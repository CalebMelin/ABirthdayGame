// Automated browser check for the level-complete FACT ROTATION end-to-end
// (PLAN-08 task 4 acceptance: "a playthrough of several levels shows no repeated
// fact; a reload mid-run preserves the seen-set"). Complements
// scripts/playtest-levelcomplete.mjs — which proves a SINGLE fixed note + a
// SINGLE fact render correctly — by proving the ROTATION across a real SEQUENCE
// of LevelCompleteScene entries plus reload persistence of `gabby22.notesSeen`,
// through the real scene + notes engine + save system (not the unit-tested
// engine in isolation).
//
// Clones playtest-levelcomplete.mjs's structure: playwright-core system Chrome
// headless, drives via window.__gabbyGame + the DEV `__levelComplete` hook,
// screenshots to playtest-out/ (gitignored), gates the process exit code.
// Requires `npm run dev` running on :5173.
//
// What it gates:
//   1. NO-REPEAT ACROSS A SEQUENCE: reset the save, then directly-start
//      LevelCompleteScene for a run of FACT levels (1,2,3,4,5 then 8,10,16 —
//      never the fixed 6/9/13/14) and collect each shown note; assert every one
//      is style 'fact' and NO fact text repeats across the whole sequence
//      (proving the no-repeat draw + notesSeen-marking through the real scene).
//   2. FIXED NOTE IN THE SAME RUN: partway through, a fixed level (6) still shows
//      its byte-exact verbatim note under style 'hint' and does NOT consume the
//      pool (the surrounding fact rotation stays distinct; the seen-set does not
//      grow for the fixed level).
//   3. RELOAD PRESERVES THE SEEN-SET: capture gabby22.notesSeen mid-run, RELOAD
//      the page, assert the persisted seen-set is byte-identical after reload,
//      then draw more facts and assert none repeats a pre-reload fact (the next
//      fact shown is still not one already seen before the reload).
//   4. Zero console/page errors throughout.
//
// Usage:
//   node scripts/playtest-notes-rotation.mjs
//   PLAYTEST_URL=http://localhost:5174/ OUT_DIR=./shots node scripts/playtest-notes-rotation.mjs
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const DEV_URL = process.env.PLAYTEST_URL ?? 'http://localhost:5173/';
const OUT_DIR = process.env.OUT_DIR ?? './playtest-out';
const DESIGN_W = 1280;
const DESIGN_H = 720;

// INDEPENDENT expected literal (a second copy so a mangled shared constant can
// never pass — CLAUDE.md Rule 4). L6's fixed hint note is pure ASCII.
const EXPECTED_L6_NOTE = "Believe it or not, cars can't actually see motorcycles on the road";

const NOTES_SEEN_KEY = 'gabby22.notesSeen';

function isPureAscii(s) {
  return [...s].every((ch) => ch.codePointAt(0) < 128);
}

async function waitForScene(page, key, timeout = 20_000) {
  await page.waitForFunction((k) => globalThis.__gabbyGame?.scene.isActive(k) === true, key, { timeout });
}

/** Directly-start LevelCompleteScene for `level` (manager bypass, stopping any
 * live play scenes first), wait until create() has re-run for THIS level (guards
 * the restart-on-already-active race so we never read a stale snapshot), and
 * return the shown note. Each fact-level entry consumes one pool index and
 * persists it via the real save system — so a SEQUENCE of these entries is a
 * real rotation, exactly what this harness asserts on. */
async function showAndRead(page, level) {
  await page.evaluate((lvl) => {
    const g = globalThis.__gabbyGame;
    for (const k of ['GameScene', 'PartyScene', 'LevelSelectScene']) {
      if (g.scene.isActive(k)) g.scene.stop(k);
    }
    g.scene.start('LevelCompleteScene', { level: lvl, tulipsAtStart: 0 });
  }, level);
  await waitForScene(page, 'LevelCompleteScene');
  await page.waitForFunction(
    (lvl) => {
      const g = globalThis.__gabbyGame;
      const s = g.scene.getScene('LevelCompleteScene');
      return g.scene.isActive('LevelCompleteScene') && s?.__levelComplete?.level === lvl;
    },
    level,
    { timeout: 10_000 }
  );
  return page.evaluate(() => {
    const d = globalThis.__gabbyGame.scene.getScene('LevelCompleteScene').__levelComplete;
    return { level: d.level, noteText: d.noteText, noteStyle: d.noteStyle };
  });
}

/** Read the persisted seen-fact set straight out of localStorage (the same
 * `gabby22.notesSeen` key save.ts writes through to). */
