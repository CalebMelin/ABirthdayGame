// The party BALLOONS (PLAN-09 ST-2) — PLAN-09 task 2's "Lots of balloons
// (floating, bobbing, varied colors - at least 20)" and "balloons are
// tappable/clickable and pop with confetti; endless supply floats in".
//
// MODEL: a FIXED POOL of PARTY.balloonCount balloons, allocated once in
// createPartyBalloons and recycled forever — nothing is allocated per frame or
// per pop, so the "endless supply" is free. Each balloon drifts UPWARD at its
// own speed while swaying sideways on its own period/phase; once its knot
// clears the top edge it recycles from just below the BOTTOM edge with a fresh
// color, x, speed and sway. A tap or click pops it: the balloon vanishes behind
// a radial confetti burst (systems/confetti.ts) and floats back in from below
// after PARTY.balloonRespawnDelayMs.
//
// MOTION IS A PURE FUNCTION OF TIME, not an accumulator: each balloon stores the
// scene time and knot y it (re)entered at, and every frame recomputes
// `spawnY - riseSpeed * elapsed` plus a sine sway. That is EXACTLY frame-rate
// independent by construction (no per-frame integration error to accumulate at
// 120Hz) and makes the whole motion model unit-testable in plain Node — see
// balloonRiseY / balloonSwayOffsetPx / shouldRecycleBalloon below.
//
// HIT AREAS are DECOUPLED from the drawn balloon, following pedals.ts's
// visible-face-vs-hit-Zone split and CHARACTER_CREATE.swatchHitSizePx's doc: the
// placeholder balloon draws only ~58x77 px, so each one gets its own invisible
// PARTY.balloonHitSizePx (== UI_MIN_TOUCH_PX, 88) Zone centred on its body. At
// 30 balloons those Zones DO overlap, so one press could otherwise pop two
// balloons at once; every press is therefore deduped by (pointer id, press
// time) — see popEventKey / isDuplicatePopEvent. Popping is idempotent besides:
// an already-popped balloon ignores further presses AND has its Zone's input
// disabled, so it can't swallow a tap meant for a balloon behind it.
//
// ZERO Matter bodies: a balloon is a Container of a tinted Image + a string
// Rectangle over a plain Zone, exactly like decorations.ts's static balloons
// (whose drawBalloon this follows: tint the shared 24x32 tex-balloon placeholder
// rather than generating recolored textures, and hang a short string rect from
// the knot). Nothing here touches NORTH_STAR §8's <100-body budget.
//
// DEPTH: balloons sit at PARTY.balloonDepth (DEPTHS.fx + 1), above the ambient
// confetti rain and above the whole cast — ST-1 kept PARTY.nameTagDepth strictly
// BELOW DEPTHS.fx precisely so this layer could sit above it (see that
// constant's doc). The pop puffs draw one layer higher again.
//
// Like partyCast.ts / confetti.ts (and UNLIKE ui.ts), this module has NO runtime
// Phaser import: `import type Phaser` is erased at compile time
// (verbatimModuleSyntax + erasableSyntaxOnly), so it cannot use
// Phaser.Math.Between and instead takes an injectable `rng: () => number`
// defaulting to Math.random (the randomCharacterConfig precedent in
// data/characters.ts). The pure helpers below are unit-tested in plain Node
// (tests/partyBalloons.test.ts); createPartyBalloons only ever CALLS METHODS on
// the runtime `scene` handle it is given (same contract as createBike).
//
// FORWARD-NOTE — AUDIO IS PLAN-10's, NOT THIS SUBTASK'S: the balloon-pop SFX
// hooks in at the ONE `pop()` call site below (marked there), right beside the
// confetti burst. Deliberately nothing audio-related exists here yet.
import type Phaser from 'phaser';
import { DESIGN_HEIGHT, DESIGN_WIDTH, PALETTE, PARTY, TEXTURE_KEYS } from './constants';
import { createConfettiBurst } from './confetti';
import type { ConfettiBurstHandle } from './confetti';

