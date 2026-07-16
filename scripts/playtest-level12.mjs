// Automated browser playtest for LEVEL 12 — the Caleb pickup level (PLAN-06
// task C, src/systems/pickup.ts). Clones scripts/playtest-levels.mjs's structure
// (playwright-core system Chrome headless, drives via window.__gabbyGame,
// screenshots to playtest-out/, gates the process exit code). Requires
// `npm run dev` running on :5173.
//
// Proves the things the task requires of the pickup system:
//   (a) driving GAS-ONLY into level 12, the cutscene triggers near x≈6250, the
//       bike AUTO-BRAKES to a stop on the flat zone (despite held gas — the
//       input override wins), the passenger becomes VISIBLE (a 2nd Caleb sprite /
//       s.passenger.active flips true), and control returns (inputOverride null);
//   (b) the level then FINISHES gas-only after the pickup;
//   (c) the MELIN mailbox + "Caleb hopped on!!" toast RENDER, byte-exact
//       (asserted against actual Text GameObjects in the scene);
//   (d) with levels 1-12 seeded complete in save, entering level 13 directly
//       shows Caleb pillion FROM THE START, while entering level 11 shows Gabby
//       SOLO (the persistence rule — deriveCalebPickedUp);
//   (e) body count stays < 100 (the pickup adds ZERO Matter bodies);
//   (f) 0 console/page errors fire;
//   plus the DIFFICULTY GATE: level 12 stays trivially gas-only beatable — >=3
//   gas-only finishes in a row with 0 fails (the cutscene is a gift, not an
//   obstacle).
//
// Usage:
//   node scripts/playtest-level12.mjs
//   PLAYTEST_URL=http://localhost:5174/ OUT_DIR=./shots node scripts/playtest-level12.mjs
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const DEV_URL = process.env.PLAYTEST_URL ?? 'http://localhost:5173/';
const OUT_DIR = process.env.OUT_DIR ?? './playtest-out';
const DESIGN_W = 1280;
const DESIGN_H = 720;

// --- IN SYNC WITH src/systems/pickup.ts (MAILBOX_LABEL / PICKUP_TOAST_MESSAGE) —
// verbatim personal copy (CLAUDE.md Rule 4). A byte mismatch fails assertion (c). ---
const EXPECT_MAILBOX = 'MELIN';
const EXPECT_TOAST = 'Caleb hopped on!!';
// --- IN SYNC WITH src/levels/level12.ts's CalebPickupEvent {x, stopWindowPx}. ---
const PICKUP_X = 6250;
const STOP_WINDOW_PX = 380;
// --- IN SYNC WITH src/levels/level12.ts's {5750,6750} pickup flat zone. ---
const FLAT_ZONE_START = 5750;
const FLAT_ZONE_END = 6750;
// --- IN SYNC WITH src/systems/constants.ts TOTAL_LEVELS + TEXTURE_KEYS.caleb. ---
const TOTAL_LEVELS = 22;
const CALEB_TEXTURE_KEY = 'tex-caleb';

// The auto-braked bike must slow to at/near a stop — asserted below the bike's
// ~10.8 px/step full-gas cruise, generously above the stop threshold so a coarse
// 100ms poll still catches the near-zero dwell.
const STOPPED_SPEED_ASSERT = 2.5;

const MAX_BODIES = 100;
const RESTART_WARP_PX = 1500;
const POLL_MS = 100;
const LEVEL12_TIMEOUT_MS = 75_000;
const SETTLE_MS = 600;
const FINISH_ATTEMPTS = 3;

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

/** Atomic in-page read of the level-12 pickup state. */
const READ_L12 = () => {
  const g = globalThis.__gabbyGame;
  const s = g.scene.getScene('GameScene');
  const pk = s.__pickup;
  const texts =
    s.children && s.children.list
      ? s.children.list.filter((o) => o.type === 'Text').map((o) => o.text)
      : [];
  return {
    complete: g.scene.isActive('LevelCompleteScene'),
    active: g.scene.isActive('GameScene'),
    bikeX: s.bike ? s.bike.x : null,
    speed: s.bike ? s.bike.speed : null,
    phase: pk ? pk.phase() : null,
    passengerActive: s.passenger ? s.passenger.active : null,
    // null once the cutscene releases control (player back in charge).
    overrideCleared: (s.inputOverride ?? null) === null,
    texts,
  };
};

