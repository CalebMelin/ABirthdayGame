// The party BALLOONS (PLAN-09 ST-2) — PLAN-09 task 2's "Lots of balloons
// (floating, bobbing, varied colors - at least 20)" and "balloons are
// tappable/clickable and pop with confetti; endless supply floats in".
//
// MODEL: a FIXED POOL of PARTY.balloonCount balloons, allocated once in
// createPartyBalloons and recycled forever — nothing is allocated per frame or
// per pop, so the "endless supply" is free. Each balloon drifts UPWARD at its
// own speed while swaying sideways on its own period/phase; the instant its
// body finishes sliding off the TOP edge it re-enters at the BOTTOM edge with a
// fresh color, x, speed and sway. A tap or click pops it: the balloon vanishes
// behind a radial confetti burst (systems/confetti.ts) and re-enters the same
// way after PARTY.balloonRespawnDelayMs.
//
// ">= 20 BALLOONS PRESENT" (PLAN-09's acceptance criterion) IS STRUCTURAL HERE,
// not a statistical hope. Both flight endpoints are DERIVED from the drawn body
// height (BALLOON_ENTRY_KNOT_Y / BALLOON_RECYCLE_KNOT_Y below), so the band in
// which a balloon is alive but off-screen has exactly ZERO length: every
// unpopped balloon has visible area at every knot y STRICTLY INSIDE its flight,
// and the two endpoints (where the area is exactly 0) are each touched for at
// most a single frame before it moves or recycles. The only balloons genuinely
// out of view are ones the player just popped, bounded by
// PARTY.balloonWorstCasePopsPerSec against
// PARTY.balloonRespawnDelayMs + one frame: 32 - 6 = 26.
// tests/partyBalloons.test.ts asserts that lower bound and sweeps the whole
// flight; the browser harness measured a floor of 28 visible while popping 58
// balloons in 12.3s (4.7/sec), with at most 4 out of view at once.
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
// 32 balloons those Zones DO overlap. One press still pops exactly one balloon —
// that is Phaser's own default `topOnly` behavior, NOT something this file
// invents (see popEventKey's doc, which cites the engine source); the
// (pointer id, press time) dedupe on top of it is deliberate defence in depth
// for the day topOnly is ever off. Popping is idempotent besides: an
// already-popped balloon ignores further presses AND has its Zone's input
// disabled, so it can't swallow a tap meant for a balloon behind it.
//
// ZERO Matter bodies: a balloon is a Container of a tinted Image + a string
// Rectangle over a plain Zone, exactly like decorations.ts's static balloons
// (whose drawBalloon this follows: tint the shared 24x32 tex-balloon placeholder
// rather than generating recolored textures, and hang a short string rect from
// the knot). Nothing here touches NORTH_STAR §8's <100-body budget.
//
// DEPTH: balloons sit at PARTY.balloonDepth, ABOVE the unnamed crowd but BELOW
// the front-row cast and their name tags. This subtask originally put them in
// front of everybody (DEPTHS.fx + 1); ST-3's first full-scene screenshot showed
// 32 balloons burying the party and leaving two of the four name tags
// unreadable, so they moved behind the people — see PARTY.balloonDepth's doc and
// DECISIONS.md 2026-07-22.
//
// WHAT THAT COSTS, STATED HONESTLY (an earlier draft of this paragraph said
// "nothing"): TAPPABILITY is untouched — no cast object is interactive, so every
// balloon still takes a press wherever it is. But a balloon drifting through the
// front row's ~432x144px band is now HIDDEN behind a cast member, and a press
// there pops a balloon the player cannot see. The POP PUFF is what keeps that
// press legible, so PARTY.popConfettiDepth deliberately sits ABOVE the whole
// cast and its name tags rather than one step above the balloons — it is the
// pop's only guaranteed feedback, and PLAN-10's pop SFX will fire beside it.
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
import { confettiColorAt, confettiRangeAt, createConfettiBurst } from './confetti';
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

// --- The flight's two endpoints. DERIVED FROM THE ART, NOT TUNED — which is
// exactly why they live here beside BALLOON_BODY_HEIGHT_PX rather than as
// knobs in the PARTY block. PLAN-09's acceptance criterion is ">= 20 balloons
// present", and the ONLY way to make that structural rather than statistical is
// for the transit to have a ZERO-LENGTH invisible band: a balloon must enter
// exactly as it becomes visible and recycle exactly as it stops being visible.
// Both endpoints are therefore a function of the drawn body height, and a
// "tuned" value would silently reintroduce a window in which balloons are alive
// but off-screen. tests/partyBalloons.test.ts guards the zero band.
//
// The body is bottom-anchored at the knot, so it occupies [knotY - bodyH, knotY]
// and intersects the 0..DESIGN_HEIGHT viewport exactly while 0 < knotY < 796.8.

