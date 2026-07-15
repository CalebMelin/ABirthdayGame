// Automated browser playtest for PLAN-03 task 5 (pause menu + ⏸ button/Esc/P).
// Companion to playtest-drive.mjs / playtest-touch.mjs / playtest-orientation.mjs
// (run those too — they're the drive/pedals/rotate regression gates; the pause
// additions must not break any of them).
//
// Proves, as far as the harness allows, the pause acceptance criteria (desktop
// context — mouse for the ⏸ button + menu, keyboard for gas + Esc/P):
//   - ⏸ BUTTON pauses: a designClick at the button (top-left) → PauseScene
//     active AND GameScene paused, and the bike is FROZEN (hold gas while
//     paused → bike.x does not change),
//   - RESUME → GameScene active again and the bike CONTINUES from where it
//     froze (not reset) and drives again under gas,
//   - ESC and (separately) P each open the pause menu (PauseScene active),
//   - RESTART → GameScene fresh, bike back near spawn x (≈250),
//   - LEVEL SELECT → LevelSelectScene active (GameScene + PauseScene gone),
//   - ZOOM-STABILITY: across a full-speed run (camera zooms out) the ⏸
//     button's on-screen position + size stay fixed (same check as the pedals).
//
// Talks to the game through window.__gabbyGame (dev-only; see src/main.ts).
// Requires `npm run dev` running. Usage: node scripts/playtest-pause.mjs
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const DEV_URL = process.env.PLAYTEST_URL ?? 'http://localhost:5173/';
const OUT_DIR = process.env.OUT_DIR ?? './playtest-out';
const DESIGN_W = 1280;
const DESIGN_H = 720;

// Design-space click points. In sync with constants.ts PAUSE:
//   ⏸ button center = buttonMarginPx(16) + buttonSizePx/2(32) = (48,48).
//   Menu buttons centered at x=640; firstButtonY=348, spacingY=112.
const PAUSE_BTN = { x: 48, y: 48 };
const RESUME = { x: 640, y: 348 };
const RESTART = { x: 640, y: 460 };
const LEVEL_SELECT = { x: 640, y: 572 };

// GAS pedal press point (design coords) for the TOUCH-context regression below.
// In sync with pedals.ts/PEDALS (same point playtest-touch presses): face center
// = edge margin(36) + half the 144px face = 108 from the right edge; y = 720 - 36
// - 72 = 612. Bottom-right → (1172, 612).
const GAS_XY = { x: DESIGN_W - 108, y: 612 };

// A fresh CDP touch-point id per press (Chrome drops an id reused right after its
// release — see playtest-touch.mjs). Only the touch regression uses this.
let idSeq = 100;
const nextId = () => idSeq++;

// Zoom-stability expectations (mirror pedals check): the ⏸ button's screen
// anchor is its design center (48,48); its on-screen face size is buttonSizePx.
const PIVOT_X = DESIGN_W / 2; // 640 — camera zoom pivot (screen center)
const EXPECTED_ANCHOR_X = 48;
const EXPECTED_FACE_SIZE = 64; // PAUSE.buttonSizePx

const round2 = (n) => Math.round(n * 100) / 100;
const round3 = (n) => Math.round(n * 1000) / 1000;

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

async function waitForScene(page, key, timeout = 20_000) {
  await page.waitForFunction((k) => globalThis.__gabbyGame?.scene.isActive(k) === true, key, {
    timeout,
  });
}
/** Wait until the pause menu is up AND GameScene is frozen (paused). */
async function waitPauseOpen(page, timeout = 10_000) {
  await page.waitForFunction(
    () => {
      const g = globalThis.__gabbyGame;
      return g?.scene.isActive('PauseScene') === true && g?.scene.isPaused('GameScene') === true;
    },
    undefined,
    { timeout }
  );
}
/** Wait until the menu is gone and GameScene is running again. */
async function waitGameResumed(page, timeout = 10_000) {
  await page.waitForFunction(
    () => {
      const g = globalThis.__gabbyGame;
      return g?.scene.isActive('GameScene') === true && g?.scene.isActive('PauseScene') === false;
    },
    undefined,
    { timeout }
  );
}

