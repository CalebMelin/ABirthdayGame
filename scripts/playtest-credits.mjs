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
//      non-ASCII glyphs are PROVED to have rendered rather than tofu'd by their
//      DRAWN INK, compared in a 2D canvas against a PRIVATE-USE code point no
//      font can define. The advance-width probe beside it is a WEAKER, DIFFERENT
//      claim and is NOT the proof: Press Start 2P is fixed-width and its own
//      .notdef box advances exactly as far as a real glyph, so width only rules
//      out a fallback font (Courier New would advance 0.6x). A tight screenshot
//      crop is captured for the eye.
//   4. "Play again?" routes to TitleScene by BOTH click and tap, and EVERY
//      gabby22.* key is byte-identical before and after (raw localStorage,
//      seeded with a real partially-completed save first).
//   5. "Fresh start" NEVER wipes anything directly: it opens the in-scene
//      confirmation; while that is open a press where "Play again?" sits must
//      NOT navigate (the underlying buttons are input-disabled); CANCEL leaves
//      every gabby22.* key untouched and re-enables both buttons; CONFIRM clears
//      every gabby22.* key and lands on the Title. Both paths are exercised.
//   6. REPEAT-PRESS GUARD: TitleScene.create is instrumented with a counter. A
//      rapid double-CLICK (one mouse pointer, pressed twice) on "Play again?"
//      and a genuine TWO-FINGER TAP (two CDP touch points at once) on the
//      destructive "Erase it all" must each produce exactly ONE create — with a
//      falsifiability control asserting the two-finger tap really did arrive as
//      TWO pointer-downs rather than one.
//   7. NO DEAD ENDS, driven end to end: PartyScene -> "Credits ->" -> Credits ->
//      "Play again?" -> Title, asserting every hop.
//   8. A TINY HEART is present (the DEV flag plus a real Graphics object).
//   9. LEGIBILITY: every credit line's rendered fill colour is NOT the default
//      plum TEXT_COLOR (#4a2c40), which is unreadable on this dark field.
//  10. THE CONFIRMATION'S OWN COPY really rendered (its title, its three body
//      lines and both of its button labels), not merely `confirmShowing`.
//  11. 60FPS with the reveal finished and the 60-piece rain running — the same
//      floor playtest-party.mjs holds the party to, so the two finale harnesses
//      stay symmetric.
//  12. RELEASE-ONLY ACTIVATION IS IMPOSSIBLE: a press that starts on empty space
//      and is HELD past the tail fade, so a button materialises under the
//      finger, must skip the reveal and NOTHING else. Before ui.ts grew its
//      per-pointer press latch a 420ms hold ejected the player to the Title off
//      the last screen of the gift; a 300ms hold did not, which is what made it
//      look like a timing quirk rather than a shared-input bug.
//  13. ZERO Matter bodies, the ambient confetti actually falling, zero
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

/** PLAN-02's 60fps criterion, measured exactly as scripts/playtest-party.mjs
 * measures the party: 55 leaves headroom for headless-Chrome scheduling noise
 * while still catching a real regression. The two finale scenes run the same
 * 60-piece rain, so they hold the same floor. */
const MIN_AVG_FPS = 55;
const FPS_SAMPLE_MS = 4_000;

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

/** The confirmation's own copy, as INDEPENDENT literals (its heading, a
 * distinctive fragment of each body line, and both button labels). Plain ASCII
 * literals rather than code-point oracles because — unlike the credit lines and
 * the tally — this is UI chrome we may reword; the point here is only that the
 * words the player is asked to decide on actually reached the screen. */
const ORACLE_CONFIRM_STRINGS = [
  'Start over?',
  'This clears your levels, your tulips',
  'and the Gabby you made, so the whole',
  'ride begins again at level 1.',
  'Keep my progress',
  'Erase it all',
];

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
/**
 * A rapid DOUBLE-CLICK: two presses of the SAME mouse pointer as fast as the
 * input pipeline allows, with no movement between them. This is the mouse half
 * of what the `leaving` latch exists for — see twoFingerTapDesign below for the
 * touch half, which is a genuinely different thing (two pointers, not one).
 */
