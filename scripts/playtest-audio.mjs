// Automated browser playtest for the PLAN-10 ST-7a audio ENGINE + mute
// persistence. Same shape as the sibling harnesses (playwright-core driving
// system Chrome headless, viewport 1280x720 with touch, talking to the game
// through window.__gabbyGame, console + page errors collected AND gating the
// exit code). Requires `npm run dev` already running on :5173.
//
// The audio itself is SYNTHESIZED at runtime (no committed files) and the whole
// game must run clean muted AND unmuted with ZERO console/page errors — the key
// risk this gates, since audio runs in headless Chrome with no audio device.
//
// What it gates:
//   1. DEFAULT UNMUTED: a fresh save shows the Title toggle reading "sound: on"
//      and gabby22.muted is absent/false.
//   2. TOGGLE FLIPS + PERSISTS: tapping the toggle flips the label to
//      "sound: off" and writes gabby22.muted = "true"; a page RELOAD keeps the
//      label + the stored flag (the toggle reflects PERSISTED state); tapping
//      again flips back to "sound: on" / "false" and that too survives a reload.
//   3. RUNS CLEAN BOTH WAYS: the game is driven Title -> ... -> level 1 and held
//      on gas for a few seconds BOTH while UNMUTED and while MUTED, with zero
//      console/page errors throughout (music loop, button-click SFX, gesture
//      unlock, and gameplay all add none).
//
// Usage:
//   node scripts/playtest-audio.mjs
//   PLAYTEST_URL=http://localhost:5174/ node scripts/playtest-audio.mjs
import { chromium } from 'playwright-core';

const DEV_URL = process.env.PLAYTEST_URL ?? 'http://localhost:5173/';
const DESIGN_W = 1280;
const DESIGN_H = 720;
const SETTLE_MS = 250;

// Title sound-toggle center — IN SYNC WITH TitleScene.renderSoundButton
// (x = DESIGN_WIDTH - 140 = 1140, y = 64).
const SOUND_BTN = { x: DESIGN_W - 140, y: 64 };

async function waitForScene(page, key, timeout = 20_000) {
  await page.waitForFunction((k) => globalThis.__gabbyGame?.scene.isActive(k) === true, key, {
    timeout,
  });
}

async function canvasBox(page) {
  const box = await page.locator('canvas').boundingBox();
  if (!box) throw new Error('canvas not found');
  return box;
}
function vx(box, x) {
  return box.x + (x / DESIGN_W) * box.width;
}
function vy(box, y) {
  return box.y + (y / DESIGN_H) * box.height;
}
async function clickDesign(page, x, y) {
  const box = await canvasBox(page);
  await page.mouse.click(vx(box, x), vy(box, y));
}

/** Wipe every gabby22.* key (fresh first-launch state). */
async function wipeSave(page) {
  await page.evaluate(() => {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && key.startsWith('gabby22.')) localStorage.removeItem(key);
    }
  });
}

/** Raw localStorage value of gabby22.muted (null when absent). */
function readMuted(page) {
  return page.evaluate(() => localStorage.getItem('gabby22.muted'));
}

async function reloadToTitle(page) {
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForScene(page, 'TitleScene');
  await page.waitForTimeout(SETTLE_MS);
}

/** Every string a live Text on the Title renders (incl. button labels nested in
 * Containers) — proves the toggle label actually reached the screen. */
function titleTexts(page) {
  return page.evaluate(() => {
    const out = [];
    const walk = (list) => {
      for (const o of list) {
        if (o.type === 'Text' && typeof o.text === 'string') out.push(o.text);
        if (Array.isArray(o.list)) walk(o.list);
      }
    };
    walk(globalThis.__gabbyGame.scene.getScene('TitleScene').children.list);
    return out;
  });
}

async function soundLabel(page) {
  const texts = await titleTexts(page);
  if (texts.includes('sound: off')) return 'sound: off';
  if (texts.includes('sound: on')) return 'sound: on';
  return null;
}

/** Real-click through Title -> (CharacterCreation first run | LevelSelect
 * returning) -> level 1 -> GameScene, then hold gas for `holdMs`. Exercises the
 * button-click SFX + title music + gameplay under whatever the current mute
 * state is. */
async function driveLevel1(page, holdMs) {
  await clickDesign(page, 640, 400); // Title: Play
  await page.waitForFunction(
    () => {
      const g = globalThis.__gabbyGame;
      return (
        g.scene.isActive('CharacterCreationScene') || g.scene.isActive('LevelSelectScene')
      );
    },
    undefined,
    { timeout: 10_000 }
  );
  const atCharacter = await page.evaluate(() =>
    globalThis.__gabbyGame.scene.isActive('CharacterCreationScene')
  );
  if (atCharacter) {
    await clickDesign(page, 820, 660); // CharacterCreation: "Let's ride! ->"
    await waitForScene(page, 'LevelSelectScene');
  }
  await clickDesign(page, 265, 220); // LevelSelect: level 1 cell
  await waitForScene(page, 'GameScene');
  await page.waitForTimeout(400);

  const start = Date.now();
  while (Date.now() - start < holdMs) {
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(200);
  }
  await page.keyboard.up('ArrowRight');
}

