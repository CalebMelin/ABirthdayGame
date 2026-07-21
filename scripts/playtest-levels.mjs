// Automated browser "ghost driver" for PLAN-05 ST-5/task 6 — proves every
// one of the 22 levels is gas-only-beatable (companion to playtest-drive.mjs,
// which exercises restart/fail/perf mechanics on a single level; this one
// sweeps the whole level SET for completability).
//
// Launches the SYSTEM Chrome headless via playwright-core (channel:
// 'chrome' — no browser download, same technique as every other
// scripts/playtest-*.mjs), waits for TitleScene (confirms BootScene's asset
// generation finished — no character/UI click-through needed beyond that:
// character choice is purely cosmetic, see PLAN-04 DECISIONS.md), then for
// each level 1..22:
//   1. enters DIRECTLY via game.scene.start('GameScene', { level: n })
//      (bypassing LevelSelect's unlock gating entirely). Verified against
//      the installed Phaser 3.90 SceneManager source
//      (node_modules/phaser/src/scene/SceneManager.js's `start()`): calling
//      start() on a scene key that is already RUNNING/PAUSED/SLEEPING calls
//      sys.shutdown() then sys.start(data) — the same shutdown-then-create
//      lifecycle scene.restart() uses (GameScene's own SHUTDOWN handler
//      already documents relying on exactly that ordering), so this is a
//      clean fresh entry every time, not a no-op or a leak.
//   2. waits for GameScene active + a short settle, reads the baseline
//      Matter body count (decorations/events add none as of PLAN-05 — see
//      GameScene.ts),
//   3. holds gas (ArrowRight, re-pressed every poll — CDP has no OS key
//      auto-repeat) until the level's terminal scene activates (finished) or a
//      per-level timeout hits, detecting a crash-restart loop (bike x
//      warping back toward spawn, same heuristic/threshold as
//      playtest-drive.mjs) along the way. The terminal scene is
//      LevelCompleteScene for levels 1-21 and PartyScene for the final level
//      22 (PLAN-08 task 1: level 22 skips the per-level congrats screen),
//   4. screenshots the level and records how many console/page errors fired
//      while THAT level specifically was active (a running total is sliced
//      by count before/after each level).
//
// GAS-ONLY driving on purpose — the 22 configs were authored conservatively
// (gentle raised-cosine humps, no flip kickers, hilliness <=0.30 on every
// jump-bearing level; see src/levels/validate.ts) specifically so a
// gas-only run should clear every level; this harness is the empirical
// proof, not an assumption. No brake taps are scripted anywhere below; if a
// level genuinely needs one to finish, that is a level-authoring bug to
// FIX, not to paper over here.
//
// Assertions (gate the process exit code):
//   - every EVENT-FREE level (all except NORTH_STAR-§5's special-content
//     ids 7/11/12/15/18) must finish;
//   - every level's Matter body count must stay under NORTH_STAR §8's <100
//     budget;
//   - zero console/page errors fire across the whole run.
// The 5 special-event levels are recorded and reported (and WARN on the
// console if one doesn't finish) but do NOT gate the exit code: PLAN-05
// only stubs their events as no-ops, so they happen to be gas-only-safe
// today, but a real PLAN-06/07 obstacle (traffic, a police chase) could
// legitimately require more than gas alone — gating on them here would make
// this harness go stale the moment that lands.
//
// Requires `npm run dev` running. Usage:
//   node scripts/playtest-levels.mjs
//   PLAYTEST_URL=http://localhost:5174/ OUT_DIR=./shots node scripts/playtest-levels.mjs
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const DEV_URL = process.env.PLAYTEST_URL ?? 'http://localhost:5173/';
const OUT_DIR = process.env.OUT_DIR ?? './playtest-out';
const DESIGN_W = 1280;
const DESIGN_H = 720;

// IN SYNC WITH src/systems/constants.ts's TOTAL_LEVELS. Kept as a literal
// (not imported) — this is a plain-JS Node script that talks to the game
// only over the browser/CDP boundary, same convention every other
// scripts/playtest-*.mjs already uses for structural constants it can't
// reach through window.__gabbyGame (see e.g. playtest-character.mjs's
// hardcoded mirrors of src/data/characters.ts, each commented "IN SYNC
// WITH").
const TOTAL_LEVELS = 22;
/** IN SYNC WITH src/levels/types.ts's REQUIRED_EVENTS ids / NORTH_STAR §5's
 * special-content rows: traffic(7), wheelieRider(11), calebPickup(12),
 * police(15), billboard(18). PLAN-05 stubs every one of these as a no-op,
 * so they're expected to finish gas-only today same as any other level —
 * but they're excluded from the GATED assertion (see header) since a later
 * plan's real implementation could legitimately need more than gas alone. */
