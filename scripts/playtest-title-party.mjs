// Automated browser playtest for the post-game "Party" revisit button on the
// Title screen (PLAN-09 task 4 / ST-6, src/scenes/TitleScene.ts). Same shape as
// scripts/playtest-party.mjs / scripts/playtest-credits.mjs (playwright-core
// driving system Chrome headless, viewport 1280x720 with touch, driving through
// window.__gabbyGame, screenshots to the gitignored playtest-out/, console +
// page errors collected AND gating the exit code). Requires `npm run dev`
// already running on :5173.
//
// The Party button appears on the Title ONLY after the game is beaten (level 22
// completed — GameScene marks it at the arrival hand-off), routes to PartyScene,
// and from there the existing "Credits ->" / "Play again?" buttons close the
// revisit loop back to the Title. This harness gates exactly that.
//
// What it gates:
//   1. NOT BEATEN -> ABSENT: with no completed level 22 in gabby22.progress the
//      Party button is absent — no Text renders its label and no balloon emoji
//      renders anywhere on the Title — and a press at its slot does NOT navigate
//      (falsifiability: proves there is genuinely no button there, not just a
//      missing glyph). Play / Edit Character still read intentionally with no gap.
//   2. BEATEN -> PRESENT: with level 22 completed the label renders BYTE-EXACT as
//      "Party <U+1F388>" (asserted against an INDEPENDENT code-point oracle), and
//      the balloon emoji is proven a REAL GLYPH by its DRAWN INK vs a private-use
//      control no font can define (advance width is NOT the proof — Press Start
//      2P's own tofu box advances identically).
//   3. ROUTES to PartyScene by BOTH a real mouse click AND a real touch tap.
//   4. THE REVISIT LOOP CONNECTS with no dead end, driven through the REAL
//      buttons: Title(Party) -> PartyScene -> (Credits ->) -> CreditsScene ->
//      (Play again?) -> Title, asserting every hop's scene key.
//   5. THE REVISIT DOES NOT ALTER THE SAVE: a partially-completed-plus-level-22
//      save is seeded, the whole loop is walked, and every gabby22.* key
//      (gabby22.progress in particular) is byte-identical afterwards.
//   6. Zero console/page errors throughout; screenshots (Title with the button,
//      Title without it, a tight crop of the button) to playtest-out/.
//
// Usage:
//   node scripts/playtest-title-party.mjs
//   PLAYTEST_URL=http://localhost:5174/ OUT_DIR=./shots node scripts/playtest-title-party.mjs
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const DEV_URL = process.env.PLAYTEST_URL ?? 'http://localhost:5173/';
const OUT_DIR = process.env.OUT_DIR ?? './playtest-out';
const DESIGN_W = 1280;
const DESIGN_H = 720;

const SETTLE_MS = 200;

// Title button centers — IN SYNC WITH TitleScene.ts (DESIGN_WIDTH/2 = 640; Play
// y=400, Edit Character y=520, Party y=640 — the three stacked menu buttons).
const TITLE_PARTY = { x: 640, y: 640 };

// --- INDEPENDENT expected literals, assembled from explicit code points so a
// mangled shared constant can never pass (CLAUDE.md Rule 4 — the discipline
// playtest-party.mjs / playtest-credits.mjs use). ---
const cp = (...points) => String.fromCodePoint(...points);

/** 'Party <U+1F388>' — the label, with the balloon emoji as its own code point. */
const ORACLE_PARTY_LABEL = cp(0x50, 0x61, 0x72, 0x74, 0x79, 0x20, 0x1f388); // Party 🎈
/** U+1F388 PARTY BALLOON — the one non-ASCII glyph in the label. */
const ORACLE_BALLOON = cp(0x1f388);

/** ASCII menu labels the Title must still show when the Party button is absent,
 * so "no button" reads as an intentional menu rather than a hole. */
const ORACLE_PLAY = 'Play';
const ORACLE_EDIT = 'Edit Character';

/** A realistic partially-completed save that HAS beaten level 22. Raw
 * localStorage strings so the before/after comparison in the loop is byte-level,
 * not a re-serialisation. completed[21] === true is what TitleScene's
 * hasBeatenGame keys on; the scattered earlier completions prove the loop leaves
 * ALL of progress untouched, not just the final flag. */
const SEEDED_BEATEN_SAVE = {
  'gabby22.character': JSON.stringify({
    hairColor: 'pink',
    eyeColor: 'green',
    bikeColor: 'teal',
    outfit: 'stealth',
  }),
  'gabby22.progress': JSON.stringify({
    highestUnlocked: 22,
    completed: Array.from({ length: 22 }, (_, i) => i < 13 || i === 21),
  }),
  'gabby22.tulips': '9',
  'gabby22.notesSeen': JSON.stringify([0, 3, 7]),
  'gabby22.saveVersion': '1',
};

