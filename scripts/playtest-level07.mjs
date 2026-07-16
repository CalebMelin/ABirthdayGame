// Automated browser playtest for LEVEL 7 — the "invisible cars" traffic level
// (PLAN-06 task B, src/systems/traffic.ts). Clones scripts/playtest-levels.mjs's
// structure (playwright-core system Chrome headless, drives via
// window.__gabbyGame, screenshots to playtest-out/, gates the process exit
// code). Requires `npm run dev` running on :5173.
//
// Unlike the gas-only sweep in playtest-levels.mjs (which excludes level 7 from
// its gate BECAUSE traffic legitimately needs braking), THIS harness proves the
// four things the task requires of the traffic system:
//   (a) BEATABLE with a simple, forgiving dodge strategy — a "hold gas, but
//       hang back (brake) when the next encounter's car is closing on its
//       fixed danger zone, then go once it has swept past" driver, scripted
//       below off the DEV-only scene.__traffic snapshot. Run repeatedly for a
//       >=3-in-a-row difficulty tally (fails must stay <= 1 in 4).
//   (b) a real COLLISION fires the VERBATIM soft-fail toast + restarts (driven
//       gas-only, which — by design — gets clipped: level 7 is the one level
//       gas-only doesn't clear).
//   (c) NO encounter is unavoidable — the fixed danger zones never cover the
//       whole gap between encounters, and empirically the dodge run clears all
//       6 encounters.
//   (d) body count stays < 100 (cars add ZERO Matter bodies) and 0 console/page
//       errors fire.
//
// Usage:
//   node scripts/playtest-level07.mjs
//   PLAYTEST_URL=http://localhost:5174/ OUT_DIR=./shots node scripts/playtest-level07.mjs
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const DEV_URL = process.env.PLAYTEST_URL ?? 'http://localhost:5173/';
const OUT_DIR = process.env.OUT_DIR ?? './playtest-out';
const DESIGN_W = 1280;
const DESIGN_H = 720;

// --- IN SYNC WITH src/systems/traffic.ts (TRAFFIC_FAIL_MESSAGE) — verbatim
// personal copy (NORTH_STAR §5 row 7). A byte mismatch fails assertion (b). ---
const EXPECT_FAIL_MSG = "They really don't see us!! Go again 💛";
// --- IN SYNC WITH src/levels/level07.ts's TrafficEvent. ---
const ENCOUNTER_COUNT = 6;
// --- IN SYNC WITH src/systems/constants.ts TRAFFIC (danger geometry). Used
// only for the structural avoidability assertion (c). ---
const ZONE_HALF_PX = 260;
const DRIFT_PX = 130;
const COLLISION_HALF_PX = 70;
const COLLISION_LANE_THRESHOLD = 0.5;
const SPACING_PX = 1500;

// --- dodge-driver tuning (harness-only; the forgiving hang-back strategy a
// cautious player would use). Brake PREEMPTIVELY once within HOLD_DIST of the
// next encounter while its car is still ahead (not yet swept past) — chosen
// large enough that the bike settles well LEFT of the danger zone (enc-265)
// rather than coasting into it, so it reliably lets each car sweep through
// first. A second rule brakes for any car already descending close ahead. ---
const HOLD_DIST_PX = 900;
const DANGER_REACH_PX = 400;

const MAX_BODIES = 100;
const RESTART_WARP_PX = 1500;
const POLL_MS = 80;
const DODGE_TIMEOUT_MS = 75_000;
const GASONLY_TIMEOUT_MS = 45_000;
const DODGE_ATTEMPTS = 4;

async function waitForScene(page, key, timeout = 20_000) {
  await page.waitForFunction(
    (k) => globalThis.__gabbyGame?.scene.isActive(k) === true,
    key,
    { timeout }
  );
}

function bodyCount(page) {
  return page.evaluate(
    () => globalThis.__gabbyGame.scene.getScene('GameScene').matter.world.getAllBodies().length
  );
}

/** Enter level 7 fresh (same manager-level bypass as playtest-levels.mjs — it
 * stops a stale LevelCompleteScene the previous run may have left active). */
async function startLevel7(page) {
  await page.evaluate(() => {
    const g = globalThis.__gabbyGame;
    if (g.scene.isActive('LevelCompleteScene')) g.scene.stop('LevelCompleteScene');
    g.scene.start('GameScene', { level: 7 });
  });
  await waitForScene(page, 'GameScene');
  await page.waitForTimeout(600); // create() + bike settle
}

