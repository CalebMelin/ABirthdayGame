// Automated browser playtest for the REAL CreditsScene (PLAN-09 task 3 / ST-4,
// src/scenes/CreditsScene.ts) — the last screen of the whole gift. Same shape as
// scripts/playtest-party.mjs and scripts/playtest-levelcomplete.mjs
// (playwright-core driving system Chrome headless, viewport 1280x720 with touch,
// driving through window.__gabbyGame, screenshots to the gitignored
// playtest-out/, console + page errors collected AND gating the exit code).
// Requires `npm run dev` already running on :5173.
//
// SAFETY NOTE — THIS HARNESS CALLS resetAll(). It runs in a FRESH playwright
// browser context (its own throwaway profile and its own empty localStorage), it
// seeds every gabby22.* key it then asserts on, and it never touches a real
// browser profile. Nothing here can reach a player's actual save.
//
// What it gates:
//   1. THE THREE CREDIT LINES, BYTE-EXACT AND IN ORDER, asserted against
//      INDEPENDENT code-point oracles built here with String.fromCodePoint —
//      never imported from src/data/finale.ts and never copy-pasted — both in
//      the scene's DEV snapshot AND as three SEPARATE, CENTRED Text objects that
//      really rendered (same x, same origin, strictly increasing y).
//      "Happy 22nd!!!" must carry exactly THREE '!'.
//   2. LINE-BY-LINE REVEAL: a genuinely PARTIAL state is observed (fewer than
//      three lines showing), then completion; and on a second entry a tap
//      ANYWHERE skips straight to all three.
//   3. THE TULIP LINE: gabby22.tulips is seeded to a known N and the rendered
//      line must read "<U+1F337> <U+00D7> N collected" byte-exactly. Both
//      non-ASCII glyphs are PROVED to have rendered rather than tofu'd, two ways:
//      (a) an ink-bitmap comparison in a 2D canvas against a PRIVATE-USE code
//      point that no font can have, and (b) an advance-width probe (Press Start
//      2P advances exactly one font size per glyph; the Courier New fallback
//      would advance 0.6x). A tight screenshot crop is captured for the eye.
//   4. "Play again?" routes to TitleScene by BOTH click and tap, and EVERY
//      gabby22.* key is byte-identical before and after (raw localStorage,
//      seeded with a real partially-completed save first).
//   5. "Fresh start" NEVER wipes anything directly: it opens the in-scene
//      confirmation; while that is open a press where "Play again?" sits must
//      NOT navigate (the underlying buttons are input-disabled); CANCEL leaves
//      every gabby22.* key untouched and re-enables both buttons; CONFIRM clears
//      every gabby22.* key and lands on the Title. Both paths are exercised.
//   6. DOUBLE-PRESS GUARD: TitleScene.create is instrumented with a counter, and
//      a rapid double-press on "Play again?" AND on "Erase it all" must each
//      produce exactly ONE create.
//   7. NO DEAD ENDS, driven end to end: PartyScene -> "Credits ->" -> Credits ->
//      "Play again?" -> Title, asserting every hop.
//   8. A TINY HEART is present (the DEV flag plus a real Graphics object).
//   9. LEGIBILITY: every credit line's rendered fill colour is NOT the default
//      plum TEXT_COLOR (#4a2c40), which is unreadable on this dark field.
//  10. ZERO Matter bodies, the ambient confetti actually falling, zero
//      console/page errors, and screenshots (full scene, partial reveal, the
//      confirmation, a tight crop of the tulip line) to playtest-out/.
//
// Usage:
//   node scripts/playtest-credits.mjs
//   PLAYTEST_URL=http://localhost:5174/ OUT_DIR=./shots node scripts/playtest-credits.mjs
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const DEV_URL = process.env.PLAYTEST_URL ?? 'http://localhost:5173/';
const OUT_DIR = process.env.OUT_DIR ?? './playtest-out';
const DESIGN_W = 1280;
const DESIGN_H = 720;

const SETTLE_MS = 200;

/** How long to allow for the below-the-divider fade before the two buttons
 * exist. The scene builds them only when that fade completes (see
 * CREDITS.tailFadeMs) — deliberately NOT imported, so this is an upper bound
 * rather than a copy of the constant; `buttonsShown` is what is actually
 * polled. */
const BUTTONS_TIMEOUT_MS = 4_000;