// ---------------------------------------------------------------------------
// Presentation-only local constants (PLACEHOLDER art). Following the
// decorations.ts / pickup.ts / partyCast.ts precedent, the DRAWING dimensions of
// throwaway placeholder sprites stay here rather than in constants.ts — PLAN-10
// replaces this art wholesale. The FEEL/LAYOUT tunables (count, speeds, sway,
// margins, hit size, depths, pop timing) live in constants.ts's PARTY block.
// ---------------------------------------------------------------------------

/** Matches the HEIGHT of BootScene's tex-balloon placeholder (24x32). Only the
 * height is needed here — it is what offsets the hit area from the knot (see
 * balloonHitCenterY); the width never enters a calculation, since the hit area
 * is a fixed PARTY.balloonHitSizePx square. */
const BALLOON_TEXTURE_HEIGHT_PX = 32;
/** Scale-up so the placeholder reads as a balloon — the SAME 2.4 the static
 * level decorations use (decorations.ts's BALLOON_SCALE), so a party balloon and
 * a level-20 backdrop balloon are the same size. */
const BALLOON_SCALE = 2.4;
/** The short string hanging DOWN from the knot (decorations.ts's convention). */
const BALLOON_STRING_WIDTH_PX = 3;
const BALLOON_STRING_LENGTH_PX = 40;

/** Drawn balloon body height in screen px (the hit area is centred on it). */
const BALLOON_BODY_HEIGHT_PX = BALLOON_TEXTURE_HEIGHT_PX * BALLOON_SCALE;

/**
 * Balloon tints — "varied colors" (PLAN-09 task 2). The full cheerful pastel
 * family plus the two warm theme tones, so a wall of 30 balloons never reads as
 * three colors repeated ten times. A color SET is presentation content rather
 * than a tunable number (the LEVEL_COMPLETE / decorations.ts precedent), which
 * is why it lives beside the code that draws it instead of in constants.ts.
 * Exported so tests can assert the variety without re-listing the colors.
 */
export const BALLOON_TINTS: readonly number[] = [
  PALETTE.coral,
  PALETTE.sunshine,
  PALETTE.mint,
  PALETTE.sky,
  PALETTE.lavender,
  PALETTE.grass,
  PALETTE.bgPink,
  PALETTE.sunsetGlow,
];

// ---------------------------------------------------------------------------
// Pure helpers — no Phaser/Matter/DOM. Unit-tested in
// tests/partyBalloons.test.ts.
// ---------------------------------------------------------------------------

/**
 * A balloon's knot y after `elapsedMs` of rising from `spawnY`. Screen y grows
 * downward, so rising SUBTRACTS. Closed form rather than an accumulator, which
 * is what makes the drift exactly refresh-independent (see the module doc).
 */
export function balloonRiseY(spawnY: number, riseSpeedPxPerSec: number, elapsedMs: number): number {
  return spawnY - riseSpeedPxPerSec * (elapsedMs / 1000);
}

/**
 * The sideways sway offset, px, at `elapsedMs` into a balloon's flight — a
 * plain sine of amplitude `amplitudePx` and period `periodMs`, offset by this
 * balloon's own `phase01` (a fraction of a cycle) so no two balloons sway in
 * step. Pure and total: a non-positive period returns 0 rather than dividing by
 * zero.
 *
 * Deliberately a SMOOTH sine, unlike partyCast.ts's deliberately 2-frame
 * castBounceOffsetPx: a person's idle bounce is pixel-art-honest animation, but
 * a balloon on a string genuinely drifts, and a hard 2-frame flip at these
 * amplitudes reads as a glitch rather than as motion.
 */
export function balloonSwayOffsetPx(
  elapsedMs: number,
  phase01: number,
  amplitudePx: number,
  periodMs: number
): number {
  if (!(periodMs > 0)) return 0;
  return amplitudePx * Math.sin(2 * Math.PI * (elapsedMs / periodMs + phase01));
}

