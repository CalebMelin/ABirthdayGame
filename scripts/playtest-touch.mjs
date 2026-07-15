// Automated browser playtest for PLAN-03 task 2 (touch pedals). Companion to
// playtest-drive.mjs (run that too — it's the non-touch regression gate).
//
// Proves, as far as the harness allows, the touch-pedal acceptance criteria:
//   TOUCH context (hasTouch + isMobile, 1280x720):
//     - the touch-device gate is on (maxTouchPoints > 0 AND any-pointer:coarse),
//     - exactly 2 pedal hit Zones exist in GameScene,
//     - GAS (bottom-right) drives the bike forward (bike.x increases) and the
//       merged input reads {gas:true, brake:false} while held,
//     - a genuine release returns the merged input to {gas:false, brake:false}
//       (no stuck pedal — the raw-edge property backflips depend on),
//     - BRAKE (bottom-left) while moving slows the bike to a stop and reads
//       {gas:false, brake:true} while held,
//     - MULTITOUCH: gas alone advances, then ADDING brake (both fingers down)
//       reads {gas:true, brake:true} AND stops the bike (brake wins) — proof
//       both pedals hold at once and a swap mid-press works,
//     - ZOOM-STABILITY: across a full-speed run (camera zooms out) each
//       pedal's on-screen position + size stay fixed (the layout() zoom
//       compensation), so the generous hit area keeps tracking the art,
//     - pedals survive a scene.restart() (recreated cleanly, still 2 Zones).
//   NON-TOUCH context (default): the gate is OFF ((any-pointer: coarse) is
//     false even though this Windows host reports maxTouchPoints=10), ZERO
//     pedal Zones exist, and the keyboard still drives — desktop shows no
//     pedals and is undisturbed.
//
// Real multitouch is dispatched via CDP Input.dispatchTouchEvent (two touch
// points, a fresh pointer id per press), which drives Phaser's TouchManager
// natively (a real finger), not a synthetic-event shim. Menu navigation in
// the touch context uses real taps.
//
// Talks to the game through window.__gabbyGame (dev-only; see src/main.ts).
// Requires `npm run dev` running. Usage: node scripts/playtest-touch.mjs
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const DEV_URL = process.env.PLAYTEST_URL ?? 'http://localhost:5173/';
const OUT_DIR = process.env.OUT_DIR ?? './playtest-out';
const DESIGN_W = 1280;
const DESIGN_H = 720;

// Pedal press points, in DESIGN coords (the visible face centers — safely
// inside each pedal's generous hit region). In sync with pedals.ts/PEDALS:
// face center = edge margin(36) + half the 144px face = 108 from the near
// side; y = 720 - 36 - 72 = 612.
const GAS_XY = { x: DESIGN_W - 108, y: 612 }; // bottom-right → (1172,612)
const BRAKE_XY = { x: 108, y: 612 }; //          bottom-left  → (108,612)

// Design-screen zoom pivot + the gas pedal's expected FIXED on-screen anchor
// (its hit-region center: 1280 - 480/2 = 1040). Mirrors pedals.ts.
const PIVOT_X = DESIGN_W / 2;
const GAS_ZONE_SCREEN_X = DESIGN_W - 480 / 2; // 1040
const HIT_REGION_W = 480;

// A fresh CDP pointer id per press: reusing an id immediately after its
// release is dropped by Chrome's touch de-dup (observed: a re-pressed gas at
// id 0 never registered), so every new finger-down gets a new id.
let idSeq = 100;
const nextId = () => idSeq++;

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

async function waitForScene(page, key, timeout = 20_000) {
  await page.waitForFunction((k) => globalThis.__gabbyGame?.scene.isActive(k) === true, key, {
    timeout,
  });
}

/** Full GameScene snapshot the assertions read. `sample()` is the MERGED
 * keyboard+touch state from input.ts — with no keys down it reflects the
 * touch pedals exactly, so it is a direct readout of what each pedal
 * delivered this instant. */