// --- INDEPENDENT expected literals, assembled from explicit code points so a
// mangled shared constant can never pass (CLAUDE.md Rule 4 — the discipline
// playtest-party.mjs / playtest-levelcomplete.mjs use). ---
const cp = (...points) => String.fromCodePoint(...points);

/** 'Created by Caleb Melin' */
const ORACLE_LINE_1 = cp(
  0x43, 0x72, 0x65, 0x61, 0x74, 0x65, 0x64, // Created
  0x20,
  0x62, 0x79, // by
  0x20,
  0x43, 0x61, 0x6c, 0x65, 0x62, // Caleb
  0x20,
  0x4d, 0x65, 0x6c, 0x69, 0x6e // Melin
);

/** 'Created for Gabriella Novelli' */
const ORACLE_LINE_2 = cp(
  0x43, 0x72, 0x65, 0x61, 0x74, 0x65, 0x64, // Created
  0x20,
  0x66, 0x6f, 0x72, // for
  0x20,
  0x47, 0x61, 0x62, 0x72, 0x69, 0x65, 0x6c, 0x6c, 0x61, // Gabriella
  0x20,
  0x4e, 0x6f, 0x76, 0x65, 0x6c, 0x6c, 0x69 // Novelli
);

/** 'Happy 22nd!!!' — THREE exclamation marks (the party banner has two; they
 * are NOT the same string). */
const ORACLE_LINE_3 = cp(
  0x48, 0x61, 0x70, 0x70, 0x79, // Happy
  0x20,
  0x32, 0x32, 0x6e, 0x64, // 22nd
  0x21, 0x21, 0x21 // !!!
);

const ORACLE_LINES = [ORACLE_LINE_1, ORACLE_LINE_2, ORACLE_LINE_3];

/** U+1F337 TULIP and U+00D7 MULTIPLICATION SIGN — the plan writes the tally as
 * "<tulip> <times> N collected". */
const ORACLE_TULIP = cp(0x1f337);
const ORACLE_TIMES = cp(0x00d7);

/** '<tulip> <times> N collected' */
function oracleTulipLine(count) {
  const tail = cp(0x20, 0x63, 0x6f, 0x6c, 0x6c, 0x65, 0x63, 0x74, 0x65, 0x64); // ' collected'
  return `${ORACLE_TULIP} ${ORACLE_TIMES} ${count}${tail}`;
}

/** pixelText's DEFAULT fill (constants.ts's TEXT_COLOR = hexToCss(PALETTE.plum)),
 * restated here independently. Every string on the dark credits field must be
 * something OTHER than this — plum on duskIndigo is illegible. */
const DEFAULT_PLUM = '#4a2c40';

/** A realistic partially-completed save. Written as raw localStorage so the
 * before/after comparison is byte-level, not a re-serialisation. */
const SEEDED_TULIPS = 13;
const SEEDED_SAVE = {
  'gabby22.character': JSON.stringify({
    hairColor: 'pink',
    eyeColor: 'green',
    bikeColor: 'teal',
    outfit: 'stealth',
  }),
  'gabby22.progress': JSON.stringify({
    highestUnlocked: 14,
    completed: Array.from({ length: 22 }, (_, i) => i < 13),
  }),
  'gabby22.tulips': String(SEEDED_TULIPS),
  'gabby22.notesSeen': JSON.stringify([0, 3, 7]),
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
/** Two presses as fast as the input pipeline allows, without moving between
 * them — the rapid double-click / two-finger-tap a `leaving` latch exists for. */
async function doublePressDesign(page, x, y) {
  const box = await canvasBox(page);
  await page.mouse.move(vx(box, x), vy(box, y));
  await page.mouse.down();
  await page.mouse.up();
  await page.mouse.down();
  await page.mouse.up();
}

/** Enter CreditsScene directly (scene-manager bypass), stopping every other
 * active scene first so nothing lingers behind it stealing input or frames. The
 * scenes-to-stop list is DERIVED from the manager, never hardcoded. */
async function enterCredits(page) {
  await page.evaluate(() => {
    const g = globalThis.__gabbyGame;
    for (const scene of g.scene.getScenes(false)) {
      const key = scene.scene.key;
      if (key !== 'CreditsScene' && g.scene.isActive(key)) g.scene.stop(key);
    }
    g.scene.start('CreditsScene');
  });
  await waitForScene(page, 'CreditsScene');
}

/** Raw localStorage census of every gabby22.* key — the ONLY thing the
 * progress-kept / cancel-changes-nothing checks trust. */
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

async function seedSave(page, entries) {
  await page.evaluate((kv) => {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && key.startsWith('gabby22.')) localStorage.removeItem(key);
    }
    for (const [key, value] of Object.entries(kv)) localStorage.setItem(key, value);
  }, entries);
}

