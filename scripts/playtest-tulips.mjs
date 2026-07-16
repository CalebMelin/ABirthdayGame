// Automated browser playtest for the TRICK/TULIP system (PLAN-07 task 1,
// src/systems/tricks.ts). Clones scripts/playtest-level15.mjs's structure
// (playwright-core system Chrome headless, drives via window.__gabbyGame,
// screenshots to playtest-out/, gates the process exit code). Requires
// `npm run dev` running on :5173.
//
// Proves the NEGATIVE award path (no false positives) + the HUD/persistence.
// The POSITIVE award path (a real landed flip) is proven by PLAN-07 task 4's
// flip harness (scripts/playtest-tricks.mjs flip) off level 2's kickers, not
// here; this harness deliberately never taps gas mid-air. What it gates:
//   (a) BOUQUET HUD: with gabby22.tulips seeded to 0 / 3 / 12 (via
//       localStorage before load), entering a level renders the bouquet in the
//       TOP-RIGHT corner at the correct growth stage (single tulip / 3-tulip
//       bunch / 7-tulip bouquet) with the correct count text — including the
//       always-visible "single tulip + 0" for a fresh player;
//   (b) ZOOM PIN: the bouquet's RENDERED screen position holds fixed while the
//       play camera's speed-zoom actually varies mid-drive (the pedals/⏸
//       zoom-compensation contract);
//   (c) NO FALSE POSITIVES (acceptance criterion): a full gas-only drive over
//       level 2's hills + kickers — plenty of real airborne phases — awards ZERO
//       tulips (a gas-only hold clears the kickers upright, so airborne rotation
//       never crosses the 330-degree threshold), the HUD stays at the seeded count,
//       and gabby22.tulips is byte-unchanged;
//   (d) SESSION PERSISTENCE: reloading the page (fresh Phaser game, real save
//       path) re-renders the same count — after seeding AND after the drive;
//   (e) BODY BUDGET: the Matter body count with the tricks system live equals
//       the PRE-TRICKS baseline (the system adds ZERO Matter bodies);
//   (f) 0 console/page errors fire.
//
// Usage:
//   node scripts/playtest-tulips.mjs
//   PLAYTEST_URL=http://localhost:5174/ OUT_DIR=./shots node scripts/playtest-tulips.mjs
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const DEV_URL = process.env.PLAYTEST_URL ?? 'http://localhost:5173/';
const OUT_DIR = process.env.OUT_DIR ?? './playtest-out';
const DESIGN_W = 1280;
const DESIGN_H = 720;

// --- IN SYNC WITH src/systems/constants.ts (TRICKS / DESIGN_*) + tricks.ts. ---
// The bouquet growth stages and their cluster sprite counts (STAGE_FANS).
const STAGE_FOR_COUNT = [
  { seed: 0, stage: 'single', clusterTulips: 1 },
  { seed: 3, stage: 'bunch', clusterTulips: 3 },
  { seed: 12, stage: 'bouquet', clusterTulips: 7 },
];
// Verbatim toast copy (byte-exact — CLAUDE.md Rule 4); the 🌷 is U+1F337.
const EXPECT_BACKFLIP_MSG = 'Backflip!! 🌷';
const EXPECT_FRONTFLIP_MSG = 'Frontflip!! 🌷';
// The zoom pivot (design center) used by the zoom-compensation math.
const PIVOT_X = DESIGN_W / 2;
const PIVOT_Y = DESIGN_H / 2;

// --- PRE-TRICKS Matter body-count baseline for the level this harness drives
// (level 2, 10000px). Measured on HEAD f137a0d (the commit BEFORE tricks.ts
// existed) via a probe identical to bodyCount() below; level 1 measured 57 on
// the same run, matching PROGRESS.md's documented playtest-drive figure, so
// the probe method is trusted. The tricks system must add ZERO bodies. ---
const LEVEL = 2;
const PRE_TRICKS_LEVEL2_BODIES = 63;

const DRIVE_TIMEOUT_MS = 90_000;
const POLL_MS = 150;
const SETTLE_MS = 600;
const RESTART_WARP_PX = 1500;
// Zoom-pin gate: the camera must have actually zoomed out (< this) during the
// sampled drive or the stability assertion would be vacuous, and the rendered
// anchor's total drift across all samples must stay within the tolerance.
const ZOOM_VARIED_BELOW = 0.98;
const MAX_ANCHOR_DRIFT_PX = 2;
const ZOOM_SAMPLE_MS = 5_000;
// The bouquet anchor must render inside the top-right corner region.
const CORNER_MIN_X = DESIGN_W - 200;
const CORNER_MAX_Y = 100;

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
 * playtest-levels.mjs / playtest-level15.mjs). */