/** Full snapshot the assertions read. getScene('GameScene') stays valid even
 * while GameScene is paused/stopped; guard each field for the stopped case. */
function readState(page) {
  return page.evaluate(() => {
    const g = globalThis.__gabbyGame;
    const gs = g.scene.getScene('GameScene');
    const camOk = gs && gs.cameras && gs.cameras.main;
    return {
      gameActive: g.scene.isActive('GameScene'),
      gamePaused: g.scene.isPaused('GameScene'),
      pauseActive: g.scene.isActive('PauseScene'),
      levelSelectActive: g.scene.isActive('LevelSelectScene'),
      complete: g.scene.isActive('LevelCompleteScene'),
      ended: gs ? gs.ended : null,
      bike: gs && gs.bike ? { x: gs.bike.x, y: gs.bike.y, speed: gs.bike.speed } : null,
      // pauseButton is a private TS field, freely reachable at runtime.
      pauseButton: gs && gs.pauseButton
        ? { x: gs.pauseButton.x, y: gs.pauseButton.y, sx: gs.pauseButton.scaleX }
        : null,
      zoom: camOk ? gs.cameras.main.zoom : null,
    };
  });
}

async function enterLevel1(page) {
  await waitForScene(page, 'TitleScene');
  await clickDesign(page, 640, 400); // Title: Play
  await waitForScene(page, 'CharacterCreationScene');
  await clickDesign(page, 820, 660); // CharacterCreation: Let's ride! -> (PLAN-04 task 3)
  await waitForScene(page, 'LevelSelectScene');
  await clickDesign(page, 265, 220); // LevelSelect: level 1 cell
  await waitForScene(page, 'GameScene');
  await page.waitForTimeout(600); // create() + let the bike settle
}

/** Hold gas (ArrowRight) for `ms`, re-pressing each tick (CDP has no key
 * auto-repeat). Does NOT release at the end — caller decides. */
async function holdGas(page, ms) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(120);
  }
}

/** Tap a key by HOLDING it for a few frames, not Playwright's sub-frame
 * press() — the game polls Phaser's per-frame JustDown, and a real key press
 * is held for many frames, so a synthetic down+up inside one 16ms frame can
 * be missed. down + ~160ms + up mirrors a real press and is what the other
 * playtests do for gas. */
async function tapKey(page, key) {
  await page.keyboard.down(key);
  await page.waitForTimeout(160);
  await page.keyboard.up(key);
}

// ---- Touch-context helpers (regression section only) ----------------------

/** Dispatch a CDP touch frame (a real finger — drives Phaser's TouchManager
 * natively, not a synthetic shim). `points` is the FULL set of active points
 * AFTER this event; touchEnd([]) releases all. Mirrors playtest-touch.mjs. */
async function touch(cdp, box, type, points) {
  await cdp.send('Input.dispatchTouchEvent', {
    type,
    touchPoints: points.map((p) => ({ x: vx(box, p.x), y: vy(box, p.y), id: p.id })),
  });
}

/** Real touch tap at a design point (menu navigation in the touch context). */
async function tapDesign(page, x, y) {
  const box = await canvasBox(page);
  await page.touchscreen.tap(vx(box, x), vy(box, y));
}

/** GameScene snapshot for the touch regression: the MERGED input sample() (with
 * no keys down it reflects the touch pedals exactly, so it's a direct readout of
 * touchGas/touchBrake) + live pedal Zone count. getScene stays valid while
 * GameScene is paused; guard each field. */