async function main() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({
    viewport: { width: DESIGN_W, height: DESIGN_H },
    hasTouch: true,
  });
  const page = await context.newPage();

  const consoleErrors = [];
  const consoleWarnings = [];
  const pageErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
    if (msg.type() === 'warning') consoleWarnings.push(msg.text());
  });
  page.on('pageerror', (err) => pageErrors.push(String(err)));

  const problems = [];
  let report;
  try {
    await page.goto(DEV_URL, { waitUntil: 'domcontentloaded' });
    await waitForScene(page, 'TitleScene');

    // ================================================= (1) DEFAULT UNMUTED
    await wipeSave(page);
    await reloadToTitle(page);
    const defaultLabel = await soundLabel(page);
    const defaultMuted = await readMuted(page);
    if (defaultLabel !== 'sound: on')
      problems.push(`default: toggle read "${defaultLabel}" (expected "sound: on")`);
    if (defaultMuted === 'true')
      problems.push('default: gabby22.muted is "true" on a fresh save (expected unmuted)');

    // ============================================ (2) TOGGLE FLIPS + PERSISTS
    await clickDesign(page, SOUND_BTN.x, SOUND_BTN.y); // -> muted
    await page.waitForTimeout(SETTLE_MS);
    const mutedLabel = await soundLabel(page);
    const mutedStored = await readMuted(page);
    if (mutedLabel !== 'sound: off')
      problems.push(`toggle: label did not flip to "sound: off" (got "${mutedLabel}")`);
    if (mutedStored !== 'true')
      problems.push(`toggle: gabby22.muted did not persist "true" (got ${mutedStored})`);

    await reloadToTitle(page); // reflects PERSISTED state
    const mutedLabelReload = await soundLabel(page);
    const mutedStoredReload = await readMuted(page);
    if (mutedLabelReload !== 'sound: off')
      problems.push(
        `persist: after reload the toggle read "${mutedLabelReload}" (expected persisted "sound: off")`
      );
    if (mutedStoredReload !== 'true')
      problems.push(`persist: gabby22.muted not "true" after reload (got ${mutedStoredReload})`);

    await clickDesign(page, SOUND_BTN.x, SOUND_BTN.y); // -> unmuted
    await page.waitForTimeout(SETTLE_MS);
    const unmutedLabel = await soundLabel(page);
    const unmutedStored = await readMuted(page);
    if (unmutedLabel !== 'sound: on')
      problems.push(`toggle-back: label did not return to "sound: on" (got "${unmutedLabel}")`);
    if (unmutedStored !== 'false')
      problems.push(`toggle-back: gabby22.muted did not persist "false" (got ${unmutedStored})`);

    await reloadToTitle(page);
    const unmutedLabelReload = await soundLabel(page);
    if (unmutedLabelReload !== 'sound: on')
      problems.push(
        `persist: after reload the toggle read "${unmutedLabelReload}" (expected persisted "sound: on")`
      );

    // ============================== (3) RUNS CLEAN, UNMUTED THEN MUTED
    // Unmuted drive (music + click SFX + gameplay all audible-path).
    const errorsBeforeUnmuted = consoleErrors.length + pageErrors.length;
    await driveLevel1(page, 3000);
    const cleanUnmuted = consoleErrors.length + pageErrors.length === errorsBeforeUnmuted;
    if (!cleanUnmuted) problems.push('unmuted drive produced console/page errors');

    // Mute (persisted), then drive again.
    await reloadToTitle(page);
    await clickDesign(page, SOUND_BTN.x, SOUND_BTN.y); // -> muted
    await page.waitForTimeout(SETTLE_MS);
    const mutedForRun = await readMuted(page);
    if (mutedForRun !== 'true') problems.push('muted-run setup: gabby22.muted not "true"');
    const errorsBeforeMuted = consoleErrors.length + pageErrors.length;
    await driveLevel1(page, 3000);
    const cleanMuted = consoleErrors.length + pageErrors.length === errorsBeforeMuted;
    if (!cleanMuted) problems.push('muted drive produced console/page errors');
    // Muting must never break gameplay: confirm the level actually loaded.
    const inGameMuted = await page.evaluate(() =>
      globalThis.__gabbyGame.scene.isActive('GameScene')
    );
    if (!inGameMuted) problems.push('muted: never reached GameScene (mute broke gameplay)');

    report = {
      default: { label: defaultLabel, muted: defaultMuted },
      toggle: { mutedLabel, mutedStored, unmutedLabel, unmutedStored },
      persist: { mutedLabelReload, mutedStoredReload, unmutedLabelReload },
      run: { cleanUnmuted, cleanMuted, inGameMuted },
      consoleErrors,
      consoleWarnings,
      pageErrors,
    };
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await browser.close();
  }

  if (consoleErrors.length > 0) problems.push(`${consoleErrors.length} console error(s)`);
  if (pageErrors.length > 0) problems.push(`${pageErrors.length} page error(s)`);

  if (problems.length > 0) {
    console.error('AUDIO HARNESS FAILURES:\n  - ' + problems.join('\n  - '));
    process.exitCode = 1;
  } else {
    console.log(
      `AUDIO OK: fresh save defaults to UNMUTED ("sound: on", no gabby22.muted); toggling flips to "sound: off" + persists gabby22.muted="true" across a reload, and back to "sound: on"/"false"; the game runs Title->level 1 on gas with ZERO console/page errors both UNMUTED and MUTED (${report.consoleWarnings.length} non-gating warning(s)).`
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