const EVENT_LEVEL_IDS = [7, 11, 12, 15, 18];
/** Per-level drive timeout. Generous headroom over NORTH_STAR's 20-45s
 * "beatable by a mediocre player" window — real gas-only runs measured on
 * this project's levels/TEST_LEVEL predecessor land well under this (see
 * PROGRESS.md), so hitting it at all is itself a finding. */
const LEVEL_TIMEOUT_MS = 60_000;
/** NORTH_STAR §8 physics-body budget ("< 100 physics bodies per level"). */
const MAX_BODIES = 100;
/** Bike-x regression (px) between two polls that flags a fail-restart
 * (spawn warp-back) rather than ordinary forward progress — same
 * threshold/heuristic playtest-drive.mjs uses. */
const RESTART_WARP_PX = 1500;
/** Poll interval while holding gas, ms — same cadence as playtest-drive.mjs. */
const POLL_MS = 250;

async function waitForScene(page, key, timeout = 20_000) {
  await page.waitForFunction(
    (k) => globalThis.__gabbyGame?.scene.isActive(k) === true,
    key,
    { timeout }
  );
}

/** Matter body count in GameScene's world (terrain chain + bike — see
 * playtest-drive.mjs, the original source of this helper). */
function bodyCount(page) {
  return page.evaluate(
    () => globalThis.__gabbyGame.scene.getScene('GameScene').matter.world.getAllBodies().length
  );
}

/** Enters level `id` directly, drives it gas-only to completion or timeout,
 * and returns one report row. `errorSink` is the run-wide console/page
 * error accumulator (see main) — this level's OWN error count is the delta
 * across the call, so a boot-time error never gets misattributed to level 1
 * and every level's count reflects only errors that fired while it was the
 * active scene. */
