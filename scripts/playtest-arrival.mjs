// Automated browser playtest for the LEVEL 22 PARTY ARRIVAL — PLAN-09 task 1 /
// ST-5 (src/systems/arrival.ts). Structure follows scripts/playtest-level12.mjs
// (the other setInputOverride cutscene) and scripts/playtest-party.mjs (the most
// rigorous recent one): playwright-core driving system Chrome headless through
// window.__gabbyGame, screenshots to the gitignored playtest-out/, console +
// page errors collected AND gating the exit code. Requires `npm run dev` already
// running on :5173.
//
// This is where PLAN-09's "Level 22 finish flows: ride-in -> party -> credits
// with no dead ends" actually closes on the ride-in half.
//
// What it gates:
//   1. GAS-ONLY FINISH WITH THE ARRIVAL PLAYING: level 22 driven on gas alone
//      reaches PartyScene, having passed through ridingIn -> crawling ->
//      arrived, with zero restarts and no soft-fail.
//   2. THE CUTSCENE CARRIES A PLAYER WHO STOPS DEAD. A second drive brakes to a
//      genuine STANDSTILL short of the takeover point (asserted: speed ~0 and
//      the cutscene still in 'approaching'), then rolls forward into the
//      takeover and HOLDS THE BRAKE for the entire rest of the run. It must
//      still finish, and the bike must never come to rest again — the override
//      is what drives it in. (Proving the override WINS, not assuming it.)
//      The SETUP is retried if it fails to deliver the bike to the takeover at
//      all — braking that hard on rolling terrain can crash or bog the bike
//      down, which is ordinary gameplay and not the cutscene's doing. Nothing
//      after the takeover is ever retried; that is the part being judged.
//   3. THE RIDE-IN ENGAGES AND RELEASES. GameScene's inputOverride is non-null
//      and gas-true while the ride-in owns the pedals, and back to null once
//      onFinish() hands them over; the bike really does slow to the crawl speed
//      before the flag rather than blasting past the venue.
//   4. THE BEAT ACTUALLY RENDERS — objects and tween state, never elapsed time:
//      the venue's own GameObjects exist around the doorway, the door panels
//      really open (progress read off the LIVE panel scale), warm light really
//      spills (the pool's alpha), BOTH of them really dismount in the right
//      order (pillion Caleb first, then Gabby off her own bike) from ONE
//      measured resting x and WALK into the doorway, the standing Gabby really
//      is the player's own character texture, and both washes reach full alpha.
//   5. EXACTLY ONE GABBY AND ONE CALEB, at every sample of the whole run and
//      specifically on the frame Gabby steps off — a recursive census of the
//      live display list by texture key, not a flag. Two Gabbys is the one thing
//      this staging must never ship, and the seated rider is hidden through
//      bike.ts's cosmetic setRiderVisible seam to prevent it.
//   6. THE HAND-OFF: PartyScene becomes active and
//      gabby22.progress.completed[21] === true (GameScene's markLevelCompleted
//      still runs behind the finale hold).
//   7. LEVEL-22 MATTER BODY COUNT < 100 (it is the tightest level in the game at
//      99/100 — the arrival must add ZERO), and the total finish time reported.
//   8. Zero console/page errors throughout.
//
// Usage:
//   node scripts/playtest-arrival.mjs
//   PLAYTEST_URL=http://localhost:5174/ OUT_DIR=./shots node scripts/playtest-arrival.mjs
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const DEV_URL = process.env.PLAYTEST_URL ?? 'http://localhost:5173/';
const OUT_DIR = process.env.OUT_DIR ?? './playtest-out';
const DESIGN_W = 1280;
const DESIGN_H = 720;

// --- IN SYNC WITH src/systems/constants.ts's TOTAL_LEVELS + TEXTURE_KEYS.caleb,
// and with src/data/characters.ts's riderVariantKey format
// (`tex-gabby|<hair>|<eyes>|<outfit>`), which is the texture the BIKE'S RIDER
// renders with. Kept as literals, not imported — the convention every other
// scripts/playtest-*.mjs uses for structural constants it can only reach across
// the browser/CDP boundary. ---
const TOTAL_LEVELS = 22;
const CALEB_TEXTURE_KEY = 'tex-caleb';
const RIDER_TEXTURE_PREFIX = 'tex-gabby|';

/** NORTH_STAR §8 physics-body budget ("< 100 physics bodies per level"). */
const MAX_BODIES = 100;
/** Bike-x regression (px) between two polls that flags a fail-restart (spawn
 * warp-back) — same heuristic/threshold every other harness uses. */
const RESTART_WARP_PX = 1500;
const POLL_MS = 60;
const SETTLE_MS = 600;
const DRIVE_TIMEOUT_MS = 90_000;
/** Speed (px per physics step, BikeHandle units) at/below which the bike counts
 * as STOPPED DEAD for check 2. Generously above zero so a coarse poll still
 * catches the standstill; the bike's measured gas-only cruise on this level is
 * ~9.5 (this run reports its own figure as rideIn.cruiseSpeed). */
