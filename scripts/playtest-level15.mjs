// Automated browser playtest for LEVEL 15 — the police-chase level (PLAN-06
// task 3, src/systems/police.ts). Clones scripts/playtest-levels.mjs's structure
// (playwright-core system Chrome headless, drives via window.__gabbyGame,
// screenshots to playtest-out/, gates the process exit code). Requires
// `npm run dev` running on :5173.
//
// Proves the things the task requires of the police system:
//   (a) a GAS-ONLY run FINISHES and is NEVER caught — the cop stays behind and
//       the gap never closes to a catch (closest gap > catchDistancePx, no
//       soft-fail, no restart) — >=3 clean finishes in a row (the difficulty
//       gate: a gas-holding player must never be caught);
//   (b) a deliberately-STOPPED run (hold brake) IS caught → the byte-exact
//       "They got us!! ...let's pretend that didn't happen 🚔" soft-fail fires and
//       the level restarts;
//   (c) the escape finale shows on finish — a byte-exact "WOOHOO!" toast renders,
//       the cop spins out (its angle tweens away from 0), and the LevelComplete
//       hand-off is DELAYED (onFinish's finaleHoldMs) so the finale is visible;
//   (d) with levels 1-14 seeded complete in save, entering level 15 shows Caleb
//       pillion (passenger active + a visible tex-caleb) — both riders flee;
//   (e) body count stays < 100 (the cop adds ZERO Matter bodies);
//   (f) 0 console/page errors fire.
//
// Usage:
//   node scripts/playtest-level15.mjs
//   PLAYTEST_URL=http://localhost:5174/ OUT_DIR=./shots node scripts/playtest-level15.mjs
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const DEV_URL = process.env.PLAYTEST_URL ?? 'http://localhost:5173/';
const OUT_DIR = process.env.OUT_DIR ?? './playtest-out';
const DESIGN_W = 1280;
const DESIGN_H = 720;

// --- IN SYNC WITH src/systems/police.ts (POLICE_CAUGHT_MESSAGE / POLICE_ESCAPE_MESSAGE)
// — verbatim personal copy (NORTH_STAR §5 row 15 / CLAUDE.md Rule 4). A byte
// mismatch fails assertions (b)/(c). This file is UTF-8; the emoji is U+1F694. ---
const EXPECT_CAUGHT_MSG = "They got us!! ...let's pretend that didn't happen 🚔";
const EXPECT_ESCAPE_MSG = 'WOOHOO!';
// --- IN SYNC WITH src/levels/level15.ts's PoliceEvent. ---
const START_BEHIND_PX = 600;
const CATCH_DISTANCE_PX = 200;
// --- IN SYNC WITH src/systems/constants.ts TOTAL_LEVELS + TEXTURE_KEYS.{caleb,policeCar}. ---
const TOTAL_LEVELS = 22;
const CALEB_TEXTURE_KEY = 'tex-caleb';
const POLICE_TEXTURE_KEY = 'tex-police-car';

const MAX_BODIES = 100;
const RESTART_WARP_PX = 1500;
const POLL_MS = 100;
const GASONLY_TIMEOUT_MS = 60_000;
const STOPPED_TIMEOUT_MS = 30_000;
const SETTLE_MS = 600;
const FINISH_ATTEMPTS = 3;
// The LevelComplete hand-off must be HELD after the finish (POLICE.finaleHoldMs =
// 1200ms). Assert a delay comfortably above the coarse poll noise but under 1200.
const MIN_FINALE_DELAY_MS = 800;

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

/** Enter a level fresh via the manager-level bypass (same as playtest-levels.mjs
 * — stops a stale LevelCompleteScene the previous run may have left active). */
async function startLevel(page, level) {
  await page.evaluate((lvl) => {
    const g = globalThis.__gabbyGame;
    if (g.scene.isActive('LevelCompleteScene')) g.scene.stop('LevelCompleteScene');
    g.scene.start('GameScene', { level: lvl });
  }, level);
  await waitForScene(page, 'GameScene');
  await page.waitForTimeout(SETTLE_MS);
}