function readTouchState(page) {
  return page.evaluate(() => {
    const g = globalThis.__gabbyGame;
    const s = g.scene.getScene('GameScene');
    return {
      active: g.scene.isActive('GameScene'),
      bike: s && s.bike ? { x: s.bike.x, y: s.bike.y, speed: s.bike.speed } : null,
      sample: s && s.gameInput ? s.gameInput.sample() : null,
      zones: s && s.children ? s.children.list.filter((o) => o.type === 'Zone').length : 0,
    };
  });
}

/** Enter level 1 with real taps (touch context), so the touch-device gate is on
 * and the pedals actually exist. Mirrors enterLevel1 but touch-native. */
async function enterLevel1Touch(page) {
  await waitForScene(page, 'TitleScene');
  await tapDesign(page, 640, 400); // Title: Play
  await waitForScene(page, 'CharacterCreationScene');
  await tapDesign(page, 820, 660); // CharacterCreation: Let's ride! -> (PLAN-04 task 3)
  await waitForScene(page, 'LevelSelectScene');
  await tapDesign(page, 265, 220); // LevelSelect: level 1 cell
  await waitForScene(page, 'GameScene');
  await page.waitForTimeout(600); // create() + let the bike settle
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
    // 0) TOUCH-CONTEXT REGRESSION (the PLAN-03 cross-task bug): a touch GAS
    //    pedal HELD into a pause must not resume STUCK-ON. While GameScene is
    //    paused its InputPlugin stops dispatching pointer events
    //    (Systems.canInput() is false), so a finger lifted off GAS while the
    //    menu is up never fires pointerup → setTouchGas(false) never runs →
    //    without the fix the bike resumes under phantom gas. GameScene.onResume
    //    (the RESUME handler) clears it. Runs in a hasTouch+isMobile context so
    //    the pedals exist; real touch via CDP Input.dispatchTouchEvent.
    // ======================================================================
    {
      const touchCtx = await browser.newContext({
        hasTouch: true,
        isMobile: true,
        viewport: { width: DESIGN_W, height: DESIGN_H },
      });
      const tpage = await touchCtx.newPage();
      tpage.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
      tpage.on('pageerror', (e) => pageErrors.push(String(e)));
      const tcdp = await touchCtx.newCDPSession(tpage);

      await tpage.goto(DEV_URL, { waitUntil: 'domcontentloaded' });
      await enterLevel1Touch(tpage);
      const tbox = await canvasBox(tpage);

      // Pedals must exist here (the regression is only meaningful on touch).
      const preHold = await readTouchState(tpage);
      checks.pauseTouch_pedalsExist = preHold.zones === 2;

      // 1) Press + HOLD the GAS pedal (bottom-right) with a real CDP touch that
      //    stays down (a CDP point persists until touchEnd — no re-press needed).
      const gasId = nextId();
      await touch(tcdp, tbox, 'touchStart', [{ ...GAS_XY, id: gasId }]);
      await tpage.waitForTimeout(200);
      const held = await readTouchState(tpage);
      const resumeSpeedBaseline = held.bike?.speed ?? 0;

      // 2) Open the pause menu via Esc WHILE the gas finger is still down.
      await tapKey(tpage, 'Escape');
      await waitPauseOpen(tpage);

      // 3) Release the gas touch WHILE PAUSED. The paused GameScene's InputPlugin
      //    won't dispatch the pointerup — WITHOUT the fix setTouchGas(false)
      //    never runs and touchGas stays stuck true.
      await touch(tcdp, tbox, 'touchEnd', []);
      await tpage.waitForTimeout(200);

      // 4) Resume via the Resume button. GameScene.onResume must clear the hold.
      await tapDesign(tpage, RESUME.x, RESUME.y);
      await waitGameResumed(tpage);

      const resumed = await readTouchState(tpage);
      const resumeX = resumed.bike?.x ?? 0;
      // (b) With no finger down and no keys, sample nothing for a beat: under the
      //     phantom hold the bike would keep being DRIVEN (speed climbs, big
      //     advance); fixed, it coasts to a stop (speed → ~0).
      await tpage.waitForTimeout(900);
      const settled = await readTouchState(tpage);
      const driftX = (settled.bike?.x ?? 0) - resumeX;
      const settledSpeed = settled.bike?.speed ?? 0;

      evidence.pauseTouch = {
        pedalZoneCount: preHold.zones,
        heldSample: held.sample,
        resumedSample: resumed.sample,
        speedAtHold: Math.round(resumeSpeedBaseline * 10) / 10,
        resumeX: Math.round(resumeX),
        driftAfterResumePx: Math.round(driftX),
        settledSpeed: Math.round(settledSpeed * 10) / 10,
      };
      // Sanity: the pedal really registered while held (else the test proves nothing).
      checks.pauseTouch_gasHeldReadsTrue = !!held.sample && held.sample.gas === true;
      // (a) PRIMARY: merged input reports gas:false after resume — no phantom
      //     hold. Momentum-independent; this is the direct red→green discriminator.
      checks.pauseTouch_noPhantomGasOnResume =
        !!resumed.sample && resumed.sample.gas === false;
      // (b) BEHAVIOR: the bike is not being driven forward on resume — it comes
      //     to rest (phantom gas would hold it near full speed / advance far).
      checks.pauseTouch_bikeNotDrivenOnResume = settledSpeed < 1.5 && driftX < 120;

      await touchCtx.close();
    }

    const ctx = await browser.newContext({ viewport: { width: DESIGN_W, height: DESIGN_H } });
    const page = await ctx.newPage();
    page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
    page.on('pageerror', (e) => pageErrors.push(String(e)));

    await page.goto(DEV_URL, { waitUntil: 'domcontentloaded' });
    await enterLevel1(page);

    const enter = await readState(page);
    const spawnX = enter.bike?.x ?? NaN;
    evidence.spawnX = Math.round(spawnX);
    evidence.pauseButtonAtEntry = enter.pauseButton
      ? { screenX: round2(PIVOT_X + (enter.pauseButton.x - PIVOT_X) * (enter.zoom ?? 1)), zoom: round3(enter.zoom ?? 1) }
      : null;

    // ======================================================================
    // 0b) Esc / P TOGGLE the menu (the resume polish): the key that OPENS the
    //     menu also RESUMES it. Proven here distinctly from the Esc/P-OPENS
    //     checks in sections 2-3 below (which still independently prove opening
    //     after driving). At spawn, so no gas is held and the bike stays put.
    //     waitPauseOpen/waitGameResumed throw on timeout, so a broken toggle
    //     fails the run loudly; the explicit checks record it for the report.
    // ======================================================================
    await tapKey(page, 'Escape');
    await waitPauseOpen(page);
    checks.pause_escKeyOpens = (await readState(page)).pauseActive === true;
    await tapKey(page, 'Escape');
    await waitGameResumed(page);
    checks.pause_escKeyResumes = (await readState(page)).gameActive === true;

    await tapKey(page, 'p');
    await waitPauseOpen(page);
    checks.pause_pKeyOpens = (await readState(page)).pauseActive === true;
    await tapKey(page, 'p');
    await waitGameResumed(page);
    checks.pause_pKeyResumes = (await readState(page)).gameActive === true;

    // ======================================================================
    // 1) ⏸ BUTTON pauses + freezes the bike (from a stationary spawn, zoom≈1).
    // ======================================================================
    await clickDesign(page, PAUSE_BTN.x, PAUSE_BTN.y);
    await waitPauseOpen(page);
    const paused = await readState(page);
    checks.pause_buttonOpensMenu = paused.pauseActive === true;
    checks.pause_gameFrozenWhilePaused = paused.gamePaused === true && paused.gameActive === false;
    await page.screenshot({ path: join(OUT_DIR, 'pause-menu.png') });

    // Freeze: hold gas while paused — the bike must NOT move (update() frozen).
    const xAtPause = paused.bike?.x ?? 0;
    await holdGas(page, 800);
    await page.keyboard.up('ArrowRight');
    const stillPaused = await readState(page);
    evidence.freeze = {
      xAtPause: Math.round(xAtPause),
      xAfterGasWhilePaused: Math.round(stillPaused.bike?.x ?? NaN),
    };
    checks.pause_bikeFrozenGasNoMove = Math.abs((stillPaused.bike?.x ?? 0) - xAtPause) < 1;

    // Resume back to the run.
    await clickDesign(page, RESUME.x, RESUME.y);
    await waitGameResumed(page);
    const resumed0 = await readState(page);
    checks.pause_resumeReturnsToGame = resumed0.gameActive === true && resumed0.pauseActive === false;

    // ======================================================================
    // 2) Drive away from spawn, then ESC-pause → RESUME CONTINUES (not reset).
    // ======================================================================
    await holdGas(page, 1300);
    await page.keyboard.up('ArrowRight');
    const moving = await readState(page);
    const movedX = moving.bike?.x ?? 0;
    evidence.movedX = Math.round(movedX);
    checks.pause_droveAwayFromSpawn = movedX > spawnX + 300;

    await tapKey(page, 'Escape');
    await waitPauseOpen(page);
    const escPaused = await readState(page);
    checks.pause_escOpensMenu = escPaused.pauseActive === true && escPaused.gamePaused === true;
    const xAtEscPause = escPaused.bike?.x ?? 0;

    await clickDesign(page, RESUME.x, RESUME.y);
    await waitGameResumed(page);
    const resumed1 = await readState(page);
    const resumeStartX = resumed1.bike?.x ?? 0;
    // Continues where it froze (near movedX), NOT reset to spawn.
    checks.pause_resumeContinuesNotReset =
      Math.abs(resumeStartX - xAtEscPause) < 50 && resumeStartX > spawnX + 300;

    // Confirm the bike drives forward again under gas after resume. Early-exit
    // the instant it has advanced a clear margin (~120px), well short of the
    // first real hill, so this check never depends on hill physics: the
    // placeholder TEST_LEVEL can crash a MODERATE-speed run on the x≈1160
    // crest (a full-speed continuous run clears it — see playtest-drive, the
    // level's gas-only gate), and a bike resuming from near-stop meets that
    // crest slowly. That's a TEST_LEVEL tuning edge (PLAN-05 replaces the
    // level), not a pause bug — pause only calls scene.pause/resume/launch.
    let drove = false;
    let afterDriveX = resumeStartX;
    const driveDeadline = Date.now() + 2500;
    while (Date.now() < driveDeadline) {
      await page.keyboard.down('ArrowRight');
      await page.waitForTimeout(120);
      const s = await readState(page);
      if (s.gameActive && s.ended === false && (s.bike?.x ?? 0) > resumeStartX + 120) {
        drove = true;
        afterDriveX = s.bike?.x ?? afterDriveX;
        break;
      }
      if (s.ended === true) break; // crashed before advancing — report as failure
    }
    await page.keyboard.up('ArrowRight');
    evidence.resume = {
      xAtEscPause: Math.round(xAtEscPause),
      resumeStartX: Math.round(resumeStartX),
      afterDriveX: Math.round(afterDriveX),
    };
    checks.pause_resumeDrivesAgain = drove;

    // ======================================================================
    // 3) P-pause → RESTART: fresh run, bike back near spawn.
    // ======================================================================
    await tapKey(page, 'p');
    await waitPauseOpen(page);
    const pPaused = await readState(page);
    checks.pause_pOpensMenu = pPaused.pauseActive === true && pPaused.gamePaused === true;

    await clickDesign(page, RESTART.x, RESTART.y);
    await page.waitForFunction(
      () => {
        const g = globalThis.__gabbyGame;
        const s = g.scene.getScene('GameScene');
        return (
          g.scene.isActive('GameScene') &&
          g.scene.isActive('PauseScene') === false &&
          s.bike &&
          s.ended === false
        );
      },
      undefined,
      { timeout: 8_000 }
    );
    await page.waitForTimeout(400); // settle
    const restarted = await readState(page);
    evidence.restart = { bikeX: Math.round(restarted.bike?.x ?? NaN), spawnX: Math.round(spawnX) };
    checks.pause_restartFreshAtSpawn =
      restarted.gameActive === true &&
      restarted.pauseActive === false &&
      Math.abs((restarted.bike?.x ?? 9999) - spawnX) < 150;

    // ======================================================================
    // 4) Pause again → LEVEL SELECT navigates away.
    // ======================================================================
    await clickDesign(page, PAUSE_BTN.x, PAUSE_BTN.y);
    await waitPauseOpen(page);
    await clickDesign(page, LEVEL_SELECT.x, LEVEL_SELECT.y);
    await waitForScene(page, 'LevelSelectScene');
    const ls = await readState(page);
    checks.pause_levelSelectNavigates =
      ls.levelSelectActive === true && ls.gameActive === false && ls.pauseActive === false;

    // ======================================================================
    // 5) ZOOM-STABILITY: re-enter a level, drive to full speed (camera zooms
    //    out), and the ⏸ button's on-screen position + size must stay fixed.
    // ======================================================================
    await clickDesign(page, 265, 220); // level 1 cell
    await waitForScene(page, 'GameScene');
    await page.waitForTimeout(500);

    const zoomSamples = [];
    const zStart = Date.now();
    while (Date.now() - zStart < 6_000) {
      await page.keyboard.down('ArrowRight');
      await page.waitForTimeout(250);
      const s = await readState(page);
      if (!s.gameActive || !s.pauseButton || s.zoom == null) continue;
      const screenX = PIVOT_X + (s.pauseButton.x - PIVOT_X) * s.zoom;
      const screenSize = EXPECTED_FACE_SIZE * s.pauseButton.sx * s.zoom;
      zoomSamples.push({ zoom: round3(s.zoom), screenX: round2(screenX), screenSize: round2(screenSize) });
    }
    await page.keyboard.up('ArrowRight');
    await page.screenshot({ path: join(OUT_DIR, 'pause-button-zoomed.png') });

    const zooms = zoomSamples.map((s) => s.zoom);
    const sxs = zoomSamples.map((s) => s.screenX);
    const sizes = zoomSamples.map((s) => s.screenSize);
    const sxSpread = Math.max(...sxs) - Math.min(...sxs);
    const sizeSpread = Math.max(...sizes) - Math.min(...sizes);
    const sxErr = Math.max(...sxs.map((v) => Math.abs(v - EXPECTED_ANCHOR_X)));
    evidence.zoomStability = {
      samples: zoomSamples.length,
      minZoom: Math.min(...zooms),
      maxZoom: Math.max(...zooms),
      screenXSpreadPx: round2(sxSpread),
      screenXErrVsAnchorPx: round2(sxErr),
      screenSizeSpreadPx: round2(sizeSpread),
      expectedAnchorX: EXPECTED_ANCHOR_X,
      expectedFaceSize: EXPECTED_FACE_SIZE,
    };
    checks.pause_zoomActuallyVaried = Math.min(...zooms) < 0.98 && zoomSamples.length >= 5;
    checks.pause_buttonScreenXStable = sxSpread <= 1.5 && sxErr <= 1.5;
    checks.pause_buttonScreenSizeStable = sizeSpread <= 2.0;

    await ctx.close();

    // ======================================================================
    checks.noConsoleErrors = consoleErrors.length === 0;
    checks.noPageErrors = pageErrors.length === 0;

    const failed = Object.entries(checks)
      .filter(([, ok]) => !ok)
      .map(([name]) => name);
    const report = { allPassed: failed.length === 0, failed, checks, evidence, consoleErrors, pageErrors };
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