const STOPPED_SPEED = 0.35;
/** Where check 2 starts braking, as distances SHORT of the ride-in takeover
 * point, px — ONE PER ATTEMPT, tried in order. All are comfortably longer than
 * the bike's braking distance from its gas-only cruise (~200-370px measured), so
 * the standstill lands short of the takeover rather than racing it.
 *
 * WHY A LIST AND NOT A NUMBER: level 22 is rolling terrain (hilliness 0.38), and
 * a bike braked to a DEAD STOP part-way up a slope sometimes cannot climb it
 * again from rest under gas alone — a real player would roll back and take a
 * run-up; this harness simply brakes from somewhere else, which lands the
 * standstill on different ground instead of re-rolling the same slope. Retrying
 * the identical margin was measurably flaky (2 wasted attempts in one run).
 * NOTE this is entirely a property of the SETUP: the arrival has not taken the
 * pedals at this point and nothing here judges it. */
const STOP_MARGINS_PX = [700, 520, 900, 340, 1100];
/** The venue's GameObjects all sit within this of the doorway centre, px — the
 * window the "did the venue draw" census counts in, wide enough to include the
 * light pool (whose centre is offset back down the road). Level 22's nearest
 * ambient decoration is ~700px further back still, so nothing else can pad it. */
const VENUE_WINDOW_PX = 280;
/** Rectangles the venue draws around its doorway: body, roofline, 2 windows,
 * 7 roof bulbs, the lit interior, 2 door panels. A FLOOR, not an exact count. */
const MIN_VENUE_RECTS = 13;
/** IN SYNC WITH src/systems/constants.ts's DEPTHS.terrain (10) — the floor the
 * venue census counts ABOVE, so neither the ground itself nor the full-width
 * theme backdrop (DEPTHS.background) can pad it. */
const ABOVE_TERRAIN_DEPTH = 11;

async function waitForScene(page, key, timeout = 20_000) {
  await page.waitForFunction((k) => globalThis.__gabbyGame?.scene.isActive(k) === true, key, {
    timeout,
  });
}

/** Seed save so levels 1..upTo read as completed, then reload so the fresh page
 * boots against that progress. Level 22 needs level 12 completed for Caleb to be
 * riding pillion at spawn (save.ts's deriveCalebPickedUp) — which is the whole
 * premise of the dismount. */
async function seedProgressAndReload(page, upTo) {
  await page.evaluate(
    ({ upTo, total }) => {
      const completed = Array(total).fill(false);
      for (let i = 0; i < upTo; i++) completed[i] = true;
      localStorage.setItem(
        'gabby22.progress',
        JSON.stringify({ highestUnlocked: Math.min(upTo + 1, total), completed })
      );
    },
    { upTo, total: TOTAL_LEVELS }
  );
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForScene(page, 'TitleScene');
}

/** Enter level 22 fresh via the manager-level bypass (same as every other
 * harness — stops a stale terminal scene a previous run may have left active). */
async function startLevel22(page) {
  await page.evaluate(() => {
    const g = globalThis.__gabbyGame;
    for (const key of ['LevelCompleteScene', 'PartyScene', 'CreditsScene']) {
      if (g.scene.isActive(key)) g.scene.stop(key);
    }
    g.scene.start('GameScene', { level: 22 });
  });
  await waitForScene(page, 'GameScene');
  await page.waitForTimeout(SETTLE_MS);
}

function bodyCount(page) {
  return page.evaluate(
    () => globalThis.__gabbyGame.scene.getScene('GameScene').matter.world.getAllBodies().length
  );
}

/**
 * ONE atomic in-page read of everything a sample needs: the arrival's DEV
 * snapshot with its function fields evaluated, GameScene's live input override,
 * the bike, and a RECURSIVE VISIBLE-CHARACTER CENSUS of the display list.
 *
 * The census is what proves check 5. It walks Containers too (the standing Caleb
 * is one) and carries visibility/alpha down from every ancestor, exactly as the
 * renderer does — so a figure inside a faded-out container is correctly counted
 * as gone rather than as a duplicate.
 */
