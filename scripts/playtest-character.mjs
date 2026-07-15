// Automated browser playtest for PLAN-04 task 5 (first-run flow + the
// authoritative committed character-creation playtest). Companion to
// playtest-drive.mjs / playtest-touch.mjs / playtest-pause.mjs /
// playtest-orientation.mjs (run those too — character creation must not
// regress bike/pedal/pause/orientation behavior; all four already navigate
// through CharacterCreationScene's "Let's ride! ->" button as part of their
// own setup).
//
// Proves, as far as the harness allows, PLAN-04's acceptance criteria:
//   1) DEFAULTS: a fresh (no gabby22.character) context — Title "Play" lands
//      on CharacterCreationScene with the working config's hairColor ===
//      'blonde' and the preview rider texture keyed to blonde.
//   2) >= 6 DISTINCT combos (spanning variety: the all-defaults combo, a
//      yellow-bike combo, an all-black/stealth combo, a pink-hair+teal-bike
//      combo, etc.) render correctly BOTH in the CharacterCreationScene
//      preview (rider/bike Image texture keys, wheels untouched) AND, after
//      entering a level, in GameScene's actual chassis (DEPTHS.bike)/rider
//      (DEPTHS.rider) Image objects. Combos are set by seeding
//      gabby22.character then reloading — fast/deterministic, and it
//      exercises the exact load path GameScene itself uses
//      (getSave().loadCharacter()).
//   3) PERSISTENCE across reload — set via REAL swatch clicks (not seeding,
//      unlike (2) above), so this proves the UI's own save-on-every-change
//      path, not just the read path: the scene re-reads the choice after a
//      full page reload (working config + preview) and raw localStorage
//      matches.
//   4) PROGRESS GUARD: editing the character while gabby22.progress holds a
//      partially-completed save (several levels done, highestUnlocked
//      advanced) must leave gabby22.progress byte-for-byte unchanged — read
//      from REAL localStorage before AND after the edit.
//   5) TOUCH: on a phone-landscape (1280x720, hasTouch+isMobile) context,
//      real touch taps hit one swatch in EACH of the 4 rows (including the
//      LAST swatch of the tightest row — the 8-wide BIKE row — to prove the
//      >=88px non-overlapping hit target is genuinely reachable at the
//      tight end, not just centered), then Randomize and "Let's ride!",
//      ending on LevelSelectScene, with 0 console/page errors.
//   6) FIRST-RUN ROUTING (PLAN-04 task 5's own text): with no character,
//      Title "Play" -> CharacterCreationScene; with a character present,
//      Title "Play" -> LevelSelectScene (skips creation); "Edit Character"
//      -> CharacterCreationScene in BOTH cases.
//
// Talks to the game through window.__gabbyGame (dev-only; see src/main.ts).
// Requires `npm run dev` running. Usage: node scripts/playtest-character.mjs
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const DEV_URL = process.env.PLAYTEST_URL ?? 'http://localhost:5173/';
const OUT_DIR = process.env.OUT_DIR ?? './playtest-out';
const DESIGN_W = 1280;
const DESIGN_H = 720;

// ---------------------------------------------------------------------------
// Constants mirrored from source — each documents which file/field it must
// stay in sync with, same convention as e.g. playtest-touch.mjs's GAS_XY/
// BRAKE_XY (pedals.ts/PEDALS) and playtest-pause.mjs's PAUSE_BTN
// (constants.ts PAUSE).
// ---------------------------------------------------------------------------

// Rider/bike texture variant-key format — IN SYNC WITH
// src/data/characters.ts's riderVariantKey()/bikeVariantKey(), which build
// these from the RESOLVED (post-fallback) option ids.
function expectedRiderKey(hairColor, eyeColor, outfit) {
  return `tex-gabby|${hairColor}|${eyeColor}|${outfit}`;
}
function expectedBikeKey(bikeColor) {
  return `tex-bike|${bikeColor}`;
}

