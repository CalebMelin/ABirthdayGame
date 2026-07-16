// Automated browser playtest for LEVEL 7 — the "invisible cars" traffic level
// (PLAN-06 task B, src/systems/traffic.ts). Clones scripts/playtest-levels.mjs's
// structure (playwright-core system Chrome headless, drives via
// window.__gabbyGame, screenshots to playtest-out/, gates the process exit
// code). Requires `npm run dev` running on :5173.
//
// Unlike the gas-only sweep in playtest-levels.mjs (which excludes level 7 from
// its gate BECAUSE traffic legitimately needs braking), THIS harness proves the
// four things the task requires of the traffic system:
//   (a) BEATABLE with a forgiving dodge strategy at BOTH a slow and a
//       max-reasonable speed (PLAN-06 task 1: "at max AND min reasonable
//       speeds, every encounter has a dodge"). TWO driver profiles, each run
//       for a >=3-in-a-row tally (fails <= 1 in 4), scripted off the DEV-only
//       scene.__traffic snapshot:
//         - CAUTIOUS: hangs back (brakes early) and waits for each car to
//           sweep past — the slow/careful player.
//         - FAST-REACTIVE: holds gas by default (arrives at each encounter at
//           high speed) and only brakes once the oncoming car's telegraph has
//           closed in, then resumes gas — the max-speed player.
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

// --- dodge-driver tuning (harness-only). TWO distinct player profiles, both
// of which must clear all 6 encounters (validates avoidability at BOTH a slow
// and a MAX-reasonable speed — PLAN-06 task 1: "at max AND min reasonable
// speeds, every encounter has a dodge").
//
// CAUTIOUS (slow profile): brakes PREEMPTIVELY once within HOLD_DIST of the
// next encounter while its car is still ahead — settles well LEFT of the
// danger zone (enc-265) and waits for the car to sweep through.
const HOLD_DIST_PX = 900;
// FAST-REACTIVE (max-speed profile): holds gas by DEFAULT (arrives at each
// encounter at high speed). At a DEFAULT encounter it brakes once the oncoming
// car's telegraph has closed to within REACT_GAP ahead, then resumes gas once
// it has swept past. At a PUNCH-THROUGH encounter it instead keeps gas and
// blasts through the gap while moving faster than PUNCH_MIN_SPEED (px/step) —
// exercising the "accelerate through gaps" mechanic; if too slow it falls back
// to braking. The >=3s telegraph makes both reactions reachable at full gas.
const REACT_GAP_PX = 1700;
// Punch only above the safe-punch floor for punchTriggerLeadPx (~6.2 px/step).
// 6.5 sits just above that floor and well below the ~8-10 px/step the bike
// actually arrives at, so `punchNow` stays stable (no flicker into the hang-
// back fallback on a momentary dip); below it the bot safely hangs back.
const PUNCH_MIN_SPEED = 6.5;
// Shared safety backup: brake for any car already descending into the near
// lane this close ahead of the bike, regardless of which encounter it is.
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

// Both decision functions run entirely in-page (atomic read of the DEV
// scene.__traffic snapshot) and return { complete, active, bikeX, brake }.

/** CAUTIOUS / slow profile — preemptive hang-back (see HOLD_DIST_PX). Brakes
 * at EVERY encounter (punch-through ones included), proving every encounter is
 * avoidable by braking alone. */
