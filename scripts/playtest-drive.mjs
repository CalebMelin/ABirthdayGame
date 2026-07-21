// Automated browser playtest for PLAN-02+ (reused by later plans).
//
// Launches the SYSTEM Chrome headless via playwright-core (channel:
// 'chrome' — no browser download), clicks through the real UI
// (Title -> CharacterCreation -> LevelSelect -> level 1), then:
//   1. reads the Matter body-count baseline in GameScene,
//   2. performs 3 scene restarts (the same scene.restart() path the fail
//      flow uses) and re-reads the body count after each — the PLAN-02
//      "no physics-body leaks after 3 restarts" check,
//   3. triggers one real GENERIC fail (teleports the bike below the world
//      bottom) to exercise the PLAN-08 task-3 fail UX — a FAIL_MESSAGES pool
//      message + a "Try again" button — then TAPS the button and asserts the
//      active (tap) restart is fast (< BUTTON_RESTART_BUDGET_MS, the
//      "< 500ms-class" budget now living on the button path, not the 2.5s
//      no-input auto-restart), plus body-count stability across the fail,
//   4. holds ArrowRight (gas only, "grandma difficulty") until
//      LevelCompleteScene activates or a timeout hits, screenshotting
//      mid-drive.
//
// It talks to the game through window.__gabbyGame, which src/main.ts
// exposes in dev builds only. Requires `npm run dev` to be running.
//
// Usage:
//   node scripts/playtest-drive.mjs
//   PLAYTEST_URL=http://localhost:5174/ OUT_DIR=./shots node scripts/playtest-drive.mjs
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const DEV_URL = process.env.PLAYTEST_URL ?? 'http://localhost:5173/';
const OUT_DIR = process.env.OUT_DIR ?? './playtest-out';
const DESIGN_W = 1280;
const DESIGN_H = 720;
const DRIVE_TIMEOUT_MS = 90_000;
/** PLAN-02 "60fps" criterion: average actualFps sampled mid-drive must
 * clear this (55 leaves headroom for headless-Chrome scheduling noise
 * while still catching a real perf regression). Samples skip the first
 * 3s (scene spin-up + font/texture warmup skews early frames). */
const MIN_AVG_FPS = 55;
const FPS_WARMUP_MS = 3_000;

// --- IN SYNC WITH src/systems/constants.ts FAIL_MESSAGES (PLAN-08 task 3). A
// GENERIC fail (head crash / fell off world) must show one of these; "Oops! Go
// again 💛" is the verbatim NORTH_STAR §4 line. This file is UTF-8; the yellow
// heart is U+1F49B. ---
const FAIL_MESSAGES = [
  'Oops! Go again 💛',
  'So close!! One more time',
  'Even MotoGP riders crash sometimes 💛',
];
const TRY_AGAIN_LABEL = 'Try again';
/** Budget (ms) for the ACTIVE (button-tap) restart — must be fast and clearly
 * distinct from the 2.5s no-input auto-restart (FAIL.autoRestartMs), preserving
 * PLAN-02's "< 500ms-class" budget for the button path. The measured value is
 * dominated by the CDP click + waitForFunction poll latency (the in-game
 * scene.restart is next-frame), so the budget leaves headroom over that
 * roundtrip while still separating it unambiguously from 2500ms. */
const BUTTON_RESTART_BUDGET_MS = 1_200;

/** Click a design-space (1280x720) coordinate on the FIT-scaled canvas by
 * mapping it through the canvas element's current bounding box. */
async function designClick(page, x, y) {
  const box = await page.locator('canvas').boundingBox();
  if (!box) throw new Error('canvas not found');
  await page.mouse.click(box.x + (x / DESIGN_W) * box.width, box.y + (y / DESIGN_H) * box.height);
}

async function waitForScene(page, key, timeout = 20_000) {
  await page.waitForFunction(
    (k) => globalThis.__gabbyGame?.scene.isActive(k) === true,
    key,
    { timeout }
  );
}

/** Matter body count in GameScene's world (terrain chain + bike). */
function bodyCount(page) {
  return page.evaluate(
    () => globalThis.__gabbyGame.scene.getScene('GameScene').matter.world.getAllBodies().length
  );
}