async function doubleClickDesign(page, x, y) {
  const box = await canvasBox(page);
  await page.mouse.move(vx(box, x), vy(box, y));
  await page.mouse.down();
  await page.mouse.up();
  await page.mouse.down();
  await page.mouse.up();
}

/**
 * A genuine TWO-FINGER TAP: two distinct touch points landing and lifting
 * together, both inside the same button — the press a phone delivers when a
 * thumb and a finger arrive at once, and the literal case ST-3 added the
 * `leaving` latch for.
 *
 * Playwright's `touchscreen.tap` drives ONE point, so this goes through raw CDP.
 * The two points are spread horizontally so both land on the (>= 340px wide)
 * button rather than on top of each other.
 */
async function twoFingerTapDesign(page, x, y, spreadPx = 60) {
  const box = await canvasBox(page);
  const client = await page.context().newCDPSession(page);
  const point = (dx, id) => ({
    x: vx(box, x + dx),
    y: vy(box, y),
    radiusX: 6,
    radiusY: 6,
    force: 1,
    id,
  });
  try {
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [point(-spreadPx, 1), point(spreadPx, 2)],
    });
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } finally {
    await client.detach();
  }
}

/**
 * Makes sure the game actually HAS enough touch pointers for the two-finger tap
 * above to be two pointers rather than one.
 *
 * Phaser defaults to a single touch pointer. The game tops itself up in
 * systems/pedals.ts (`scene.input.addPointer`) the first time GameScene runs, so
 * by the time a real player reaches the credits two fingers genuinely are two
 * pointers. This harness enters CreditsScene directly and never plays a level,
 * so it performs the same top-up itself — otherwise a "two-finger tap" would be
 * silently collapsed into one pointer and the check would be theatre. The
 * falsifiability control in main() proves the delivery really is 2.
 */
function ensureMultiTouch(page) {
  return page.evaluate(() => {
    const input = globalThis.__gabbyGame.input;
    if (input.pointers.length < 3) input.addPointer(3 - input.pointers.length);
    return input.pointers.length;
  });
}

/** Counts scene-level POINTER_DOWN events on CreditsScene until read back —
 * the falsifiability control for twoFingerTapDesign: one physical two-finger tap
 * must arrive as TWO pointer-downs, or the "two fingers" claim is empty. */