/** Drive level 12 gas-only to completion, observing the whole cutscene. */
async function driveGasOnly(page) {
  await startLevel(page, 12);
  const bodies = await bodyCount(page);

  const start = Date.now();
  let finished = false;
  let restarts = 0;
  let prevX = null;
  let triggeredCutscene = false;
  let triggerX = null;
  let minCutsceneSpeed = Infinity;
  let stopX = null;
  let activatedMidLevel = false;
  let activatedAtX = null;
  let controlReturned = false;
  let sawMailbox = false;
  let sawToast = false;

  while (Date.now() - start < LEVEL12_TIMEOUT_MS) {
    await page.keyboard.down('ArrowRight');
    const st = await page.evaluate(READ_L12);

    if (st.complete) {
      finished = true;
      break;
    }
    if (st.bikeX !== null) {
      if (prevX !== null && st.bikeX < prevX - RESTART_WARP_PX) restarts++;
      prevX = st.bikeX;
    }
    if (st.phase && st.phase !== 'approaching') {
      if (!triggeredCutscene) {
        triggeredCutscene = true;
        triggerX = st.bikeX;
      }
      if (typeof st.speed === 'number') minCutsceneSpeed = Math.min(minCutsceneSpeed, st.speed);
    }
    if ((st.phase === 'stopped' || st.phase === 'hopping') && stopX === null && st.bikeX !== null) {
      stopX = st.bikeX;
    }
    if (st.passengerActive && !activatedMidLevel) {
      activatedMidLevel = true;
      activatedAtX = st.bikeX;
    }
    if (st.texts.includes(EXPECT_MAILBOX)) sawMailbox = true;
    if (st.texts.includes(EXPECT_TOAST)) sawToast = true;
    if (activatedMidLevel && st.phase === 'done' && st.overrideCleared) controlReturned = true;

    // The cutscene NEVER fails the player, so a mid-run restart is a real bug —
    // bail promptly rather than burning the full timeout re-driving.
    if (restarts > 0) break;
    await page.waitForTimeout(POLL_MS);
  }
  await page.keyboard.up('ArrowRight');

  return {
    finished,
    restarts,
    bodies,
    triggeredCutscene,
    triggerX: triggerX === null ? null : Math.round(triggerX),
    minCutsceneSpeed: minCutsceneSpeed === Infinity ? null : Math.round(minCutsceneSpeed * 100) / 100,
    stopX: stopX === null ? null : Math.round(stopX),
    activatedMidLevel,
    activatedAtX: activatedAtX === null ? null : Math.round(activatedAtX),
    controlReturned,
    sawMailbox,
    sawToast,
    driveSeconds: Math.round((Date.now() - start) / 100) / 10,
  };
}

/** Seed save so levels 1..upTo read as completed, then reload so the fresh page
 * boots against that progress. */
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

/** Enter a level and read whether Caleb is aboard from the START (passenger
 * active + a visible tex-caleb sprite). */