/** Atomic in-page read of the CreditsScene DEV snapshot (+ its function fields
 * evaluated), plus facts read straight off the live scene: the Matter body
 * count and the ambient-confetti census. */
const READ_CREDITS = () => {
  const g = globalThis.__gabbyGame;
  const s = g.scene.getScene('CreditsScene');
  const active = g.scene.isActive('CreditsScene');
  const d = s && s.__credits;
  if (!d) return { hasCredits: false, active };
  let confettiRects = 0;
  let graphicsObjects = 0;
  for (const o of s.children.list) {
    if (o.type === 'Rectangle' && o.visible && o.depth === 60) confettiRects++;
    if (o.type === 'Graphics' && o.visible) graphicsObjects++;
  }
  return {
    hasCredits: true,
    active,
    lines: d.lines,
    revealedLines: d.revealedLines(),
    revealComplete: d.revealComplete(),
    buttonsShown: d.buttonsShown(),
    tulipLineText: d.tulipLineText,
    tulips: d.tulips,
    confirmShowing: d.confirmShowing(),
    heartShown: d.heartShown(),
    playAgainPos: d.playAgainPos,
    freshStartPos: d.freshStartPos,
    confirmCancelPos: d.confirmCancelPos,
    confirmErasePos: d.confirmErasePos,
    confettiRects,
    graphicsObjects,
    // -1 == the scene has no Matter world at all (also fine); anything > 0 is a
    // regression — CreditsScene must never create a body.
    matterBodies: s.matter && s.matter.world ? s.matter.world.getAllBodies().length : -1,
    titleActive: g.scene.isActive('TitleScene'),
  };
};
const readCredits = (page) => page.evaluate(READ_CREDITS);

/** Poll readCredits until `predicate` holds or `timeoutMs` elapses; returns the
 * last sample either way. */
async function pollCredits(page, predicate, timeoutMs, stepMs = 60) {
  const start = Date.now();
  let last = await readCredits(page);
  while (Date.now() - start < timeoutMs) {
    if (predicate(last)) return last;
    await page.waitForTimeout(stepMs);
    last = await readCredits(page);
  }
  return last;
}

/**
 * Poll, then SETTLE before the caller presses anything.
 *
 * WHY THE SETTLE IS LOAD-BEARING (this cost a debugging round): Phaser queues a
 * freshly-created interactive Game Object in `InputPlugin._pendingInsertion` and
 * only splices it into the hit-test list `_list` on the NEXT scene pre-update.
 * A press that lands inside that one-frame window hit-tests against a list the
 * new button is not in yet, so it reaches the scene's own POINTER_DOWN but never
 * the button — a silent no-op that reads exactly like a broken button. The
 * buttons here appear in a tween's onComplete, and `buttonsShown` flips in that
 * same frame, so polling alone races it. Reproduced live: instrumenting the
 * button showed the scene receiving `pointerdown` at the button's exact
 * coordinates while the button itself received nothing. This is generic Phaser
 * behavior for any newly created interactive object, not a CreditsScene defect
 * — a human cannot press inside 16ms of a button fading in, but CDP can.
 */
async function pollAndSettle(page, predicate, timeoutMs, stepMs = 60) {
  const sample = await pollCredits(page, predicate, timeoutMs, stepMs);
  await page.waitForTimeout(SETTLE_MS);
  return sample;
}

/** Every Text object CreditsScene is actually rendering (including Text nested
 * in Containers, where button labels live), with the properties that prove a
 * string reached the screen legibly and centred. */
function renderedTexts(page) {
  return page.evaluate(() => {
    const out = [];
    const walk = (list) => {
      for (const o of list) {
        if (o.type === 'Text' && typeof o.text === 'string') {
          out.push({
            text: o.text,
            x: o.x,
            y: o.y,
            originX: o.originX,
            alpha: o.alpha,
            width: o.width,
            color: o.style.color,
            fontSize: o.style.fontSize,
          });
        }
        if (Array.isArray(o.list)) walk(o.list);
      }
    };
    walk(globalThis.__gabbyGame.scene.getScene('CreditsScene').children.list);
    return out;
  });
}

