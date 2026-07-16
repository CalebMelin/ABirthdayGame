// Automated browser playtest for LEVEL 18 — the sleepover billboard easter egg
// among decoy billboards (PLAN-07 task 3, src/systems/billboard.ts +
// src/systems/decorations.ts's shared drawBillboard/wrapBillboardText). Clones
// scripts/playtest-level11.mjs's structure (playwright-core system Chrome
// headless, drives via window.__gabbyGame, screenshots to playtest-out/, gates
// the process exit code). Requires `npm run dev` running on :5173.
//
// Billboards are plain, never-culled GameObjects created once in
// GameScene.create() (same as every decoration — see decorations.ts), so the
// full display-list snapshot (board count, dims, text) is already complete and
// correct the INSTANT the level is entered — it does not depend on camera
// position/proximity at all. Only the SCREENSHOTS (for a human to visually
// judge "does the egg look like its decoys") need the bike to actually be near
// a given billboard's x so it is in frame.
//
// Proves the things the task requires of the billboard system:
//   (a) a GAS-ONLY run of level 18 finishes with 0 restarts;
//   (b) the display list contains EXACTLY ONE text object whose content, with
//       any word-wrap newlines undone (replaced back with spaces — see
//       decorations.ts's wrapBillboardText round-trip property), equals the
//       VERBATIM egg literal (embedded here independently, compared by code
//       points — same discipline as tests/levels.test.ts's byte-exact guard);
//   (c) the total on-screen billboard count (decoy boards + the egg's board)
//       matches level18.ts's config: within [5,7] AND equal to the specific
//       shipped count (7 today);
//   (d) the egg's board frame dimensions sit within a documented "same
//       family" tolerance of EVERY decoy board's dimensions — asserted
//       NUMERICALLY (not eyeballed), the regression guard against the
//       original bug (an unwrapped ~44-char line would balloon the board to
//       roughly 4x a decoy's width);
//   (e) the Matter body count matches a measured baseline (billboards/
//       decorations add ZERO Matter bodies — see EXPECTED_BODIES's comment);
//   (f) 0 console/page errors fire;
//   (g) screenshots: the egg billboard as the bike passes it, plus a nearby
//       short decoy and the size-matched long decoy, for a personal, visual
//       family-resemblance check (same frame, comparable scale, egg readable).
//
// Usage:
//   node scripts/playtest-level18.mjs
//   PLAYTEST_URL=http://localhost:5174/ OUT_DIR=./shots node scripts/playtest-level18.mjs
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const DEV_URL = process.env.PLAYTEST_URL ?? 'http://localhost:5173/';
const OUT_DIR = process.env.OUT_DIR ?? './playtest-out';
const DESIGN_W = 1280;
const DESIGN_H = 720;

const LEVEL_18 = 18;

// --- IN SYNC WITH src/levels/level18.ts's BillboardEvent text (NORTH_STAR
// §5/§7 / CLAUDE.md Rule 4 -- verbatim, never paraphrase). Independent literal
// (NOT imported from source), compared by CODE POINTS below -- same
// discipline as tests/levels.test.ts's byte-exact guard. This file is UTF-8. ---
const EGG_TEXT = "Sleepovers aren't breaking the rules right??";
// --- IN SYNC WITH src/levels/level18.ts's `decorations` (6) + `events` (1). ---
const EXPECTED_BILLBOARD_COUNT = 7;
const EGG_X = 7000;
const NEARBY_SHORT_DECOY_X = 8200; // "SUNNYVALE 12 MI" -- single line, close to the egg
const SIZE_MATCHED_DECOY_X = 11000; // "PARKER AND PARKER..." -- wraps to the SAME line count as the egg
// --- IN SYNC WITH src/systems/constants.ts's PALETTE.cream -- the billboard/
// sign board fill color. Level 18 authors NO signs (only billboards), so on
// THIS level every cream-filled, stroked Rectangle is unambiguously a
// billboard board. ---
const CREAM_COLOR = 0xfef4e6;

const MAX_BODIES = 100;
// Level 18's terrain(14500px)+bike-only Matter body count -- the measured
// baseline this harness pins with an EQUALITY assert (not just < MAX_BODIES),
// so any future accidental body creep on this level fails loudly. Billboards
// (decoy AND egg alike) add ZERO bodies BY CONSTRUCTION: decorations.ts /
// billboard.ts never touch scene.matter (they only scene.add rectangles /
// text / graphics -- grep either file: 'matter' appears in comments only), so
// this baseline is independent of billboard count or word-wrap. See
// DECISIONS.md's PLAN-07 task 3 entry.
const EXPECTED_BODIES = 90;

