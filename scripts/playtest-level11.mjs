// Automated browser playtest for LEVEL 11 — the wheelie-rider easter egg
// (PLAN-07 task 2, src/systems/wheelieRider.ts). Clones scripts/playtest-level15
// .mjs's structure (playwright-core system Chrome headless, drives via
// window.__gabbyGame, screenshots to playtest-out/, gates the process exit code).
// Requires `npm run dev` running on :5173.
//
// Proves the things the task requires of the wheelie-rider system:
//   (a) a GAS-ONLY run of level 11 spawns the rider exactly once (spawn count
//       === 1), it first appears BEHIND the player (rider.x < bike.x at/soon
//       after spawn), it overtakes (rider.x crosses bike.x while both are
//       moving), it exits ahead and DESPAWNS (its GameObjects are actually gone
//       from the display list, not just a self-reported flag), and the level
//       still finishes gas-only with NO crash-restarts;
//   (b) a screenshot mid-overtake, for a human to visually confirm: all-black
//       rider + helmet, yellow bike, front wheel up (the wheelie), dust;
//   (c) ZERO physics interference — the Matter body count during the pass
//       equals the baseline captured before the rider spawned (no bodies
//       added), and the run finishes;
//   (d) an ABSENCE check — briefly driving a DIFFERENT level (10) never shows
//       the __wheelieRider debug snapshot at all;
//   (e) 0 console/page errors.
//
// Usage:
//   node scripts/playtest-level11.mjs
//   PLAYTEST_URL=http://localhost:5174/ OUT_DIR=./shots node scripts/playtest-level11.mjs
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const DEV_URL = process.env.PLAYTEST_URL ?? 'http://localhost:5173/';
const OUT_DIR = process.env.OUT_DIR ?? './playtest-out';
const DESIGN_W = 1280;
const DESIGN_H = 720;

// --- IN SYNC WITH src/levels/level11.ts's WheelieRiderEvent x. ---
const LEVEL_11 = 11;
// Any level WITHOUT a wheelieRider event, for the absence check. IN SYNC WITH
// src/levels/types.ts's REQUIRED_EVENTS (only level 11 requires wheelieRider).
const LEVEL_10 = 10;

const MAX_BODIES = 100;
const RESTART_WARP_PX = 1500;
const POLL_MS = 100;
const SETTLE_MS = 600;
const GASONLY_TIMEOUT_MS = 60_000;
const ABSENCE_DRIVE_MS = 5_000;
// How close (px) rider.x and bike.x must be before we snap the "mid-overtake"
// screenshot — close enough that the two bikes read as passing each other.
const OVERTAKE_SCREENSHOT_DISTANCE_PX = 250;

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
 * playtest-levels.mjs / playtest-level15.mjs — stops a stale
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

/** Atomic in-page read of the level-11 wheelie-rider state (off the DEV
 * __wheelieRider snapshot). */
const READ_L11 = () => {
  const g = globalThis.__gabbyGame;
  const s = g.scene.getScene('GameScene');
  const wr = s.__wheelieRider;
  return {
    complete: g.scene.isActive('LevelCompleteScene'),
    active: g.scene.isActive('GameScene'),
    bikeX: s.bike ? s.bike.x : null,
    hasWheelieRider: Boolean(wr),
    spawnCount: wr ? wr.spawnCount() : null,
    riderActive: wr ? wr.active() : null,
    despawned: wr ? wr.despawned() : null,
    riderX: wr ? wr.riderX() : null,
    triggerX: wr ? wr.triggerX : null,
    bikeTextureKey: wr ? wr.bikeTextureKey : null,
    riderTextureKey: wr ? wr.riderTextureKey : null,
  };
};

/** Whether the scene's display list still contains a visible Image using
 * `textureKey` — the concrete "GameObjects destroyed" cross-check (not just
 * trusting the self-reported `despawned()` flag). */