// Z-depths for locating the in-game chassis/rider Image objects directly off
// GameScene's children.list — BikeHandle deliberately never exposes its
// sprites (see bike.ts). IN SYNC WITH constants.ts DEPTHS.bike/DEPTHS.rider.
const DEPTH_BIKE = 40;
const DEPTH_RIDER = 50;
// The raw, never-recolored wheel texture key — IN SYNC WITH
// constants.ts TEXTURE_KEYS.wheel.
const RAW_WHEEL_KEY = 'tex-wheel';

// Title screen button centers — IN SYNC WITH TitleScene.ts
// (DESIGN_WIDTH/2 = 640; Play y=400, Edit Character y=520).
const TITLE_PLAY = { x: 640, y: 400 };
const TITLE_EDIT_CHARACTER = { x: 640, y: 520 };

// LevelSelectScene's level-1 cell — IN SYNC WITH LevelSelectScene.ts's grid
// (FIRST_CELL_X=265, FIRST_ROW_Y=220) and identical to the point every other
// scripts/playtest-*.mjs already clicks for "level 1".
const LEVEL_1_CELL = { x: 265, y: 220 };

// CharacterCreationScene swatch-row + action-button layout — IN SYNC WITH
// constants.ts CHARACTER_CREATE.
const ROW_START_X = 590; // CHARACTER_CREATE.rowStartX
const SWATCH_SPACING_PX = 90; // CHARACTER_CREATE.swatchCenterSpacingPx
const HAIR_ROW_Y = 185; // CHARACTER_CREATE.hairRowY
const EYES_ROW_Y = 300; // CHARACTER_CREATE.eyesRowY
const BIKE_ROW_Y = 415; // CHARACTER_CREATE.bikeRowY
const SUIT_ROW_Y = 530; // CHARACTER_CREATE.suitRowY
const RANDOMIZE_BTN = { x: 460, y: 660 }; // randomizeButtonX, actionButtonY
const LETS_RIDE_BTN = { x: 820, y: 660 }; // letsRideButtonX, actionButtonY

/** x for the Nth (0-indexed) swatch in any row — the same affine formula
 * CharacterCreationScene.buildSwatchRow uses (rowStartX +
 * index*swatchCenterSpacingPx). */
function swatchX(index) {
  return ROW_START_X + index * SWATCH_SPACING_PX;
}

// Swatch option ids IN THEIR RENDERED ORDER — IN SYNC WITH
// src/data/characters.ts's HAIR_OPTIONS/EYE_OPTIONS/BIKE_OPTIONS/
// OUTFIT_OPTIONS. buildSwatchRow renders one swatch per array element via
// `options.forEach((option, index) => ...)`, so array order here MUST match
// array order there (index -> on-screen left-to-right position -> swatchX).
const HAIR_IDS = ['blonde', 'brown', 'black', 'ginger', 'pink', 'blue'];
const EYE_IDS = ['blue', 'green', 'brown', 'hazel', 'grey'];
const BIKE_IDS = ['red', 'blue', 'black', 'white', 'pink', 'purple', 'teal', 'yellow'];
const OUTFIT_IDS = ['classic', 'twoTone', 'stealth', 'cafe', 'party'];

// >= 6 distinct combos (criterion 2), spanning variety: every hair swatch is
// used exactly once across the six, and the set includes the all-defaults
// combo, a yellow-bike combo, an all-black/stealth combo, and a
// pink-hair+teal-bike combo, per the task's explicit examples.
const COMBOS = [
  {
    name: 'defaults',
    character: { hairColor: 'blonde', eyeColor: 'blue', bikeColor: 'pink', outfit: 'classic' },
  },
  {
    name: 'yellow-bike',
    character: { hairColor: 'brown', eyeColor: 'green', bikeColor: 'yellow', outfit: 'twoTone' },
  },
  {
    name: 'stealth-all-black',
    character: { hairColor: 'black', eyeColor: 'grey', bikeColor: 'black', outfit: 'stealth' },
  },
  {
    name: 'ginger-cafe-racer',
    character: { hairColor: 'ginger', eyeColor: 'brown', bikeColor: 'white', outfit: 'cafe' },
  },
  {
    name: 'pink-hair-teal-bike',
    character: { hairColor: 'pink', eyeColor: 'hazel', bikeColor: 'teal', outfit: 'party' },
  },
  {
    name: 'blue-hair-red-bike',
    character: { hairColor: 'blue', eyeColor: 'blue', bikeColor: 'red', outfit: 'classic' },
  },
];