function readState(page) {
  return page.evaluate(() => {
    const g = globalThis.__gabbyGame;
    const s = g.scene.getScene('GameScene');
    const active = g.scene.isActive('GameScene');
    const bike = active && s.bike ? { x: s.bike.x, y: s.bike.y, speed: s.bike.speed } : null;
    const sample = active && s.gameInput ? s.gameInput.sample() : null;
    const zoom = active ? s.cameras.main.zoom : null;
    const zones = active
      ? s.children.list
          .filter((o) => o.type === 'Zone')
          .map((z) => ({ x: z.x, y: z.y, w: z.width, sx: z.scaleX }))
      : [];
    return {
      complete: g.scene.isActive('LevelCompleteScene'),
      active,
      bike,
      sample,
      zoom,
      zones,
      maxTouchPoints: navigator.maxTouchPoints,
      anyPointerCoarse: window.matchMedia('(any-pointer: coarse)').matches,
    };
  });
}

/** Dispatch a CDP touch frame. `points` is the FULL set of currently-active
 * touch points AFTER this event (Chrome diffs against the previous frame to
 * emit the right press/move/release DOM events). touchEnd releases all ([]). */
async function touch(cdp, box, type, points) {
  await cdp.send('Input.dispatchTouchEvent', {
    type,
    touchPoints: points.map((p) => ({ x: vx(box, p.x), y: vy(box, p.y), id: p.id })),
  });
}

/** Press a pedal (fresh id) and poll until the bike is moving >= minSpeed or
 * the timeout hits. Returns { id, state } — the caller holds via `id` (to add
 * a second finger) and releases with touchEnd([]). */
async function pressUntilMoving(cdp, box, page, xy, minSpeed, timeoutMs) {
  const id = nextId();
  await touch(cdp, box, 'touchStart', [{ ...xy, id }]);
  const deadline = Date.now() + timeoutMs;
  let state = null;
  while (Date.now() < deadline) {
    await page.waitForTimeout(150);
    state = await readState(page);
    if (state.bike && state.bike.speed >= minSpeed) break;
  }
  return { id, state };
}

async function clickDesign(page, x, y) {
  const box = await canvasBox(page);
  await page.mouse.click(vx(box, x), vy(box, y));
}
async function tapDesign(page, x, y) {
  const box = await canvasBox(page);
  await page.touchscreen.tap(vx(box, x), vy(box, y));
}