/** Recursively search GameScene's display list (including Container children —
 * the "Try again" label lives inside the button's Container) for a live Text
 * object whose text is EXACTLY `text`. Proves the object actually RENDERED. */
function textShown(page, text) {
  return page.evaluate((t) => {
    const s = globalThis.__gabbyGame.scene.getScene('GameScene');
    if (!s || !s.children) return false;
    const stack = [...s.children.list];
    while (stack.length > 0) {
      const o = stack.pop();
      if (o.type === 'Text' && o.text === t) return true;
      if (Array.isArray(o.list)) stack.push(...o.list);
    }
    return false;
  }, text);
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: DESIGN_W, height: DESIGN_H } });
  const page = await context.newPage();

  const consoleErrors = [];
  const consoleWarnings = [];
  const pageErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
    if (msg.type() === 'warning') consoleWarnings.push(msg.text());
  });
  page.on('pageerror', (err) => pageErrors.push(String(err)));

  try {
    await page.goto(DEV_URL, { waitUntil: 'domcontentloaded' });

    // Fresh context => empty localStorage => first-launch path:
    // Title "Play" -> CharacterCreation "Let's ride! ->" -> LevelSelect -> level 1.
    await waitForScene(page, 'TitleScene');
    await designClick(page, 640, 400); // Title: Play
    await waitForScene(page, 'CharacterCreationScene');
    await designClick(page, 820, 660); // CharacterCreation: Let's ride! -> (PLAN-04 task 3)
    await waitForScene(page, 'LevelSelectScene');
    await designClick(page, 265, 220); // LevelSelect: level 1 cell
    await waitForScene(page, 'GameScene');
    await page.waitForTimeout(600); // let create() finish + bike settle
    const baselineBodies = await bodyCount(page);

    // --- 3 restarts via the exact scene.restart() path the fail flow uses.
    const bodiesAfterRestart = [];
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => {
        globalThis.__gabbyGame.scene.getScene('GameScene').scene.restart({ level: 1 });
      });
      await page.waitForTimeout(500); // restart + settle
      await waitForScene(page, 'GameScene');
      bodiesAfterRestart.push(await bodyCount(page));
    }

    // --- one real GENERIC fail: teleport the bike FAR below the world bottom
    // (y=5000 — far enough that the stiff suspension struts can't yank the
    // chassis back above the fell-off threshold in one frame; a shallow drop
    // can beat the check), then exercise the PLAN-08 task-3 fail UX: a
    // FAIL_MESSAGES pool message + a "Try again" button whose TAP restarts
    // instantly.
    await page.evaluate(() => {
      const s = globalThis.__gabbyGame.scene.getScene('GameScene');
      // `bike` is a private TS field, freely reachable at runtime.
      s.matter.body.setPosition(s.bike.chassis, { x: s.bike.x, y: 5000 });
      s.matter.body.setVelocity(s.bike.chassis, { x: 0, y: 0 });
    });
    // Wait until failLevel actually ran (ended latched + the DEV __fail handle
    // populated) before reading the overlay.
    await page.waitForFunction(
      () => {
        const s = globalThis.__gabbyGame.scene.getScene('GameScene');
        return s.ended === true && s.__fail != null;
      },
      undefined,
      { timeout: 3_000 }
    );
    await page.screenshot({ path: join(OUT_DIR, 'fail-overlay.png') });
    const failInfo = await page.evaluate(() => {
      const s = globalThis.__gabbyGame.scene.getScene('GameScene');
      return { ended: s.ended === true, fail: s.__fail ?? null };
    });
    const failMessageInPool =
      failInfo.fail !== null && FAIL_MESSAGES.includes(failInfo.fail.message);
    const tryAgainShown = await textShown(page, TRY_AGAIN_LABEL);

    // Damp the falling bike (repeated zero-velocity) so the speed-driven camera
    // zoom holds at ~1 and the screen-anchored button maps cleanly to design
    // coords, then tap "Try again" at its center and time the restart.
    for (let i = 0; i < 8; i++) {
      await page.evaluate(() => {
        const s = globalThis.__gabbyGame.scene.getScene('GameScene');
        if (s.bike) s.matter.body.setVelocity(s.bike.chassis, { x: 0, y: 0 });
      });
      await page.waitForTimeout(40);
    }
    const tapStart = Date.now();
    if (failInfo.fail) await designClick(page, failInfo.fail.buttonX, failInfo.fail.buttonY);
    // Playable again = GameScene active AND a fresh bike back near spawn.
    await page.waitForFunction(
      () => {
        const g = globalThis.__gabbyGame;
        const s = g.scene.getScene('GameScene');
        return g.scene.isActive('GameScene') && s.bike && s.bike.y < 1000 && s.ended === false;
      },
      undefined,
      { timeout: 5_000 }
    );
    const buttonRestartMs = Date.now() - tapStart;
    await page.waitForTimeout(400);
    const bodiesAfterFail = await bodyCount(page);

    // --- the gas-only drive. The key is re-pressed every poll tick: CDP
    // has no OS key auto-repeat, so a fail's scene.restart() (which
    // recreates the Key objects) would otherwise silently drop a held key
    // that a real browser would re-latch from repeat events.
    const driveStart = Date.now();
    let midShotTaken = false;
    let finished = false;
    let failCount = 0; // mid-drive restarts (bike x warping back to spawn)
    let prevX = null;
    const progressSamples = [];
    const fpsSamples = [];
    while (Date.now() - driveStart < DRIVE_TIMEOUT_MS) {
      await page.keyboard.down('ArrowRight');
      const state = await page.evaluate(() => {
        const g = globalThis.__gabbyGame;
        const s = g.scene.getScene('GameScene');
        return {
          complete: g.scene.isActive('LevelCompleteScene'),
          bikeX: g.scene.isActive('GameScene') && s.bike ? Math.round(s.bike.x) : null,
          fps: g.loop.actualFps,
        };
      });
      if (Date.now() - driveStart > FPS_WARMUP_MS && state.bikeX !== null) {
        fpsSamples.push(state.fps);
      }
      if (state.complete) {
        finished = true;
        break;
      }
      if (state.bikeX !== null) {
        if (prevX !== null && state.bikeX < prevX - 1500) failCount++;
        prevX = state.bikeX;
        progressSamples.push({ t: Date.now() - driveStart, x: state.bikeX });
      }
      if (!midShotTaken && Date.now() - driveStart > 8_000) {
        await page.screenshot({ path: join(OUT_DIR, 'mid-drive.png') });
        midShotTaken = true;
      }
      await page.waitForTimeout(250);
    }
    await page.keyboard.up('ArrowRight');
    const driveMs = Date.now() - driveStart;
    await page.screenshot({ path: join(OUT_DIR, 'end-state.png') });

    const avgFps =
      fpsSamples.length > 0
        ? Math.round((fpsSamples.reduce((a, b) => a + b, 0) / fpsSamples.length) * 10) / 10
        : null;
    const minFps =
      fpsSamples.length > 0 ? Math.round(Math.min(...fpsSamples) * 10) / 10 : null;

    const report = {
      finished,
      failCountDuringDrive: failCount,
      driveSeconds: Math.round(driveMs / 100) / 10,
      baselineBodies,
      bodiesAfterRestart,
      bodiesAfterFail,
      failMessage: failInfo.fail ? failInfo.fail.message : null,
      failMessageInPool,
      tryAgainShown,
      buttonRestartMs,
      buttonRestartBudgetMs: BUTTON_RESTART_BUDGET_MS,
      avgFps,
      minFps,
      minAvgFps: MIN_AVG_FPS,
      consoleErrors,
      consoleWarnings,
      pageErrors,
      lastProgressSamples: progressSamples.slice(-8),
    };
    console.log(JSON.stringify(report, null, 2));
    // consoleErrors/pageErrors were already collected + printed above (via
    // `report`) but previously never failed the run — a regression that
    // logs a console error could pass silently. Gate on them too.
    if (
      !finished ||
      failCount > 0 ||
      !failMessageInPool ||
      !tryAgainShown ||
      buttonRestartMs > BUTTON_RESTART_BUDGET_MS ||
      avgFps === null ||
      avgFps < MIN_AVG_FPS ||
      consoleErrors.length > 0 ||
      pageErrors.length > 0
    ) {
      process.exitCode = 1;
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