/**
 * PROVE THE TWO NON-ASCII GLYPHS REALLY RENDERED (rather than tofu'd), in the
 * page, with the exact font stack and size CreditsScene draws the tally at.
 *
 * Two independent signals:
 *   - INK: each character is drawn into a 2D canvas and its lit pixels reduced
 *     to a count + a positional hash. A PRIVATE-USE code point (U+E123) is the
 *     control: no font can define it, so whatever the browser draws for it IS
 *     this stack's "missing glyph" rendering. A character whose ink signature
 *     differs from that control drew a real glyph.
 *   - ADVANCE: Press Start 2P advances exactly one font size (24px) per glyph;
 *     the 'Courier New' fallback in FONT_STACK_PIXEL advances 0.6x (14.4px). An
 *     advance of exactly 24 therefore says the pixel font itself supplied it.
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
      return { ink, hash, advance: Math.round(ctx.measureText(ch).width * 100) / 100 };
    };
    return {
      missing: probe('\u{E123}'), // private use — the control
      times: probe('\u{00D7}'),
      tulip: probe('\u{1F337}'),
      letterX: probe('x'),
      letterA: probe('A'),
    };
  });
}

/** Instruments TitleScene.create with a call counter (patched once on the
 * prototype) and zeroes it. A `leaving` latch is only observable this way: a
 * second scene.start on a running scene SHUTS IT DOWN and creates it again, so
 * the failure is a silent RESTART rather than an error. */
async function armTitleCreateCounter(page) {
  await page.evaluate(() => {
    const g = globalThis.__gabbyGame;
    const scene = g.scene.getScene('TitleScene');
    const proto = Object.getPrototypeOf(scene);
    if (!globalThis.__titlePatched) {
      const original = proto.create;
      proto.create = function patched(...args) {
        globalThis.__titleCreates = (globalThis.__titleCreates ?? 0) + 1;
        return original.apply(this, args);
      };
      globalThis.__titlePatched = true;
    }
    globalThis.__titleCreates = 0;
  });
}
const readTitleCreates = (page) => page.evaluate(() => globalThis.__titleCreates ?? 0);

/** Enter the credits, skip the reveal, and wait until both buttons exist. */
async function enterCreditsReady(page, problems, label) {
  await enterCredits(page);
  await page.waitForTimeout(SETTLE_MS);
  await tapDesign(page, 200, 200); // skip the reveal; nowhere near any button
  const ready = await pollAndSettle(page, (s) => s.buttonsShown, BUTTONS_TIMEOUT_MS);
  if (!ready.buttonsShown) problems.push(`${label}: the buttons never appeared`);
  return ready;
}

/** One "Play again?" routing assertion by a real click OR tap, with the raw
 * localStorage census compared byte-for-byte across the hop. */