async function startLevel(page, level) {
  await page.evaluate((lvl) => {
    const g = globalThis.__gabbyGame;
    if (g.scene.isActive('LevelCompleteScene')) g.scene.stop('LevelCompleteScene');
    g.scene.start('GameScene', { level: lvl });
  }, level);
  await waitForScene(page, 'GameScene');
  await page.waitForTimeout(SETTLE_MS);
}

/** Seed gabby22.tulips directly (the "previous session wrote this" setup),
 * then reload so a FRESH game boots against it — the real save read path. */
async function seedTulipsAndReload(page, count) {
  await page.evaluate((n) => {
    localStorage.setItem('gabby22.tulips', String(n));
  }, count);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForScene(page, 'TitleScene');
}

/** Atomic in-page read of the tricks state (off the DEV __tricks snapshot),
 * plus the pieces needed to compute the bouquet's RENDERED screen point:
 * a scrollFactor-0 root at (rootX, rootY) scaled rootScale renders its child
 * anchor at pivot + ((root + anchor*scale) - pivot) * zoom.
 *
 * The scene-level fields (complete/active/...) are ALWAYS returned:
 * GameScene's shutdown (e.g. the finish transition to LevelComplete) destroys
 * the tricks system and deletes __tricks, and the drive loop still needs to
 * observe `complete` after that — `hasTricks` marks whether the trick fields
 * are populated this sample. */
const READ_TRICKS = () => {
  const g = globalThis.__gabbyGame;
  const s = g.scene.getScene('GameScene');
  const t = s.__tricks;
  const base = {
    complete: g.scene.isActive('LevelCompleteScene'),
    active: g.scene.isActive('GameScene'),
    bikeX: s.bike ? s.bike.x : null,
    zoom: s.cameras && s.cameras.main ? s.cameras.main.zoom : null,
    storedTulips: localStorage.getItem('gabby22.tulips'),
    hasTricks: Boolean(t),
  };
  if (!t) return base;
  return {
    ...base,
    displayedCount: t.displayedCount(),
    savedCount: t.savedCount(),
    stage: t.stage(),
    countText: t.countText(),
    clusterTulips: t.clusterTulips(),
    landings: t.landings(),
    awardedTulips: t.awardedTulips(),
    maxLandingRotationDeg: t.maxLandingRotationDeg(),
    inFlightArcs: t.inFlightArcs(),
    rootX: t.rootX(),
    rootY: t.rootY(),
    rootScale: t.rootScale(),
    anchorX: t.anchorX,
    anchorY: t.anchorY,
    backflipMessage: t.backflipMessage,
    frontflipMessage: t.frontflipMessage,
  };
};

/** The bouquet anchor's rendered (on-screen, design-scale) point for one
 * READ_TRICKS sample — the zoom-compensation contract under test. */
function renderedAnchor(st) {
  return {
    x: PIVOT_X + (st.rootX + st.anchorX * st.rootScale - PIVOT_X) * st.zoom,
    y: PIVOT_Y + (st.rootY + st.anchorY * st.rootScale - PIVOT_Y) * st.zoom,
  };
}

/** Assert one seeded count renders the right HUD; returns evidence + problems. */
async function checkSeededHud(page, expected, problems) {
  await seedTulipsAndReload(page, expected.seed);
  await startLevel(page, LEVEL);
  const st = await page.evaluate(READ_TRICKS);
  const bodies = await bodyCount(page);
  const label = `seed ${expected.seed}`;

  if (!st.hasTricks) {
    problems.push(`${label}: __tricks debug snapshot missing (tricks system not created?)`);
    return { bodies };
  }
  if (st.displayedCount !== expected.seed) {
    problems.push(`${label}: HUD count ${st.displayedCount} != ${expected.seed}`);
  }
  if (st.countText !== String(expected.seed)) {
    problems.push(`${label}: count text ${JSON.stringify(st.countText)} != "${expected.seed}"`);
  }
  if (st.stage !== expected.stage) {
    problems.push(`${label}: stage ${st.stage} != ${expected.stage}`);
  }
  if (st.clusterTulips !== expected.clusterTulips) {
    problems.push(`${label}: cluster has ${st.clusterTulips} tulips != ${expected.clusterTulips}`);
  }
  const anchor = renderedAnchor(st);
  if (!(anchor.x >= CORNER_MIN_X && anchor.x <= DESIGN_W && anchor.y >= 0 && anchor.y <= CORNER_MAX_Y)) {
    problems.push(
      `${label}: bouquet rendered at (${Math.round(anchor.x)}, ${Math.round(anchor.y)}) — not in the top-right corner`
    );
  }
  if (bodies !== PRE_TRICKS_LEVEL2_BODIES) {
    problems.push(`${label}: body count ${bodies} != pre-tricks baseline ${PRE_TRICKS_LEVEL2_BODIES}`);
  }
  if (st.backflipMessage !== EXPECT_BACKFLIP_MSG || st.frontflipMessage !== EXPECT_FRONTFLIP_MSG) {
    problems.push(
      `${label}: toast copy mismatch (got ${JSON.stringify(st.backflipMessage)} / ${JSON.stringify(st.frontflipMessage)})`
    );
  }
  await page.screenshot({ path: join(OUT_DIR, `tulips-seed-${expected.seed}.png`) });
  return { bodies, count: st.displayedCount, stage: st.stage, clusterTulips: st.clusterTulips, countText: st.countText, anchor };
}