/** Read scene state + compute the dodge decision (brake or gas) in one atomic
 * page.evaluate off the DEV traffic snapshot. */
const DECISION_FN = ({ holdDist, dangerReach }) => {
  const g = globalThis.__gabbyGame;
  const s = g.scene.getScene('GameScene');
  const complete = g.scene.isActive('LevelCompleteScene');
  const active = g.scene.isActive('GameScene');
  const bikeX = active && s.bike ? s.bike.x : null;
  const t = s.__traffic;
  let brake = false;
  let nextEnc = null;
  if (t && bikeX !== null) {
    const cars = t.cars();
    const ahead = t.encounters.filter((c) => c >= bikeX - 60);
    if (ahead.length > 0) {
      nextEnc = Math.min(...ahead);
      // Preemptive hang-back: within holdDist of the next encounter while its
      // car is still ahead (not yet swept past) -> brake to a stop well left
      // of the danger zone and wait for the car to sweep through.
      if (
        nextEnc - bikeX <= holdDist &&
        cars.some((c) => Math.abs(c.encounterX - nextEnc) < 1 && c.x > bikeX - 60)
      ) {
        brake = true;
      }
    }
    // Safety backup: any car already descending into the near lane, close
    // ahead of the bike, forces a brake regardless of which encounter it is.
    if (
      cars.some((c) => c.laneFraction >= 0.3 && c.x > bikeX - 30 && c.x < bikeX + dangerReach)
    ) {
      brake = true;
    }
  }
  return { complete, active, bikeX, brake, nextEnc };
};

/** Drive level 7 with the forgiving dodge strategy until finish/timeout. */
async function driveDodge(page) {
  await startLevel7(page);
  const bodies = await bodyCount(page);

  const start = Date.now();
  let finished = false;
  let restarts = 0;
  let prevX = null;
  const passed = new Set();
  let encounters = null;

  while (Date.now() - start < DODGE_TIMEOUT_MS) {
    const st = await page.evaluate(DECISION_FN, {
      holdDist: HOLD_DIST_PX,
      dangerReach: DANGER_REACH_PX,
    });
    if (encounters === null) {
      encounters = await page.evaluate(() => globalThis.__gabbyGame.scene.getScene('GameScene').__traffic?.encounters ?? null);
    }
    if (st.complete) {
      finished = true;
      break;
    }
    if (st.bikeX !== null) {
      if (prevX !== null && st.bikeX < prevX - RESTART_WARP_PX) restarts++;
      prevX = st.bikeX;
      if (encounters) for (const e of encounters) if (st.bikeX > e + 50) passed.add(e);
    }
    // A mid-run restart means the dodge failed (a collision soft-fail warped
    // the bike back) — end the attempt promptly instead of burning the full
    // timeout re-driving from spawn.
    if (restarts > 0) break;
    if (st.brake) {
      await page.keyboard.up('ArrowRight');
      await page.keyboard.down('ArrowLeft');
    } else {
      await page.keyboard.up('ArrowLeft');
      await page.keyboard.down('ArrowRight');
    }
    await page.waitForTimeout(POLL_MS);
  }
  await page.keyboard.up('ArrowRight');
  await page.keyboard.up('ArrowLeft');

  return {
    finished,
    restarts,
    passedEncounters: passed.size,
    bodies,
    driveSeconds: Math.round((Date.now() - start) / 100) / 10,
  };
}

/** Drive gas-only into the traffic and prove it soft-fails with the verbatim
 * message and restarts (level 7 is not gas-only clearable — by design). */