async function readPassengerAtSpawn(page, level) {
  await startLevel(page, level);
  return page.evaluate((texKey) => {
    const g = globalThis.__gabbyGame;
    const s = g.scene.getScene('GameScene');
    const visibleCalebs =
      s.children && s.children.list
        ? s.children.list.filter(
            (o) => o.type === 'Image' && o.texture && o.texture.key === texKey && o.visible
          ).length
        : 0;
    return { passengerActive: s.passenger ? s.passenger.active : null, visibleCalebs };
  }, CALEB_TEXTURE_KEY);
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

    // (a)-(c) + difficulty gate: >=3 gas-only finishes in a row; capture the full
    // cutscene evidence on the first attempt.
    const attempts = [];
    for (let i = 0; i < FINISH_ATTEMPTS; i++) {
      const r = await driveGasOnly(page);
      attempts.push(r);
      if (i === 0) await page.screenshot({ path: join(OUT_DIR, 'level12-pickup.png') });
    }
    const detail = attempts[0];

    // (d) persistence: seed levels 1-12 complete, then 13 shows Caleb / 11 solo.
    await seedProgressAndReload(page, 12);
    const level13 = await readPassengerAtSpawn(page, 13);
    await page.screenshot({ path: join(OUT_DIR, 'level12-persist-13.png') });
    const level11 = await readPassengerAtSpawn(page, 11);
    await page.screenshot({ path: join(OUT_DIR, 'level12-persist-11.png') });

    const maxBodies = attempts.reduce((m, a) => Math.max(m, a.bodies), 0);
    const winsInARow = (() => {
      let best = 0;
      let run = 0;
      for (const a of attempts) {
        if (a.finished && a.restarts === 0) {
          run++;
          best = Math.max(best, run);
        } else run = 0;
      }
      return best;
    })();

    report = {
      cutscene: detail,
      finishTally: {
        attempts: FINISH_ATTEMPTS,
        finished: attempts.filter((a) => a.finished).length,
        winsInARow,
        fails: attempts.filter((a) => !(a.finished && a.restarts === 0)).length,
      },
      attempts,
      persistence: { level13, level11 },
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
  const d = report.cutscene;

  // (a) cutscene triggered near the pickup x, auto-braked to a stop, activated
  // the passenger, control returned.
  if (!d.triggeredCutscene) problems.push('cutscene never triggered on the gas-only run');
  if (d.triggerX === null || d.triggerX < PICKUP_X - STOP_WINDOW_PX - 100 || d.triggerX > PICKUP_X + 150) {
    problems.push(`cutscene trigger x ${d.triggerX} not near the pickup x (${PICKUP_X})`);
  }
  if (d.minCutsceneSpeed === null || d.minCutsceneSpeed > STOPPED_SPEED_ASSERT) {
    problems.push(`bike did not auto-brake to a stop (min cutscene speed ${d.minCutsceneSpeed} px/step)`);
  }
  if (d.stopX === null || d.stopX < FLAT_ZONE_START || d.stopX > FLAT_ZONE_END) {
    problems.push(`bike stopped at x ${d.stopX}, outside the pickup flat zone [${FLAT_ZONE_START}, ${FLAT_ZONE_END}]`);
  }
  if (!d.activatedMidLevel) problems.push('passenger never became active mid-level (no pickup)');
  if (!d.controlReturned) problems.push('control did not return to the player after the pickup');

  // (b) finished gas-only after the pickup.
  if (!d.finished) problems.push('level 12 did not finish gas-only after the pickup');

  // (c) verbatim strings actually rendered.
  if (!d.sawMailbox) problems.push(`the ${JSON.stringify(EXPECT_MAILBOX)} mailbox never rendered`);
  if (!d.sawToast) problems.push(`the ${JSON.stringify(EXPECT_TOAST)} toast never rendered`);

  // difficulty gate: >=3 clean gas-only finishes in a row, 0 fails.
  if (report.finishTally.winsInARow < FINISH_ATTEMPTS) {
    problems.push(`did not finish gas-only ${FINISH_ATTEMPTS}x in a row (max streak ${report.finishTally.winsInARow})`);
  }
  if (report.finishTally.fails > 0) {
    problems.push(`${report.finishTally.fails} gas-only attempt(s) failed — level 12 must stay trivially beatable`);
  }

  // (d) persistence.
  if (report.persistence.level13.passengerActive !== true || report.persistence.level13.visibleCalebs < 1) {
    problems.push(`level 13 did not show Caleb pillion from the start (${JSON.stringify(report.persistence.level13)})`);
  }
  if (report.persistence.level11.passengerActive !== false || report.persistence.level11.visibleCalebs !== 0) {
    problems.push(`level 11 did not show Gabby solo (${JSON.stringify(report.persistence.level11)})`);
  }

  // (e) body budget + (f) no errors.
  if (report.maxBodies >= MAX_BODIES) problems.push(`body count ${report.maxBodies} >= ${MAX_BODIES}`);
  if (report.consoleErrors.length > 0) problems.push(`${report.consoleErrors.length} console error(s)`);
  if (report.pageErrors.length > 0) problems.push(`${report.pageErrors.length} page error(s)`);

  if (problems.length > 0) {
    console.error('LEVEL 12 HARNESS FAILURES:\n  - ' + problems.join('\n  - '));
    process.exitCode = 1;
  } else {
    console.log(
      'LEVEL 12 OK: gas-only cutscene auto-brakes + picks up Caleb + returns control + finishes; MELIN + "Caleb hopped on!!" render; L13 shows Caleb / L11 solo; bodies < 100; no errors.'
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