const READ = ({ riderPrefix, calebKey }) => {
  const g = globalThis.__gabbyGame;
  const s = g.scene.getScene('GameScene');
  const gameActive = g.scene.isActive('GameScene');
  const a = s && s.__arrival;

  let gabbyVisible = 0;
  let calebVisible = 0;
  if (gameActive && s.children) {
    const walk = (list, shown) => {
      for (const o of list) {
        const vis = shown && o.visible !== false && (o.alpha === undefined || o.alpha > 0.02);
        if (vis && o.type === 'Image' && o.texture && typeof o.texture.key === 'string') {
          if (o.texture.key.indexOf(riderPrefix) === 0) gabbyVisible++;
          else if (o.texture.key === calebKey) calebVisible++;
        }
        if (Array.isArray(o.list)) walk(o.list, vis);
      }
    };
    walk(s.children.list, true);
  }

  return {
    gameActive,
    partyActive: g.scene.isActive('PartyScene'),
    bikeX: gameActive && s.bike ? s.bike.x : null,
    speed: gameActive && s.bike ? s.bike.speed : null,
    velocityX: gameActive && s.bike ? s.bike.velocityX : null,
    // Chassis attitude + contact, so a fail can be diagnosed (a loop-out under
    // forced gas looks very different from a fall) instead of guessed at.
    angleDeg: gameActive && s.bike ? Math.round((s.bike.angle * 180) / Math.PI) : null,
    airborne: gameActive && s.bike ? s.bike.airborne : null,
    // null once the cutscene releases the pedals (player/GameScene back in charge).
    override: gameActive ? (s.inputOverride ?? null) : null,
    // A soft fail this run would stash its message here (GameScene.failLevel's
    // DEV seam) — the arrival must NEVER produce one.
    failMessage: gameActive && s.__fail ? s.__fail.message : null,
    hasArrival: Boolean(a),
    phase: a ? a.phase() : null,
    rideInX: a ? a.rideInX : null,
    crawlX: a ? a.crawlX : null,
    doorX: a ? a.doorX : null,
    finishX: a ? a.finishX : null,
    tookControl: a ? a.tookControl() : null,
    releasedControl: a ? a.releasedControl() : null,
    doorsOpen01: a ? a.doorsOpen01() : null,
    spillAlpha: a ? a.spillAlpha() : null,
    calebDismounted: a ? a.calebDismounted() : null,
    gabbyDismounted: a ? a.gabbyDismounted() : null,
    calebX: a ? a.calebX() : null,
    gabbyX: a ? a.gabbyX() : null,
    dismountAnchorX: a ? a.dismountAnchorX() : null,
    riderTextureKey: a ? a.riderTextureKey : null,
    washAlpha: a ? a.washAlpha() : null,
    duskAlpha: a ? a.duskAlpha() : null,
    finaleHoldMs: a ? a.finaleHoldMs : null,
    walkInDelayMs: a ? a.walkInDelayMs : null,
    gabbyVisible,
    calebVisible,
  };
};
const read = (page) =>
  page.evaluate(READ, { riderPrefix: RIDER_TEXTURE_PREFIX, calebKey: CALEB_TEXTURE_KEY });

/** Census of the venue's own GameObjects: everything on the display list whose x
 * lands in the doorway's neighbourhood. Observed from the display list rather
 * than trusted from a flag, and narrow enough that the level's balloons and
 * streamers (all >= 1000px back) can't pad it. */
const READ_VENUE = ({ doorX, windowPx, minDepth }) => {
  const s = globalThis.__gabbyGame.scene.getScene('GameScene');
  let rects = 0;
  let graphics = 0;
  for (const o of s.children.list) {
    // The depth floor keeps the ground itself and the theme BACKDROP (which
    // draws full-width bands at DEPTHS.background) out of the count, so this
    // really is a census of what the venue put at the doorway.
    if (typeof o.depth !== 'number' || o.depth < minDepth) continue;
    if (typeof o.x !== 'number' || Math.abs(o.x - doorX) > windowPx) continue;
    if (o.type === 'Rectangle') rects++;
    if (o.type === 'Graphics') graphics++;
  }
  return { rects, graphics };
};

/** Hold `next` for this poll, releasing whatever was held before. Returns the
 * new held key so the caller can thread it. The down() is re-issued every tick
 * even when unchanged (CDP has no OS key auto-repeat — the convention every
 * other harness follows), but the up() only fires on a real CHANGE, so a steady
 * hold is never momentarily released mid-drive. `null` releases everything. */
async function press(page, held, next) {
  if (held !== next && held) await page.keyboard.up(held);
  if (next) await page.keyboard.down(next);
  return next;
}

/**
 * Drives one level-22 attempt to PartyScene, sampling the whole way.
 *
 * `plan(sample, elapsedMs)` returns the key to hold for the NEXT tick
 * ('ArrowRight' = gas, 'ArrowLeft' = brake, null = hands off), so a caller can
 * script a profile (gas-only, brake-to-a-standstill, ...) without duplicating
 * the drive loop. Every sample is kept: the assertions below read the recording,
 * not a live page.
 */
async function drive(page, plan, shots = {}) {
  await startLevel22(page);
  const bodies = await bodyCount(page);

  const samples = [];
  const start = Date.now();
  let restarts = 0;
  let prevX = null;
  let finished = false;
  let held = null;
  const taken = new Set();

  while (Date.now() - start < DRIVE_TIMEOUT_MS) {
    const sample = await read(page);
    sample.atMs = Date.now() - start;
    samples.push(sample);

    if (sample.partyActive) {
      finished = true;
      break;
    }
    if (sample.bikeX !== null) {
      if (prevX !== null && sample.bikeX < prevX - RESTART_WARP_PX) restarts++;
      prevX = sample.bikeX;
    }
    // Opportunistic screenshots: the first sample matching each predicate.
    for (const [name, predicate] of Object.entries(shots)) {
      if (!taken.has(name) && predicate(sample)) {
        taken.add(name);
        await page.screenshot({ path: join(OUT_DIR, `${name}.png`) });
      }
    }
    // The arrival can never fail the player — bail promptly rather than burning
    // the timeout re-driving a run that has already proven the bug.
    if (restarts > 0) break;

    held = await press(page, held, plan(sample, Date.now() - start));
    await page.waitForTimeout(POLL_MS);
  }
  await press(page, held, null);

  return { bodies, samples, restarts, finished, seconds: Math.round((Date.now() - start) / 100) / 10 };
}

/**
 * Drives level 22 gas-only and STOPS the moment the finale is mid-flight (Caleb
 * off the bike, the light wash still pending). The caller then restarts the
 * level from under it — the teardown path a shutdown DURING the hold takes, with
 * tweens in flight and timed events still queued. Nothing may throw.
 */