async function driveGasOnlyFail(page) {
  await startLevel7(page);
  const start = Date.now();
  let failMsg = null;
  let warpedBack = false;
  let prevX = null;

  while (Date.now() - start < GASONLY_TIMEOUT_MS) {
    await page.keyboard.down('ArrowRight');
    const st = await page.evaluate(() => {
      const g = globalThis.__gabbyGame;
      const s = g.scene.getScene('GameScene');
      return {
        msg: s.__lastTrafficSoftFail ?? null,
        bikeX: g.scene.isActive('GameScene') && s.bike ? Math.round(s.bike.x) : null,
        complete: g.scene.isActive('LevelCompleteScene'),
      };
    });
    if (st.msg) failMsg = st.msg;
    if (st.bikeX !== null) {
      if (prevX !== null && st.bikeX < prevX - RESTART_WARP_PX) warpedBack = true;
      prevX = st.bikeX;
    }
    // Stop once we've both captured the message AND observed the restart warp.
    if (failMsg && warpedBack) break;
    if (st.complete) break; // would mean gas-only cleared it (unexpected)
    await page.waitForTimeout(100);
  }
  await page.keyboard.up('ArrowRight');
  await page.screenshot({ path: join(OUT_DIR, 'level07-gasonly-fail.png') });
  return { failMsg, warpedBack };
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: DESIGN_W, height: DESIGN_H } });
  const page = await context.newPage();

  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => pageErrors.push(String(err)));

  let report;
  try {
    await page.goto(DEV_URL, { waitUntil: 'domcontentloaded' });
    await waitForScene(page, 'TitleScene');

    // (b) collision -> verbatim soft-fail + restart (gas-only, by-design fail).
    const gasOnly = await driveGasOnlyFail(page);

    // (a) beatable with the forgiving dodge strategy + difficulty tally.
    const attempts = [];
    let maxConsecutiveWins = 0;
    let consecutive = 0;
    let fails = 0;
    for (let i = 0; i < DODGE_ATTEMPTS; i++) {
      const r = await driveDodge(page);
      const won = r.finished && r.restarts === 0;
      if (won) {
        consecutive++;
        maxConsecutiveWins = Math.max(maxConsecutiveWins, consecutive);
      } else {
        consecutive = 0;
        fails++;
      }
      attempts.push({ attempt: i + 1, won, ...r });
      if (i === 0) await page.screenshot({ path: join(OUT_DIR, 'level07-dodge.png') });
    }

    // (c) structural avoidability: danger zones never fill the inter-encounter
    // gap, so there is always clear road to hang back in.
    const dangerHalf = ZONE_HALF_PX - COLLISION_LANE_THRESHOLD * DRIFT_PX + COLLISION_HALF_PX;
    const clearRoadPx = SPACING_PX - 2 * dangerHalf;

    const maxBodies = attempts.reduce((m, a) => Math.max(m, a.bodies), 0);

    report = {
      gasOnlyFail: gasOnly,
      dodgeAttempts: attempts,
      difficulty: {
        attempts: DODGE_ATTEMPTS,
        wins: attempts.filter((a) => a.won).length,
        fails,
        maxConsecutiveWins,
      },
      avoidability: {
        dangerHalfPx: dangerHalf,
        clearRoadPx,
        encounterCount: ENCOUNTER_COUNT,
        allEncountersClearedOnWin: attempts.some((a) => a.won && a.passedEncounters === ENCOUNTER_COUNT),
      },
      maxBodies,
      maxBodiesBudget: MAX_BODIES,
      consoleErrors,
      pageErrors,
    };
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await browser.close();
  }

  // --- gate the exit code ---
  const problems = [];
  if (report.gasOnlyFail.failMsg !== EXPECT_FAIL_MSG) {
    problems.push(`gas-only soft-fail message mismatch: got ${JSON.stringify(report.gasOnlyFail.failMsg)}`);
  }
  if (!report.gasOnlyFail.warpedBack) problems.push('gas-only run did not restart after the collision');
  if (report.difficulty.maxConsecutiveWins < 3) {
    problems.push(`dodge strategy did not win >= 3 in a row (max ${report.difficulty.maxConsecutiveWins})`);
  }
  if (report.difficulty.fails > 1) {
    problems.push(`dodge strategy failed too often (${report.difficulty.fails}/${DODGE_ATTEMPTS}) — make it easier`);
  }
  if (!report.avoidability.allEncountersClearedOnWin) {
    problems.push('no winning run cleared all encounters (avoidability not demonstrated)');
  }
  if (report.avoidability.clearRoadPx <= 300) {
    problems.push(`danger zones leave too little clear road (${report.avoidability.clearRoadPx}px)`);
  }
  if (report.maxBodies >= MAX_BODIES) problems.push(`body count ${report.maxBodies} >= ${MAX_BODIES}`);
  if (report.consoleErrors.length > 0) problems.push(`${report.consoleErrors.length} console error(s)`);
  if (report.pageErrors.length > 0) problems.push(`${report.pageErrors.length} page error(s)`);

  if (problems.length > 0) {
    console.error('LEVEL 7 HARNESS FAILURES:\n  - ' + problems.join('\n  - '));
    process.exitCode = 1;
  } else {
    console.log('LEVEL 7 OK: dodge-beatable, verbatim soft-fail + restart, all encounters avoidable, bodies < 100, no errors.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