/** A (re)entering balloon's knot y: one body-height BELOW the bottom edge, i.e.
 * the precise y at which its TOP edge touches the bottom of the screen. It is
 * visible from its very first frame and still slides smoothly up into view — no
 * pop-in, no invisible wait. Exported so tests/harnesses assert against the
 * SAME number the module flies by rather than a re-typed copy. */
export const BALLOON_ENTRY_KNOT_Y = DESIGN_HEIGHT + BALLOON_BODY_HEIGHT_PX;

/** The knot y at or above which a balloon recycles: the TOP edge of the screen,
 * i.e. the precise y at which its BOTTOM edge has finished sliding off.
 *
 * The balloon's 40px string tail is deliberately NOT waited for. Holding the
 * balloon alive for those extra 40px would reopen a band in which it is alive
 * but its body is off-screen — trading the structural >= 20 guarantee for a
 * cosmetic detail. Be honest about the detail, though: it is a 3px-WIDE but
 * 40px-LONG dark line that blanks out rather than sliding away, and across a
 * flock of 32 rising balloons that happens roughly once or twice a second
 * somewhere along the top edge. Judged the right trade at PLACEHOLDER fidelity;
 * PLAN-10 can revisit it (e.g. by fading the string over the last few px)
 * without touching the flight geometry. */
export const BALLOON_RECYCLE_KNOT_Y = 0;

/**
 * Balloon tints — "varied colors" (PLAN-09 task 2). The full cheerful pastel
 * family plus the two warm theme tones, so a wall of 32 balloons never reads as
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

/** Whether a balloon's body has finished sliding off the top edge and it should
 * recycle from below. Inclusive (`<=`): at `knotY === recycleAtY` the body
 * occupies [recycleAtY - bodyH, recycleAtY] and has exactly ZERO area on
 * screen, so that is precisely the frame to recycle — which is what closes the
 * invisible band to zero length (see BALLOON_RECYCLE_KNOT_Y). Pure — the one
 * place the recycle rule is defined. */
export function shouldRecycleBalloon(knotY: number, recycleAtY: number): boolean {
  return knotY <= recycleAtY;
}

/** The y a balloon's HIT AREA centres on, given its knot y: the middle of the
 * drawn body, which floats ABOVE the knot. Pure, and the one place the
 * visible-face/hit-area offset is computed. */
export function balloonHitCenterY(knotY: number, bodyHeightPx = BALLOON_BODY_HEIGHT_PX): number {
  return knotY - bodyHeightPx / 2;
}

/**
 * A stable key for ONE physical press: the (pointer id, press time) pair. Two
 * dispatches from the same press share both; a later press by the same finger
 * differs in `downTime`; a SECOND finger landing on the same millisecond differs
 * in `id` — so two thumbs still correctly pop two balloons.
 *
 * WHAT THIS ACTUALLY BUYS (read the engine before believing otherwise):
 * Phaser ALREADY delivers a press to exactly one object. `InputPlugin` sets
 * `this.topOnly = true` by default (node_modules/phaser/src/input/InputPlugin.js,
 * the `topOnly` property) and its `update()` splices the hit-tested list down to
 * a single entry (`this._temp.splice(1)`) BEFORE `processDownEvents` runs. This
 * project never overrides `topOnly`. So "one press pops one balloon" is the
 * ENGINE's guarantee, not this dedupe's — and the browser harness's
 * one-pop-per-press result is equally explained by it.
 *
 * The dedupe is therefore DEFENCE IN DEPTH, kept deliberately and cheaply: the
 * hit Zones genuinely do overlap (32 balloons x 88px on 1280x720), so the day
 * anything sets `scene.input.topOnly = false` — a debug session, a future
 * overlay that needs press-through, a Phaser default change — a single thumb
 * would otherwise pop a whole column of balloons at once. Two string
 * comparisons per press is a fair price for that not being possible.
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
 * empty room slowly filling); `'recycle'` brings one back in at the bottom edge
 * (BALLOON_ENTRY_KNOT_Y). An `as const` union — this project forbids TS enums. */
export type BalloonSpawnMode = 'initial' | 'recycle';