/** Whether a balloon has fully cleared the top edge and should recycle from
 * below. `recycleAboveY` is NEGATIVE (above the screen). Pure — the one place
 * the recycle rule is defined. */
export function shouldRecycleBalloon(knotY: number, recycleAboveY: number): boolean {
  return knotY < recycleAboveY;
}

/** The y a balloon's HIT AREA centres on, given its knot y: the middle of the
 * drawn body, which floats ABOVE the knot. Pure, and the one place the
 * visible-face/hit-area offset is computed. */
export function balloonHitCenterY(knotY: number, bodyHeightPx = BALLOON_BODY_HEIGHT_PX): number {
  return knotY - bodyHeightPx / 2;
}

/**
 * A stable key for ONE physical press. Phaser dispatches a separate
 * `pointerdown` to every interactive object under the pointer that passes its
 * hit test, and at 30 balloons with 88px hit areas two of them WILL overlap — so
 * without this, one thumb could pop two balloons. Both dispatches carry the same
 * pointer id and the same `downTime`, so the pair uniquely identifies the press.
 */
export function popEventKey(pointerId: number, downTimeMs: number): string {
  return `${pointerId}:${downTimeMs}`;
}

/** Whether this press was already spent on another balloon (see popEventKey).
 * A null `lastKey` means nothing has been popped yet. Pure. */
export function isDuplicatePopEvent(lastKey: string | null, key: string): boolean {
  return lastKey !== null && lastKey === key;
}

/** Everything randomised when a balloon (re)enters: where it comes in, how fast
 * it rises, how it sways, and what color it is. Plain data (no Phaser), so the
 * whole spawn distribution is assertable in Node. */
export interface BalloonSpawn {
  /** Base centre x, px — the sway is applied on top of this each frame. */
  readonly baseX: number;
  /** The knot y it enters at, px. */
  readonly spawnY: number;
  readonly riseSpeedPxPerSec: number;
  readonly swayAmplitudePx: number;
  readonly swayPeriodMs: number;
  /** This balloon's own offset into the sway cycle, 0..1. */
  readonly swayPhase01: number;
  readonly tint: number;
}

/** How a balloon is entering the scene. `'initial'` seeds the pool ALREADY
 * SPREAD across the screen (so the very first frame is a full party, not an
 * empty room slowly filling); `'recycle'` brings one back in from just below the
 * bottom edge. An `as const` union — this project forbids TS enums. */
export type BalloonSpawnMode = 'initial' | 'recycle';

/** Maps a uniform draw onto `[min, max]` — the one place this module turns
 * randomness into a number. */
function rangeAt(u01: number, min: number, max: number): number {
  return min + u01 * (max - min);
}

/**
 * Rolls one balloon's entry. PURE given `rng` (0 <= rng() < 1), so
 * tests/partyBalloons.test.ts can pin every bound: x always inside
 * PARTY.balloonSpawnMarginPx of both edges, rise/sway inside their configured
 * ranges, tint always from BALLOON_TINTS, and a `'recycle'` spawn always BELOW
 * the bottom edge.
 *
 * UNLIKE partyCast.ts's deliberately deterministic layout (a group photo must
 * look identical on every visit, so it never touches Math.random), the balloons
 * ARE random: they are weather, not staging — a pool that recycled to fixed
 * positions would visibly re-form into rows within a minute.
 */
export function balloonSpawn(rng: () => number, mode: BalloonSpawnMode): BalloonSpawn {
  const margin = PARTY.balloonSpawnMarginPx;
  return {
    baseX: rangeAt(rng(), margin, DESIGN_WIDTH - margin),
    spawnY:
      mode === 'initial'
        ? // Seeded across the whole screen plus the entry band below it.
          rng() * (DESIGN_HEIGHT + PARTY.balloonSpawnBelowPx)
        : DESIGN_HEIGHT + PARTY.balloonSpawnBelowPx,
    riseSpeedPxPerSec: rangeAt(rng(), PARTY.balloonRiseMinPxPerSec, PARTY.balloonRiseMaxPxPerSec),
    swayAmplitudePx: rangeAt(rng(), PARTY.balloonSwayMinPx, PARTY.balloonSwayMaxPx),
    swayPeriodMs: rangeAt(rng(), PARTY.balloonSwayMinPeriodMs, PARTY.balloonSwayMaxPeriodMs),
    swayPhase01: rng(),
    tint: BALLOON_TINTS[Math.min(BALLOON_TINTS.length - 1, Math.floor(rng() * BALLOON_TINTS.length))],
  };
}