function hasImageWithTexture(page, textureKey) {
  return page.evaluate((key) => {
    const g = globalThis.__gabbyGame;
    if (!g.scene.isActive('GameScene')) return false; // scene moved on (finished) -- nothing to find either way
    const s = g.scene.getScene('GameScene');
    const list = s.children && s.children.list ? s.children.list : [];
    // The rig's Images live inside a Container, not as top-level scene
    // children -- walk one level of container.list too.
    const flat = [];
    for (const obj of list) {
      flat.push(obj);
      if (Array.isArray(obj.list)) flat.push(...obj.list);
    }
    return flat.some((o) => o.type === 'Image' && o.texture && o.texture.key === key);
  }, textureKey);
}

/** Drive level 11 GAS-ONLY to completion, observing the whole wheelie-rider
 * pass: spawn (exactly once, behind the player), overtake (crosses bike.x),
 * despawn (GameObjects actually gone), zero added Matter bodies, and a clean
 * gas-only finish. */
async function driveLevel11(page) {
  await startLevel(page, LEVEL_11);
  await page.screenshot({ path: join(OUT_DIR, 'level11-spawn-area.png') });
  const bodiesBaseline = await bodyCount(page);

  const start = Date.now();
  let finished = false;
  let restarts = 0;
  let prevX = null;
  let maxSpawnCount = 0;
  let sawBehind = false;
  let sawCrossed = false;
  let sawDespawnedFlag = false;
  let bodiesDuringPass = null;
  let screenshotTaken = false;
  let textureKeys = null;

  while (Date.now() - start < GASONLY_TIMEOUT_MS) {
    await page.keyboard.down('ArrowRight');
    const st = await page.evaluate(READ_L11);

    if (st.bikeX !== null) {
      if (prevX !== null && st.bikeX < prevX - RESTART_WARP_PX) restarts++;
      prevX = st.bikeX;
    }

    if (typeof st.spawnCount === 'number') maxSpawnCount = Math.max(maxSpawnCount, st.spawnCount);

    if (!textureKeys && st.bikeTextureKey && st.riderTextureKey) {
      textureKeys = { bike: st.bikeTextureKey, rider: st.riderTextureKey };
    }

    if (st.riderActive && typeof st.riderX === 'number' && typeof st.bikeX === 'number') {
      if (st.riderX < st.bikeX) sawBehind = true;
      if (sawBehind && st.riderX >= st.bikeX) sawCrossed = true;

      if (bodiesDuringPass === null) {
        bodiesDuringPass = await bodyCount(page);
      }

      if (!screenshotTaken && Math.abs(st.riderX - st.bikeX) < OVERTAKE_SCREENSHOT_DISTANCE_PX) {
        await page.screenshot({ path: join(OUT_DIR, 'level11-overtake.png') });
        screenshotTaken = true;
      }
    }

    if (st.despawned) sawDespawnedFlag = true;

    if (st.complete) {
      finished = true;
      break;
    }
    await page.waitForTimeout(POLL_MS);
  }
  await page.keyboard.up('ArrowRight');

  // Concrete "GameObjects destroyed" cross-check, not just the self-reported
  // flag: neither the yellow-bike nor the bespoke rider texture should still
  // be present anywhere in the display list once despawned.
  let objectsGoneAfterDespawn = null;
  if (sawDespawnedFlag && textureKeys) {
    const stillHasBike = await hasImageWithTexture(page, textureKeys.bike);
    const stillHasRider = await hasImageWithTexture(page, textureKeys.rider);
    objectsGoneAfterDespawn = !stillHasBike && !stillHasRider;
  }

  return {
    finished,
    restarts,
    bodiesBaseline,
    bodiesDuringPass,
    maxSpawnCount,
    sawBehind,
    sawCrossed,
    sawDespawnedFlag,
    objectsGoneAfterDespawn,
    screenshotTaken,
    textureKeys,
    driveSeconds: Math.round((Date.now() - start) / 100) / 10,
  };
}