// ---------------------------------------------------------------------------
// Generic helpers — same shape as every other scripts/playtest-*.mjs.
// ---------------------------------------------------------------------------

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
/** Real touch tap (hasTouch context only) — Playwright's touchscreen.tap
 * dispatches a genuine CDP Input.dispatchTouchEvent touchStart/touchEnd
 * pair, the same underlying mechanism playtest-touch.mjs's raw `touch()`
 * helper uses; a discrete tap (no hold/multitouch) doesn't need that
 * lower-level control. */
async function tapDesign(page, x, y) {
  const box = await canvasBox(page);
  await page.touchscreen.tap(vx(box, x), vy(box, y));
}

async function waitForScene(page, key, timeout = 20_000) {
  await page.waitForFunction((k) => globalThis.__gabbyGame?.scene.isActive(k) === true, key, {
    timeout,
  });
}

function attachErrorListeners(page, consoleErrors, pageErrors) {
  page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
  page.on('pageerror', (e) => pageErrors.push(String(e)));
}

function readLocalStorage(page, key) {
  return page.evaluate((k) => localStorage.getItem(k), key);
}

function seedLocalStorage(page, key, value) {
  return page.evaluate(({ k, v }) => localStorage.setItem(k, JSON.stringify(v)), { k: key, v: value });
}