// ---------------------------------------------------------------------------
// Runtime factory (calls scene methods only — see module doc).
// ---------------------------------------------------------------------------

/** The minimal read-only view of one balloon: enough for ST-3's browser harness
 * to assert "at least 20 are present", to aim a real tap at one, and to prove
 * that tapping it popped it and a replacement floated in — and nothing more
 * (the partyCast.ts `members` precedent). */
export interface PartyBalloonInfo {
  /** Stable pool index — a balloon keeps it across recycles and pops, so a
   * harness can follow ONE balloon through a pop. */
  readonly index: number;
  /** Current centre x / knot y, px (design space). */
  readonly x: number;
  readonly y: number;
  /** false while popped and waiting to float back in. */
  readonly alive: boolean;
  /** How many times this balloon has been popped — the seam that proves a tap
   * actually landed (and that a second tap on a popped balloon does nothing). */
  readonly pops: number;
}

/** The handle PartyScene holds: create-once (createPartyBalloons) /
 * update(delta)-per-frame / destroy()-on-teardown, mirroring the
 * passenger/traffic/partyCast handles. */
export interface PartyBalloonsHandle {
  /** Advances every balloon's rise/sway, recycles the ones that cleared the
   * top, floats popped ones back in, and integrates the pop-confetti burst.
   * Call once per PartyScene.update() with its `delta`.
   *
   * `deltaMs` is consumed ONLY by the confetti (which integrates velocities);
   * the balloons' own motion is a closed-form function of scene.time.now and so
   * needs no accumulation — see the module doc. Allocates nothing. */
  update(deltaMs: number): void;
  /** Pool size — how many balloons exist (== PARTY.balloonCount). */
  readonly count: number;
  /** A snapshot of every balloon. Allocates a fresh array per call ON PURPOSE:
   * it is a harness/test seam called occasionally, never per frame. */
  balloons(): readonly PartyBalloonInfo[];
  /** Destroys every GameObject this module created (balloons, hit Zones, and
   * the pop-confetti pool it owns). Safe to call twice. */
  destroy(): void;
}

export interface PartyBalloonsOptions {
  /** Injected randomness (0 <= rng() < 1). Defaults to Math.random; a
   * deterministic harness can pass its own. Shared with the pop-confetti pool
   * so ONE seed reproduces the whole scene. */
  readonly rng?: () => number;
}

/** One live balloon: its visuals, its hit Zone, and the flight it is currently
 * on. `spawnAtMs` is the scene time it entered at — every position below is
 * derived from it, never accumulated. */
interface Balloon {
  readonly index: number;
  readonly container: Phaser.GameObjects.Container;
  readonly body: Phaser.GameObjects.Image;
  readonly zone: Phaser.GameObjects.Zone;
  spawn: BalloonSpawn;
  spawnAtMs: number;
  alive: boolean;
  /** Scene time this balloon is allowed to float back in at (popped only). */
  respawnAtMs: number;
  pops: number;
  /** Last rendered position, mirrored here so balloons() need not read back
   * through the GameObjects. */
  x: number;
  y: number;
}

/**
 * Builds the party's balloon flock and returns its handle. `scene` is a runtime
 * handle only (same contract as createBike) — NO Matter body is created.
 */