/** Atomic in-page read of the level-15 chase state (off the DEV __police snapshot). */
const READ_L15 = () => {
  const g = globalThis.__gabbyGame;
  const s = g.scene.getScene('GameScene');
  const pol = s.__police;
  const list = s.children && s.children.list ? s.children.list : [];
  const texts = list.filter((o) => o.type === 'Text').map((o) => o.text);
  const copImg = list.find(
    (o) => o.type === 'Image' && o.texture && o.texture.key === 'tex-police-car'
  );
  return {
    complete: g.scene.isActive('LevelCompleteScene'),
    active: g.scene.isActive('GameScene'),
    ended: s.ended === true,
    bikeX: s.bike ? s.bike.x : null,
    finishX: typeof s.finishX === 'number' ? s.finishX : null,
    gap: pol ? pol.gap() : null,
    closestGap: pol ? pol.closestGap() : null,
    catchTimerMs: pol ? pol.catchTimerMs() : null,
    passengerActive: s.passenger ? s.passenger.active : null,
    softFail: s.__lastPoliceSoftFail ?? null,
    copAngle: copImg ? copImg.angle : null,
    texts,
  };
};

/** Drive level 15 GAS-ONLY to completion, observing the chase + escape finale. */
async function driveGasOnly(page) {
  await startLevel(page, 15);
  const bodies = await bodyCount(page);

  const start = Date.now();
  let finished = false;
  let restarts = 0;
  let prevX = null;
  let minGap = Infinity;
  let closestGap = Infinity;
  let maxCatchTimer = 0;
  let softFail = null;
  let passengerActiveSeen = false;
  // finale evidence
  let firstEndedAt = null;
  let completeAt = null;
  let sawEscapeToast = false;
  let maxCopAngleInFinale = 0;

  while (Date.now() - start < GASONLY_TIMEOUT_MS) {
    await page.keyboard.down('ArrowRight');
    const st = await page.evaluate(READ_L15);

    if (st.softFail) softFail = st.softFail; // must stay null on a clean gas-only run
    if (st.passengerActive) passengerActiveSeen = true;
    if (typeof st.gap === 'number') minGap = Math.min(minGap, st.gap);
    if (typeof st.closestGap === 'number') closestGap = Math.min(closestGap, st.closestGap);
    if (typeof st.catchTimerMs === 'number') maxCatchTimer = Math.max(maxCatchTimer, st.catchTimerMs);

    if (st.bikeX !== null) {
      if (prevX !== null && st.bikeX < prevX - RESTART_WARP_PX) restarts++;
      prevX = st.bikeX;
    }

    // Finale window: after the finish, GameScene stays active + ended while the
    // hand-off is HELD (onFinish delay). Capture the WOOHOO toast + cop spin-out.
    if (st.ended && st.active && !st.complete) {
      if (firstEndedAt === null) firstEndedAt = Date.now();
      if (st.texts.includes(EXPECT_ESCAPE_MSG)) sawEscapeToast = true;
      if (typeof st.copAngle === 'number') maxCopAngleInFinale = Math.max(maxCopAngleInFinale, Math.abs(st.copAngle));
    }

    if (st.complete) {
      completeAt = Date.now();
      finished = true;
      break;
    }
    await page.waitForTimeout(POLL_MS);
  }
  await page.keyboard.up('ArrowRight');

  const transitionDelayMs = firstEndedAt !== null && completeAt !== null ? completeAt - firstEndedAt : null;

  return {
    finished,
    restarts,
    bodies,
    minGap: minGap === Infinity ? null : Math.round(minGap),
    closestGap: closestGap === Infinity ? null : Math.round(closestGap),
    maxCatchTimerMs: Math.round(maxCatchTimer),
    softFail,
    passengerActiveSeen,
    sawEscapeToast,
    maxCopAngleInFinale: Math.round(maxCopAngleInFinale),
    transitionDelayMs,
    driveSeconds: Math.round((Date.now() - start) / 100) / 10,
  };
}

/** Drive level 15 STOPPED (hold brake) and prove the cop catches → the verbatim
 * soft-fail fires and the level restarts. */