/** Hold gas for a few seconds while sampling zoom + the bouquet's rendered
 * screen point — the zoom-pin evidence (mirrors playtest-touch's technique). */
async function sampleZoomPin(page) {
  const samples = [];
  const start = Date.now();
  while (Date.now() - start < ZOOM_SAMPLE_MS) {
    await page.keyboard.down('ArrowRight');
    const st = await page.evaluate(READ_TRICKS);
    if (st.hasTricks && st.active && st.zoom !== null) {
      const a = renderedAnchor(st);
      samples.push({ zoom: Math.round(st.zoom * 1000) / 1000, x: a.x, y: a.y });
    }
    await page.waitForTimeout(POLL_MS);
  }
  await page.keyboard.up('ArrowRight');
  await page.screenshot({ path: join(OUT_DIR, 'tulips-zoomed.png') });

  const zooms = samples.map((s) => s.zoom);
  const xs = samples.map((s) => s.x);
  const ys = samples.map((s) => s.y);
  return {
    samples: samples.length,
    minZoom: Math.min(...zooms),
    maxZoom: Math.max(...zooms),
    driftX: Math.round((Math.max(...xs) - Math.min(...xs)) * 100) / 100,
    driftY: Math.round((Math.max(...ys) - Math.min(...ys)) * 100) / 100,
  };
}

/** The NEGATIVE award path (acceptance criterion): drive level 2 gas-only to
 * completion — real hills + the authored kickers, so genuine airborne phases —
 * and prove zero tulips are ever awarded while the HUD count holds. */