/** A save that has NOT beaten the game: several early levels done, level 22 not.
 * completed[21] === false, so the Party button must be absent. */
const SEEDED_UNBEATEN_SAVE = {
  'gabby22.character': SEEDED_BEATEN_SAVE['gabby22.character'],
  'gabby22.progress': JSON.stringify({
    highestUnlocked: 9,
    completed: Array.from({ length: 22 }, (_, i) => i < 8),
  }),
  'gabby22.tulips': '4',
  'gabby22.saveVersion': '1',
};

async function waitForScene(page, key, timeout = 20_000) {
  await page.waitForFunction((k) => globalThis.__gabbyGame?.scene.isActive(k) === true, key, {
    timeout,
  });
}

// --- design->viewport mapping for real clicks/taps (canvas is FIT-scaled). ---
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
async function tapDesign(page, x, y) {
  const box = await canvasBox(page);
  await page.touchscreen.tap(vx(box, x), vy(box, y));
}

/** Wipe every gabby22.* key, then seed the given raw entries. */
async function seedSave(page, entries) {
  await page.evaluate((kv) => {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && key.startsWith('gabby22.')) localStorage.removeItem(key);
    }
    for (const [key, value] of Object.entries(kv)) localStorage.setItem(key, value);
  }, entries);
}

/** Raw localStorage census of every gabby22.* key — the byte-level baseline the
 * loop's "revisit changes nothing" check trusts. */
function readSaveKeys(page) {
  return page.evaluate(() => {
    const out = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('gabby22.')) out[key] = localStorage.getItem(key);
    }
    return out;
  });
}

/** Reload the page and wait onto a fresh TitleScene — the exact path a real
 * launch takes, so TitleScene.create re-reads gabby22.progress each time (this
 * is where the button-visibility decision is made). */
async function reloadToTitle(page) {
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForScene(page, 'TitleScene');
  await page.waitForTimeout(SETTLE_MS);
}

/** Every string a live Text object on the Title is actually rendering, INCLUDING
 * Text nested inside Containers (button labels live there). Proves a string
 * reached the screen, not merely that the code intended it. */
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

/** Which of the finale scenes are active right now. */
function activeScenes(page) {
  return page.evaluate(() => {
    const g = globalThis.__gabbyGame;
    return {
      title: g.scene.isActive('TitleScene'),
      party: g.scene.isActive('PartyScene'),
      credits: g.scene.isActive('CreditsScene'),
    };
  });
}

/**
 * PROVE THE BALLOON EMOJI REALLY RENDERED (rather than tofu'd), in the page, with
 * the exact font stack and size TitleScene draws the label at (createPixelText ->
 * snapFontSize(24)=24 over FONT_STACK_PIXEL).
 *
 * INK is the proof: each character is drawn into a 2D canvas and its lit pixels
 * reduced to a count + a positional hash. A PRIVATE-USE code point (U+E123) is
 * the control — no font can define it, so whatever the browser draws for IT is
 * this stack's "missing glyph". A character whose ink signature differs from that
 * control drew a real glyph. (Advance width is deliberately NOT used: Press Start
 * 2P's own .notdef box is fixed-width and advances exactly as a real glyph would,
 * so width would happily pass a tofu box. Same reasoning as
 * scripts/playtest-credits.mjs's glyphProbe.)
 */
function glyphProbe(page) {
  return page.evaluate(() => {
    const FONT = "24px 'Press Start 2P', 'Courier New', monospace";
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const probe = (ch) => {
      ctx.clearRect(0, 0, 64, 64);
      ctx.font = FONT;
      ctx.textBaseline = 'top';
      ctx.fillStyle = '#000000';
      ctx.fillText(ch, 12, 12);
      const data = ctx.getImageData(0, 0, 64, 64).data;
      let ink = 0;
      let hash = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] > 8) {
          ink++;
          hash = (Math.imul(hash, 31) + (i >>> 2)) >>> 0;
        }
      }
      return { ink, hash };
    };
    return {
      missing: probe('\u{E123}'), // private use — the control
      balloon: probe('\u{1F388}'),
      letterA: probe('A'),
    };
  });
}