/** Drive a DIFFERENT level (10) briefly and confirm the wheelie-rider debug
 * snapshot never activates there — level 11's egg must never appear anywhere
 * else (NORTH_STAR §5 / src/levels/types.ts's REQUIRED_EVENTS). */
async function checkAbsenceOnOtherLevel(page) {
  await startLevel(page, LEVEL_10);
  const start = Date.now();
  let sawWheelieRider = false;

  while (Date.now() - start < ABSENCE_DRIVE_MS) {
    await page.keyboard.down('ArrowRight');
    const present = await page.evaluate(() => {
      const g = globalThis.__gabbyGame;
      if (!g.scene.isActive('GameScene')) return false;
      const s = g.scene.getScene('GameScene');
      return Boolean(s.__wheelieRider);
    });
    if (present) sawWheelieRider = true;
    await page.waitForTimeout(POLL_MS);
  }
  await page.keyboard.up('ArrowRight');

  return { sawWheelieRider };
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

    const pass = await driveLevel11(page);
    const absence = await checkAbsenceOnOtherLevel(page);

    report = {
      pass,
      absence,
      maxBodiesBudget: MAX_BODIES,
      consoleErrors,
      pageErrors,
    };
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await browser.close();
  }

  // --- gate the exit code ---
  const problems = [];
  const p = report.pass;

  if (!p.finished) problems.push('level 11 gas-only run did not finish');
  if (p.restarts > 0) problems.push(`level 11 gas-only run restarted ${p.restarts}x (unexpected crash)`);
  if (p.maxSpawnCount !== 1) problems.push(`rider spawn count was ${p.maxSpawnCount}, expected exactly 1`);
  if (!p.sawBehind) problems.push('rider was never observed behind the bike (rider.x < bike.x)');
  if (!p.sawCrossed) problems.push('rider was never observed overtaking (crossing bike.x)');
  if (!p.sawDespawnedFlag) problems.push('rider never despawned');
  if (p.objectsGoneAfterDespawn === null) {
    problems.push('could not verify GameObjects were destroyed after despawn (missing texture keys)');
  } else if (!p.objectsGoneAfterDespawn) {
    problems.push('wheelie-rider GameObjects (bike/rider textures) are still present in the scene after despawn');
  }
  if (p.bodiesDuringPass === null) {
    problems.push('never captured a Matter body-count sample during the pass');
  } else if (p.bodiesDuringPass !== p.bodiesBaseline) {
    problems.push(
      `Matter body count changed during the pass (${p.bodiesBaseline} -> ${p.bodiesDuringPass}) — the wheelie rider must add ZERO Matter bodies`
    );
  }
  if (p.bodiesBaseline >= MAX_BODIES || (p.bodiesDuringPass ?? 0) >= MAX_BODIES) {
    problems.push(`body count >= ${MAX_BODIES} (NORTH_STAR §8 budget)`);
  }
  if (!p.screenshotTaken) problems.push('never captured the mid-overtake screenshot');

  if (report.absence.sawWheelieRider) {
    problems.push('the wheelie-rider debug snapshot activated on level 10 -- the egg must never appear outside level 11');
  }

  if (report.consoleErrors.length > 0) problems.push(`${report.consoleErrors.length} console error(s)`);
  if (report.pageErrors.length > 0) problems.push(`${report.pageErrors.length} page error(s)`);

  if (problems.length > 0) {
    console.error('LEVEL 11 HARNESS FAILURES:\n  - ' + problems.join('\n  - '));
    process.exitCode = 1;
  } else {
    console.log(
      `LEVEL 11 OK: rider spawned exactly once, first behind the bike, overtook, despawned (GameObjects confirmed gone); ` +
        `bodies unchanged during the pass (${p.bodiesBaseline}); gas-only finish in ${p.driveSeconds}s with 0 restarts; ` +
        `absent on level ${LEVEL_10}; no errors.`
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