async function enterLevel1(page, nav) {
  await waitForScene(page, 'TitleScene');
  await nav(page, 640, 400);
  await waitForScene(page, 'CharacterCreationScene');
  await nav(page, 640, 400);
  await waitForScene(page, 'LevelSelectScene');
  await nav(page, 265, 220);
  await waitForScene(page, 'GameScene');
  await page.waitForTimeout(600);
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
    // TOUCH CONTEXT
    // ======================================================================
    const touchCtx = await browser.newContext({
      hasTouch: true,
      isMobile: true,
      viewport: { width: DESIGN_W, height: DESIGN_H },
    });
    const page = await touchCtx.newPage();
    page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
    page.on('pageerror', (e) => pageErrors.push(String(e)));
    const cdp = await touchCtx.newCDPSession(page);

    await page.goto(DEV_URL, { waitUntil: 'domcontentloaded' });
    await enterLevel1(page, tapDesign);
    const box = await canvasBox(page);

    // --- gate is on + pedals exist on touch --------------------------------
    let st = await readState(page);
    evidence.touch = { maxTouchPoints: st.maxTouchPoints, anyPointerCoarse: st.anyPointerCoarse, pedalZoneCount: st.zones.length };
    checks.touch_gateOn = st.maxTouchPoints > 0 && st.anyPointerCoarse === true;
    checks.touch_twoPedalZones = st.zones.length === 2;

    // --- GAS drives forward + merged input reads gas-only ------------------
    const gasStartX = st.bike?.x ?? 0;
    const gasId = nextId();
    await touch(cdp, box, 'touchStart', [{ ...GAS_XY, id: gasId }]);
    await page.waitForTimeout(250);
    const gasHeld = await readState(page);
    await page.waitForTimeout(1500);
    const gasEnd = await readState(page);
    await touch(cdp, box, 'touchEnd', []);
    await page.waitForTimeout(250);
    const afterRelease = await readState(page);

    evidence.gas = {
      startX: Math.round(gasStartX),
      endX: Math.round(gasEnd.bike?.x ?? NaN),
      dx: Math.round((gasEnd.bike?.x ?? 0) - gasStartX),
      sampleHeld: gasHeld.sample,
      sampleAfterRelease: afterRelease.sample,
    };
    checks.touch_gasDrivesForward = (gasEnd.bike?.x ?? 0) - gasStartX > 100;
    checks.touch_gasSampleGasOnly =
      !!gasHeld.sample && gasHeld.sample.gas === true && gasHeld.sample.brake === false;
    checks.touch_releaseClearsBoth =
      !!afterRelease.sample && afterRelease.sample.gas === false && afterRelease.sample.brake === false;
    await page.screenshot({ path: join(OUT_DIR, 'touch-gas.png') });

    // --- BRAKE slows a moving bike to a stop + reads brake-only ------------
    const spd = await pressUntilMoving(cdp, box, page, GAS_XY, 5, 5000);
    const movingBeforeBrake = spd.state;
    await touch(cdp, box, 'touchEnd', []); // release gas
    const brakeId = nextId();
    await touch(cdp, box, 'touchStart', [{ ...BRAKE_XY, id: brakeId }]);
    await page.waitForTimeout(300);
    const brakeHeld = await readState(page);
    await page.waitForTimeout(1700);
    const brakeStopped = await readState(page);
    await touch(cdp, box, 'touchEnd', []);
    await page.waitForTimeout(200);

    evidence.brake = {
      xBeforeBrake: Math.round(movingBeforeBrake?.bike?.x ?? NaN),
      speedBeforeBrake: Math.round((movingBeforeBrake?.bike?.speed ?? 0) * 10) / 10,
      speedAfterBrake: Math.round((brakeStopped.bike?.speed ?? 0) * 10) / 10,
      sampleHeld: brakeHeld.sample,
    };
    checks.touch_brakeStopsBike =
      (movingBeforeBrake?.bike?.speed ?? 0) > 3 && (brakeStopped.bike?.speed ?? 99) < 1.5;
    checks.touch_brakeSampleBrakeOnly =
      !!brakeHeld.sample && brakeHeld.sample.gas === false && brakeHeld.sample.brake === true;
    await page.screenshot({ path: join(OUT_DIR, 'touch-brake.png') });

    // --- MULTITOUCH: gas alone advances, then add brake (both down) stops it
    const mg = await pressUntilMoving(cdp, box, page, GAS_XY, 5, 5000);
    const gasOnly = mg.state;
    // Add brake WITHOUT releasing gas: send both active points (gas keeps its
    // id). Brake wins over gas in bike.ts, so the bike should stop.
    const mBrakeId = nextId();
    await touch(cdp, box, 'touchStart', [
      { ...GAS_XY, id: mg.id },
      { ...BRAKE_XY, id: mBrakeId },
    ]);
    await page.waitForTimeout(300);
    const bothHeld = await readState(page);
    const bothX0 = bothHeld.bike?.x ?? 0;
    await page.waitForTimeout(1600);
    const bothSettled = await readState(page);
    const bothX1 = bothSettled.bike?.x ?? 0;
    await page.screenshot({ path: join(OUT_DIR, 'touch-both.png') });
    await touch(cdp, box, 'touchEnd', []);
    await page.waitForTimeout(200);
    const afterBoth = await readState(page);

    evidence.multitouch = {
      gasOnlySpeed: Math.round((gasOnly?.bike?.speed ?? 0) * 10) / 10,
      sampleBothHeld: bothHeld.sample,
      advanceWhileBothHeld: Math.round(bothX1 - bothX0),
      settledSpeed: Math.round((bothSettled.bike?.speed ?? 0) * 10) / 10,
      sampleAfterRelease: afterBoth.sample,
    };
    checks.touch_gasOnlyWasMoving = (gasOnly?.bike?.speed ?? 0) > 3;
    checks.touch_bothPedalsDownAtOnce =
      !!bothHeld.sample && bothHeld.sample.gas === true && bothHeld.sample.brake === true;
    // Brake wins: while both are held the bike stops (speed → ~0) and does not
    // keep driving forward (a small coast-down as it decelerates is fine; at
    // full gas with no brake it would advance ~1500px over this window).
    checks.touch_brakeWinsOverGas =
      bothX1 - bothX0 < 250 && (bothSettled.bike?.speed ?? 99) < 1.5;

    // --- ZOOM-STABILITY: fresh restart (clean long runway + proves pedals
    // survive restart), then hold gas to full speed while the camera zooms
    // out; the gas pedal's on-screen position + size must stay fixed.
    await page.evaluate(() =>
      globalThis.__gabbyGame.scene.getScene('GameScene').scene.restart({ level: 1 })
    );
    await page.waitForTimeout(700);
    await waitForScene(page, 'GameScene');
    const restarted = await readState(page);
    evidence.pedalZoneCountAfterRestart = restarted.zones.length;
    checks.touch_pedalsSurviveRestart = restarted.zones.length === 2;

    const zId = nextId();
    await touch(cdp, box, 'touchStart', [{ ...GAS_XY, id: zId }]);
    const zoomSamples = [];
    for (let i = 0; i < 20; i++) {
      await page.waitForTimeout(300);
      const s = await readState(page);
      if (!s.active || !s.bike || s.zones.length !== 2 || s.zoom == null) continue;
      const screen = s.zones.map((z) => ({
        sx: PIVOT_X + (z.x - PIVOT_X) * s.zoom,
        w: z.w * z.sx * s.zoom,
      }));
      const gasScreen = screen.reduce((a, b) => (b.sx > a.sx ? b : a)); // right-side = gas
      zoomSamples.push({
        zoom: Math.round(s.zoom * 1000) / 1000,
        sx: Math.round(gasScreen.sx * 100) / 100,
        w: Math.round(gasScreen.w * 100) / 100,
      });
    }
    await touch(cdp, box, 'touchEnd', []);
    await page.screenshot({ path: join(OUT_DIR, 'touch-zoomed.png') });

    const zooms = zoomSamples.map((s) => s.zoom);
    const sxs = zoomSamples.map((s) => s.sx);
    const ws = zoomSamples.map((s) => s.w);
    const sxSpread = Math.max(...sxs) - Math.min(...sxs);
    const wSpread = Math.max(...ws) - Math.min(...ws);
    const sxErr = Math.max(...sxs.map((v) => Math.abs(v - GAS_ZONE_SCREEN_X)));
    evidence.zoomStability = {
      samples: zoomSamples.length,
      minZoom: Math.min(...zooms),
      maxZoom: Math.max(...zooms),
      screenXSpreadPx: Math.round(sxSpread * 100) / 100,
      screenXErrVsAnchorPx: Math.round(sxErr * 100) / 100,
      screenWidthSpreadPx: Math.round(wSpread * 100) / 100,
      expectedAnchorX: GAS_ZONE_SCREEN_X,
      expectedWidth: HIT_REGION_W,
    };
    checks.touch_zoomActuallyVaried = Math.min(...zooms) < 0.98 && zoomSamples.length >= 5;
    checks.touch_pedalScreenXStable = sxSpread <= 1.5 && sxErr <= 1.5;
    checks.touch_pedalScreenSizeStable = wSpread <= 2.0;

    await touchCtx.close();

    // ======================================================================
    // NON-TOUCH (DESKTOP) CONTEXT — pedals must NOT exist; keyboard drives.
    // ======================================================================
    const deskCtx = await browser.newContext({ viewport: { width: DESIGN_W, height: DESIGN_H } });
    const dpage = await deskCtx.newPage();
    dpage.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
    dpage.on('pageerror', (e) => pageErrors.push(String(e)));
    await dpage.goto(DEV_URL, { waitUntil: 'domcontentloaded' });
    await enterLevel1(dpage, clickDesign);

    let dst = await readState(dpage);
    evidence.desktop = {
      maxTouchPoints: dst.maxTouchPoints,
      anyPointerCoarse: dst.anyPointerCoarse,
      pedalZoneCount: dst.zones.length,
    };
    // The real gate signal on desktop is (any-pointer: coarse) === false —
    // note maxTouchPoints is NOT 0 on this Windows host (it's 10), which is
    // exactly why the pedals gate can't rely on it alone. Pedals absent proves
    // the gate correctly ignores that Windows over-report.
    checks.desktop_coarsePointerAbsent = dst.anyPointerCoarse === false;
    checks.desktop_noPedalZones = dst.zones.length === 0;

    const dStartX = dst.bike?.x ?? 0;
    await dpage.keyboard.down('ArrowRight');
    await dpage.waitForTimeout(1500);
    await dpage.keyboard.up('ArrowRight');
    dst = await readState(dpage);
    evidence.desktop.keyboardDx = Math.round((dst.bike?.x ?? 0) - dStartX);
    checks.desktop_keyboardDrives = (dst.bike?.x ?? 0) - dStartX > 100;

    await deskCtx.close();

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