// Family-resemblance tolerance: the egg's board must sit within this factor of
// EVERY decoy's board dims on BOTH axes. Measured real ratios (shipped copy):
// widest observed is ~1.43x (egg 480x140 vs the shortest decoy, "EAT AT
// JOE'S" at 336x110); the size-matched "PARKER AND PARKER..." decoy is an
// EXACT 1.00x match (identical 480x140 board -- both wrap to 3 lines at the
// same BILLBOARD.wrapMaxChars). 1.8 gives ~25% headroom above the worst real
// ratio (so minor future copy edits don't flake) while still catching a
// regression back to the pre-wrap bug (an unwrapped ~44-char line balloons to
// roughly 2.8x-4x a decoy's width -- well outside this band either way).
const FAMILY_FACTOR_MAX = 1.8;
const FAMILY_FACTOR_MIN = 1 / FAMILY_FACTOR_MAX;

const RESTART_WARP_PX = 1500;
const POLL_MS = 150;
const SETTLE_MS = 600;
const GASONLY_TIMEOUT_MS = 60_000;
const SCREENSHOT_PROXIMITY_PX = 200;

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

/** Enter a level fresh via the manager-level bypass (same as
 * playtest-level11.mjs / playtest-level15.mjs -- stops a stale
 * LevelCompleteScene the previous run may have left active). */
async function startLevel(page, level) {
  await page.evaluate((lvl) => {
    const g = globalThis.__gabbyGame;
    if (g.scene.isActive('LevelCompleteScene')) g.scene.stop('LevelCompleteScene');
    g.scene.start('GameScene', { level: lvl });
  }, level);
  await waitForScene(page, 'GameScene');
  await page.waitForTimeout(SETTLE_MS);
}

/** Atomic in-page read: every billboard board Rectangle (cream fill + a
 * stroke) and every Text object currently on the display list, plus the
 * bike's x and the scene's complete/active flags. Billboards are plain,
 * never-culled GameObjects created once at level entry (see this file's
 * header), so this snapshot is complete regardless of camera position --
 * taken once right after entry, not polled during the drive. */
const READ_BILLBOARDS = (creamColor) => {
  const g = globalThis.__gabbyGame;
  const s = g.scene.getScene('GameScene');
  const list = s.children && s.children.list ? s.children.list : [];

  const boards = list
    .filter((o) => o.type === 'Rectangle' && o.fillColor === creamColor && o.isStroked)
    .map((o) => ({ x: o.x, y: o.y, width: o.width, height: o.height }));
  const texts = list
    .filter((o) => o.type === 'Text')
    .map((o) => ({ x: o.x, y: o.y, width: o.width, height: o.height, text: o.text }));

  return {
    complete: g.scene.isActive('LevelCompleteScene'),
    active: g.scene.isActive('GameScene'),
    bikeX: s.bike ? s.bike.x : null,
    boards,
    texts,
  };
};

/** Drive level 18 GAS-ONLY to completion, capturing proximity screenshots (for
 * a human to visually judge family resemblance) along the way. */