async function armPointerDownCounter(page) {
  await page.evaluate(() => {
    const scene = globalThis.__gabbyGame.scene.getScene('CreditsScene');
    globalThis.__downCount = 0;
    globalThis.__countDown = () => {
      globalThis.__downCount++;
    };
    scene.input.on('pointerdown', globalThis.__countDown);
  });
}
const readPointerDowns = (page) => page.evaluate(() => globalThis.__downCount ?? 0);

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
    tulipTallyText: d.tulipTallyText,
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
    fps: g.loop.actualFps,
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
 * Two signals, and they prove DIFFERENT things — do not conflate them:
 *   - INK (this is the proof). Each character is drawn into a 2D canvas and its
 *     lit pixels reduced to a count + a positional hash. A PRIVATE-USE code
 *     point (U+E123) is the control: no font can define it, so whatever the
 *     browser draws for IT is this stack's "missing glyph" rendering. A
 *     character whose ink signature differs from that control drew a real glyph.
 *   - ADVANCE (a weaker, separate claim). Press Start 2P advances exactly one
 *     font size (24px) per glyph; the 'Courier New' fallback in
 *     FONT_STACK_PIXEL advances 0.6x (14.4px). So an advance of exactly 24 says
 *     the PIXEL FONT supplied the glyph rather than a fallback — it does NOT say
 *     the glyph is real, because that font's .notdef box is fixed-width too and
 *     advances identically. Width alone would happily pass a tofu box.
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
    // Match the pointer budget a real player arrives with (see ensureMultiTouch).
    const pointerCount = await ensureMultiTouch(page);
    if (pointerCount < 3)
      problems.push(`only ${pointerCount} pointers available — no real two-finger tap is possible`);
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
    if (finished.tulipTallyText !== expectedTally)
      problems.push(`tulip tally mismatch: ${JSON.stringify(finished.tulipTallyText)}`);
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
    // Advance: a SECONDARY check, deliberately NOT the tofu proof above — it
    // only says the multiplication sign came from Press Start 2P itself (one
    // font size per glyph) rather than from the Courier New fallback (0.6x).
    // That font's own .notdef box advances 24 as well, so this would pass on
    // tofu; the ink comparison above is what rules tofu out.
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

    // (10) THE CONFIRMATION'S OWN COPY, on screen — `confirmShowing` only says a
    // dialog exists. This is the one dialog in the game that can delete
    // everything, so the words that explain it must be proved present, and the
    // two button labels must be DISTINGUISHABLE (an "OK/Cancel" pair here is
    // exactly the dialog a tired thumb gets wrong).
    const confirmTexts = await renderedTexts(page);
    const confirmCopy = confirmTexts.map((t) => t.text);
    const confirmBodyRendered = confirmCopy.filter((t) => t.includes('\n')).join(' ');
    for (const needle of ORACLE_CONFIRM_STRINGS) {
      const present =
        confirmCopy.includes(needle) || confirmBodyRendered.includes(needle);
      if (!present) problems.push(`confirm copy missing from the screen: ${JSON.stringify(needle)}`);
    }
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
    // (6) A genuine TWO-FINGER TAP on the DESTRUCTIVE button — the phone case
    // the `leaving` latch was added for, and the one where an unguarded second
    // press would also run resetAll() twice. The control below proves the tap
    // really arrived as two pointer-downs and not one.
    await armPointerDownCounter(page);
    await twoFingerTapDesign(page, toErase.confirmErasePos.x, toErase.confirmErasePos.y);
    // Settle before reading, exactly as every other press site here does: the
    // count is written by Phaser's input step, and reading it on the same CDP
    // round trip as the dispatch would race that step.
    await page.waitForTimeout(SETTLE_MS);
    const eraseDowns = await readPointerDowns(page);
    if (eraseDowns !== 2)
      problems.push(
        `two-finger tap: the scene saw ${eraseDowns} pointer-down(s), not 2 — the multi-touch check is not testing two fingers`
      );
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
      problems.push(
        `erase two-finger tap: TitleScene.create ran ${eraseTitleCreates} times (want 1)`
      );

    // ------------------------------- (6) double-CLICK guard on "Play again?"
    await seedSave(page, SEEDED_SAVE);
    ready = await enterCreditsReady(page, problems, 'double press');
    await armTitleCreateCounter(page);
    await doubleClickDesign(page, ready.playAgainPos.x, ready.playAgainPos.y);
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

    // ------------------- (12) RELEASE-ONLY ACTIVATION MUST BE IMPOSSIBLE
    // Press on empty space, HOLD past the tail fade so both buttons materialise
    // under the pointer, then release over "Play again?". The hold must skip the
    // reveal and do NOTHING else. Run at three durations because the bug this
    // guards was duration-dependent: 300ms was clean, 420ms (past tailFadeMs)
    // ejected the player to the Title.
    const holds = [];
    for (const holdMs of [300, 420, 700]) {
      await seedSave(page, SEEDED_SAVE);
      await enterCredits(page);
      await page.waitForTimeout(SETTLE_MS);
      // The button positions are STATIC in the DEV snapshot precisely so they
      // are readable before the buttons exist — which is the whole point here.
      const fresh = await readCredits(page);
      const box = await canvasBox(page);
      await page.mouse.move(vx(box, fresh.playAgainPos.x), vy(box, fresh.playAgainPos.y));
      await page.mouse.down();
      await page.waitForTimeout(holdMs);
      await page.mouse.up();
      await page.waitForTimeout(300);
      const after = await readCredits(page);
      const navigated = after.titleActive || !after.active;
      holds.push({ kind: 'mouse', holdMs, navigated, revealComplete: after.revealComplete });
      if (navigated)
        problems.push(
          `hold ${holdMs}ms over "Play again?" navigated away — a press that began on empty space activated a button that appeared under it`
        );
      if (!after.revealComplete)
        problems.push(`hold ${holdMs}ms: the press did not even skip the reveal (test is not exercising the path)`);
    }
    // ...and the same by TOUCH on the DESTRUCTIVE secondary.
    await seedSave(page, SEEDED_SAVE);
    await enterCredits(page);
    await page.waitForTimeout(SETTLE_MS);
    const holdSample = await readCredits(page);
    const holdBox = await canvasBox(page);
    const touchClient = await page.context().newCDPSession(page);
    const touchPoint = {
      x: vx(holdBox, holdSample.freshStartPos.x),
      y: vy(holdBox, holdSample.freshStartPos.y),
      radiusX: 6,
      radiusY: 6,
      force: 1,
      id: 1,
    };
    await touchClient.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [touchPoint],
    });
    await page.waitForTimeout(700);
    await touchClient.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await touchClient.detach();
    await page.waitForTimeout(300);
    const afterTouchHold = await readCredits(page);
    if (afterTouchHold.confirmShowing)
      problems.push('touch-hold over "Fresh start" opened the reset confirmation');
    holds.push({
      holdMs: 700,
      kind: 'touch',
      navigated: !afterTouchHold.active,
      confirmShowing: afterTouchHold.confirmShowing,
    });

    // ------------------------------------------------------------- (11) 60FPS
    const fpsSamples = [];
    const fpsStart = Date.now();
    while (Date.now() - fpsStart < FPS_SAMPLE_MS) {
      const sample = await readCredits(page);
      if (sample.hasCredits) fpsSamples.push(sample.fps);
      await page.waitForTimeout(250);
    }
    const avgFps =
      fpsSamples.length > 0
        ? Math.round((fpsSamples.reduce((a, b) => a + b, 0) / fpsSamples.length) * 10) / 10
        : null;
    const minFps = fpsSamples.length > 0 ? Math.round(Math.min(...fpsSamples) * 10) / 10 : null;
    if (avgFps === null || avgFps < MIN_AVG_FPS) problems.push(`average fps ${avgFps} < ${MIN_AVG_FPS}`);

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
      // Settle before pressing, for the same reason pollAndSettle exists: the
      // party builds its button inside a delayedCall, so the frame the poll
      // sees `creditsButtonShown()` flip is the frame it is still queued in
      // Phaser's _pendingInsertion and cannot be hit-tested yet.
      await page.waitForTimeout(SETTLE_MS);
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
        text: finished.tulipTallyText,
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
      repeatPress: {
        pointerBudget: pointerCount,
        doubleClickPlayAgainTitleCreates: playAgainTitleCreates,
        twoFingerTapEraseTitleCreates: eraseTitleCreates,
        twoFingerTapPointerDowns: eraseDowns,
      },
      chain,
      holds,
      avgFps,
      minFps,
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
      `CREDITS OK: the three lines byte-exact and centred — "${report.lines.join('" / "')}" (last one with THREE '!') — revealed line by line (saw ${report.reveal.partialLines}/3 partway, complete after ${report.reveal.completedNaturallyAfterMs}ms) and a tap anywhere skips ${report.reveal.skip.revealedBefore}/3 straight to 3/3; tally "${report.tulipLine.text}" rendered, with the tulip and the multiplication sign both proven REAL GLYPHS by their drawn ink (${g.tulip.ink}/${g.times.ink} lit px vs the private-use control's ${g.missing.ink}) — the ${g.times.advance}px advance only rules out a fallback font, since the pixel font's own tofu box advances the same; a tiny heart is drawn; ${report.confettiRects} confetti pieces still falling; ${report.matterBodies === -1 ? 'no' : report.matterBodies} Matter bodies; "Play again?" routes to the Title by click AND tap with all ${Object.keys(report.playAgainKeepsSave.before).length} gabby22.* keys byte-identical; "Fresh start" opens a confirm that swallows presses aimed at the buttons under it, cancel leaves every key untouched and re-enables both, and confirm leaves ${report.freshStart.keysAfterErase.length} keys behind; a rapid double-CLICK on "Play again?" and a genuine TWO-FINGER TAP on "Erase it all" (${report.repeatPress.twoFingerTapPointerDowns} pointer-downs, ${report.repeatPress.pointerBudget} pointers available) each started the Title exactly ${report.repeatPress.doubleClickPlayAgainTitleCreates}/${report.repeatPress.twoFingerTapEraseTitleCreates} times; a press held on empty space past the tail fade (300/420/700ms, mouse, plus a 700ms touch-hold on the destructive button) skips the reveal and activates NOTHING; avg ${report.avgFps} fps (min ${report.minFps}); the confirmation's own heading, three body lines and both button labels all rendered; party -> credits -> title with no dead ends; no errors.`
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