async function driveToMidFinale(page) {
  await startLevel22(page);
  const start = Date.now();
  let held = null;
  let last = null;
  while (Date.now() - start < DRIVE_TIMEOUT_MS) {
    last = await read(page);
    // GABBY's dismount, not Caleb's: it is the later of the two AND the one that
    // leaves the seated rider hidden, which is the state this restart must prove
    // is recoverable.
    if (last.gabbyDismounted === true || last.partyActive) break;
    held = await press(page, held, 'ArrowRight');
    await page.waitForTimeout(POLL_MS);
  }
  await press(page, held, null);
  return last;
}

/** The last sample in which the GameScene (and so the arrival snapshot) was
 * still live — the finale's final observable state. */
function lastLive(samples) {
  for (let i = samples.length - 1; i >= 0; i--) {
    if (samples[i].hasArrival) return samples[i];
  }
  return null;
}

const maxOf = (samples, field) =>
  samples.reduce((m, s) => (typeof s[field] === 'number' && s[field] > m ? s[field] : m), 0);

async function readProgress(page) {
  return page.evaluate(() => {
    const raw = localStorage.getItem('gabby22.progress');
    return raw ? JSON.parse(raw) : null;
  });
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
    // Levels 1..21 complete -> Caleb rides pillion on 22 from spawn, which is
    // what the dismount takes off the bike. Also clears completed[21] so check 6
    // proves THIS run marked it.
    await seedProgressAndReload(page, 21);

    // ------------------------------------------------------------- (1) gas-only
    const gas = await drive(page, () => 'ArrowRight', {
      'arrival-ridein': (s) => s.phase === 'ridingIn',
      'arrival-doors': (s) => s.doorsOpen01 !== null && s.doorsOpen01 >= 0.98,
      'arrival-hopoff': (s) => s.gabbyDismounted === true && s.washAlpha < 0.05,
      // THE SHOT THE BEAT IS ABOUT: both of them IN the lit doorway at the end
      // of the walk, not still standing beside the bike. The old predicate
      // (doorX - 160) fired ~70px into a ~180px walk and archived exactly that
      // wrong frame. Gabby's walk ends AT the doorway centre, so waiting until
      // she is within a body's width of it catches the arrival itself; the
      // washAlpha guard keeps it before the light takes the screen.
      'arrival-walkin': (s) =>
        s.gabbyX !== null &&
        s.doorX !== null &&
        s.gabbyX > s.doorX - 24 &&
        s.washAlpha < 0.4,
      'arrival-wash': (s) => s.washAlpha !== null && s.washAlpha >= 0.5,
    });
    await page.screenshot({ path: join(OUT_DIR, 'arrival-party.png') });

    const phases = [...new Set(gas.samples.map((s) => s.phase).filter(Boolean))];
    const live = lastLive(gas.samples);
    const geometry = live
      ? { rideInX: live.rideInX, crawlX: live.crawlX, doorX: live.doorX, finishX: live.finishX }
      : null;

    if (!gas.finished) problems.push('gas-only level 22 never reached PartyScene');
    if (gas.restarts > 0) problems.push(`gas-only run restarted ${gas.restarts}x (the arrival must never fail the player)`);
    for (const wanted of ['approaching', 'ridingIn', 'crawling', 'arrived']) {
      if (!phases.includes(wanted)) problems.push(`the cutscene never entered the '${wanted}' phase`);
    }
    if (gas.samples.some((s) => s.failMessage !== null)) {
      problems.push(`the arrival soft-failed the player: ${JSON.stringify(gas.samples.find((s) => s.failMessage)?.failMessage)}`);
    }

    // ------------------------------------------------- (3) the ride-in engages
    const overrideSamples = gas.samples.filter((s) => s.override !== null);
    const gasHeldByCutscene = overrideSamples.filter((s) => s.override.gas === true).length;
    const brakeHeldByCutscene = overrideSamples.filter((s) => s.override.brake === true).length;
    const tookControlAtX = gas.samples.find((s) => s.tookControl === true)?.bikeX ?? null;
    const releasedSample = gas.samples.find((s) => s.releasedControl === true) ?? null;
    // The crawl's whole job: she must actually be slowed by the time she reaches
    // the flag, not blasting past the venue at cruise.
    const crossingSpeed = (() => {
      const inCrawl = gas.samples.filter((s) => s.phase === 'crawling' && s.speed !== null);
      return inCrawl.length > 0 ? inCrawl[inCrawl.length - 1].speed : null;
    })();
    const cruiseSpeed = maxOf(gas.samples, 'speed');

    if (!overrideSamples.length) problems.push('the ride-in never took the pedals (inputOverride stayed null)');
    if (gasHeldByCutscene === 0) problems.push('the ride-in never held GAS');
    if (tookControlAtX === null) problems.push('__arrival.tookControl never flipped');
    else if (geometry && (tookControlAtX < geometry.rideInX - 60 || tookControlAtX > geometry.crawlX)) {
      problems.push(`took the pedals at x=${Math.round(tookControlAtX)}, outside [rideInX ${geometry.rideInX}, crawlX ${geometry.crawlX}]`);
    }
    if (!releasedSample) problems.push('the cutscene never released the pedals (__arrival.releasedControl)');
    if (live && live.override !== null) {
      problems.push(`GameScene.inputOverride was still ${JSON.stringify(live.override)} at the hand-off (want null)`);
    }
    if (crossingSpeed === null || crossingSpeed > cruiseSpeed / 2) {
      problems.push(`the bike crossed the flag at ${crossingSpeed} px/step, not slowed from its ${Math.round(cruiseSpeed * 10) / 10} cruise`);
    }

    // ------------------------------------------------- (4) the beat rendered
    const venue = geometry
      ? await (async () => {
          // Read from the LAST live moment's scene — it is gone once PartyScene
          // takes over, so re-enter briefly and read the freshly built venue.
          await startLevel22(page);
          return page.evaluate(READ_VENUE, {
            doorX: geometry.doorX,
            windowPx: VENUE_WINDOW_PX,
            minDepth: ABOVE_TERRAIN_DEPTH,
          });
        })()
      : null;

    const doorsOpen = maxOf(gas.samples, 'doorsOpen01');
    const spillAlpha = maxOf(gas.samples, 'spillAlpha');
    const washAlpha = maxOf(gas.samples, 'washAlpha');
    const duskAlpha = maxOf(gas.samples, 'duskAlpha');
    const dismountSamples = gas.samples.filter((s) => s.calebDismounted === true && s.calebX !== null);
    const gabbySamples = gas.samples.filter((s) => s.gabbyDismounted === true && s.gabbyX !== null);

    // MEASURE THE WALK, NOT THE HOP. Diffing each figure's first sample against
    // its last folds in the hop DOWN off the bike — and since the two spawn at
    // different bike offsets (pillion vs rider), that made their totals differ
    // (245 vs 235) even though the walks themselves are provably identical,
    // which read in the OK line as though the equal-walk invariant had failed.
    // Windowing from ARRIVAL.walkInDelayMs after the finish measures the shared
    // walk alone. Both figures are read from the SAME sample objects, so their
    // start and end instants are identical and the two numbers are comparable.
    const finishAtMs = gas.samples.find((s) => s.phase === 'arrived')?.atMs ?? null;
    const walkStartMs =
      finishAtMs === null || live?.walkInDelayMs == null ? null : finishAtMs + live.walkInDelayMs;
    const walkSamples =
      walkStartMs === null ? [] : gas.samples.filter((s) => s.atMs >= walkStartMs);
    const walkedPx = (rows, field) => {
      const seen = rows.filter((s) => s[field] !== null);
      return seen.length > 1 ? Math.round(seen[seen.length - 1][field] - seen[0][field]) : null;
    };
    const calebWalkedPx = walkedPx(walkSamples, 'calebX');
    const gabbyWalkedPx = walkedPx(walkSamples, 'gabbyX');
    // Caleb (the pillion) must get off BEFORE Gabby (the rider) — the order the
    // beat is staged in, asserted from when each figure first exists.
    const calebFirstMs = dismountSamples.length > 0 ? dismountSamples[0].atMs : null;
    const gabbyFirstMs = gabbySamples.length > 0 ? gabbySamples[0].atMs : null;
    // Their landings are anchored to ONE sampled bike x, so the gap between
    // them is exact rather than drifting with the still-creeping bike. This is
    // deliberately NOT the bike's final resting x (reported separately as
    // rideIn.restX) — it is read a little before the bike settles.
    const measuredAnchorX = lastLive(gas.samples)?.dismountAnchorX ?? null;
    // The doors must be open BEFORE she crosses the flag — the venue opens up
    // ahead of her, it does not pop open behind her.
    const doorsOpenBeforeFinish = gas.samples.some((s) => s.phase === 'crawling' && s.doorsOpen01 >= 0.98);

    if (venue && venue.rects < MIN_VENUE_RECTS)
      problems.push(`the venue drew only ${venue.rects} rectangles around its doorway (want >= ${MIN_VENUE_RECTS})`);
    if (venue && venue.graphics < 1) problems.push('the doorway light pool (a Graphics) never drew');
    if (doorsOpen < 0.98) problems.push(`the doors only opened to ${Math.round(doorsOpen * 100)}%`);
    if (!doorsOpenBeforeFinish) problems.push('the doors were not open before the bike crossed the finish flag');
    if (spillAlpha <= 0) problems.push('no light ever spilled out of the doorway (pool alpha stayed 0)');
    if (dismountSamples.length === 0) problems.push('Caleb never hopped off (no standing Caleb was ever built)');
    if (gabbySamples.length === 0) problems.push('Gabby never got off the bike (no standing Gabby was ever built)');
    if (calebWalkedPx === null || calebWalkedPx <= 0)
      problems.push(`Caleb never walked toward the doorway (moved ${calebWalkedPx}px)`);
    if (gabbyWalkedPx === null || gabbyWalkedPx <= 0)
      problems.push(`Gabby never walked toward the doorway (moved ${gabbyWalkedPx}px)`);
    // THE EQUAL-WALK INVARIANT, LIVE. A unit test pins the two offset SUMS that
    // make it true; this proves it actually held on screen, which is what makes
    // them arrive side by side rather than one straggling.
    if (calebWalkedPx !== null && gabbyWalkedPx !== null && Math.abs(calebWalkedPx - gabbyWalkedPx) >= 4) {
      problems.push(
        `the two walks were not equal: Caleb ${calebWalkedPx}px vs Gabby ${gabbyWalkedPx}px — they do not cross the forecourt together`
      );
    }
    if (calebFirstMs === null || gabbyFirstMs === null || !(calebFirstMs < gabbyFirstMs))
      problems.push(`the pillion did not dismount first (Caleb at ${calebFirstMs}ms, Gabby at ${gabbyFirstMs}ms)`);
    if (measuredAnchorX === null)
      problems.push('the dismount never sampled the bike x it anchors both landings to');
    // She must be the PLAYER'S character, from the one-source-of-truth path —
    // the same `tex-gabby|<hair>|<eyes>|<outfit>` variant the seated rider uses.
    if (typeof live?.riderTextureKey !== 'string' || live.riderTextureKey.indexOf(RIDER_TEXTURE_PREFIX) !== 0)
      problems.push(`the standing Gabby's texture ${JSON.stringify(live?.riderTextureKey)} is not a character variant`);
    if (washAlpha < 0.99) problems.push(`the warm light wash only reached alpha ${washAlpha}`);
    if (duskAlpha < 0.99) problems.push(`the dusk wash only reached alpha ${duskAlpha}`);

    // ------------------------------- (5) exactly one Gabby and exactly one Caleb
    const cast = gas.samples.filter((s) => s.gameActive && s.hasArrival);
    const maxGabby = maxOf(cast, 'gabbyVisible');
    const maxCaleb = maxOf(cast, 'calebVisible');
    // THE FRAME THAT MATTERS is the one Gabby steps off on: the SEATED rider has
    // to go on exactly it, or the game shows a standing Gabby beside a riding
    // one. Checked at that instant specifically, as well as over the whole run.
    const swapFrame = gabbySamples.length > 0 ? gabbySamples[0] : null;
    if (maxGabby > 1) problems.push(`${maxGabby} Gabbys were visible at once`);
    if (maxCaleb > 1) problems.push(`${maxCaleb} Calebs were visible at once`);
    // Separate from the > 1 checks above so a duplicate reports as a DUPLICATE
    // rather than also as a nonsensical "never visible (max 2)".
    if (maxGabby === 0) problems.push('Gabby was never visible during the run');
    if (maxCaleb === 0) problems.push('Caleb was never visible during the run');
    if (swapFrame && (swapFrame.gabbyVisible !== 1 || swapFrame.calebVisible !== 1)) {
      problems.push(
        `on the frame Gabby stepped off, ${swapFrame.gabbyVisible} Gabby / ${swapFrame.calebVisible} Caleb were visible (want 1 / 1)`
      );
    }

    // ------------------------------------------------------- (6) the hand-off
    const progress = await readProgress(page);
    if (progress?.completed?.[21] !== true)
      problems.push('finishing level 22 did not mark gabby22.progress.completed[21]');

    // ------------------------------------- (2) the stop-dead-then-hands-off run
    // Brake to a genuine STANDSTILL short of the takeover, then roll into it and
    // hold the BRAKE for the whole rest of the run: the harshest thing a player
    // can do. The cutscene must carry them in regardless.
    let stoppedDead = false;
    let stoppedAtX = null;
    let nudged = false;
    let stopDeadSetupRetries = 0;
    let stopMarginPx = STOP_MARGINS_PX[0];
    const stopDeadFailMessages = [];
    const stopPlan = (s) => {
      if (s.bikeX === null) return 'ArrowRight';
      if (!stoppedDead) {
        const stopBy = (s.rideInX ?? Infinity) - stopMarginPx;
        if (s.bikeX < stopBy) return 'ArrowRight';
        if (s.speed !== null && s.speed <= STOPPED_SPEED && s.phase === 'approaching') {
          stoppedDead = true;
          stoppedAtX = s.bikeX;
          return 'ArrowRight'; // roll forward again, into the takeover
        }
        return 'ArrowLeft'; // brake to a standstill
      }
      if (!nudged) {
        if (s.tookControl === true) {
          nudged = true;
          return 'ArrowLeft'; // hands off gas from here on — brake only
        }
        return 'ArrowRight';
      }
      return 'ArrowLeft';
    };
    // RETRIED, because the SETUP can legitimately fail. Getting the bike to a
    // standstill means the harness braking hard from cruise on level 22's
    // rolling terrain, and a hard brake down a slope can crash — ordinary
    // gameplay (friendly fail, instant restart), nothing to do with the arrival,
    // which has not even taken the pedals yet. Retrying the scenario is honest;
    // blaming the cutscene for it would not be. A crash AFTER the takeover is a
    // different matter entirely and is asserted against below.
    let stopRun = null;
    for (const marginPx of STOP_MARGINS_PX) {
      stopMarginPx = marginPx;
      stoppedDead = false;
      stoppedAtX = null;
      nudged = false;
      stopRun = await drive(page, stopPlan, { 'arrival-stopped-dead': () => stoppedDead });
      for (const message of stopRun.samples.map((s) => s.failMessage).filter(Boolean)) {
        stopDeadFailMessages.push(message);
      }
      // Accept only once the SETUP has actually produced the scenario: the bike
      // genuinely stood still, AND the cutscene then took the pedals. Anything
      // else (crashed on the way down, bogged on a slope it braked itself onto,
      // or rolled past the takeover still moving) means there is nothing to
      // judge the arrival on yet — so try another brake point. Once it HAS taken
      // over, everything below is asserted for real and never retried.
      if (stoppedDead && stopRun.samples.some((s) => s.tookControl === true)) break;
      stopDeadSetupRetries++;
    }

    // Once the ride-in owns the pedals the bike must never come to rest again,
    // however hard the player brakes — that IS the carry-in.
    const carriedSamples = stopRun.samples.filter(
      (s) => s.tookControl === true && s.speed !== null && s.phase !== 'arrived'
    );
    const minCarriedSpeed = carriedSamples.reduce((m, s) => Math.min(m, s.speed), Infinity);

    if (!stoppedDead) problems.push('the stop-dead drive never actually brought the bike to a standstill');
    if (!stopRun.finished) problems.push('the stop-dead + brake-held drive never reached PartyScene');
    // Restarts and fails only count against the ARRIVAL once the arrival owns
    // the pedals. Before that the harness is just riding the level like anyone
    // else (and braking harder than anyone would), which the retry above covers.
    const failedUnderCutscene = stopRun.samples.some(
      (s) => s.failMessage !== null && s.tookControl === true
    );
    if (failedUnderCutscene)
      problems.push('the arrival soft-failed the player AFTER taking the pedals — it must never fail anyone');
    if (stopRun.restarts > 0 && stopRun.samples.some((s) => s.tookControl === true))
      problems.push(`the stop-dead drive restarted ${stopRun.restarts}x while the cutscene owned the pedals`);
    if (carriedSamples.length === 0) problems.push('the stop-dead drive never reached the ride-in takeover');
    else if (!(minCarriedSpeed > STOPPED_SPEED))
      problems.push(`the bike stalled to ${minCarriedSpeed} px/step while the cutscene was meant to be carrying it`);

    // ------------------------- (extra) teardown DURING the finale hold is clean
    // The one lifecycle the two drives above never exercise: a shutdown while
    // the finale's tweens are running and its timed events are still queued
    // (quitting to the menu, or a restart, mid-hold). Nothing may throw, and the
    // next entry must come up as a completely fresh 'approaching' run.
    // It is ALSO the only check that proves the borrowed BikeHandle.setRiderVisible
    // seam cannot strand the game with an invisible rider: the restart is taken
    // while the seated rider is hidden for the dismount, and the fresh run must
    // show exactly one Gabby again.
    const midFinale = await driveToMidFinale(page);
    const errorsBeforeRestart = consoleErrors.length + pageErrors.length;
    await startLevel22(page);
    const afterRestart = await read(page);
    const bodiesAfterRestart = await bodyCount(page);
    const errorsFromRestart = consoleErrors.length + pageErrors.length - errorsBeforeRestart;

    if (midFinale?.gabbyDismounted !== true)
      problems.push('the mid-finale restart check never actually caught the finale in flight');
    if (afterRestart.gabbyVisible !== 1 || afterRestart.calebVisible !== 1)
      problems.push(
        `after a restart taken while the SEATED rider was hidden, ${afterRestart.gabbyVisible} Gabby / ${afterRestart.calebVisible} Caleb are visible (want 1 / 1 — an invisible rider would be unplayable)`
      );
    if (!afterRestart.gameActive || afterRestart.phase !== 'approaching')
      problems.push(`after a mid-finale restart the arrival came up as '${afterRestart.phase}' (want a fresh 'approaching')`);
    if (afterRestart.partyActive) problems.push('a mid-finale restart still fell through to PartyScene');
    if (afterRestart.override !== null)
      problems.push(`a mid-finale restart left inputOverride ${JSON.stringify(afterRestart.override)}`);
    if (afterRestart.calebDismounted !== false)
      problems.push('a mid-finale restart left the dismounted Caleb behind');
    if (errorsFromRestart > 0) problems.push(`${errorsFromRestart} error(s) fired during the mid-finale restart`);

    // ----------------------------------------------------------- (7) the budget
    const maxBodies = Math.max(gas.bodies, stopRun.bodies, bodiesAfterRestart);
    if (maxBodies >= MAX_BODIES) problems.push(`body count ${maxBodies} >= ${MAX_BODIES}`);

    report = {
      gasOnly: {
        finished: gas.finished,
        seconds: gas.seconds,
        restarts: gas.restarts,
        phases,
        bodies: gas.bodies,
      },
      geometry,
      rideIn: {
        tookControlAtX: tookControlAtX === null ? null : Math.round(tookControlAtX),
        overrideSamples: overrideSamples.length,
        gasHeldByCutscene,
        brakeHeldByCutscene,
        releasedControl: Boolean(releasedSample),
        overrideAtHandOff: live ? live.override : null,
        cruiseSpeed: Math.round(cruiseSpeed * 100) / 100,
        speedAtFlag: crossingSpeed === null ? null : Math.round(crossingSpeed * 100) / 100,
        restX: live && live.bikeX !== null ? Math.round(live.bikeX) : null,
      },
      finale: {
        venue,
        doorsOpen01: Math.round(doorsOpen * 100) / 100,
        doorsOpenBeforeFinish,
        spillAlpha: Math.round(spillAlpha * 100) / 100,
        calebDismounted: dismountSamples.length > 0,
        gabbyDismounted: gabbySamples.length > 0,
        // How long AFTER Caleb was Gabby first seen off the bike (the polled
        // approximation of ARRIVAL.gabbyOffDelayMs - hopOffDelayMs). Positive
        // is the whole point: the pillion gets off first.
        gabbyAfterCalebMs:
          calebFirstMs === null || gabbyFirstMs === null ? null : gabbyFirstMs - calebFirstMs,
        measuredAnchorX: measuredAnchorX === null ? null : Math.round(measuredAnchorX),
        standingGabbyTexture: live ? live.riderTextureKey : null,
        calebWalkedPx,
        gabbyWalkedPx,
        washAlpha: Math.round(washAlpha * 100) / 100,
        duskAlpha: Math.round(duskAlpha * 100) / 100,
        finaleHoldMs: live ? live.finaleHoldMs : null,
      },
      cast: { maxGabbyVisible: maxGabby, maxCalebVisible: maxCaleb },
      stopDead: {
        stoppedAtX: stoppedAtX === null ? null : Math.round(stoppedAtX),
        finished: stopRun.finished,
        seconds: stopRun.seconds,
        restarts: stopRun.restarts,
        // Setup crashes (harness braking too hard, before the takeover) that
        // forced a retry — reported so a rise in them is visible rather than
        // silently absorbed.
        setupRetries: stopDeadSetupRetries,
        brakedFromPxShortOfTakeover: stopMarginPx,
        // Across ALL attempts, so a setup that keeps crashing is visible rather
        // than discarded with the attempt that produced it.
        failMessages: [...new Set(stopDeadFailMessages)],
        // The state the accepted attempt was in when it first failed, if it did.
        failedAt: (() => {
          const s = stopRun.samples.find((x) => x.failMessage !== null);
          return s
            ? {
                x: s.bikeX === null ? null : Math.round(s.bikeX),
                speed: s.speed === null ? null : Math.round(s.speed * 100) / 100,
                angleDeg: s.angleDeg,
                airborne: s.airborne,
                phase: s.phase,
                tookControl: s.tookControl,
                message: s.failMessage,
              }
            : null;
        })(),
        lastBikeX: (() => {
          const xs = stopRun.samples.map((s) => s.bikeX).filter((x) => x !== null);
          return xs.length > 0 ? Math.round(xs[xs.length - 1]) : null;
        })(),
        maxBikeX: (() => {
          const xs = stopRun.samples.map((s) => s.bikeX).filter((x) => x !== null);
          return xs.length > 0 ? Math.round(Math.max(...xs)) : null;
        })(),
        minSpeedWhileCarried:
          minCarriedSpeed === Infinity ? null : Math.round(minCarriedSpeed * 100) / 100,
      },
      midFinaleRestart: {
        // GABBY's dismount, matching the gate above and driveToMidFinale's own
        // predicate — hers is the one that leaves the seated rider hidden, which
        // is the state this restart exists to prove recoverable.
        caughtInFlight: midFinale?.gabbyDismounted === true,
        phaseAfter: afterRestart.phase,
        bodiesAfter: bodiesAfterRestart,
        errors: errorsFromRestart,
      },
      completed21: progress?.completed?.[21] === true,
      maxBodies,
      maxBodiesBudget: MAX_BODIES,
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
    console.error('ARRIVAL HARNESS FAILURES:\n  - ' + problems.join('\n  - '));
    process.exitCode = 1;
  } else {
    const r = report;
    console.log(
      `ARRIVAL OK: level 22 gas-only finishes in ${r.gasOnly.seconds}s through ${r.gasOnly.phases.join(' -> ')}; ` +
        `the ride-in takes the pedals at x=${r.rideIn.tookControlAtX} (rideInX ${r.geometry.rideInX}), ` +
        `slows her from ${r.rideIn.cruiseSpeed} to ${r.rideIn.speedAtFlag} px/step by the flag (${r.geometry.finishX}) ` +
        `and rolls her to rest at x=${r.rideIn.restX} in front of the doors (${r.geometry.doorX}), then releases the override to null; ` +
        `the venue drew ${r.finale.venue.rects} rects + ${r.finale.venue.graphics} Graphics, its doors opened to ` +
        `${Math.round(r.finale.doorsOpen01 * 100)}% BEFORE the flag with light spilling to alpha ${r.finale.spillAlpha}, ` +
        `Caleb hopped off first and Gabby (as "${r.finale.standingGabbyTexture}") ${r.finale.gabbyAfterCalebMs}ms later, ` +
        `both anchored to the sampled dismount x ${r.finale.measuredAnchorX} and walking equal ` +
        `${r.finale.calebWalkedPx}/${r.finale.gabbyWalkedPx}px into the doorway together, and the warm+dusk washes reached ` +
        `${r.finale.washAlpha}/${r.finale.duskAlpha} over the ${r.finale.finaleHoldMs}ms hold; ` +
        `exactly ${r.cast.maxGabbyVisible} Gabby and ${r.cast.maxCalebVisible} Caleb visible throughout, including the ` +
        `frame she steps off; ` +
        `a player who STOPPED DEAD at x=${r.stopDead.stoppedAtX} and then held the BRAKE was still carried in ` +
        `(never below ${r.stopDead.minSpeedWhileCarried} px/step) and finished in ${r.stopDead.seconds}s; ` +
        `a restart taken mid-dismount tore down cleanly, came back up '${r.midFinaleRestart.phaseAfter}' and put the ` +
        `seated rider back; ` +
        `completed[21]=${r.completed21}; ${r.maxBodies} Matter bodies < ${r.maxBodiesBudget}; no errors.`
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