async function driveStopped(page) {
  await startLevel(page, 15);
  const start = Date.now();
  let caughtMsg = null;
  let restarted = false;
  // The bike is caught NEAR SPAWN, so there is no forward-progress "warp back" to
  // detect (the level07/12 heuristic). Instead prove the restart via the cop
  // RESET: after the cop closes to within catch distance and the soft-fail fires,
  // a scene.restart() tears down + rebuilds the police handle, placing a FRESH cop
  // ~startBehindPx (600) back — so the gap jumping from ~caught back out past
  // GAP_RESET_PX is unambiguous proof the level restarted with a new pursuit.
  const GAP_RESET_PX = 400;
  let sawClose = false;
  let maxCatchTimer = 0;

  while (Date.now() - start < STOPPED_TIMEOUT_MS) {
    await page.keyboard.down('ArrowLeft'); // brake — stay put, let the cop close
    const st = await page.evaluate(READ_L15);
    if (st.softFail) caughtMsg = st.softFail;
    if (typeof st.catchTimerMs === 'number') maxCatchTimer = Math.max(maxCatchTimer, st.catchTimerMs);
    if (typeof st.gap === 'number' && st.gap <= CATCH_DISTANCE_PX + 20) sawClose = true;
    if (sawClose && typeof st.gap === 'number' && st.gap > GAP_RESET_PX) restarted = true;
    if (caughtMsg && restarted) break;
    if (st.complete) break; // would mean the stopped run somehow finished (unexpected)
    await page.waitForTimeout(POLL_MS);
  }
  await page.keyboard.up('ArrowLeft');
  await page.screenshot({ path: join(OUT_DIR, 'level15-caught.png') });
  return { caughtMsg, restarted, maxCatchTimerMs: Math.round(maxCatchTimer) };
}

/** Seed save so levels 1..upTo read as completed, then reload. */
async function seedProgressAndReload(page, upTo) {
  await page.evaluate(
    ({ upTo, total }) => {
      const completed = Array(total).fill(false);
      for (let i = 0; i < upTo; i++) completed[i] = true;
      localStorage.setItem(
        'gabby22.progress',
        JSON.stringify({ highestUnlocked: Math.min(upTo + 1, total), completed })
      );
    },
    { upTo, total: TOTAL_LEVELS }
  );
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForScene(page, 'TitleScene');
}