async function driveLevel18(page) {
  const start = Date.now();
  let finished = false;
  let restarts = 0;
  let prevX = null;
  let shotEgg = false;
  let shotShortDecoy = false;
  let shotSizeMatchedDecoy = false;

  while (Date.now() - start < GASONLY_TIMEOUT_MS) {
    await page.keyboard.down('ArrowRight');
    const bikeX = await page.evaluate(() => {
      const g = globalThis.__gabbyGame;
      if (!g.scene.isActive('GameScene')) return null;
      const s = g.scene.getScene('GameScene');
      return s.bike ? s.bike.x : null;
    });
    const complete = await page.evaluate(() => globalThis.__gabbyGame.scene.isActive('LevelCompleteScene'));

    if (bikeX !== null) {
      if (prevX !== null && bikeX < prevX - RESTART_WARP_PX) restarts++;
      prevX = bikeX;

      if (!shotEgg && Math.abs(bikeX - EGG_X) < SCREENSHOT_PROXIMITY_PX) {
        await page.screenshot({ path: join(OUT_DIR, 'level18-egg.png') });
        shotEgg = true;
      }
      if (!shotShortDecoy && Math.abs(bikeX - NEARBY_SHORT_DECOY_X) < SCREENSHOT_PROXIMITY_PX) {
        await page.screenshot({ path: join(OUT_DIR, 'level18-decoy-short.png') });
        shotShortDecoy = true;
      }
      if (!shotSizeMatchedDecoy && Math.abs(bikeX - SIZE_MATCHED_DECOY_X) < SCREENSHOT_PROXIMITY_PX) {
        await page.screenshot({ path: join(OUT_DIR, 'level18-decoy-sizematched.png') });
        shotSizeMatchedDecoy = true;
      }
    }

    if (complete) {
      finished = true;
      break;
    }
    await page.waitForTimeout(POLL_MS);
  }
  await page.keyboard.up('ArrowRight');

  return {
    finished,
    restarts,
    shotEgg,
    shotShortDecoy,
    shotSizeMatchedDecoy,
    driveSeconds: Math.round((Date.now() - start) / 100) / 10,
  };
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

    await startLevel(page, LEVEL_18);
    const bodies = await bodyCount(page);
    // Taken immediately -- see READ_BILLBOARDS's header doc: complete and
    // correct from the instant the level is entered, independent of camera.
    const snapshot = await page.evaluate(READ_BILLBOARDS, CREAM_COLOR);

    const drive = await driveLevel18(page);

    report = { bodies, snapshot, drive, consoleErrors, pageErrors };
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await browser.close();
  }

  // --- gate the exit code ---
  const problems = [];

  if (!report.drive.finished) problems.push('level 18 gas-only run did not finish');
  if (report.drive.restarts > 0) {
    problems.push(`level 18 gas-only run restarted ${report.drive.restarts}x (unexpected crash)`);
  }

  // (b) exactly one text object matches the verbatim egg literal, once
  // word-wrap newlines are undone.
  const matchingEggTexts = report.snapshot.texts.filter((t) => t.text.replace(/\n/g, ' ') === EGG_TEXT);
  if (matchingEggTexts.length !== 1) {
    problems.push(
      `expected EXACTLY ONE text object matching the verbatim egg text, found ${matchingEggTexts.length}`
    );
  }

  // (c) total billboard count on-screen matches config.
  const boardCount = report.snapshot.boards.length;
  if (boardCount < 5 || boardCount > 7) problems.push(`billboard count ${boardCount} outside [5,7]`);
  if (boardCount !== EXPECTED_BILLBOARD_COUNT) {
    problems.push(`billboard count ${boardCount} != expected ${EXPECTED_BILLBOARD_COUNT}`);
  }

  // (d) family-resemblance: the egg's board dims within tolerance of every decoy's.
  let eggBoard = null;
  let decoyBoards = [];
  if (matchingEggTexts.length === 1) {
    const eggTextX = matchingEggTexts[0].x;
    eggBoard = report.snapshot.boards.find((b) => Math.abs(b.x - eggTextX) < 1);
    decoyBoards = report.snapshot.boards.filter((b) => b !== eggBoard);
  }
  if (!eggBoard) {
    problems.push('could not identify the egg board (no board rectangle shares the egg text x)');
  } else if (decoyBoards.length === 0) {
    problems.push('found no decoy boards to compare the egg board against');
  } else {
    for (const decoy of decoyBoards) {
      const widthRatio = eggBoard.width / decoy.width;
      const heightRatio = eggBoard.height / decoy.height;
      if (widthRatio > FAMILY_FACTOR_MAX || widthRatio < FAMILY_FACTOR_MIN) {
        problems.push(
          `egg board width ${eggBoard.width} vs decoy(x=${decoy.x}) width ${decoy.width} (ratio ${widthRatio.toFixed(2)}) outside [${FAMILY_FACTOR_MIN.toFixed(2)}, ${FAMILY_FACTOR_MAX}]`
        );
      }
      if (heightRatio > FAMILY_FACTOR_MAX || heightRatio < FAMILY_FACTOR_MIN) {
        problems.push(
          `egg board height ${eggBoard.height} vs decoy(x=${decoy.x}) height ${decoy.height} (ratio ${heightRatio.toFixed(2)}) outside [${FAMILY_FACTOR_MIN.toFixed(2)}, ${FAMILY_FACTOR_MAX}]`
        );
      }
    }
  }

  // (e) body count -- billboards/decorations add ZERO Matter bodies.
  if (report.bodies !== EXPECTED_BODIES) {
    problems.push(`body count ${report.bodies} != expected baseline ${EXPECTED_BODIES} (decorations must add ZERO bodies)`);
  }
  if (report.bodies >= MAX_BODIES) problems.push(`body count ${report.bodies} >= ${MAX_BODIES} (NORTH_STAR §8 budget)`);

  // (g) screenshots captured.
  if (!report.drive.shotEgg) problems.push('never captured the egg screenshot');
  if (!report.drive.shotShortDecoy) problems.push('never captured the short-decoy screenshot');
  if (!report.drive.shotSizeMatchedDecoy) problems.push('never captured the size-matched-decoy screenshot');

  if (report.consoleErrors.length > 0) problems.push(`${report.consoleErrors.length} console error(s)`);
  if (report.pageErrors.length > 0) problems.push(`${report.pageErrors.length} page error(s)`);

  if (problems.length > 0) {
    console.error('LEVEL 18 HARNESS FAILURES:\n  - ' + problems.join('\n  - '));
    process.exitCode = 1;
  } else {
    console.log(
      `LEVEL 18 OK: gas-only finish in ${report.drive.driveSeconds}s, 0 restarts; exactly one text object carries ` +
        `the verbatim egg text; ${boardCount} billboards on-screen (matches config); egg board ` +
        `(${eggBoard.width}x${eggBoard.height}) within family range of its ${decoyBoards.length} decoys; ` +
        `body count ${report.bodies} (< ${MAX_BODIES}); no errors.`
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