async function playLevel(page, id, errorSink) {
  const errorsBefore = errorSink.consoleErrors.length + errorSink.pageErrors.length;

  await page.evaluate((levelId) => {
    const g = globalThis.__gabbyGame;
    // In REAL play, LevelCompleteScene's "next ->" button calls
    // this.scene.start(SCENE_KEYS.game, ...) on ITSELF, which stops the
    // CALLING scene (LevelCompleteScene) before starting GameScene (Phaser's
    // ScenePlugin.start semantics). Our manager-level game.scene.start(...)
    // bypass has no "calling scene" to stop, so a LevelCompleteScene left
    // active by the PREVIOUS level would otherwise stay active forever,
    // making g.scene.isActive('LevelCompleteScene') read stale-true on the
    // very next level's first poll (both scenes CAN be active
    // simultaneously in Phaser, same as the pause-menu-over-GameScene
    // pattern) — a real bug this harness hit and fixed during PLAN-05
    // ST-5/task 6 (see DECISIONS.md): every level after the first appeared
    // to "finish" in 0 seconds. Stopping it explicitly here reproduces the
    // real UI's self-cleaning transition.
    if (g.scene.isActive('LevelCompleteScene')) {
      g.scene.stop('LevelCompleteScene');
    }
    // PLAN-08 task 1: finishing the FINAL level (22) now routes to PartyScene
    // instead of LevelCompleteScene, so a prior level-22 run could leave
    // PartyScene active — stop it too for the same self-cleaning reason.
    if (g.scene.isActive('PartyScene')) {
      g.scene.stop('PartyScene');
    }
    g.scene.start('GameScene', { level: levelId });
  }, id);
  await waitForScene(page, 'GameScene');
  await page.waitForTimeout(600); // let create() finish + bike settle (matches playtest-drive.mjs)

  const bodies = await bodyCount(page);
  const worldLength = await page.evaluate(
    () => globalThis.__gabbyGame.scene.getScene('GameScene').terrain?.worldLength ?? null
  );

  const driveStart = Date.now();
  let finished = false;
  let restartCount = 0;
  let prevX = null;
  let lastX = null;
  while (Date.now() - driveStart < LEVEL_TIMEOUT_MS) {
    await page.keyboard.down('ArrowRight');
    // PLAN-08 task 1: the FINAL level (22) SKIPS LevelCompleteScene and lands
    // on PartyScene, so its "finished" terminal scene differs from levels 1-21.
    const finishKey = id >= TOTAL_LEVELS ? 'PartyScene' : 'LevelCompleteScene';
    const state = await page.evaluate((key) => {
      const g = globalThis.__gabbyGame;
      const s = g.scene.getScene('GameScene');
      return {
        complete: g.scene.isActive(key),
        bikeX: g.scene.isActive('GameScene') && s.bike ? Math.round(s.bike.x) : null,
      };
    }, finishKey);
    if (state.complete) {
      finished = true;
      break;
    }
    if (state.bikeX !== null) {
      if (prevX !== null && state.bikeX < prevX - RESTART_WARP_PX) restartCount++;
      prevX = state.bikeX;
      lastX = state.bikeX;
    }
    await page.waitForTimeout(POLL_MS);
  }
  await page.keyboard.up('ArrowRight');
  const driveMs = Date.now() - driveStart;

  await page.screenshot({ path: join(OUT_DIR, `level-${String(id).padStart(2, '0')}.png`) });

  const errorsAfter = errorSink.consoleErrors.length + errorSink.pageErrors.length;

  return {
    id,
    hasEvent: EVENT_LEVEL_IDS.includes(id),
    finished,
    driveSeconds: Math.round(driveMs / 100) / 10,
    bodies,
    worldLength,
    finalX: lastX,
    restartCount,
    errors: errorsAfter - errorsBefore,
  };
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: DESIGN_W, height: DESIGN_H } });
  const page = await context.newPage();

  const errorSink = { consoleErrors: [], pageErrors: [] };
  page.on('console', (msg) => {
    if (msg.type() === 'error') errorSink.consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => errorSink.pageErrors.push(String(err)));

  const rows = [];
  try {
    await page.goto(DEV_URL, { waitUntil: 'domcontentloaded' });
    await waitForScene(page, 'TitleScene'); // confirms BootScene's asset generation finished

    for (let id = 1; id <= TOTAL_LEVELS; id++) {
      const row = await playLevel(page, id, errorSink);
      rows.push(row);
    }
  } finally {
    await browser.close();
  }

  const eventFreeRows = rows.filter((r) => !r.hasEvent);
  const eventRows = rows.filter((r) => r.hasEvent);
  const eventFreeUnfinished = eventFreeRows.filter((r) => !r.finished);
  const eventUnfinished = eventRows.filter((r) => !r.finished);
  const overBodyBudget = rows.filter((r) => r.bodies >= MAX_BODIES);
  // A gas-only run that CRASHES then recovers still returns finished:true;
  // restartCount>0 means it didn't CLEANLY make it. Gate event-free levels
  // on it (the harness's whole point is proving clean gas-only beatability);
  // event levels only WARN (a real PLAN-06/07 obstacle could force a retry).
  const eventFreeRestarted = eventFreeRows.filter((r) => r.restartCount > 0);
  const eventRestarted = eventRows.filter((r) => r.restartCount > 0);

  const summary = {
    totalLevels: rows.length,
    eventFreeTotal: eventFreeRows.length,
    eventFreeFinished: eventFreeRows.length - eventFreeUnfinished.length,
    eventFreeUnfinishedIds: eventFreeUnfinished.map((r) => r.id), // GATES the exit code
    eventLevelIds: EVENT_LEVEL_IDS,
    eventLevelsFinishedIds: eventRows.filter((r) => r.finished).map((r) => r.id),
    eventLevelsNotFinishedIds: eventUnfinished.map((r) => r.id), // WARN only, not gated
    eventFreeRestartedIds: eventFreeRestarted.map((r) => r.id), // GATES the exit code
    eventLevelsRestartedIds: eventRestarted.map((r) => r.id), // WARN only, not gated
    maxBodies: MAX_BODIES,
    maxBodiesSeen: rows.reduce((max, r) => Math.max(max, r.bodies), 0),
    overBodyBudgetIds: overBodyBudget.map((r) => r.id), // GATES the exit code
    totalConsoleErrors: errorSink.consoleErrors.length, // GATES the exit code
    totalPageErrors: errorSink.pageErrors.length, // GATES the exit code
  };

  const report = { rows, summary, consoleErrors: errorSink.consoleErrors, pageErrors: errorSink.pageErrors };
  console.log(JSON.stringify(report, null, 2));

  if (eventUnfinished.length > 0) {
    console.warn(
      `WARNING: ${eventUnfinished.length} special-event level(s) did not finish gas-only (ids ${eventUnfinished
        .map((r) => r.id)
        .join(', ')}). Not gated (a real PLAN-06/07 event could legitimately block gas-only), but worth a look.`
    );
  }
  if (eventRestarted.length > 0) {
    console.warn(
      `WARNING: ${eventRestarted.length} special-event level(s) crash-restarted mid-drive (ids ${eventRestarted
        .map((r) => r.id)
        .join(', ')}). Not gated (a real PLAN-06/07 obstacle could force a retry), but worth a look.`
    );
  }

  const gatedFailure =
    eventFreeUnfinished.length > 0 ||
    eventFreeRestarted.length > 0 ||
    overBodyBudget.length > 0 ||
    errorSink.consoleErrors.length > 0 ||
    errorSink.pageErrors.length > 0;

  if (gatedFailure) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
