// Automated browser playtest for PLAN-03 task 3 (portrait rotate-phone guard).
// Companion to playtest-drive.mjs + playtest-touch.mjs (run those too — they're
// the non-touch + touch-pedal regression gates; the device.ts extraction and
// the loop-sleep must not regress either).
//
// Proves, as far as the harness allows, the orientation acceptance criteria:
//   TOUCH context (hasTouch + isMobile, starts landscape 1280x720):
//     - drive into GameScene in landscape → the overlay exists but is HIDDEN,
//     - rotate to PORTRAIT (setViewportSize 414x896) → the overlay is VISIBLE,
//       its message is EXACTLY "Flip your phone sideways to ride! 🏍️", the
//       Phaser loop is asleep (game.loop.running === false), the GameScene is
//       still active (loop.sleep doesn't disturb scene state), and the game is
//       FROZEN: holding gas does NOT advance bike.x,
//     - rotate back to LANDSCAPE (1280x720) → the overlay is HIDDEN again, the
//       loop is running, and the game RESUMES: gas advances bike.x ("rotating
//       back resumes seamlessly").
//   NON-TOUCH context (default desktop): rotate to a portrait-shaped viewport →
//     the overlay is NOT shown (desktop is never blocked — the guard installs
//     nothing) AND the game keeps running (gas still advances bike.x).
//
// matchMedia('(orientation: portrait)') tracks viewport aspect in Chromium, so
// setViewportSize to a tall size flips orientation; the guard's `resize` backup
// listener catches it even if the MQL `change` event is flaky under Playwright.
//
// Talks to the game through window.__gabbyGame (dev-only; see src/main.ts).
// Requires `npm run dev` running. Usage: node scripts/playtest-orientation.mjs
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const DEV_URL = process.env.PLAYTEST_URL ?? 'http://localhost:5173/';
const OUT_DIR = process.env.OUT_DIR ?? './playtest-out';
const DESIGN_W = 1280;
const DESIGN_H = 720;
const LANDSCAPE = { width: 1280, height: 720 };
const PORTRAIT = { width: 414, height: 896 };

// Must match src/systems/orientation.ts exactly (byte-for-byte, incl. the emoji).
const EXPECTED_TEXT = 'Flip your phone sideways to ride! 🏍️';
const OVERLAY_ID = 'gabby-orientation-guard';
const MSG_SELECTOR = '.gabby-orientation-msg';

function vx(box, x) {
  return box.x + (x / DESIGN_W) * box.width;
}
function vy(box, y) {
  return box.y + (y / DESIGN_H) * box.height;
}
async function canvasBox(page) {
  const box = await page.locator('canvas').boundingBox();
  if (!box) throw new Error('canvas not found');
  return box;
}
async function clickDesign(page, x, y) {
  const box = await canvasBox(page);
  await page.mouse.click(vx(box, x), vy(box, y));
}
async function tapDesign(page, x, y) {
  const box = await canvasBox(page);
  await page.touchscreen.tap(vx(box, x), vy(box, y));
}

async function waitForScene(page, key, timeout = 20_000) {
  await page.waitForFunction((k) => globalThis.__gabbyGame?.scene.isActive(k) === true, key, {
    timeout,
  });
}

/** GameScene + loop + overlay snapshot the assertions read. */
function readState(page) {
  return page.evaluate(
    ({ id, msgSel }) => {
      const g = globalThis.__gabbyGame;
      const s = g.scene.getScene('GameScene');
      const active = g.scene.isActive('GameScene');
      const bike = active && s.bike ? { x: s.bike.x, y: s.bike.y } : null;
      const el = document.getElementById(id);
      const overlay = el
        ? (() => {
            const cs = getComputedStyle(el);
            const msg = el.querySelector(msgSel);
            return {
              present: true,
              hidden: el.hidden,
              display: cs.display,
              visible: cs.display !== 'none' && !el.hidden,
              text: msg ? msg.textContent : null,
            };
          })()
        : { present: false, hidden: null, display: null, visible: false, text: null };
      return {
        active,
        bike,
        overlay,
        loopRunning: g.loop.running,
        portraitMql: window.matchMedia('(orientation: portrait)').matches,
      };
    },
    { id: OVERLAY_ID, msgSel: MSG_SELECTOR }
  );
}

