// Automated browser playtest for the PLAN-08 task-3 FAIL/RESTART UX. Clones the
// structure of the other scripts/playtest-*.mjs (playwright-core system Chrome
// headless, drives via window.__gabbyGame, screenshots to playtest-out/, gates
// the process exit code). Requires `npm run dev` running on :5173.
//
// Proves the new fail overlay end-to-end:
//   (a) a GENERIC fail (teleport below the world on level 1) shows a message
//       that is one of the FAIL_MESSAGES pool AND a "Try again" button;
//   (b) TAPPING the button restarts INSTANTLY (< BUTTON_RESTART_BUDGET_MS — the
//       "< 500ms-class" active path, clearly under the 2.5s auto fallback);
//   (c) NOT tapping AUTO-restarts by ~FAIL.autoRestartMs (2.5s): the restart
//       lands inside [AUTO_MIN_MS, AUTO_MAX_MS] — proving it is the gentle
//       no-input fallback, not an instant restart;
//   (d) a SPECIAL fail (drive level 7 gas-only into a car) still shows its
//       VERBATIM message ("They really don't see us!! Go again 💛") alongside
//       the same "Try again" button;
//   (e) body count stays < 100 and 0 console/page errors fire.
//
// Usage:
//   node scripts/playtest-fail.mjs
//   PLAYTEST_URL=http://localhost:5174/ OUT_DIR=./shots node scripts/playtest-fail.mjs
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const DEV_URL = process.env.PLAYTEST_URL ?? 'http://localhost:5173/';
const OUT_DIR = process.env.OUT_DIR ?? './playtest-out';
const DESIGN_W = 1280;
const DESIGN_H = 720;

// --- IN SYNC WITH src/systems/constants.ts FAIL_MESSAGES (PLAN-08 task 3). A
// GENERIC fail must show one of these; "Oops! Go again 💛" is the verbatim
// NORTH_STAR §4 line. This file is UTF-8; the yellow heart is U+1F49B. ---
const FAIL_MESSAGES = [
  'Oops! Go again 💛',
  'So close!! One more time',
  'Even MotoGP riders crash sometimes 💛',
];
const TRY_AGAIN_LABEL = 'Try again';
// --- IN SYNC WITH src/systems/traffic.ts (TRAFFIC_FAIL_MESSAGE) — verbatim
// personal copy (NORTH_STAR §5 row 7). The SPECIAL-fail message must be exact. ---
const EXPECT_TRAFFIC_MSG = "They really don't see us!! Go again 💛";

/** Active (button-tap) restart budget, ms — fast, clearly under the 2.5s auto
 * fallback. Dominated by the CDP click + poll roundtrip (the in-game restart is
 * next-frame), so it leaves headroom over that while staying < 500ms-class. */
const BUTTON_RESTART_BUDGET_MS = 1_200;
// --- IN SYNC WITH src/systems/constants.ts FAIL.autoRestartMs (2500). The
// no-input auto-restart must land inside this window: above AUTO_MIN_MS (proves
// it was NOT the instant path) and below AUTO_MAX_MS (2.5s + CDP/settle slack). ---
const FAIL_AUTO_RESTART_MS = 2_500;
const AUTO_MIN_MS = 1_800;
const AUTO_MAX_MS = 4_200;

const MAX_BODIES = 100;
const RESTART_WARP_PX = 1_500;
const GASONLY_TIMEOUT_MS = 45_000;

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

function bodyCount(page) {
  return page.evaluate(
    () => globalThis.__gabbyGame.scene.getScene('GameScene').matter.world.getAllBodies().length
  );
}

/** Recursively search GameScene's display list (incl. Container children — the
 * "Try again" label lives inside the button's Container) for a live Text object
 * whose text is EXACTLY `text`. Proves it actually RENDERED, not just declared. */
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

/** Enter a level fresh via the manager-level bypass (same as playtest-levels.mjs
 * — stops a stale LevelCompleteScene the previous run may have left active). */
async function startLevel(page, level) {
  await page.evaluate((lvl) => {
    const g = globalThis.__gabbyGame;
    if (g.scene.isActive('LevelCompleteScene')) g.scene.stop('LevelCompleteScene');
    g.scene.start('GameScene', { level: lvl });
  }, level);
  await waitForScene(page, 'GameScene');
  await page.waitForTimeout(600); // create() + bike settle
}

