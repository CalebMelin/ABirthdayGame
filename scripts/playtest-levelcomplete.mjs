// Automated browser playtest for the REAL LevelCompleteScene (PLAN-08 task 1,
// src/scenes/LevelCompleteScene.ts). Clones scripts/playtest-tulips.mjs's
// structure (playwright-core system Chrome headless, drives via
// window.__gabbyGame, screenshots to playtest-out/, gates the process exit
// code). Requires `npm run dev` running on :5173.
//
// What it gates:
//   1. FIXED HINT NOTE: LevelCompleteScene({level:6, tulipsAtStart:0}) shows the
//      byte-exact L6 note "Believe it or not, cars can't actually see
//      motorcycles on the road" (independent code-point literal + pure-ASCII
//      assertion) under the "Psst… 💡" title (style 'hint').
//   2. FACT CARD: a fact level (3) shows a "Did you know?" card (style 'fact')
//      with a non-empty pool fact.
//   3. HEADER: reads exactly "Level 6 complete!! 🎉" (the !! + U+1F389).
//   4. TULIPS EARNED: seed gabby22.tulips=5, enter with {level:3,
//      tulipsAtStart:2} -> earned shows 3, total shows 5.
//   5. TYPEWRITER: the note reveals over time then completes (rendered card text
//      normalizes back to the byte-exact note); a tap anywhere reveals instantly.
//   6. BUTTONS route by BOTH mouse click and touch tap: "Next level →" ->
//      GameScene(level+1), "Replay" -> GameScene(same level), "Level select" ->
//      LevelSelectScene — each exercised by a real click/tap, asserting the
//      active scene changed.
//   7. LEVEL-22 SKIP: finishing GameScene on level 22 lands on PartyScene (NOT
//      LevelCompleteScene) with gabby22.progress.completed[21]===true; finishing
//      a level < 22 (level 1) lands on LevelCompleteScene (NOT PartyScene) with
//      completed[0]===true — proving the markLevelCompleted move + the skip.
//   8. Zero console/page errors throughout; screenshots to playtest-out/.
//
// Usage:
//   node scripts/playtest-levelcomplete.mjs
//   PLAYTEST_URL=http://localhost:5174/ OUT_DIR=./shots node scripts/playtest-levelcomplete.mjs
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const DEV_URL = process.env.PLAYTEST_URL ?? 'http://localhost:5173/';
const OUT_DIR = process.env.OUT_DIR ?? './playtest-out';
const DESIGN_W = 1280;
const DESIGN_H = 720;

// --- INDEPENDENT expected literals (built from code points so a mangled shared
// constant can never pass — CLAUDE.md Rule 4). ---
const EXPECTED_L6_NOTE = "Believe it or not, cars can't actually see motorcycles on the road";
const EXPECTED_HEADER_L6 = 'Level 6 complete!! ' + String.fromCodePoint(0x1f389); // 🎉
const EXPECTED_TITLE_HINT = 'Psst' + String.fromCodePoint(0x2026) + ' ' + String.fromCodePoint(0x1f4a1); // Psst… 💡
const EXPECTED_TITLE_FACT = 'Did you know?';

const SETTLE_MS = 160;

function isPureAscii(s) {
  return [...s].every((ch) => ch.codePointAt(0) < 128);
}
function normalizeWs(s) {
  return s.replace(/\s+/g, ' ').trim();
}