/**
 * Rolls one balloon's entry. PURE given `rng` (0 <= rng() < 1), so
 * tests/partyBalloons.test.ts can pin every bound: x always inside
 * PARTY.balloonSpawnMarginPx of both edges, rise/sway inside their configured
 * ranges, tint always from BALLOON_TINTS, and every spawn y strictly inside the
 * flight, so a balloon is NEVER alive-but-off-screen (see BALLOON_ENTRY_KNOT_Y).
 *
 * A `'recycle'` spawn enters at exactly BALLOON_ENTRY_KNOT_Y; an `'initial'`
 * spawn is seeded uniformly across the WHOLE flight, which is also its
 * steady-state distribution — so the party starts full and stays statistically
 * unchanged rather than settling into a different look after a minute.
 *
 * RNG BUDGET (ST-3 harnesses, note BOTH parts — a seeded run cannot assume a
 * fixed stride per balloon):
 *   - This function draws SEVEN times in `'initial'` mode and SIX in
 *     `'recycle'`, because the recycle entry y is derived rather than drawn.
 *   - createPartyBalloons ALSO burns `popConfettiCount x
 *     popConfettiConcurrentBursts` = 168 draws building the pop-confetti pool
 *     BEFORE the first balloon is rolled, since it shares this handle's rng.
 * So balloon i's first draw is number 168 + 7i, not 7i.
 *
 * UNLIKE partyCast.ts's deliberately deterministic layout (a group photo must
 * look identical on every visit, so it never touches Math.random), the balloons
 * ARE random: they are weather, not staging — a pool that recycled to fixed
 * positions would visibly re-form into rows within a minute.
 */
export function balloonSpawn(rng: () => number, mode: BalloonSpawnMode): BalloonSpawn {
  const margin = PARTY.balloonSpawnMarginPx;
  return {
    // confettiRangeAt / confettiColorAt come from systems/confetti.ts rather
    // than being re-implemented here: a byte-identical private `rangeAt` used to
    // sit in this file, and the local tint pick had silently LOST
    // confettiColorAt's lower clamp (a negative injected draw would have indexed
    // -1 and produced an undefined tint). Exactly the duplication this module's
    // own doc cites pixelText.ts about.
    baseX: confettiRangeAt(rng(), margin, DESIGN_WIDTH - margin),
    spawnY: mode === 'initial' ? rng() * BALLOON_ENTRY_KNOT_Y : BALLOON_ENTRY_KNOT_Y,
    riseSpeedPxPerSec: confettiRangeAt(
      rng(),
      PARTY.balloonRiseMinPxPerSec,
      PARTY.balloonRiseMaxPxPerSec
    ),
    swayAmplitudePx: confettiRangeAt(rng(), PARTY.balloonSwayMinPx, PARTY.balloonSwayMaxPx),
    swayPeriodMs: confettiRangeAt(
      rng(),
      PARTY.balloonSwayMinPeriodMs,
      PARTY.balloonSwayMaxPeriodMs
    ),
    swayPhase01: rng(),
    tint: confettiColorAt(BALLOON_TINTS, rng()),
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
    //
    // LOAD-BEARING CREATION ORDER: every container AND every zone sits at the
    // same PARTY.balloonDepth, so both the render order and Phaser's input
    // sorting (InputPlugin.sortGameObjects, which falls back to display-list
    // index once depths tie) are decided by insertion order alone. Because zone
    // i is added immediately after container i, the two orders agree: the
    // balloon that DRAWS on top is exactly the one whose zone WINS the hit test
    // where hit areas overlap. Keep them paired — creating all the containers
    // first and all the zones after would silently invert that, and taps would
    // start landing on balloons behind the one under the finger.
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
    // would allocate a fresh iterator each time. The STEADY-STATE frame
    // therefore allocates nothing at all; the only allocation anywhere in this
    // loop is the small BalloonSpawn literal `enter()` rolls when a balloon
    // recycles or returns from a pop — a handful of objects per SECOND across
    // the whole pool (a balloon's flight lasts 14-31s), not per frame.
    for (let i = 0; i < pool.length; i++) {
      const balloon = pool[i];

      if (!balloon.alive) {
        if (now >= balloon.respawnAtMs) enter(balloon, 'recycle', now);
        continue;
      }

      const elapsed = now - balloon.spawnAtMs;
      const knotY = balloonRiseY(balloon.spawn.spawnY, balloon.spawn.riseSpeedPxPerSec, elapsed);
      if (shouldRecycleBalloon(knotY, BALLOON_RECYCLE_KNOT_Y)) {
        // BACKGROUNDED-TAB GUARD. `scene.time.now` is Phaser's RAW rAF
        // timestamp (TimeStep.step -> Clock.update sets `this.now = time`), so
        // it jumps by the whole wall-clock gap when a hidden tab resumes — even
        // though `delta` itself is smoothed. Without this branch EVERY alive
        // balloon would be past the recycle line on that one frame, all 32
        // would re-enter at the identical BALLOON_ENTRY_KNOT_Y, and the flock
        // would resume as a single horizontal row taking ~10s to disperse —
        // precisely the artifact the randomised flight exists to prevent.
        // Overshooting by more than a FULL flight can only mean lost time, so
        // re-scatter across the whole flight ('initial') instead of queueing at
        // the entry line.
        const overshotAWholeFlight = knotY < BALLOON_RECYCLE_KNOT_Y - BALLOON_ENTRY_KNOT_Y;
        enter(balloon, overshotAWholeFlight ? 'initial' : 'recycle', now);
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