async function driveGasOnlyNegative(page) {
  const start = Date.now();
  let finished = false;
  let restarts = 0;
  let prevX = null;
  let last = null;

  while (Date.now() - start < DRIVE_TIMEOUT_MS) {
    // Re-press every poll: CDP has no OS auto-repeat, so a restart's
    // recreated Key objects would silently drop a held key (drive.mjs note).
    await page.keyboard.down('ArrowRight');
    const st = await page.evaluate(READ_TRICKS);
    // `last` keeps the final sample WITH trick data — the finish transition
    // destroys the tricks system (hasTricks false), but the scene-level
    // `complete` flag must still be observed to end the loop.
    if (st.hasTricks) last = st;
    if (st.complete) {
      finished = true;
      break;
    }
    if (st.bikeX !== null) {
      if (prevX !== null && st.bikeX < prevX - RESTART_WARP_PX) restarts++;
      prevX = st.bikeX;
    }
    await page.waitForTimeout(POLL_MS);
  }
  await page.keyboard.up('ArrowRight');
  await page.screenshot({ path: join(OUT_DIR, 'tulips-negative-end.png') });

  return {
    finished,
    restarts,
    driveSeconds: Math.round((Date.now() - start) / 100) / 10,
    // From the last in-GameScene sample before completion:
    landings: last ? last.landings : null,
    awardedTulips: last ? last.awardedTulips : null,
    maxLandingRotationDeg: last ? Math.round(last.maxLandingRotationDeg * 10) / 10 : null,
    savedCount: last ? last.savedCount : null,
    storedTulips: last ? last.storedTulips : null,
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

  const problems = [];
  let report;
  try {
    await page.goto(DEV_URL, { waitUntil: 'domcontentloaded' });
    await waitForScene(page, 'TitleScene');

    // (a) + (e): each seeded count renders the right growth stage, count text,
    // top-right placement, and the pre-tricks body count. Ordered 3 -> 12 -> 0
    // so the run ends on the seed-0 state the negative drive needs.
    const hud = {};
    hud.seed3 = await checkSeededHud(page, STAGE_FOR_COUNT[1], problems);

    // (d) part 1: reload after seeding — a fresh session re-reads 3.
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForScene(page, 'TitleScene');
    await startLevel(page, LEVEL);
    const reread = await page.evaluate(READ_TRICKS);
    if (!reread.hasTricks || reread.displayedCount !== 3 || reread.storedTulips !== '3') {
      problems.push(
        `post-reload session did not re-read the seeded 3 tulips (count ${reread.displayedCount}, stored ${reread.storedTulips})`
      );
    }

    hud.seed12 = await checkSeededHud(page, STAGE_FOR_COUNT[2], problems);

    // (b): zoom-pin while driving on the seed-12 state (bouquet at its largest).
    const zoomPin = await sampleZoomPin(page);
    if (zoomPin.samples < 5 || !(zoomPin.minZoom < ZOOM_VARIED_BELOW)) {
      problems.push(
        `zoom never varied during the pin sample (minZoom ${zoomPin.minZoom}, samples ${zoomPin.samples}) — stability check vacuous`
      );
    }
    if (zoomPin.driftX > MAX_ANCHOR_DRIFT_PX || zoomPin.driftY > MAX_ANCHOR_DRIFT_PX) {
      problems.push(
        `bouquet drifted on screen under zoom (drift ${zoomPin.driftX}px x, ${zoomPin.driftY}px y > ${MAX_ANCHOR_DRIFT_PX}px)`
      );
    }

    hud.seed0 = await checkSeededHud(page, STAGE_FOR_COUNT[0], problems);

    // (c): the negative award path over level 2's real hills + kickers.
    const negative = await driveGasOnlyNegative(page);
    if (!negative.finished) problems.push('gas-only level 2 drive did not finish');
    if (negative.restarts > 0) problems.push(`gas-only drive restarted ${negative.restarts}x (unexpected crash)`);
    if (negative.awardedTulips !== 0) {
      problems.push(`gas-only rolling drive AWARDED ${negative.awardedTulips} tulips — false positive!`);
    }
    if (negative.savedCount !== 0 || negative.storedTulips !== '0') {
      problems.push(
        `tulip count changed during the no-flip drive (saved ${negative.savedCount}, stored ${JSON.stringify(negative.storedTulips)})`
      );
    }
    if (negative.landings === null || negative.landings < 1) {
      problems.push(
        `the drive produced no observed landings (${negative.landings}) — the no-false-positive check proved nothing`
      );
    }
    if (negative.maxLandingRotationDeg !== null && negative.maxLandingRotationDeg >= 330) {
      problems.push(
        `a rolling landing accumulated ${negative.maxLandingRotationDeg} degrees (>= the 330 award threshold)`
      );
    }

    // (d) part 2: reload AFTER the drive — the (unchanged) count survives the
    // session boundary through the real save path.
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForScene(page, 'TitleScene');
    await startLevel(page, LEVEL);
    const afterDrive = await page.evaluate(READ_TRICKS);
    if (!afterDrive.hasTricks || afterDrive.displayedCount !== 0 || afterDrive.storedTulips !== '0') {
      problems.push(
        `post-drive reload did not hold the tulip count (count ${afterDrive.displayedCount}, stored ${afterDrive.storedTulips})`
      );
    }

    report = {
      hud,
      zoomPin,
      negative,
      persistence: {
        seededReloadCount: reread ? reread.displayedCount : null,
        postDriveReloadCount: afterDrive ? afterDrive.displayedCount : null,
      },
      preTricksBaselineBodies: PRE_TRICKS_LEVEL2_BODIES,
      consoleErrors,
      pageErrors,
    };
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await browser.close();
  }

  // (f) no errors.
  if (consoleErrors.length > 0) problems.push(`${consoleErrors.length} console error(s)`);
  if (pageErrors.length > 0) problems.push(`${pageErrors.length} page error(s)`);

  if (problems.length > 0) {
    console.error('TULIP HARNESS FAILURES:\n  - ' + problems.join('\n  - '));
    process.exitCode = 1;
  } else {
    console.log(
      `TULIPS OK: bouquet renders top-right at the right stage/count for 0/3/12; zoom-pinned (drift ${report.zoomPin.driftX}/${report.zoomPin.driftY}px across zoom ${report.zoomPin.minZoom}-${report.zoomPin.maxZoom}); gas-only level 2 (${report.negative.landings} landings, max ${report.negative.maxLandingRotationDeg} deg) awarded 0 — no false positives; count survives reloads; bodies == pre-tricks ${PRE_TRICKS_LEVEL2_BODIES}; no errors.`
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