/** Poll a party/credits DEV snapshot until `predicate` holds or time is up. */
async function pollScene(page, sceneKey, snapField, predicate, timeoutMs, stepMs = 100) {
  const read = () =>
    page.evaluate(
      ({ k, f }) => {
        const s = globalThis.__gabbyGame.scene.getScene(k);
        const d = s && s[f];
        if (!d) return null;
        return {
          creditsButtonShown: typeof d.creditsButtonShown === 'function' ? d.creditsButtonShown() : undefined,
          creditsButtonPos: d.creditsButtonPos,
          buttonsShown: typeof d.buttonsShown === 'function' ? d.buttonsShown() : undefined,
          playAgainPos: d.playAgainPos,
        };
      },
      { k: sceneKey, f: snapField }
    );
  const start = Date.now();
  let last = await read();
  while (Date.now() - start < timeoutMs) {
    if (last && predicate(last)) return last;
    await page.waitForTimeout(stepMs);
    last = await read();
  }
  return last;
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({
    viewport: { width: DESIGN_W, height: DESIGN_H },
    hasTouch: true,
  });
  const page = await context.newPage();

  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => pageErrors.push(String(err)));

  const problems = [];
  let report;
  try {
    await page.goto(DEV_URL, { waitUntil: 'domcontentloaded' });
    await waitForScene(page, 'TitleScene');

    // ============================================================ (1) ABSENT
    await seedSave(page, SEEDED_UNBEATEN_SAVE);
    await reloadToTitle(page);
    const absentTexts = await titleTexts(page);
    const absent = {
      partyLabelPresent: absentTexts.includes(ORACLE_PARTY_LABEL),
      balloonAnywhere: absentTexts.some((t) => t.includes(ORACLE_BALLOON)),
      playPresent: absentTexts.includes(ORACLE_PLAY),
      editPresent: absentTexts.includes(ORACLE_EDIT),
    };
    if (absent.partyLabelPresent) problems.push('absent: the Party label rendered on an unbeaten save');
    if (absent.balloonAnywhere) problems.push('absent: a balloon emoji rendered on an unbeaten save');
    if (!absent.playPresent || !absent.editPresent)
      problems.push('absent: Play / Edit Character are not both present — the menu is not intact');
    await page.screenshot({ path: join(OUT_DIR, 'title-without-party.png') });

    // Falsifiability: a press at the Party slot must do NOTHING (there is no
    // button there to press) — proves absence, not merely a missing glyph.
    await clickDesign(page, TITLE_PARTY.x, TITLE_PARTY.y);
    await page.waitForTimeout(300);
    const afterEmptyPress = await activeScenes(page);
    if (!afterEmptyPress.title || afterEmptyPress.party)
      problems.push('absent: a press at the empty Party slot navigated away from the Title');

    // =========================================================== (2) PRESENT
    await seedSave(page, SEEDED_BEATEN_SAVE);
    await reloadToTitle(page);
    const presentTexts = await titleTexts(page);
    const labelRendered = presentTexts.includes(ORACLE_PARTY_LABEL);
    if (!labelRendered)
      problems.push(`present: the Party label never rendered (texts: ${JSON.stringify(presentTexts)})`);

    const glyphs = await glyphProbe(page);
    // INK: a real glyph's bitmap must differ from the private-use control's.
    if (glyphs.balloon.ink === 0) problems.push('balloon glyph: drew NOTHING at all');
    if (glyphs.balloon.ink === glyphs.missing.ink && glyphs.balloon.hash === glyphs.missing.hash)
      problems.push(
        'balloon glyph: renders identically to a private-use code point — it is TOFU, not a real glyph'
      );

    await page.screenshot({ path: join(OUT_DIR, 'title-with-party.png') });
    const cropBox = await canvasBox(page);
    await page.screenshot({
      path: join(OUT_DIR, 'title-party-button-closeup.png'),
      clip: {
        x: vx(cropBox, TITLE_PARTY.x - 200),
        y: vy(cropBox, TITLE_PARTY.y - 60),
        width: (400 / DESIGN_W) * cropBox.width,
        height: (120 / DESIGN_H) * cropBox.height,
      },
    });

    // ============================================= (3) ROUTES by click AND tap
    // Click. (Save is still the beaten one; reloadToTitle re-shows the button.)
    await reloadToTitle(page);
    await clickDesign(page, TITLE_PARTY.x, TITLE_PARTY.y);
    let clickRouted = true;
    try {
      await waitForScene(page, 'PartyScene', 6000);
    } catch {
      clickRouted = false;
      problems.push('route(click): PartyScene never activated after pressing Party');
    }

    // Tap.
    await reloadToTitle(page);
    await tapDesign(page, TITLE_PARTY.x, TITLE_PARTY.y);
    let tapRouted = true;
    try {
      await waitForScene(page, 'PartyScene', 6000);
    } catch {
      tapRouted = false;
      problems.push('route(tap): PartyScene never activated after tapping Party');
    }

    // ============================== (4)+(5) THE LOOP CONNECTS, SAVE UNTOUCHED
    // Seed the beaten save fresh, capture the byte-level baseline, then walk the
    // whole revisit loop through the REAL buttons and re-census afterwards.
    await seedSave(page, SEEDED_BEATEN_SAVE);
    const saveBefore = await readSaveKeys(page);
    await reloadToTitle(page);

    const chain = { party: false, credits: false, title: false };

    // hop 1: Title(Party) -> PartyScene
    await clickDesign(page, TITLE_PARTY.x, TITLE_PARTY.y);
    try {
      await waitForScene(page, 'PartyScene', 6000);
      chain.party = true;
    } catch {
      problems.push('loop: Party button did not reach PartyScene');
    }

    // hop 2: PartyScene -> (Credits ->) -> CreditsScene
    if (chain.party) {
      const partyBtn = await pollScene(
        page,
        'PartyScene',
        '__party',
        (d) => d.creditsButtonShown === true,
        10_000
      );
      if (!partyBtn || partyBtn.creditsButtonShown !== true) {
        problems.push('loop: the party never revealed its "Credits ->" button');
      } else {
        // Settle before pressing: the party builds this button inside a
        // delayedCall, so the frame the poll sees it flip true is a frame it is
        // still queued in Phaser's _pendingInsertion and not yet hit-testable.
        await page.waitForTimeout(SETTLE_MS);
        await clickDesign(page, partyBtn.creditsButtonPos.x, partyBtn.creditsButtonPos.y);
        try {
          await waitForScene(page, 'CreditsScene', 6000);
          chain.credits = true;
        } catch {
          problems.push('loop: "Credits ->" did not reach CreditsScene');
        }
      }
    }

    // hop 3: CreditsScene -> (Play again?) -> TitleScene
    if (chain.credits) {
      await page.waitForTimeout(SETTLE_MS);
      await tapDesign(page, 200, 200); // skip the reveal; nowhere near a button
      const creditsBtns = await pollScene(
        page,
        'CreditsScene',
        '__credits',
        (d) => d.buttonsShown === true,
        6000
      );
      if (!creditsBtns || creditsBtns.buttonsShown !== true) {
        problems.push('loop: the credits buttons never appeared');
      } else {
        await page.waitForTimeout(SETTLE_MS);
        await clickDesign(page, creditsBtns.playAgainPos.x, creditsBtns.playAgainPos.y);
        try {
          await waitForScene(page, 'TitleScene', 6000);
          chain.title = true;
        } catch {
          problems.push('loop: "Play again?" did not reach TitleScene');
        }
      }
    }

    await page.waitForTimeout(SETTLE_MS);
    const saveAfter = await readSaveKeys(page);
    const progressUnchanged = saveAfter['gabby22.progress'] === saveBefore['gabby22.progress'];
    const allKeysUnchanged = JSON.stringify(saveAfter) === JSON.stringify(saveBefore);
    if (!progressUnchanged)
      problems.push(
        `loop: gabby22.progress CHANGED across the revisit — before ${saveBefore['gabby22.progress']} after ${saveAfter['gabby22.progress']}`
      );
    if (!allKeysUnchanged)
      problems.push(
        `loop: a gabby22.* key changed across the revisit — before ${JSON.stringify(saveBefore)} after ${JSON.stringify(saveAfter)}`
      );

    report = {
      absent,
      present: {
        labelRendered,
        label: ORACLE_PARTY_LABEL,
        glyphs,
      },
      routes: { click: clickRouted, tap: tapRouted },
      loop: chain,
      save: {
        progressUnchanged,
        allKeysUnchanged,
        keys: Object.keys(saveBefore),
      },
      consoleErrors,
      pageErrors,
    };
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await browser.close();
  }

  if (consoleErrors.length > 0) problems.push(`${consoleErrors.length} console error(s)`);
  if (pageErrors.length > 0) problems.push(`${pageErrors.length} page error(s)`);

  if (problems.length > 0) {
    console.error('TITLE-PARTY HARNESS FAILURES:\n  - ' + problems.join('\n  - '));
    process.exitCode = 1;
  } else {
    const g = report.present.glyphs;
    console.log(
      `TITLE-PARTY OK: on an unbeaten save the Party button is absent (no label, no balloon emoji; Play + Edit Character still shown) and a press at its slot does nothing; on a beaten save the label renders byte-exact "${report.present.label}" with the balloon proven a REAL GLYPH by its drawn ink (${g.balloon.ink} lit px vs the private-use control's ${g.missing.ink}); it routes to PartyScene by BOTH click and tap; the revisit loop connects Title(Party) -> Party -> Credits -> Title with no dead end; and the whole loop left all ${report.save.keys.length} gabby22.* keys byte-identical (progress included); no errors.`
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