function safeJsonParse(raw) {
  if (raw === null || raw === undefined) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** CharacterCreationScene snapshot: the working config (private TS field,
 * freely reachable at runtime — same convention every other
 * scripts/playtest-*.mjs uses for e.g. GameScene's private `bike`/
 * `pauseButton`/`gameInput`), the preview rider/bike Image texture keys, and
 * whether the two wheel Images in the preview stayed the RAW (never
 * recolored) wheel texture. */
function readCreationState(page) {
  return page.evaluate((rawWheelKey) => {
    const g = globalThis.__gabbyGame;
    const active = g.scene.isActive('CharacterCreationScene');
    const s = g.scene.getScene('CharacterCreationScene');
    if (!active || !s) {
      return { active, config: null, riderKey: null, bikeKey: null, wheelsRawOk: false };
    }
    const wheelKeys = s.previewContainer
      ? s.previewContainer.list
          .filter((o) => o.type === 'Image' && o !== s.riderPreviewSprite && o !== s.bikePreviewSprite)
          .map((o) => o.texture.key)
      : [];
    return {
      active,
      config: s.config ? { ...s.config } : null,
      riderKey: s.riderPreviewSprite ? s.riderPreviewSprite.texture.key : null,
      bikeKey: s.bikePreviewSprite ? s.bikePreviewSprite.texture.key : null,
      wheelsRawOk: wheelKeys.length === 2 && wheelKeys.every((k) => k === rawWheelKey),
    };
  }, RAW_WHEEL_KEY);
}

/** GameScene snapshot: the ACTUAL in-scene chassis/rider Image objects, read
 * off children.list by depth (BikeHandle never exposes its sprites — see
 * bike.ts). Three Images share DEPTH_BIKE (two wheels + the chassis); the
 * chassis is whichever one is NOT the raw wheel texture. Exactly one Image
 * sits at DEPTH_RIDER. */
function readGameCharacterState(page) {
  return page.evaluate(
    ({ depthBike, depthRider, rawWheelKey }) => {
      const g = globalThis.__gabbyGame;
      const active = g.scene.isActive('GameScene');
      const s = g.scene.getScene('GameScene');
      if (!active || !s) {
        return { active, chassisKey: null, riderKey: null, wheelsRawOk: false };
      }
      const atBikeDepth = s.children.list.filter((o) => o.type === 'Image' && o.depth === depthBike);
      const chassis = atBikeDepth.find((o) => o.texture.key !== rawWheelKey);
      const wheels = atBikeDepth.filter((o) => o !== chassis);
      const atRiderDepth = s.children.list.filter((o) => o.type === 'Image' && o.depth === depthRider);
      return {
        active,
        chassisKey: chassis ? chassis.texture.key : null,
        riderKey: atRiderDepth[0] ? atRiderDepth[0].texture.key : null,
        wheelsRawOk: wheels.length === 2 && wheels.every((w) => w.texture.key === rawWheelKey),
      };
    },
    { depthBike: DEPTH_BIKE, depthRider: DEPTH_RIDER, rawWheelKey: RAW_WHEEL_KEY }
  );
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });

  const checks = {};
  const evidence = {};
  const consoleErrors = [];
  const pageErrors = [];

  /** Fresh isolated browser context + page: the common setup all six
   * sections share (new context at the 1280x720 design viewport, error
   * listeners attached, navigated to the dev URL, waited onto TitleScene).
   * `contextOptions` is spread over the defaults — the touch section passes
   * `{ hasTouch: true, isMobile: true }`. Returns `{ ctx, page }`; the caller
   * closes `ctx` when its section is done. Closes over consoleErrors/
   * pageErrors so every context funnels its errors into the one report. */
  async function freshTitlePage(browser, contextOptions = {}) {
    const ctx = await browser.newContext({
      viewport: { width: DESIGN_W, height: DESIGN_H },
      ...contextOptions,
    });
    const page = await ctx.newPage();
    attachErrorListeners(page, consoleErrors, pageErrors);
    await page.goto(DEV_URL, { waitUntil: 'domcontentloaded' });
    await waitForScene(page, 'TitleScene');
    return { ctx, page };
  }

  try {
    // ========================================================================
    // 1) DEFAULTS ON FIRST OPEN = blonde hair.
    // ========================================================================
    {
      // A fresh browser context has empty localStorage by construction
      // (Playwright isolates storage per context) — the same first-launch
      // guarantee playtest-drive.mjs's own "Fresh context => empty
      // localStorage" comment documents.
      const { ctx, page } = await freshTitlePage(browser);

      const preCharacter = await readLocalStorage(page, 'gabby22.character');
      checks.defaults_freshContextHadNoCharacter = preCharacter === null;

      await clickDesign(page, TITLE_PLAY.x, TITLE_PLAY.y);
      await waitForScene(page, 'CharacterCreationScene');
      await page.waitForTimeout(150);
      const state = await readCreationState(page);
      await page.screenshot({ path: join(OUT_DIR, 'defaults-first-open.png') });

      checks.defaults_creationSceneActiveOnFirstOpen = state.active === true;
      checks.defaults_hairColorBlonde = state.config?.hairColor === 'blonde';
      // "the preview rider texture key contains blonde" — parse the pinned
      // key format and check the hair segment precisely (a stronger, exact
      // form of "contains").
      checks.defaults_previewRiderKeyIsBlonde = state.riderKey?.split('|')[1] === 'blonde';

      evidence.defaults = {
        preCharacter,
        config: state.config,
        riderKey: state.riderKey,
        bikeKey: state.bikeKey,
      };
      await ctx.close();
    }

    // ========================================================================
    // 2) >= 6 DISTINCT COMBOS render correctly in preview AND in-game.
    // ========================================================================
    {
      const { ctx, page } = await freshTitlePage(browser);

      const comboResults = [];
      for (const combo of COMBOS) {
        // Seed + reload: fast/deterministic, and it exercises the exact
        // load path GameScene itself uses (getSave().loadCharacter()).
        await seedLocalStorage(page, 'gabby22.character', combo.character);
        await page.reload({ waitUntil: 'domcontentloaded' });
        await waitForScene(page, 'TitleScene');
        // A character now exists, so "Play" would skip straight to
        // LevelSelect (criterion 6) — "Edit Character" always returns to
        // CharacterCreationScene regardless of save state.
        await clickDesign(page, TITLE_EDIT_CHARACTER.x, TITLE_EDIT_CHARACTER.y);
        await waitForScene(page, 'CharacterCreationScene');
        await page.waitForTimeout(200);

        const wantRider = expectedRiderKey(
          combo.character.hairColor,
          combo.character.eyeColor,
          combo.character.outfit
        );
        const wantBike = expectedBikeKey(combo.character.bikeColor);
        const preview = await readCreationState(page);
        const previewOk = preview.riderKey === wantRider && preview.bikeKey === wantBike;
        await page.screenshot({ path: join(OUT_DIR, `combo-${combo.name}-preview.png`) });

        await clickDesign(page, LETS_RIDE_BTN.x, LETS_RIDE_BTN.y);
        await waitForScene(page, 'LevelSelectScene');
        await clickDesign(page, LEVEL_1_CELL.x, LEVEL_1_CELL.y);
        await waitForScene(page, 'GameScene');
        await page.waitForTimeout(500);

        const inGame = await readGameCharacterState(page);
        const inGameOk = inGame.chassisKey === wantBike && inGame.riderKey === wantRider;
        await page.screenshot({ path: join(OUT_DIR, `combo-${combo.name}-ingame.png`) });

        checks[`combo_${combo.name}_previewMatches`] = previewOk;
        checks[`combo_${combo.name}_previewWheelsRaw`] = preview.wheelsRawOk;
        checks[`combo_${combo.name}_inGameMatches`] = inGameOk;
        checks[`combo_${combo.name}_inGameWheelsRaw`] = inGame.wheelsRawOk;

        comboResults.push({
          name: combo.name,
          character: combo.character,
          wantRider,
          wantBike,
          previewRiderKey: preview.riderKey,
          previewBikeKey: preview.bikeKey,
          inGameChassisKey: inGame.chassisKey,
          inGameRiderKey: inGame.riderKey,
          previewOk,
          inGameOk,
        });
      }

      checks.combos_atLeastSixTested = comboResults.length >= 6;
      evidence.combos = comboResults;
      await ctx.close();
    }

    // ========================================================================
    // 3) PERSISTENCE across reload — set via REAL swatch clicks (not
    //    seeding, unlike (2) above — proves the UI's own save-on-every-
    //    change path survives a reload, not just the read path).
    // ========================================================================
    {
      const { ctx, page } = await freshTitlePage(browser);
      await clickDesign(page, TITLE_PLAY.x, TITLE_PLAY.y); // fresh context, no character => first-run
      await waitForScene(page, 'CharacterCreationScene');

      const distinctive = { hairColor: 'ginger', eyeColor: 'hazel', bikeColor: 'purple', outfit: 'party' };
      await clickDesign(page, swatchX(HAIR_IDS.indexOf(distinctive.hairColor)), HAIR_ROW_Y);
      await page.waitForTimeout(120);
      await clickDesign(page, swatchX(EYE_IDS.indexOf(distinctive.eyeColor)), EYES_ROW_Y);
      await page.waitForTimeout(120);
      await clickDesign(page, swatchX(BIKE_IDS.indexOf(distinctive.bikeColor)), BIKE_ROW_Y);
      await page.waitForTimeout(120);
      await clickDesign(page, swatchX(OUTFIT_IDS.indexOf(distinctive.outfit)), SUIT_ROW_Y);
      await page.waitForTimeout(120);

      const preReload = await readCreationState(page);
      checks.persist_uiTapsRegistered =
        preReload.config?.hairColor === distinctive.hairColor &&
        preReload.config?.eyeColor === distinctive.eyeColor &&
        preReload.config?.bikeColor === distinctive.bikeColor &&
        preReload.config?.outfit === distinctive.outfit;
      await page.screenshot({ path: join(OUT_DIR, 'persist-before-reload.png') });

      await page.reload({ waitUntil: 'domcontentloaded' });
      await waitForScene(page, 'TitleScene');
      // A character now exists (every swatch tap persists) — "Play" would
      // skip to LevelSelect, so use "Edit Character" to land back here.
      await clickDesign(page, TITLE_EDIT_CHARACTER.x, TITLE_EDIT_CHARACTER.y);
      await waitForScene(page, 'CharacterCreationScene');
      await page.waitForTimeout(150);

      const postReload = await readCreationState(page);
      const postReloadRaw = await readLocalStorage(page, 'gabby22.character');
      const postReloadStored = safeJsonParse(postReloadRaw);
      await page.screenshot({ path: join(OUT_DIR, 'persist-after-reload.png') });

      const wantRider = expectedRiderKey(distinctive.hairColor, distinctive.eyeColor, distinctive.outfit);
      const wantBike = expectedBikeKey(distinctive.bikeColor);

      checks.persist_survivesReload_config =
        postReload.config?.hairColor === distinctive.hairColor &&
        postReload.config?.eyeColor === distinctive.eyeColor &&
        postReload.config?.bikeColor === distinctive.bikeColor &&
        postReload.config?.outfit === distinctive.outfit;
      checks.persist_survivesReload_preview =
        postReload.riderKey === wantRider && postReload.bikeKey === wantBike;
      checks.persist_localStorageMatches =
        !!postReloadStored && Object.keys(distinctive).every((k) => postReloadStored[k] === distinctive[k]);

      evidence.persistence = { distinctive, preReload, postReload, postReloadStored };
      await ctx.close();
    }

    // ========================================================================
    // 4) PROGRESS GUARD — editing the character must never touch
    //    gabby22.progress. Read REAL localStorage before AND after.
    // ========================================================================
    {
      const { ctx, page } = await freshTitlePage(browser);

      // Matches save.ts's LevelProgress shape exactly: { highestUnlocked,
      // completed: boolean[TOTAL_LEVELS] } (22 levels — constants.ts
      // TOTAL_LEVELS). 8 of the first levels done, unlocked through 9.
      const seededProgress = {
        highestUnlocked: 9,
        completed: Array.from({ length: 22 }, (_, i) => i < 8),
      };
      await seedLocalStorage(page, 'gabby22.progress', seededProgress);
      // RAW (unparsed) progress string, captured right after seeding — the
      // byte-exact baseline the post-edit string must still equal. Nothing
      // between here and the character edit below writes gabby22.progress, so
      // this IS the pre-edit raw state.
      const progressBeforeRaw = await readLocalStorage(page, 'gabby22.progress');
      const progressRightAfterSeed = safeJsonParse(progressBeforeRaw);
      checks.progress_seedReadsBackBeforeEdit =
        !!progressRightAfterSeed &&
        progressRightAfterSeed.highestUnlocked === seededProgress.highestUnlocked &&
        JSON.stringify(progressRightAfterSeed.completed) === JSON.stringify(seededProgress.completed);

      const characterBefore = await readLocalStorage(page, 'gabby22.character');

      await clickDesign(page, TITLE_PLAY.x, TITLE_PLAY.y); // no character seeded => first-run => CharacterCreationScene
      await waitForScene(page, 'CharacterCreationScene');

      // Change swatches, then commit via "Let's ride!" — the exact flow
      // that must only ever write gabby22.character (see
      // CharacterCreationScene.applyConfigChange's doc comment).
      await clickDesign(page, swatchX(HAIR_IDS.indexOf('black')), HAIR_ROW_Y);
      await page.waitForTimeout(120);
      await clickDesign(page, swatchX(BIKE_IDS.indexOf('teal')), BIKE_ROW_Y);
      await page.waitForTimeout(120);
      await clickDesign(page, LETS_RIDE_BTN.x, LETS_RIDE_BTN.y);
      await waitForScene(page, 'LevelSelectScene');

      const characterAfter = await readLocalStorage(page, 'gabby22.character');
      const progressAfterRaw = await readLocalStorage(page, 'gabby22.progress');
      const progressAfter = safeJsonParse(progressAfterRaw);

      checks.progress_characterActuallyChanged = characterAfter !== null && characterAfter !== characterBefore;
      // PRIMARY guard (THE acceptance criterion "changing character mid-
      // progress doesn't reset level progress"): the RAW gabby22.progress
      // string is byte-for-byte identical before and after the character
      // edit — the strongest possible form of "untouched". saveCharacter only
      // ever writes gabby22.character (save.ts), so this string must not move.
      checks.progress_unchangedAfterCharacterEdit = progressAfterRaw === progressBeforeRaw;
      // SECONDARY (extra evidence, redundant with the raw check above): the
      // parsed structure still matches the seeded LevelProgress field-by-field
      // — human-readable corroboration that the untouched string is in fact
      // the fully-completed-8/unlocked-9 progress we seeded.
      checks.progress_unchangedStructural =
        !!progressAfter &&
        progressAfter.highestUnlocked === seededProgress.highestUnlocked &&
        Array.isArray(progressAfter.completed) &&
        progressAfter.completed.length === seededProgress.completed.length &&
        progressAfter.completed.every((v, i) => v === seededProgress.completed[i]);

      evidence.progressGuard = {
        seededProgress,
        characterBefore,
        characterAfter,
        progressBeforeRaw,
        progressAfterRaw,
        progressAfter,
      };
      await ctx.close();
    }

    // ========================================================================
    // 5) TOUCH: phone landscape, real taps on every row incl. the tightest
    //    (8-wide BIKE) row's LAST swatch, then Randomize + Let's ride!.
    // ========================================================================
    {
      const { ctx, page } = await freshTitlePage(browser, { hasTouch: true, isMobile: true });
      await tapDesign(page, TITLE_PLAY.x, TITLE_PLAY.y);
      await waitForScene(page, 'CharacterCreationScene');
      await page.screenshot({ path: join(OUT_DIR, 'touch-character-creation-start.png') });

      // Non-default picks in every row, so a stale/default value can't
      // masquerade as "the tap worked".
      const hairPick = 'ginger';
      const eyePick = 'green';
      const bikePick = 'yellow'; // index 7 -- LAST swatch of the 8-wide BIKE row
      const suitPick = 'cafe';

      await tapDesign(page, swatchX(HAIR_IDS.indexOf(hairPick)), HAIR_ROW_Y);
      await page.waitForTimeout(150);
      let cfg = (await readCreationState(page)).config;
      checks.touch_hairRowTapRegisters = cfg?.hairColor === hairPick;

      await tapDesign(page, swatchX(EYE_IDS.indexOf(eyePick)), EYES_ROW_Y);
      await page.waitForTimeout(150);
      cfg = (await readCreationState(page)).config;
      checks.touch_eyesRowTapRegisters = cfg?.eyeColor === eyePick;

      // CRUCIAL: the tightest row (8 swatches) — tap the LAST (yellow)
      // swatch to prove the >=88px non-overlapping hit target is genuinely
      // tappable by touch at the tight end, not just centered.
      await tapDesign(page, swatchX(BIKE_IDS.indexOf(bikePick)), BIKE_ROW_Y);
      await page.waitForTimeout(150);
      cfg = (await readCreationState(page)).config;
      checks.touch_bikeRowLastSwatchTapRegisters = cfg?.bikeColor === bikePick;

      await tapDesign(page, swatchX(OUTFIT_IDS.indexOf(suitPick)), SUIT_ROW_Y);
      await page.waitForTimeout(150);
      cfg = (await readCreationState(page)).config;
      checks.touch_suitRowTapRegisters = cfg?.outfit === suitPick;
      await page.screenshot({ path: join(OUT_DIR, 'touch-character-creation-swatches.png') });

      await tapDesign(page, RANDOMIZE_BTN.x, RANDOMIZE_BTN.y);
      await page.waitForTimeout(150);
      const randomized = (await readCreationState(page)).config;
      // Randomize's OWN random result isn't gated (it could rarely re-roll
      // the same values) — what matters here is the touch tap on the button
      // registered and produced a fully-resolvable config (every field a
      // real option id, catching e.g. an off-by-one in randomOptionId).
      checks.touch_randomizeProducesValidConfig =
        !!randomized &&
        HAIR_IDS.includes(randomized.hairColor) &&
        EYE_IDS.includes(randomized.eyeColor) &&
        BIKE_IDS.includes(randomized.bikeColor) &&
        OUTFIT_IDS.includes(randomized.outfit);

      await tapDesign(page, LETS_RIDE_BTN.x, LETS_RIDE_BTN.y);
      await waitForScene(page, 'LevelSelectScene');
      checks.touch_letsRideNavigatesToLevelSelect =
        (await page.evaluate(() => globalThis.__gabbyGame.scene.isActive('LevelSelectScene'))) === true;
      await page.screenshot({ path: join(OUT_DIR, 'touch-level-select.png') });

      evidence.touch = {
        hairPick,
        eyePick,
        bikePick,
        suitPick,
        configAfterSwatchTaps: cfg,
        randomizedConfig: randomized,
      };
      await ctx.close();
    }

    // ========================================================================
    // 6) FIRST-RUN ROUTING both directions.
    // ========================================================================
    {
      const { ctx, page } = await freshTitlePage(browser);

      const noCharAtStart = await readLocalStorage(page, 'gabby22.character');
      checks.routing_freshContextHasNoCharacter = noCharAtStart === null;

      // (a) "Edit Character" always goes to CharacterCreationScene, even
      // with no character saved yet.
      await clickDesign(page, TITLE_EDIT_CHARACTER.x, TITLE_EDIT_CHARACTER.y);
      await waitForScene(page, 'CharacterCreationScene');
      checks.routing_editCharacter_noCharacter_goesToCreation =
        (await page.evaluate(() => globalThis.__gabbyGame.scene.isActive('CharacterCreationScene'))) === true;

      // (b) Back to Title (visiting the scene without acting saves
      // nothing), then "Play" with NO character -> CharacterCreationScene
      // (the first-run path).
      await page.reload({ waitUntil: 'domcontentloaded' });
      await waitForScene(page, 'TitleScene');
      const stillNoChar = await readLocalStorage(page, 'gabby22.character');
      await clickDesign(page, TITLE_PLAY.x, TITLE_PLAY.y);
      await waitForScene(page, 'CharacterCreationScene');
      checks.routing_play_noCharacter_goesToCreation =
        stillNoChar === null &&
        (await page.evaluate(() => globalThis.__gabbyGame.scene.isActive('CharacterCreationScene'))) === true;

      // (c) Seed a character, reload, "Play" -> LevelSelectScene directly
      // (skips creation).
      const seededChar = { hairColor: 'blue', eyeColor: 'grey', bikeColor: 'white', outfit: 'twoTone' };
      await seedLocalStorage(page, 'gabby22.character', seededChar);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await waitForScene(page, 'TitleScene');
      await clickDesign(page, TITLE_PLAY.x, TITLE_PLAY.y);
      await waitForScene(page, 'LevelSelectScene');
      const afterPlay = await page.evaluate(() => ({
        levelSelect: globalThis.__gabbyGame.scene.isActive('LevelSelectScene'),
        creation: globalThis.__gabbyGame.scene.isActive('CharacterCreationScene'),
      }));
      checks.routing_play_characterExists_skipsToLevelSelect =
        afterPlay.levelSelect === true && afterPlay.creation === false;
      await page.screenshot({ path: join(OUT_DIR, 'routing-play-skips-to-levelselect.png') });

      // (d) "Edit Character" still always works, even with a character
      // already saved.
      await page.reload({ waitUntil: 'domcontentloaded' });
      await waitForScene(page, 'TitleScene');
      await clickDesign(page, TITLE_EDIT_CHARACTER.x, TITLE_EDIT_CHARACTER.y);
      await waitForScene(page, 'CharacterCreationScene');
      checks.routing_editCharacter_withCharacter_goesToCreation =
        (await page.evaluate(() => globalThis.__gabbyGame.scene.isActive('CharacterCreationScene'))) === true;

      evidence.routing = { noCharAtStart, stillNoChar, seededChar };
      await ctx.close();
    }

    // ========================================================================
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