const CAUTIOUS_DECISION_FN = ({ holdDist, dangerReach }) => {
  const g = globalThis.__gabbyGame;
  const s = g.scene.getScene('GameScene');
  const complete = g.scene.isActive('LevelCompleteScene');
  const active = g.scene.isActive('GameScene');
  const bikeX = active && s.bike ? s.bike.x : null;
  const t = s.__traffic;
  let brake = false;
  if (t && bikeX !== null) {
    const cars = t.cars();
    const ahead = t.encounters.filter((e) => e.centerX >= bikeX - 60);
    if (ahead.length > 0) {
      const nextEnc = Math.min(...ahead.map((e) => e.centerX));
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
    if (cars.some((c) => c.laneFraction >= 0.3 && c.x > bikeX - 30 && c.x < bikeX + dangerReach)) {
      brake = true;
    }
  }
  return { complete, active, bikeX, brake };
};

/** FAST-REACTIVE / max-speed profile — gas by default. Punch-through encounters
 * (short trigger lead): if fast enough, hold gas and blast through the gap;
 * otherwise (rare) hang back PREEMPTIVELY like the cautious profile (a late
 * reactGap brake would be unsafe at a short lead). Default encounters: brake
 * once the oncoming car has closed to within reactGap ahead, resume gas once it
 * has swept past. Shared near-lane safety backup. */
const FAST_DECISION_FN = ({ reactGap, dangerReach, punchMinSpeed, holdDist }) => {
  const g = globalThis.__gabbyGame;
  const s = g.scene.getScene('GameScene');
  const complete = g.scene.isActive('LevelCompleteScene');
  const active = g.scene.isActive('GameScene');
  const bikeX = active && s.bike ? s.bike.x : null;
  const velX = active && s.bike ? s.bike.velocityX : 0;
  const t = s.__traffic;
  let brake = false;
  if (t && bikeX !== null) {
    const cars = t.cars();
    const ahead = t.encounters.filter((e) => e.centerX >= bikeX - 60);
    const nextEnc = ahead.length > 0 ? ahead.reduce((a, b) => (a.centerX < b.centerX ? a : b)) : null;
    // Are we committed to PUNCHING through the next (punch-through) encounter?
    const punchNow = nextEnc !== null && nextEnc.punchThrough && velX >= punchMinSpeed;
    // Too slow to punch a punch-through encounter -> preemptive hang-back
    // (safe), NOT a late reactGap brake.
    if (
      nextEnc !== null &&
      nextEnc.punchThrough &&
      !punchNow &&
      nextEnc.centerX - bikeX <= holdDist &&
      cars.some((c) => Math.abs(c.encounterX - nextEnc.centerX) < 1 && c.x > bikeX - 60)
    ) {
      brake = true;
    }
    // Approaching a DEFAULT (brake) encounter: hang back once ITS OWN car has
    // closed to within reactGap ahead. Keyed strictly to the next encounter's
    // car (like the cautious profile) — NOT any car — so a harmless far-lane
    // car we've already punched past can't spuriously brake us and bleed the
    // speed the next punch needs. Punch-through encounters are punched, not
    // braked (handled by punchNow / the preemptive fallback above).
    if (nextEnc !== null && !nextEnc.punchThrough) {
      if (
        cars.some(
          (c) =>
            Math.abs(c.encounterX - nextEnc.centerX) < 1 &&
            c.x > bikeX - 40 &&
            c.x - bikeX <= reactGap
        )
      ) {
        brake = true;
      }
    }
    // Near-lane safety backup — but NOT for the car we're punching through:
    // while punching, that car is by design close ahead and descending, so
    // braking for it here would sabotage the punch and get us caught.
    const isPunchCar = (c) =>
      punchNow && nextEnc && Math.abs(c.encounterX - nextEnc.centerX) < 1;
    if (
      cars.some(
        (c) =>
          c.laneFraction >= 0.3 && c.x > bikeX - 30 && c.x < bikeX + dangerReach && !isPunchCar(c)
      )
    ) {
      brake = true;
    }
  }
  return { complete, active, bikeX, brake };
};

/** Drive level 7 with a given decision profile until finish/timeout. */
async function driveProfile(page, decisionFn, params) {
  await startLevel7(page);
  const bodies = await bodyCount(page);

  const start = Date.now();
  let finished = false;
  let restarts = 0;
  let prevX = null;
  const passed = new Set();
  let encounters = null;

  while (Date.now() - start < DODGE_TIMEOUT_MS) {
    const st = await page.evaluate(decisionFn, params);
    if (encounters === null || encounters.length === 0) {
      encounters = await page.evaluate(
        () =>
          (globalThis.__gabbyGame.scene.getScene('GameScene').__traffic?.encounters ?? []).map(
            (e) => e.centerX
          )
      );
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

    // (a) beatable with a forgiving dodge strategy at BOTH a slow AND a
    // max-reasonable speed — run each profile DODGE_ATTEMPTS times for a
    // difficulty tally. This validates PLAN-06 task 1's "at max AND min
    // reasonable speeds, every encounter has a dodge".
    async function runProfile(decisionFn, params, shotName) {
      const attempts = [];
      let maxConsecutiveWins = 0;
      let consecutive = 0;
      let fails = 0;
      for (let i = 0; i < DODGE_ATTEMPTS; i++) {
        const r = await driveProfile(page, decisionFn, params);
        const won = r.finished && r.restarts === 0;
        if (won) {
          consecutive++;
          maxConsecutiveWins = Math.max(maxConsecutiveWins, consecutive);
        } else {
          consecutive = 0;
          fails++;
        }
        attempts.push({ attempt: i + 1, won, ...r });
        if (i === 0) await page.screenshot({ path: join(OUT_DIR, shotName) });
      }
      return {
        attempts,
        tally: {
          attempts: DODGE_ATTEMPTS,
          wins: attempts.filter((a) => a.won).length,
          fails,
          maxConsecutiveWins,
        },
        allEncountersClearedOnWin: attempts.some(
          (a) => a.won && a.passedEncounters === ENCOUNTER_COUNT
        ),
        maxBodies: attempts.reduce((m, a) => Math.max(m, a.bodies), 0),
      };
    }

    const cautious = await runProfile(
      CAUTIOUS_DECISION_FN,
      { holdDist: HOLD_DIST_PX, dangerReach: DANGER_REACH_PX },
      'level07-dodge-cautious.png'
    );
    const fast = await runProfile(
      FAST_DECISION_FN,
      {
        reactGap: REACT_GAP_PX,
        dangerReach: DANGER_REACH_PX,
        punchMinSpeed: PUNCH_MIN_SPEED,
        holdDist: HOLD_DIST_PX,
      },
      'level07-dodge-fast.png'
    );

    // (c) structural avoidability: danger zones never fill the inter-encounter
    // gap, so there is always clear road to hang back in.
    const dangerHalf = ZONE_HALF_PX - COLLISION_LANE_THRESHOLD * DRIFT_PX + COLLISION_HALF_PX;
    const clearRoadPx = SPACING_PX - 2 * dangerHalf;

    const maxBodies = Math.max(cautious.maxBodies, fast.maxBodies);

    report = {
      gasOnlyFail: gasOnly,
      profiles: {
        cautious: { tally: cautious.tally, attempts: cautious.attempts },
        fast: { tally: fast.tally, attempts: fast.attempts },
      },
      avoidability: {
        dangerHalfPx: dangerHalf,
        clearRoadPx,
        encounterCount: ENCOUNTER_COUNT,
        cautiousClearedAllOnWin: cautious.allEncountersClearedOnWin,
        fastClearedAllOnWin: fast.allEncountersClearedOnWin,
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

  // Both profiles (slow hang-back AND max-speed fast-reactive) must clear
  // >= 3-in-a-row with <= 1 fail, and each must clear all 6 encounters on a
  // win — this is the "at max AND min reasonable speeds, every encounter has a
  // dodge" gate.
  for (const [name, p] of [
    ['cautious', report.profiles.cautious],
    ['fast-reactive', report.profiles.fast],
  ]) {
    if (p.tally.maxConsecutiveWins < 3) {
      problems.push(`${name} profile did not win >= 3 in a row (max ${p.tally.maxConsecutiveWins})`);
    }
    if (p.tally.fails > 1) {
      problems.push(`${name} profile failed too often (${p.tally.fails}/${DODGE_ATTEMPTS}) — make it easier`);
    }
  }
  if (!report.avoidability.cautiousClearedAllOnWin) {
    problems.push('cautious profile: no winning run cleared all encounters');
  }
  if (!report.avoidability.fastClearedAllOnWin) {
    problems.push('fast-reactive profile: no winning run cleared all encounters (max-speed dodge not demonstrated)');
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
    console.log(
      'LEVEL 7 OK: dodge-beatable at BOTH slow and max speed, verbatim soft-fail + restart, all encounters avoidable, bodies < 100, no errors.'
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