export function createPartyBalloons(
  scene: Phaser.Scene,
  opts: PartyBalloonsOptions = {}
): PartyBalloonsHandle {
  const rng = opts.rng ?? Math.random;

  // The pop puff. Owned by this handle (created here, updated in update(),
  // destroyed in destroy()) so a consumer gets "balloons that pop with
  // confetti" as one unit rather than having to wire two systems together.
  const popConfetti: ConfettiBurstHandle = createConfettiBurst(scene, {
    count: PARTY.popConfettiCount,
    speedMinPxPerSec: PARTY.popConfettiSpeedMinPxPerSec,
    speedMaxPxPerSec: PARTY.popConfettiSpeedMaxPxPerSec,
    // A FULL circle: a popped balloon throws confetti every way at once, where
    // LevelComplete's burst is a narrow upward fan. Same code, one number.
    launchSpreadRad: Math.PI,
    gravityPxPerSec2: PARTY.popConfettiGravityPxPerSec2,
    spinMaxRadPerSec: PARTY.popConfettiSpinMaxRadPerSec,
    lifetimeMinMs: PARTY.popConfettiLifetimeMinMs,
    lifetimeMaxMs: PARTY.popConfettiLifetimeMaxMs,
    sizeMinPx: PARTY.popConfettiSizeMinPx,
    sizeMaxPx: PARTY.popConfettiSizeMaxPx,
    fadeStartFrac: PARTY.popConfettiFadeStartFrac,
    depth: PARTY.popConfettiDepth,
    concurrentBursts: PARTY.popConfettiConcurrentBursts,
    rng,
  });

  /** The press key already spent on a pop — see popEventKey's doc. */
  let lastPopKey: string | null = null;

  const pool: Balloon[] = [];

  /** Puts a balloon on screen at the start of the flight already in its
   * `spawn`, alive and tappable. Split out of `enter` so the pool's very first
   * placement can reuse the spawn each balloon was built with instead of
   * rolling (and discarding) a second one. */
  function place(balloon: Balloon, nowMs: number): void {
    balloon.spawnAtMs = nowMs;
    balloon.alive = true;
    balloon.x = balloon.spawn.baseX;
    balloon.y = balloon.spawn.spawnY;
    balloon.body.setTint(balloon.spawn.tint);
    balloon.container.setPosition(balloon.x, balloon.y).setVisible(true);
    balloon.zone.setPosition(balloon.x, balloonHitCenterY(balloon.y));
    balloon.zone.setInteractive();
  }

  /** Rolls a FRESH flight for a balloon and puts it on screen — the single path
   * a balloon re-enters by, whether it drifted off the top or was popped. */
  function enter(balloon: Balloon, mode: BalloonSpawnMode, nowMs: number): void {
    balloon.spawn = balloonSpawn(rng, mode);
    place(balloon, nowMs);
  }

  /**
   * Pops one balloon: hide it, throw a radial confetti puff from its body, and
   * schedule it to float back in. IDEMPOTENT — a second press on an
   * already-popped balloon returns immediately, which is also why `alive` is
   * checked here rather than only at the call site.
   */
  function pop(balloon: Balloon, nowMs: number): void {
    if (!balloon.alive) return;
    balloon.alive = false;
    balloon.pops++;
    balloon.respawnAtMs = nowMs + PARTY.balloonRespawnDelayMs;
    balloon.container.setVisible(false);
    // Disabled (not merely ignored) so a popped balloon's Zone can't swallow a
    // tap aimed at a live balloon drifting behind it.
    balloon.zone.disableInteractive();
    popConfetti.burst(balloon.x, balloonHitCenterY(balloon.y));
    // FORWARD-NOTE (PLAN-10 owns ALL audio): the balloon-pop SFX plays HERE,
    // one line, right beside the puff. Nothing audio-related exists yet — this
    // subtask is explicitly sound-free.
  }

  const now0 = scene.time.now;
  for (let i = 0; i < PARTY.balloonCount; i++) {
    // String hangs DOWN from the knot (origin at its top); balloon floats ABOVE
    // it (origin at its bottom) — decorations.ts's drawBalloon convention, so
    // the container's own (0,0) IS the knot.
    const string = scene.add
      .rectangle(0, 0, BALLOON_STRING_WIDTH_PX, BALLOON_STRING_LENGTH_PX, PALETTE.outline)
      .setOrigin(0.5, 0);
    const body = scene.add
      .image(0, 0, TEXTURE_KEYS.balloon)
      .setOrigin(0.5, 1)
      .setScale(BALLOON_SCALE);
    const container = scene.add.container(0, 0, [string, body]).setDepth(PARTY.balloonDepth);

    // The hit area is its own Zone, NOT the Container: an interactive Container
    // needs setSize(), which ui.ts documents as a trap, and a Zone's DEFAULT hit
    // area (computed inside Phaser from its width/height) is exactly the region
    // we want — so this file never references Phaser.Geom and stays
    // runtime-Phaser-free (the pedals.ts pattern).
    const zone = scene.add
      .zone(0, 0, PARTY.balloonHitSizePx, PARTY.balloonHitSizePx)
      .setDepth(PARTY.balloonDepth);

    const balloon: Balloon = {
      index: i,
      container,
      body,
      zone,
      spawn: balloonSpawn(rng, 'initial'),
      spawnAtMs: now0,
      alive: true,
      respawnAtMs: 0,
      pops: 0,
      x: 0,
      y: 0,
    };

    // ONE handler per balloon, registered once. Works for BOTH a mouse click and
    // a touch tap — Phaser delivers 'pointerdown' for either, which is why the
    // pedals/buttons in this codebase are exercised by both in their harnesses.
    zone.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      const key = popEventKey(pointer.id, pointer.downTime);
      if (isDuplicatePopEvent(lastPopKey, key)) return; // one press, one balloon
      lastPopKey = key;
      pop(balloon, scene.time.now);
    });

    place(balloon, now0);
    pool.push(balloon);
  }

  function update(deltaMs: number): void {
    popConfetti.update(deltaMs);
    const now = scene.time.now;
    // Indexed loop, NOT for...of: this runs every render frame, and for...of
    // would allocate a fresh iterator each time. Nothing here allocates.
    for (let i = 0; i < pool.length; i++) {
      const balloon = pool[i];

      if (!balloon.alive) {
        if (now >= balloon.respawnAtMs) enter(balloon, 'recycle', now);
        continue;
      }

      const elapsed = now - balloon.spawnAtMs;
      const knotY = balloonRiseY(balloon.spawn.spawnY, balloon.spawn.riseSpeedPxPerSec, elapsed);
      if (shouldRecycleBalloon(knotY, -PARTY.balloonRecycleAbovePx)) {
        enter(balloon, 'recycle', now);
        continue;
      }

      balloon.x =
        balloon.spawn.baseX +
        balloonSwayOffsetPx(
          elapsed,
          balloon.spawn.swayPhase01,
          balloon.spawn.swayAmplitudePx,
          balloon.spawn.swayPeriodMs
        );
      balloon.y = knotY;
      balloon.container.setPosition(balloon.x, balloon.y);
      balloon.zone.setPosition(balloon.x, balloonHitCenterY(balloon.y));
    }
  }

  function balloons(): readonly PartyBalloonInfo[] {
    return pool.map((b) => ({ index: b.index, x: b.x, y: b.y, alive: b.alive, pops: b.pops }));
  }

  function destroy(): void {
    for (let i = 0; i < pool.length; i++) {
      // Destroying a Zone removes its input registration + listeners; destroying
      // a Container takes its children (string + balloon Image) with it.
      pool[i].zone.destroy();
      pool[i].container.destroy();
    }
    // Emptying the pool is what makes a second destroy() a no-op (the
    // partyCast.ts discipline) — and leaves update() inert rather than crashing.
    pool.length = 0;
    popConfetti.destroy();
    lastPopKey = null;
  }

  // `count` is read ONCE here (== PARTY.balloonCount): it describes the pool
  // this handle was built with and stays constant for its life, unlike
  // balloons(), which is a live snapshot and empties after destroy().
  return { update, count: pool.length, balloons, destroy };
}