async function enterLevel1(page, nav) {
  await waitForScene(page, 'TitleScene');
  await nav(page, 640, 400); // Title: Play
  await waitForScene(page, 'CharacterCreationScene');
  await nav(page, 820, 660); // CharacterCreation: Let's ride! -> (PLAN-04 task 3)
  await waitForScene(page, 'LevelSelectScene');
  await nav(page, 265, 220);
  await waitForScene(page, 'GameScene');
  await page.waitForTimeout(700); // create() + let the bike settle (velocity ~0)
}

/** Hold gas (ArrowRight) for `ms`, re-pressing each tick (CDP has no key
 * auto-repeat), and measure how far bike.x moved. Returns start/end/dx. */
async function driveAndMeasure(page, ms) {
  const start = await readState(page);
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(150);
  }
  const end = await readState(page);
  await page.keyboard.up('ArrowRight');
  const dx = (end.bike?.x ?? 0) - (start.bike?.x ?? 0);
  return { startX: start.bike?.x ?? null, endX: end.bike?.x ?? null, dx, end };
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });

  const checks = {};
  const evidence = {};
  const consoleErrors = [];
  const pageErrors = [];

  try {
    // ======================================================================
    // TOUCH CONTEXT — overlay blocks + freezes in portrait, resumes in landscape
    // ======================================================================
    const touchCtx = await browser.newContext({
      hasTouch: true,
      isMobile: true,
      viewport: LANDSCAPE,
    });
    const page = await touchCtx.newPage();
    page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
    page.on('pageerror', (e) => pageErrors.push(String(e)));

    await page.goto(DEV_URL, { waitUntil: 'domcontentloaded' });
    await enterLevel1(page, tapDesign);

    // --- landscape: overlay exists but hidden, loop running ----------------
    const land0 = await readState(page);
    evidence.touchLandscapeStart = {
      overlayPresent: land0.overlay.present,
      overlayVisible: land0.overlay.visible,
      loopRunning: land0.loopRunning,
      portraitMql: land0.portraitMql,
    };
    checks.touch_overlayPresentButHiddenInLandscape =
      land0.overlay.present === true && land0.overlay.visible === false;
    checks.touch_loopRunningInLandscape = land0.loopRunning === true;

    // --- rotate to PORTRAIT: overlay shows, loop sleeps, game frozen -------
    await page.setViewportSize(PORTRAIT);
    await page.waitForTimeout(400); // let the resize/MQL listeners fire
    const port = await readState(page);
    await page.screenshot({ path: join(OUT_DIR, 'orientation-portrait.png') });

    const frozen = await driveAndMeasure(page, 1200); // hold gas while portrait

    evidence.touchPortrait = {
      portraitMql: port.portraitMql,
      overlayVisible: port.overlay.visible,
      overlayDisplay: port.overlay.display,
      overlayText: port.overlay.text,
      overlayTextMatches: port.overlay.text === EXPECTED_TEXT,
      loopRunning: port.loopRunning,
      sceneStillActive: port.active,
      bikeStartX: Math.round(frozen.startX ?? NaN),
      bikeEndX: Math.round(frozen.endX ?? NaN),
      bikeDxWhileGasHeld: Math.round((frozen.dx ?? 0) * 1000) / 1000,
    };
    checks.touch_overlayVisibleInPortrait = port.overlay.visible === true;
    checks.touch_overlayTextExact = port.overlay.text === EXPECTED_TEXT;
    checks.touch_loopAsleepInPortrait = port.loopRunning === false;
    checks.touch_sceneStillActiveWhileAsleep = port.active === true; // loop.sleep ≠ scene.pause
    checks.touch_gameFrozenGasDoesNotAdvance = Math.abs(frozen.dx ?? 999) < 1;

    // --- rotate back to LANDSCAPE: overlay hides, loop wakes, game resumes --
    await page.setViewportSize(LANDSCAPE);
    await page.waitForTimeout(400);
    const land1 = await readState(page);
    const resumed = await driveAndMeasure(page, 1600); // gas should now advance
    await page.screenshot({ path: join(OUT_DIR, 'orientation-resumed.png') });

    evidence.touchResumed = {
      overlayVisible: land1.overlay.visible,
      loopRunning: land1.loopRunning,
      bikeStartX: Math.round(resumed.startX ?? NaN),
      bikeEndX: Math.round(resumed.endX ?? NaN),
      bikeDxUnderGas: Math.round(resumed.dx ?? 0),
    };
    checks.touch_overlayHiddenAfterRotateBack = land1.overlay.visible === false;
    checks.touch_loopRunningAfterRotateBack = land1.loopRunning === true;
    checks.touch_gameResumesGasAdvances = (resumed.dx ?? 0) > 100;

    await touchCtx.close();

    // ======================================================================
    // TOUCH CONTEXT, LOADED ALREADY IN PORTRAIT — proves the initial loop sync
    // (deferred to the first POST_STEP, since the loop isn't running yet at
    // install time) sleeps a page that BOOTS in portrait. We never enter a game
    // scene here (the overlay covers the menus); we only assert the guard
    // reacted at boot: overlay visible + loop asleep.
    // ======================================================================
    const portraitLoadCtx = await browser.newContext({
      hasTouch: true,
      isMobile: true,
      viewport: PORTRAIT,
    });
    const ppage = await portraitLoadCtx.newPage();
    ppage.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
    ppage.on('pageerror', (e) => pageErrors.push(String(e)));
    await ppage.goto(DEV_URL, { waitUntil: 'domcontentloaded' });
    // Wait until the loop has booted (started) then been put to sleep by the
    // first POST_STEP handler — or a timeout.
    await ppage
      .waitForFunction(() => globalThis.__gabbyGame?.loop?.running === false, undefined, {
        timeout: 10_000,
      })
      .catch(() => {});
    const loaded = await readState(ppage);
    await ppage.screenshot({ path: join(OUT_DIR, 'orientation-load-portrait.png') });
    evidence.touchLoadedInPortrait = {
      portraitMql: loaded.portraitMql,
      overlayVisible: loaded.overlay.visible,
      overlayTextMatches: loaded.overlay.text === EXPECTED_TEXT,
      loopRunning: loaded.loopRunning,
    };
    checks.touch_loadedInPortrait_overlayVisible = loaded.overlay.visible === true;
    checks.touch_loadedInPortrait_loopAsleep = loaded.loopRunning === false;
    await portraitLoadCtx.close();

    // ======================================================================
    // NON-TOUCH (DESKTOP) CONTEXT — never blocked, even portrait-shaped.
    // ======================================================================
    const deskCtx = await browser.newContext({ viewport: LANDSCAPE });
    const dpage = await deskCtx.newPage();
    dpage.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
    dpage.on('pageerror', (e) => pageErrors.push(String(e)));
    await dpage.goto(DEV_URL, { waitUntil: 'domcontentloaded' });
    await enterLevel1(dpage, clickDesign);

    await dpage.setViewportSize(PORTRAIT); // narrow/portrait-shaped desktop window
    await dpage.waitForTimeout(400);
    const desk = await readState(dpage);
    const deskDrive = await driveAndMeasure(dpage, 1500);
    await dpage.screenshot({ path: join(OUT_DIR, 'orientation-desktop-portrait.png') });

    evidence.desktopPortrait = {
      portraitMql: desk.portraitMql,
      overlayPresent: desk.overlay.present,
      overlayVisible: desk.overlay.visible,
      loopRunning: desk.loopRunning,
      bikeDxUnderGas: Math.round(deskDrive.dx ?? 0),
    };
    // Guard installs nothing on desktop, so the element is absent entirely —
    // !visible covers both "absent" and "present-but-hidden".
    checks.desktop_overlayNotShownInPortrait = desk.overlay.visible === false;
    checks.desktop_loopKeepsRunning = desk.loopRunning === true;
    checks.desktop_gameStillDrives = (deskDrive.dx ?? 0) > 100;

    await deskCtx.close();

    // ======================================================================
    checks.noConsoleErrors = consoleErrors.length === 0;
    checks.noPageErrors = pageErrors.length === 0;

    const failed = Object.entries(checks)
      .filter(([, ok]) => !ok)
      .map(([name]) => name);
    const report = {
      allPassed: failed.length === 0,
      failed,
      checks,
      evidence,
      consoleErrors,
      pageErrors,
    };
    console.log(JSON.stringify(report, null, 2));
    if (failed.length > 0) process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