async function checkPlayAgain(page, kind, problems) {
  await seedSave(page, SEEDED_SAVE);
  const before = await readSaveKeys(page);
  const ready = await enterCreditsReady(page, problems, `play again via ${kind}`);

  const fire = kind === 'tap' ? tapDesign : clickDesign;
  await fire(page, ready.playAgainPos.x, ready.playAgainPos.y);
  try {
    await waitForScene(page, 'TitleScene', 6000);
  } catch {
    problems.push(`play again via ${kind}: TitleScene never activated`);
  }
  await page.waitForTimeout(SETTLE_MS);
  const after = await readSaveKeys(page);
  if (JSON.stringify(after) !== JSON.stringify(before)) {
    problems.push(
      `play again via ${kind}: the save CHANGED — before ${JSON.stringify(before)} after ${JSON.stringify(after)}`
    );
  }
  return { before, after };
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
    await seedSave(page, SEEDED_SAVE);

    // ------------------------------------------------ (1)+(2) reveal + lines
    await enterCredits(page);
    const entered = Date.now();
    const early = await readCredits(page);
    if (!early.hasCredits)
      throw new Error('__credits snapshot missing — is the dev server in DEV mode?');

    // A GENUINELY PARTIAL state: at least one line up, but not all three.
    const partial = await pollCredits(
      page,
      (s) => s.revealedLines > 0 && s.revealedLines < s.lines.length,
      3000,
      40
    );
    const sawPartial =
      partial.revealedLines > 0 &&
      partial.revealedLines < partial.lines.length &&
      !partial.revealComplete;
    if (!sawPartial)
      problems.push(
        `reveal: never observed a partial state (saw ${partial.revealedLines}/${partial.lines.length}, complete=${partial.revealComplete})`
      );
    await page.screenshot({ path: join(OUT_DIR, 'credits-partial-reveal.png') });

    const finished = await pollCredits(page, (s) => s.revealComplete, 8000);
    const naturalRevealMs = Date.now() - entered;
    if (!finished.revealComplete) problems.push('reveal: never completed on its own');
    if (finished.revealedLines !== finished.lines.length)
      problems.push(`reveal: ${finished.revealedLines}/${finished.lines.length} lines after completion`);

    const readyNatural = await pollAndSettle(page, (s) => s.buttonsShown, BUTTONS_TIMEOUT_MS);
    if (!readyNatural.buttonsShown) problems.push('reveal: the buttons never appeared');
    await page.screenshot({ path: join(OUT_DIR, 'credits-full.png') });

    // THE THREE LINES, byte-exact, in the snapshot AND on the screen.
    if (JSON.stringify(finished.lines) !== JSON.stringify(ORACLE_LINES))
      problems.push(`credit lines mismatch: ${JSON.stringify(finished.lines)}`);
    if (ORACLE_LINE_3.split('!').length - 1 !== 3)
      problems.push('oracle self-check: the third line does not carry three "!"');

    const texts = await renderedTexts(page);
    const lineTexts = ORACLE_LINES.map((line) => texts.find((t) => t.text === line));
    ORACLE_LINES.forEach((line, index) => {
      if (!lineTexts[index]) problems.push(`credit line ${index + 1} never rendered: ${JSON.stringify(line)}`);
    });
    let lineGeometry = null;
    if (lineTexts.every(Boolean)) {
      lineGeometry = lineTexts.map((t) => ({
        text: t.text,
        x: t.x,
        y: t.y,
        originX: t.originX,
        alpha: t.alpha,
        width: t.width,
        color: t.color,
        fontSize: t.fontSize,
      }));
      // THREE SEPARATE, CENTRED lines: one Text each, all centred on the same x
      // at the horizontal centre, running strictly top-down in plan order.
      for (const t of lineTexts) {
        if (t.originX !== 0.5) problems.push(`credit line ${JSON.stringify(t.text)} is not centre-origin`);
        if (t.x !== DESIGN_W / 2) problems.push(`credit line ${JSON.stringify(t.text)} sits at x=${t.x}`);
        if (t.alpha < 1) problems.push(`credit line ${JSON.stringify(t.text)} finished at alpha ${t.alpha}`);
        // (9) LEGIBILITY on the dark field.
        if (t.color === DEFAULT_PLUM)
          problems.push(`credit line ${JSON.stringify(t.text)} renders in the default plum ${DEFAULT_PLUM}`);
        if (t.width > DESIGN_W) problems.push(`credit line ${JSON.stringify(t.text)} is ${t.width}px wide`);
      }
      if (!(lineTexts[0].y < lineTexts[1].y && lineTexts[1].y < lineTexts[2].y))
        problems.push(`credit lines are not top-down: ${lineTexts.map((t) => t.y).join(', ')}`);
    }

    // (8) A TINY HEART.
    if (!finished.heartShown) problems.push('no heart was drawn');
    if (finished.graphicsObjects < 1) problems.push('no Graphics object on the display list (the heart)');

    // (10) ZERO Matter bodies + the rain actually falling.
    if (finished.matterBodies > 0)
      problems.push(`CreditsScene holds ${finished.matterBodies} Matter bodies (want 0)`);
    if (finished.confettiRects < 20)
      problems.push(`only ${finished.confettiRects} confetti pieces falling`);

    // ------------------------------------------------------ (3) tulip line
    const expectedTally = oracleTulipLine(SEEDED_TULIPS);
    if (finished.tulips !== SEEDED_TULIPS)
      problems.push(`tulips read ${finished.tulips} != ${SEEDED_TULIPS}`);
    if (finished.tulipLineText !== expectedTally)
      problems.push(`tulip line mismatch: ${JSON.stringify(finished.tulipLineText)}`);
    const tallyText = texts.find((t) => t.text === expectedTally);
    if (!tallyText) problems.push(`tulip line never rendered: ${JSON.stringify(expectedTally)}`);
    else {
      if (!tallyText.text.includes(String(SEEDED_TULIPS)))
        problems.push('tulip line does not contain the seeded count');
      if (tallyText.color === DEFAULT_PLUM)
        problems.push(`tulip line renders in the default plum ${DEFAULT_PLUM}`);
    }

    const glyphs = await glyphProbe(page);
    // Ink: a real glyph's bitmap must differ from the private-use control's.
    for (const [name, key] of [
      ['tulip', 'tulip'],
      ['times', 'times'],
    ]) {
      const g = glyphs[key];
      if (g.ink === 0) problems.push(`glyph ${name}: drew NOTHING at all`);
      if (g.ink === glyphs.missing.ink && g.hash === glyphs.missing.hash)
        problems.push(
          `glyph ${name}: renders identically to a private-use code point — it is TOFU, not a glyph`
        );
    }
    // Advance: the multiplication sign must come from Press Start 2P itself
    // (one font size per glyph), not from the Courier New fallback (0.6x).
    if (glyphs.times.advance !== glyphs.letterA.advance)
      problems.push(
        `glyph times: advance ${glyphs.times.advance} != an ASCII glyph's ${glyphs.letterA.advance} — it came from a fallback font`
      );

    const tallyBox = await canvasBox(page);
    await page.screenshot({
      path: join(OUT_DIR, 'credits-tulip-line.png'),
      clip: {
        x: vx(tallyBox, 400),
        y: vy(tallyBox, 430),
        width: (480 / DESIGN_W) * tallyBox.width,
        height: (52 / DESIGN_H) * tallyBox.height,
      },
    });

    // -------------------------------------------------- (2b) tap-to-skip
    // Skip from a GENUINELY PARTIAL state (at least one line up, not all three),
    // so the check exercises the impatient player's actual case rather than a
    // tap on a still-empty screen.
    await enterCredits(page);
    const beforeSkip = await pollCredits(
      page,
      (s) => s.revealedLines > 0 && s.revealedLines < s.lines.length,
      3000,
      40
    );
    if (!(beforeSkip.revealedLines > 0 && beforeSkip.revealedLines < beforeSkip.lines.length))
      problems.push(
        `skip: never caught a partial reveal to skip from (${beforeSkip.revealedLines}/${beforeSkip.lines.length})`
      );
    await tapDesign(page, 200, 200);
    const afterSkip = await pollCredits(page, (s) => s.revealComplete, 800, 30);
    const skip = {
      revealedBefore: beforeSkip.revealedLines,
      completeBefore: beforeSkip.revealComplete,
      revealedAfter: afterSkip.revealedLines,
      completeAfter: afterSkip.revealComplete,
    };
    if (beforeSkip.revealComplete)
      problems.push('skip: the reveal had already completed before the tap (test vacuous)');
    if (!afterSkip.revealComplete) problems.push('skip: a tap anywhere did not complete the reveal');
    if (afterSkip.revealedLines !== afterSkip.lines.length)
      problems.push(`skip: ${afterSkip.revealedLines}/${afterSkip.lines.length} lines after the tap`);

    // ------------------------------------------ (4) "Play again?" keeps all
    const playAgainClick = await checkPlayAgain(page, 'click', problems);
    await checkPlayAgain(page, 'tap', problems);

    // ------------------------------------------------- (5) the fresh start
    await seedSave(page, SEEDED_SAVE);
    const beforeConfirm = await readSaveKeys(page);
    let ready = await enterCreditsReady(page, problems, 'fresh start');
    await clickDesign(page, ready.freshStartPos.x, ready.freshStartPos.y);
    const opened = await pollAndSettle(page, (s) => s.confirmShowing, 2000);
    if (!opened.confirmShowing) problems.push('fresh start: the confirmation never opened');
    await page.screenshot({ path: join(OUT_DIR, 'credits-fresh-start-confirm.png') });
    const duringConfirm = await readSaveKeys(page);
    if (JSON.stringify(duringConfirm) !== JSON.stringify(beforeConfirm))
      problems.push('fresh start: opening the confirmation already touched the save');

    // 5a. A press where "Play again?" sits must NOT navigate while the
    // confirmation is open (the underlying buttons are input-disabled).
    await clickDesign(page, opened.playAgainPos.x, opened.playAgainPos.y);
    await page.waitForTimeout(300);
    const blocked = await readCredits(page);
    if (!blocked.active || blocked.titleActive)
      problems.push('confirm: a press leaked through the dialog to "Play again?" and navigated away');
    if (!blocked.confirmShowing) problems.push('confirm: the leaked press also closed the dialog');

    // 5b. CANCEL changes nothing at all.
    await clickDesign(page, blocked.confirmCancelPos.x, blocked.confirmCancelPos.y);
    const cancelled = await pollAndSettle(page, (s) => !s.confirmShowing, 2000);
    if (cancelled.confirmShowing) problems.push('cancel: the confirmation stayed open');
    const afterCancel = await readSaveKeys(page);
    if (JSON.stringify(afterCancel) !== JSON.stringify(beforeConfirm))
      problems.push(
        `cancel: the save CHANGED — before ${JSON.stringify(beforeConfirm)} after ${JSON.stringify(afterCancel)}`
      );
    if (!cancelled.active) problems.push('cancel: left CreditsScene');

    // 5c. ...and both buttons work again afterwards (cancel re-enables them).
    await clickDesign(page, cancelled.freshStartPos.x, cancelled.freshStartPos.y);
    const reopened = await pollAndSettle(page, (s) => s.confirmShowing, 2000);
    if (!reopened.confirmShowing)
      problems.push('cancel: "Fresh start" was left input-disabled and could not re-open the dialog');
    await clickDesign(page, reopened.confirmCancelPos.x, reopened.confirmCancelPos.y);
    await pollAndSettle(page, (s) => !s.confirmShowing, 2000);
    await armTitleCreateCounter(page);
    await clickDesign(page, reopened.playAgainPos.x, reopened.playAgainPos.y);
    try {
      await waitForScene(page, 'TitleScene', 6000);
    } catch {
      problems.push('cancel: "Play again?" was left input-disabled and could not route');
    }

    // 5d. CONFIRM erases every gabby22.* key and lands on the Title.
    await seedSave(page, SEEDED_SAVE);
    ready = await enterCreditsReady(page, problems, 'erase');
    await clickDesign(page, ready.freshStartPos.x, ready.freshStartPos.y);
    const toErase = await pollAndSettle(page, (s) => s.confirmShowing, 2000);
    if (!toErase.confirmShowing) problems.push('erase: the confirmation never opened');
    await armTitleCreateCounter(page);
    // (6) DOUBLE-PRESS on the destructive button too.
    await doublePressDesign(page, toErase.confirmErasePos.x, toErase.confirmErasePos.y);
    try {
      await waitForScene(page, 'TitleScene', 6000);
    } catch {
      problems.push('erase: TitleScene never activated');
    }
    await page.waitForTimeout(600);
    const afterErase = await readSaveKeys(page);
    const eraseTitleCreates = await readTitleCreates(page);
    if (Object.keys(afterErase).length > 0)
      problems.push(`erase: gabby22.* keys survived resetAll(): ${JSON.stringify(afterErase)}`);
    if (eraseTitleCreates !== 1)
      problems.push(`erase double-press: TitleScene.create ran ${eraseTitleCreates} times (want 1)`);

    // ------------------------------- (6) double-press guard on "Play again?"
    await seedSave(page, SEEDED_SAVE);
    ready = await enterCreditsReady(page, problems, 'double press');
    await armTitleCreateCounter(page);
    await doublePressDesign(page, ready.playAgainPos.x, ready.playAgainPos.y);
    try {
      await waitForScene(page, 'TitleScene', 6000);
    } catch {
      problems.push('double press: TitleScene never activated');
    }
    await page.waitForTimeout(600);
    const playAgainTitleCreates = await readTitleCreates(page);
    if (playAgainTitleCreates !== 1)
      problems.push(
        `play-again double-press: TitleScene.create ran ${playAgainTitleCreates} times (want 1)`
      );

    // --------------------------------------------- (7) the chain, no dead ends
    // PartyScene -> "Credits ->" -> CreditsScene -> "Play again?" -> Title.
    await seedSave(page, SEEDED_SAVE);
    await page.evaluate(() => {
      const g = globalThis.__gabbyGame;
      for (const scene of g.scene.getScenes(false)) {
        const key = scene.scene.key;
        if (key !== 'PartyScene' && g.scene.isActive(key)) g.scene.stop(key);
      }
      g.scene.start('PartyScene');
    });
    await waitForScene(page, 'PartyScene');
    const chain = { party: true, credits: false, title: false };
    const partyButton = await page.evaluate(async () => {
      const g = globalThis.__gabbyGame;
      const deadline = Date.now() + 10_000;
      for (;;) {
        const d = g.scene.getScene('PartyScene').__party;
        if (d && d.creditsButtonShown()) return d.creditsButtonPos;
        if (Date.now() > deadline) return null;
        await new Promise((r) => setTimeout(r, 100));
      }
    });
    if (!partyButton) problems.push('chain: the party never revealed its "Credits ->" button');
    else {
      await clickDesign(page, partyButton.x, partyButton.y);
      try {
        await waitForScene(page, 'CreditsScene', 6000);
        chain.credits = true;
      } catch {
        problems.push('chain: "Credits ->" did not reach CreditsScene');
      }
    }
    if (chain.credits) {
      await page.waitForTimeout(SETTLE_MS);
      await tapDesign(page, 200, 200);
      const chainReady = await pollAndSettle(page, (s) => s.buttonsShown, BUTTONS_TIMEOUT_MS);
      if (!chainReady.buttonsShown) problems.push('chain: the credits buttons never appeared');
      else {
        await clickDesign(page, chainReady.playAgainPos.x, chainReady.playAgainPos.y);
        try {
          await waitForScene(page, 'TitleScene', 6000);
          chain.title = true;
        } catch {
          problems.push('chain: "Play again?" did not reach TitleScene');
        }
      }
    }

    report = {
      lines: finished.lines,
      lineGeometry,
      reveal: {
        sawPartial,
        partialLines: partial.revealedLines,
        completedNaturallyAfterMs: naturalRevealMs,
        skip,
      },
      tulipLine: {
        text: finished.tulipLineText,
        tulips: finished.tulips,
        rendered: tallyText !== undefined,
        glyphs,
      },
      heartShown: finished.heartShown,
      matterBodies: finished.matterBodies,
      confettiRects: finished.confettiRects,
      playAgainKeepsSave: {
        before: playAgainClick.before,
        after: playAgainClick.after,
      },
      freshStart: {
        cancelledSaveUnchanged: JSON.stringify(afterCancel) === JSON.stringify(beforeConfirm),
        pressBlockedWhileOpen: !blocked.titleActive && blocked.confirmShowing,
        keysAfterErase: Object.keys(afterErase),
      },
      doublePress: { playAgain: playAgainTitleCreates, erase: eraseTitleCreates },
      chain,
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
    console.error('CREDITS HARNESS FAILURES:\n  - ' + problems.join('\n  - '));
    process.exitCode = 1;
  } else {
    const g = report.tulipLine.glyphs;
    console.log(
      `CREDITS OK: the three lines byte-exact and centred — "${report.lines.join('" / "')}" (last one with THREE '!') — revealed line by line (saw ${report.reveal.partialLines}/3 partway, complete after ${report.reveal.completedNaturallyAfterMs}ms) and a tap anywhere skips ${report.reveal.skip.revealedBefore}/3 straight to 3/3; tally "${report.tulipLine.text}" rendered with the tulip and the x both REAL glyphs (ink ${g.tulip.ink}/${g.times.ink} vs the private-use control's ${g.missing.ink}; x advances ${g.times.advance}px like an ASCII glyph); a tiny heart is drawn; ${report.confettiRects} confetti pieces still falling; ${report.matterBodies === -1 ? 'no' : report.matterBodies} Matter bodies; "Play again?" routes to the Title by click AND tap with all ${Object.keys(report.playAgainKeepsSave.before).length} gabby22.* keys byte-identical; "Fresh start" opens a confirm that swallows presses aimed at the buttons under it, cancel leaves every key untouched and re-enables both, and confirm leaves ${report.freshStart.keysAfterErase.length} keys behind; rapid double-presses started the Title exactly ${report.doublePress.playAgain}/${report.doublePress.erase} times; party -> credits -> title with no dead ends; no errors.`
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