async function readNotesSeen(page, key) {
  return page.evaluate((k) => {
    const raw = localStorage.getItem(k);
    return raw ? JSON.parse(raw) : [];
  }, key);
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

    // Reset the save so the fact pool starts fresh (clears gabby22.notesSeen +
    // every other key) — "getSave().resetAll or clear localStorage".
    await page.evaluate(() => localStorage.clear());

    // --- Phase A (pre-reload): a run of fact levels, with a fixed level midway. ---
    const preReloadFactLevels = [1, 2, 3, 4, 5];
    const factsA = [];
    for (const lvl of preReloadFactLevels) {
      const note = await showAndRead(page, lvl);
      if (note.noteStyle !== 'fact') problems.push(`L${lvl}: style ${note.noteStyle} != fact`);
      if (!note.noteText) problems.push(`L${lvl}: empty note`);
      factsA.push(note.noteText);
    }

    // Fixed level 6 in the SAME run: verbatim note, style 'hint', must NOT consume
    // the pool (the fact rotation on either side of it stays intact).
    const fixed = await showAndRead(page, 6);
    if (fixed.noteText !== EXPECTED_L6_NOTE)
      problems.push(`L6 fixed note mismatch: ${JSON.stringify(fixed.noteText)}`);
    if (!isPureAscii(fixed.noteText)) problems.push('L6 fixed note is not pure ASCII');
    if (fixed.noteStyle !== 'hint') problems.push(`L6 fixed style ${fixed.noteStyle} != hint`);
    await page.screenshot({ path: join(OUT_DIR, 'notes-fixed-l6.png') });

    // Capture the persisted seen-set mid-run (before the reload). The fixed L6
    // draw above must NOT have grown it beyond the 5 fact draws.
    const seenBefore = await readNotesSeen(page, NOTES_SEEN_KEY);
    if (seenBefore.length !== preReloadFactLevels.length)
      problems.push(
        `seen-set holds ${seenBefore.length} indices, expected ${preReloadFactLevels.length} (the fixed L6 must not consume the pool)`
      );

    // --- RELOAD mid-run. The seen-set lives in localStorage, so it must survive. ---
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForScene(page, 'TitleScene');
    const seenAfter = await readNotesSeen(page, NOTES_SEEN_KEY);
    const seenPersisted = JSON.stringify(seenAfter) === JSON.stringify(seenBefore);
    if (!seenPersisted)
      problems.push(
        `notesSeen NOT preserved across reload: before=${JSON.stringify(seenBefore)} after=${JSON.stringify(seenAfter)}`
      );

    // --- Phase B (post-reload): more fact levels; none may repeat a pre-reload fact. ---
    const postReloadFactLevels = [8, 10, 16];
    const factsB = [];
    for (const lvl of postReloadFactLevels) {
      const note = await showAndRead(page, lvl);
      if (note.noteStyle !== 'fact') problems.push(`L${lvl} (post-reload): style ${note.noteStyle} != fact`);
      if (!note.noteText) problems.push(`L${lvl} (post-reload): empty note`);
      factsB.push(note.noteText);
    }
    await page.screenshot({ path: join(OUT_DIR, 'notes-post-reload.png') });

    // --- No repeat across the WHOLE sequence (spanning the reload). ---
    const allFacts = [...factsA, ...factsB];
    const uniqueFacts = new Set(allFacts);
    if (uniqueFacts.size !== allFacts.length) {
      const seen = new Set();
      const dupes = [];
      for (const f of allFacts) {
        if (seen.has(f)) dupes.push(f);
        else seen.add(f);
      }
      problems.push(`repeated fact(s) across the sequence: ${JSON.stringify(dupes)}`);
    }
    // Behavioral reload proof: no post-reload fact equals any pre-reload fact
    // (deterministic given seenPersisted — selectNote only draws unseen indices).
    const setA = new Set(factsA);
    const crossRepeat = factsB.filter((f) => setA.has(f));
    if (crossRepeat.length > 0)
      problems.push(`post-reload fact repeated a pre-reload fact: ${JSON.stringify(crossRepeat)}`);

    report = {
      preReloadFactLevels,
      postReloadFactLevels,
      factsA,
      factsB,
      totalFacts: allFacts.length,
      uniqueFacts: uniqueFacts.size,
      fixedL6: { note: fixed.noteText, style: fixed.noteStyle },
      seenBefore,
      seenAfter,
      seenPersisted,
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
    console.error('NOTES-ROTATION HARNESS FAILURES:\n  - ' + problems.join('\n  - '));
    process.exitCode = 1;
  } else {
    const levelOrder = [...report.preReloadFactLevels, 6, ...report.postReloadFactLevels].join(', ');
    console.log(
      `NOTES-ROTATION OK: ${report.totalFacts} facts across levels [${levelOrder}] all distinct (no repeat); ` +
        `fixed L6 showed its verbatim note under style 'hint' without consuming the pool ` +
        `(seen-set held ${report.seenBefore.length}); gabby22.notesSeen ${JSON.stringify(report.seenBefore)} ` +
        `persisted byte-identical across a page reload and no post-reload fact repeated a pre-reload one; no errors.`
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