/** Trigger a GENERIC fail by teleporting the bike FAR below the world bottom.
 * It must be far (not just past worldBottomY): the stiff suspension struts yank
 * a chassis only slightly below its wheels back UP within a frame, which can
 * beat the fell-off check — y=5000 is unrecoverable in one step, so the fail is
 * guaranteed (the pre-PLAN-08 harness used the same value). */
async function triggerFellOffFail(page) {
  await page.evaluate(() => {
    const s = globalThis.__gabbyGame.scene.getScene('GameScene');
    s.matter.body.setPosition(s.bike.chassis, { x: s.bike.x, y: 5000 });
    s.matter.body.setVelocity(s.bike.chassis, { x: 0, y: 0 });
  });
}

/** Wait until failLevel has actually run: ended latched AND the DEV __fail
 * handle populated. Returns the handle. */
async function waitForFailRegistered(page, timeout = 3_000) {
  await page.waitForFunction(
    () => {
      const s = globalThis.__gabbyGame.scene.getScene('GameScene');
      return s.ended === true && s.__fail != null;
    },
    undefined,
    { timeout }
  );
  return page.evaluate(() => {
    const s = globalThis.__gabbyGame.scene.getScene('GameScene');
    return { ended: s.ended === true, fail: s.__fail ?? null };
  });
}

/** Hold the camera near zoom 1 while the crashed bike is still falling, by
 * repeatedly zeroing its velocity — speed stays ~0, so the speed-driven zoom
 * never drifts and the screen-anchored button maps cleanly to design coords for
 * the real tap. (The overlay + button already exist and are independent of the
 * bike, so damping the bike doesn't disturb them.) */
async function stabilizeZoom(page) {
  for (let i = 0; i < 8; i++) {
    await page.evaluate(() => {
      const s = globalThis.__gabbyGame.scene.getScene('GameScene');
      if (s.bike) s.matter.body.setVelocity(s.bike.chassis, { x: 0, y: 0 });
    });
    await page.waitForTimeout(40);
  }
}