async function waitForScene(page, key, timeout = 20_000) {
  await page.waitForFunction((k) => globalThis.__gabbyGame?.scene.isActive(k) === true, key, { timeout });
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

/** Enter LevelCompleteScene directly (manager bypass), stopping any live play
 * scenes first so nothing lingers active. */
async function startLevelComplete(page, level, tulipsAtStart) {
  await page.evaluate(
    ({ level, tulipsAtStart }) => {
      const g = globalThis.__gabbyGame;
      for (const k of ['GameScene', 'PartyScene', 'LevelSelectScene']) {
        if (g.scene.isActive(k)) g.scene.stop(k);
      }
      g.scene.start('LevelCompleteScene', { level, tulipsAtStart });
    },
    { level, tulipsAtStart }
  );
  await waitForScene(page, 'LevelCompleteScene');
  await page.waitForTimeout(SETTLE_MS);
}

async function seedTulips(page, n) {
  await page.evaluate((v) => localStorage.setItem('gabby22.tulips', String(v)), n);
}

/** Atomic in-page read of the LevelCompleteScene DEV snapshot (+ its function
 * fields evaluated). */
const READ_LC = () => {
  const g = globalThis.__gabbyGame;
  const s = g.scene.getScene('LevelCompleteScene');
  const d = s.__levelComplete;
  const lcActive = g.scene.isActive('LevelCompleteScene');
  if (!d) return { hasLC: false, lcActive };
  return {
    hasLC: true,
    lcActive,
    level: d.level,
    headerText: d.headerText,
    cardTitle: d.cardTitle,
    noteText: d.noteText,
    noteStyle: d.noteStyle,
    earned: d.earned,
    total: d.total,
    fullWrappedText: d.fullWrappedText,
    revealedLength: d.revealedLength(),
    revealedText: d.revealedText(),
    typewriterComplete: d.typewriterComplete(),
    fullLength: Array.from(d.fullWrappedText).length,
    nextButtonPos: d.nextButtonPos,
    replayButtonPos: d.replayButtonPos,
    levelSelectButtonPos: d.levelSelectButtonPos,
  };
};

const readLc = (page) => page.evaluate(READ_LC);

/** Poll until predicate(readLc) is true or timeout; returns the last sample. */
async function pollLc(page, predicate, timeoutMs, stepMs = 60) {
  const start = Date.now();
  let last = await readLc(page);
  while (Date.now() - start < timeoutMs) {
    if (predicate(last)) return last;
    await page.waitForTimeout(stepMs);
    last = await readLc(page);
  }
  return last;
}

/** Drive GameScene(level) gas-only until `targetKey` activates (finished) or
 * `wrongKey` activates (a routing bug) or timeout. */
async function driveToFinish(page, level, targetKey, wrongKey, timeoutMs) {
  await page.evaluate((lvl) => {
    const g = globalThis.__gabbyGame;
    for (const k of ['LevelCompleteScene', 'PartyScene', 'LevelSelectScene']) {
      if (g.scene.isActive(k)) g.scene.stop(k);
    }
    g.scene.start('GameScene', { level: lvl });
  }, level);
  await waitForScene(page, 'GameScene');
  await page.waitForTimeout(600);

  const start = Date.now();
  let finished = false;
  let wrong = false;
  let restarts = 0;
  let prevX = null;
  while (Date.now() - start < timeoutMs) {
    await page.keyboard.down('ArrowRight');
    const st = await page.evaluate((keys) => {
      const g = globalThis.__gabbyGame;
      const s = g.scene.getScene('GameScene');
      return {
        target: g.scene.isActive(keys.target),
        wrong: g.scene.isActive(keys.wrong),
        bikeX: g.scene.isActive('GameScene') && s.bike ? s.bike.x : null,
      };
    }, { target: targetKey, wrong: wrongKey });
    if (st.target) {
      finished = true;
      break;
    }
    if (st.wrong) {
      wrong = true;
      break;
    }
    if (st.bikeX !== null) {
      if (prevX !== null && st.bikeX < prevX - 1500) restarts++;
      prevX = st.bikeX;
    }
    await page.waitForTimeout(200);
  }
  await page.keyboard.up('ArrowRight');
  return { finished, wrong, restarts, seconds: Math.round((Date.now() - start) / 100) / 10 };
}

function readProgress(page) {
  return page.evaluate(() => {
    const raw = localStorage.getItem('gabby22.progress');
    return raw ? JSON.parse(raw) : null;
  });
}

/** One button-routing assertion by a real click OR tap. Enters LC(level 5),
 * fires the input at the button, waits for the expected scene, and checks the
 * GameScene level where relevant. */
async function checkButton(page, kind, which, problems) {
  await startLevelComplete(page, 5, 0);
  const lc = await readLc(page);
  const pos =
    which === 'next' ? lc.nextButtonPos : which === 'replay' ? lc.replayButtonPos : lc.levelSelectButtonPos;
  const fire = kind === 'tap' ? tapDesign : clickDesign;
  await fire(page, pos.x, pos.y);

  const label = `${which} via ${kind}`;
  try {
    if (which === 'levelSelect') {
      await waitForScene(page, 'LevelSelectScene', 6000);
    } else {
      await waitForScene(page, 'GameScene', 6000);
      const lvl = await page.evaluate(() => globalThis.__gabbyGame.scene.getScene('GameScene').level);
      const want = which === 'next' ? 6 : 5;
      if (lvl !== want) problems.push(`${label}: GameScene level ${lvl} != ${want}`);
    }
  } catch {
    problems.push(`${label}: expected scene never activated`);
  }
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
    await seedTulips(page, 0);

    // (1) + (3): L6 fixed hint note + header, byte-exact.
    await startLevelComplete(page, 6, 0);
    const l6 = await readLc(page);
    if (!l6.hasLC) problems.push('L6: __levelComplete snapshot missing');
    else {
      if (l6.noteText !== EXPECTED_L6_NOTE)
        problems.push(`L6 note mismatch: ${JSON.stringify(l6.noteText)}`);
      if (!isPureAscii(l6.noteText)) problems.push('L6 note is not pure ASCII');
      if (l6.noteStyle !== 'hint') problems.push(`L6 style ${l6.noteStyle} != hint`);
      if (l6.cardTitle !== EXPECTED_TITLE_HINT)
        problems.push(`L6 title mismatch: ${JSON.stringify(l6.cardTitle)}`);
      if (l6.headerText !== EXPECTED_HEADER_L6)
        problems.push(`L6 header mismatch: ${JSON.stringify(l6.headerText)}`);
    }
    await page.screenshot({ path: join(OUT_DIR, 'lc-level6-hint.png') });

    // (5) TYPEWRITER natural reveal + completion (proves rendered card = byte-exact note).
    await startLevelComplete(page, 6, 0);
    const early = await readLc(page);
    await page.waitForTimeout(300);
    const mid = await readLc(page);
    const grew = mid.revealedLength > early.revealedLength;
    const midPartial = !mid.typewriterComplete && mid.revealedLength < mid.fullLength;
    const done = await pollLc(page, (s) => s.typewriterComplete, 5000);
    const typewriter = {
      earlyLen: early.revealedLength,
      midLen: mid.revealedLength,
      fullLen: mid.fullLength,
      grewDuringReveal: grew,
      observedPartial: midPartial,
      completed: done.typewriterComplete,
      renderedMatchesNote: normalizeWs(done.revealedText) === EXPECTED_L6_NOTE,
    };
    if (!grew) problems.push('typewriter: reveal length did not grow over time');
    if (!midPartial) problems.push('typewriter: never observed a partial reveal');
    if (!done.typewriterComplete) problems.push('typewriter: never completed');
    if (!typewriter.renderedMatchesNote)
      problems.push(`typewriter: rendered card text != note (${JSON.stringify(done.revealedText)})`);
    await page.screenshot({ path: join(OUT_DIR, 'lc-typewriter-complete.png') });

    // (5) TAP-TO-SKIP reveals instantly.
    await startLevelComplete(page, 6, 0);
    await page.waitForTimeout(80); // partway in, not complete
    const beforeSkip = await readLc(page);
    await tapDesign(page, DESIGN_W / 2, 352); // card center, away from buttons
    const afterSkip = await pollLc(page, (s) => s.typewriterComplete, 400);
    const skip = {
      beforeLen: beforeSkip.revealedLength,
      fullLen: beforeSkip.fullLength,
      completedInstantly: afterSkip.typewriterComplete,
      revealedFull: afterSkip.revealedLength === afterSkip.fullLength,
    };
    if (!(beforeSkip.revealedLength < beforeSkip.fullLength))
      problems.push('skip: text was already fully revealed before the tap (test vacuous)');
    if (!afterSkip.typewriterComplete) problems.push('skip: tap did not complete the typewriter');
    if (!skip.revealedFull) problems.push('skip: revealed length != full length after tap');
    await page.screenshot({ path: join(OUT_DIR, 'lc-skip.png') });

    // (2) FACT card.
    await startLevelComplete(page, 3, 0);
    const fact = await readLc(page);
    if (fact.cardTitle !== EXPECTED_TITLE_FACT)
      problems.push(`fact title ${JSON.stringify(fact.cardTitle)} != "${EXPECTED_TITLE_FACT}"`);
    if (fact.noteStyle !== 'fact') problems.push(`fact style ${fact.noteStyle} != fact`);
    if (!fact.noteText || fact.noteText.length === 0) problems.push('fact note is empty');
    await page.screenshot({ path: join(OUT_DIR, 'lc-level3-fact.png') });

    // (4) TULIPS earned + total.
    await seedTulips(page, 5);
    await startLevelComplete(page, 3, 2);
    const tulips = await readLc(page);
    if (tulips.earned !== 3) problems.push(`earned ${tulips.earned} != 3`);
    if (tulips.total !== 5) problems.push(`total ${tulips.total} != 5`);
    await page.screenshot({ path: join(OUT_DIR, 'lc-tulips.png') });

    // (6) BUTTONS by mouse click AND touch tap.
    for (const kind of ['click', 'tap']) {
      for (const which of ['next', 'replay', 'levelSelect']) {
        await checkButton(page, kind, which, problems);
      }
    }

    // (7) LEVEL-22 SKIP + level-<22 routing (proves the markLevelCompleted move).
    await page.evaluate(() => localStorage.removeItem('gabby22.progress'));
    await seedTulips(page, 0);

    const lvl1 = await driveToFinish(page, 1, 'LevelCompleteScene', 'PartyScene', 45_000);
    await page.screenshot({ path: join(OUT_DIR, 'lc-finish-level1.png') });
    if (!lvl1.finished) problems.push(`level 1 did not reach LevelCompleteScene (wrong=${lvl1.wrong})`);
    const progAfter1 = await readProgress(page);
    if (!progAfter1 || progAfter1.completed?.[0] !== true)
      problems.push('level 1 finish did not mark completed[0]');

    const lvl22 = await driveToFinish(page, 22, 'PartyScene', 'LevelCompleteScene', 80_000);
    await page.screenshot({ path: join(OUT_DIR, 'lc-finish-level22.png') });
    if (!lvl22.finished) problems.push(`level 22 did not reach PartyScene (wrong=${lvl22.wrong})`);
    if (lvl22.wrong) problems.push('level 22 routed to LevelCompleteScene instead of PartyScene!');
    const progAfter22 = await readProgress(page);
    if (!progAfter22 || progAfter22.completed?.[21] !== true)
      problems.push('level 22 finish did not mark completed[21]');

    report = {
      l6: { note: l6.noteText, title: l6.cardTitle, header: l6.headerText, style: l6.noteStyle },
      fact: { title: fact.cardTitle, style: fact.noteStyle, note: fact.noteText },
      tulips: { earned: tulips.earned, total: tulips.total },
      typewriter,
      skip,
      routing: {
        level1: { finished: lvl1.finished, seconds: lvl1.seconds, restarts: lvl1.restarts, completed0: progAfter1?.completed?.[0] },
        level22: { finished: lvl22.finished, wrong: lvl22.wrong, seconds: lvl22.seconds, restarts: lvl22.restarts, completed21: progAfter22?.completed?.[21] },
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
    console.error('LEVELCOMPLETE HARNESS FAILURES:\n  - ' + problems.join('\n  - '));
    process.exitCode = 1;
  } else {
    console.log(
      `LEVELCOMPLETE OK: L6 byte-exact hint note under "Psst… 💡" + header "Level 6 complete!! 🎉"; fact level shows "Did you know?"; earned ${report.tulips.earned}/total ${report.tulips.total}; typewriter reveals (${report.typewriter.midLen}/${report.typewriter.fullLen}) then completes + tap-skips instantly; all 3 buttons route by click AND tap; level 1 finish -> LevelComplete (completed[0]), level 22 finish -> PartyScene (completed[21], ${report.routing.level22.seconds}s); no errors.`
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