/** Enter level 15 and read whether Caleb is aboard from the START. */
async function readPassengerAtSpawn(page) {
  await startLevel(page, 15);
  return page.evaluate(
    ({ calebKey, copKey }) => {
      const g = globalThis.__gabbyGame;
      const s = g.scene.getScene('GameScene');
      const list = s.children && s.children.list ? s.children.list : [];
      const visibleCalebs = list.filter(
        (o) => o.type === 'Image' && o.texture && o.texture.key === calebKey && o.visible
      ).length;
      const copPresent = list.some(
        (o) => o.type === 'Image' && o.texture && o.texture.key === copKey
      );
      return { passengerActive: s.passenger ? s.passenger.active : null, visibleCalebs, copPresent };
    },
    { calebKey: CALEB_TEXTURE_KEY, copKey: POLICE_TEXTURE_KEY }
  );
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

    // Seed levels 1-14 complete so Caleb rides pillion on level 15 (deriveCalebPickedUp)
    // for every run below — (d) plus "both riders flee".
    await seedProgressAndReload(page, 14);
    const spawn = await readPassengerAtSpawn(page);
    await page.screenshot({ path: join(OUT_DIR, 'level15-spawn.png') });

    // (a) + difficulty gate: >=3 clean gas-only finishes in a row, never caught.
    const attempts = [];
    for (let i = 0; i < FINISH_ATTEMPTS; i++) {
      const r = await driveGasOnly(page);
      attempts.push(r);
      if (i === 0) await page.screenshot({ path: join(OUT_DIR, 'level15-gasonly.png') });
    }

    // (b) stopped -> caught -> verbatim soft-fail + restart.
    const stopped = await driveStopped(page);

    const maxBodies = attempts.reduce((m, a) => Math.max(m, a.bodies), 0);
    const cleanWins = attempts.filter((a) => a.finished && a.restarts === 0 && !a.softFail).length;
    const winsInARow = (() => {
      let best = 0;
      let run = 0;
      for (const a of attempts) {
        if (a.finished && a.restarts === 0 && !a.softFail) {
          run++;
          best = Math.max(best, run);
        } else run = 0;
      }
      return best;
    })();
    const closestGapAcross = attempts.reduce(
      (m, a) => (a.closestGap !== null ? Math.min(m, a.closestGap) : m),
      Infinity
    );
    // First attempt that captured the finale (toast + delay).
    const finaleDetail = attempts.find((a) => a.finished) ?? attempts[0];

    report = {
      passengerAtSpawn: spawn,
      gasOnly: {
        attempts,
        cleanWins,
        winsInARow,
        closestGapAcross: closestGapAcross === Infinity ? null : closestGapAcross,
      },
      finale: {
        sawEscapeToast: finaleDetail.sawEscapeToast,
        maxCopAngleInFinale: finaleDetail.maxCopAngleInFinale,
        transitionDelayMs: finaleDetail.transitionDelayMs,
      },
      stopped,
      startBehindPx: START_BEHIND_PX,
      catchDistancePx: CATCH_DISTANCE_PX,
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

  // (d) passenger aboard from spawn (both riders flee).
  if (report.passengerAtSpawn.passengerActive !== true || report.passengerAtSpawn.visibleCalebs < 1) {
    problems.push(`level 15 did not show Caleb pillion from the start (${JSON.stringify(report.passengerAtSpawn)})`);
  }
  if (!report.passengerAtSpawn.copPresent) problems.push('the police car was not present in the scene');

  // (a) + difficulty gate: >=3 clean gas-only finishes in a row, never caught,
  // and the cop never even reached catch distance on any gas-only run.
  if (report.gasOnly.winsInARow < FINISH_ATTEMPTS) {
    problems.push(
      `did not finish gas-only ${FINISH_ATTEMPTS}x in a row uncaught (max streak ${report.gasOnly.winsInARow})`
    );
  }
  for (const a of report.gasOnly.attempts) {
    if (a.softFail) problems.push(`a gas-only run was CAUGHT (soft-fail fired) — cop too fast, lower copMaxSpeedFrac`);
    if (a.restarts > 0) problems.push('a gas-only run restarted mid-drive (unexpected crash/catch)');
  }
  if (report.gasOnly.closestGapAcross === null || report.gasOnly.closestGapAcross <= CATCH_DISTANCE_PX) {
    problems.push(
      `gas-only closest cop gap ${report.gasOnly.closestGapAcross}px reached the catch distance (${CATCH_DISTANCE_PX}px) — cop too fast`
    );
  }

  // (c) escape finale: WOOHOO toast rendered, cop spun out, hand-off delayed.
  if (!report.finale.sawEscapeToast) problems.push(`the ${JSON.stringify(EXPECT_ESCAPE_MSG)} escape toast never rendered`);
  if (report.finale.maxCopAngleInFinale <= 0) problems.push('the cop did not spin out on finish (angle stayed 0)');
  if (report.finale.transitionDelayMs === null || report.finale.transitionDelayMs < MIN_FINALE_DELAY_MS) {
    problems.push(`LevelComplete hand-off was not delayed for the finale (delay ${report.finale.transitionDelayMs}ms < ${MIN_FINALE_DELAY_MS}ms)`);
  }

  // (b) stopped -> caught -> verbatim soft-fail + restart.
  if (report.stopped.caughtMsg !== EXPECT_CAUGHT_MSG) {
    problems.push(`stopped-run soft-fail message mismatch: got ${JSON.stringify(report.stopped.caughtMsg)}`);
  }
  if (!report.stopped.restarted) problems.push('stopped run did not restart after being caught');

  // (e) body budget + (f) no errors.
  if (report.maxBodies >= MAX_BODIES) problems.push(`body count ${report.maxBodies} >= ${MAX_BODIES}`);
  if (report.consoleErrors.length > 0) problems.push(`${report.consoleErrors.length} console error(s)`);
  if (report.pageErrors.length > 0) problems.push(`${report.pageErrors.length} page error(s)`);

  if (problems.length > 0) {
    console.error('LEVEL 15 HARNESS FAILURES:\n  - ' + problems.join('\n  - '));
    process.exitCode = 1;
  } else {
    console.log(
      `LEVEL 15 OK: gas-only never caught (${report.gasOnly.winsInARow}x in a row, closest gap ${report.gasOnly.closestGapAcross}px); stopped run caught -> verbatim soft-fail + restart; WOOHOO! finale + cop spin-out + delayed hand-off; Caleb pillion; bodies < 100; no errors.`
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