async function waitForPlayableAgain(page, timeout = 6_000) {
  await page.waitForFunction(
    () => {
      const g = globalThis.__gabbyGame;
      const s = g.scene.getScene('GameScene');
      return g.scene.isActive('GameScene') && s.bike && s.bike.y < 1000 && s.ended === false;
    },
    undefined,
    { timeout }
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

    // (a)+(b) GENERIC fail #1 -> pool message + "Try again" button -> TAP -> instant restart.
    await startLevel(page, 1);
    const bodiesBaseline = await bodyCount(page);
    await triggerFellOffFail(page);
    const genericFail = await waitForFailRegistered(page);
    await page.screenshot({ path: join(OUT_DIR, 'fail-generic-overlay.png') });
    const bodiesAfterFail = await bodyCount(page);
    const genericMessageInPool =
      genericFail.fail !== null && FAIL_MESSAGES.includes(genericFail.fail.message);
    const genericButtonShown = await textShown(page, TRY_AGAIN_LABEL);

    // Damp the falling bike so zoom holds at ~1, then tap the button at its
    // design-space center and time the restart.
    await stabilizeZoom(page);
    let buttonRestartMs = null;
    if (genericFail.fail) {
      const tapStart = Date.now();
      await designClick(page, genericFail.fail.buttonX, genericFail.fail.buttonY);
      await waitForPlayableAgain(page);
      buttonRestartMs = Date.now() - tapStart;
    }

    // (c) GENERIC fail #2 -> do NOT tap -> auto-restart by ~2.5s. Measure from
    // the moment the fail REGISTERS (when failLevel schedules the auto timer),
    // not from the teleport, so poll latency before the fail can't inflate it.
    await startLevel(page, 1);
    await triggerFellOffFail(page);
    await waitForFailRegistered(page);
    const autoStart = Date.now();
    await waitForPlayableAgain(page, AUTO_MAX_MS + 2_000);
    const autoRestartMs = Date.now() - autoStart;

    // (d) SPECIAL fail: drive level 7 gas-only into a car -> VERBATIM traffic
    // message + the same "Try again" button. Level 7 is the one level gas-only
    // doesn't clear (by design), so holding gas guarantees a collision.
    await startLevel(page, 7);
    let specialFail = null;
    let specialButtonShown = false;
    const specialStart = Date.now();
    let prevX = null;
    let warpedBack = false;
    while (Date.now() - specialStart < GASONLY_TIMEOUT_MS) {
      await page.keyboard.down('ArrowRight');
      const st = await page.evaluate(() => {
        const s = globalThis.__gabbyGame.scene.getScene('GameScene');
        return {
          ended: s.ended === true,
          fail: s.__fail ?? null,
          lastTraffic: s.__lastTrafficSoftFail ?? null,
          bikeX: globalThis.__gabbyGame.scene.isActive('GameScene') && s.bike ? Math.round(s.bike.x) : null,
        };
      });
      // Gate on `ended` so a stale __fail can never be read before the level-7
      // collision fires (belt-and-suspenders alongside create() clearing it).
      if (st.ended && st.fail && specialFail === null) {
        specialFail = st.fail;
        specialButtonShown = await textShown(page, TRY_AGAIN_LABEL);
        await page.screenshot({ path: join(OUT_DIR, 'fail-special-overlay.png') });
      }
      if (st.bikeX !== null) {
        if (prevX !== null && st.bikeX < prevX - RESTART_WARP_PX) warpedBack = true;
        prevX = st.bikeX;
      }
      // Stop once we captured the special overlay AND observed the restart warp
      // (proves the special fail also restarts through the same path).
      if (specialFail && warpedBack) break;
      await page.waitForTimeout(100);
    }
    await page.keyboard.up('ArrowRight');

    const bodiesSpecial = await bodyCount(page);

    report = {
      generic: {
        bodiesBaseline,
        bodiesAfterFail,
        message: genericFail.fail ? genericFail.fail.message : null,
        messageInPool: genericMessageInPool,
        buttonShown: genericButtonShown,
        buttonRestartMs,
        buttonRestartBudgetMs: BUTTON_RESTART_BUDGET_MS,
        autoRestartMs,
        autoRestartTargetMs: FAIL_AUTO_RESTART_MS,
        autoWindowMs: [AUTO_MIN_MS, AUTO_MAX_MS],
      },
      special: {
        message: specialFail ? specialFail.message : null,
        buttonShown: specialButtonShown,
        warpedBack,
        bodies: bodiesSpecial,
      },
      maxBodies: Math.max(bodiesBaseline, bodiesAfterFail, bodiesSpecial),
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
  // (a) generic pool message + button.
  if (!report.generic.messageInPool) {
    problems.push(`generic fail message not in FAIL_MESSAGES pool: ${JSON.stringify(report.generic.message)}`);
  }
  if (!report.generic.buttonShown) problems.push('generic fail: "Try again" button never rendered');
  // (b) tapping restarts instantly.
  if (report.generic.buttonRestartMs === null) {
    problems.push('generic fail: never tapped the button (no __fail handle)');
  } else if (report.generic.buttonRestartMs > BUTTON_RESTART_BUDGET_MS) {
    problems.push(
      `button-tap restart too slow: ${report.generic.buttonRestartMs}ms > ${BUTTON_RESTART_BUDGET_MS}ms`
    );
  }
  // (c) no-input auto-restart lands in the ~2.5s window.
  if (report.generic.autoRestartMs < AUTO_MIN_MS || report.generic.autoRestartMs > AUTO_MAX_MS) {
    problems.push(
      `auto-restart ${report.generic.autoRestartMs}ms outside [${AUTO_MIN_MS}, ${AUTO_MAX_MS}]ms window`
    );
  }
  // (d) special verbatim message + button.
  if (report.special.message !== EXPECT_TRAFFIC_MSG) {
    problems.push(`special fail message mismatch: got ${JSON.stringify(report.special.message)}`);
  }
  if (!report.special.buttonShown) problems.push('special fail: "Try again" button never rendered');
  if (!report.special.warpedBack) problems.push('special fail did not restart (no warp back to spawn)');
  // (e) bodies + errors.
  if (report.maxBodies >= MAX_BODIES) problems.push(`body count ${report.maxBodies} >= ${MAX_BODIES}`);
  if (report.consoleErrors.length > 0) problems.push(`${report.consoleErrors.length} console error(s)`);
  if (report.pageErrors.length > 0) problems.push(`${report.pageErrors.length} page error(s)`);

  if (problems.length > 0) {
    console.error('FAIL-UX HARNESS FAILURES:\n  - ' + problems.join('\n  - '));
    process.exitCode = 1;
  } else {
    console.log(
      `FAIL UX OK: generic pool message + "Try again" button; tap restarts in ${report.generic.buttonRestartMs}ms ` +
        `(< ${BUTTON_RESTART_BUDGET_MS}); no-input auto-restart in ${report.generic.autoRestartMs}ms (~2.5s); ` +
        `special fail shows the verbatim traffic message + button; bodies < 100; no errors.`
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
