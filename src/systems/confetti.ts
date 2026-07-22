// The ONE shared confetti system (PLAN-09 ST-2). Two shapes, one integrator:
//
//   - createConfettiBurst  — a re-triggerable one-shot POP of N pieces from a
//     point, launched in a fan (or radially, at launchSpreadRad = PI), falling
//     under gravity, fading out near end-of-life. Consumers: LevelCompleteScene's
//     "Level N complete!!" burst, and one burst per popped party balloon.
//   - createConfettiFall   — a steady RAIN that keeps going indefinitely: pieces
//     enter across the top, drift/tumble down at constant velocity, wrap
//     horizontally, and recycle from above once they pass the bottom edge.
//     Consumers: PartyScene's and CreditsScene's continuous confetti (ST-3/ST-4).
//
// WHY THIS FILE EXISTS: PLAN-09 adds three new confetti consumers on top of the
// one LevelCompleteScene already had. Four independent copies of the same ~20
// lines of Euler integration + alpha ramp is exactly the mistake this codebase
// already had to undo once — see the module doc at the top of pixelText.ts,
// which exists because four files had each replicated one ~15-line helper and
// they had already diverged. So the integrator, the fade curve, the recycle
// rule and the spawn randomisation live here ONCE, and
// src/scenes/LevelCompleteScene.ts was migrated onto this module (its private
// ConfettiPiece/spawnConfetti/updateConfetti deleted) in the same change.
//
// WHERE THE NUMBERS LIVE: deliberately NOT in one shared CONFETTI constants
// block. Every knob below is a per-consumer FEEL choice — LevelComplete's burst
// is tuned to pop up past a 40px header on a pastel menu, a balloon pop is a
// small radial puff, the party rain is a slow drift — and no single value is
// genuinely shared, so a shared block would either duplicate the numbers or
// force one screen's taste on another. LEVEL_COMPLETE.confetti* therefore stays
// exactly where (and what) it was, PARTY gains its own popConfetti*/confettiFall*
// sub-sections, and this module takes them as options. One number, one home.
// (See DECISIONS.md, 2026-07-22.) The default COLOR SET is the one thing all
// three consumers do share, so it lives here as CONFETTI_COLORS — a color set is
// presentation content, not a tunable number (the LEVEL_COMPLETE block's own doc
// makes exactly that distinction).
//
// ZERO Matter bodies: every piece is a plain scene.add.rectangle, so confetti
// never touches NORTH_STAR §8's <100-body budget. It never references
// scene.matter.
//
// POOLED: both factories allocate all of their Rectangles ONCE at create time
// and recycle them forever — nothing is allocated per frame or per burst, and a
// 10-minute party leaks nothing. A piece's SIZE is randomised once per pool slot
// (never re-rolled on recycle): the pool as a whole still carries the full size
// spread, which is what actually reads as variety, and it avoids re-sizing shape
// geometry every respawn.
//
// Like bike.ts / terrain.ts / partyCast.ts (and UNLIKE ui.ts), this module has
// NO runtime Phaser import — `import type Phaser` is erased at compile time
// (verbatimModuleSyntax + erasableSyntaxOnly). That is also why it cannot use
// Phaser.Math.Between/FloatBetween and instead takes an injectable
// `rng: () => number` defaulting to Math.random (the randomCharacterConfig
// precedent in data/characters.ts), which is what makes the spawn helpers
// deterministic under test. The pure helpers below are unit-tested in plain Node
// (tests/confetti.test.ts); the factories only ever CALL METHODS on the runtime
// `scene` handle they are given (same contract as createBike).
import type Phaser from 'phaser';
import { DESIGN_HEIGHT, DESIGN_WIDTH, PALETTE } from './constants';

// ---------------------------------------------------------------------------
// Shared color set.
// ---------------------------------------------------------------------------

/** The cheerful pastel confetti colors, cycled at random across pieces. Lifted
 * verbatim out of LevelCompleteScene when it was migrated onto this module, so
 * that screen's burst looks byte-identical to before. A color SET is
 * presentation content rather than a tunable number (the decorations.ts /
 * tricks.ts precedent), which is why it lives beside the code that draws it
 * instead of in constants.ts. */
export const CONFETTI_COLORS: readonly number[] = [
  PALETTE.coral,
  PALETTE.sunshine,
  PALETTE.mint,
  PALETTE.sky,
  PALETTE.lavender,
  PALETTE.grass,
];

// ---------------------------------------------------------------------------
// Pure helpers — no Phaser/Matter/DOM. Unit-tested in tests/confetti.test.ts.
// ---------------------------------------------------------------------------

/** The kinematic state of one confetti piece: position, velocity (px/sec),
 * rotation (rad) and tumble spin (rad/sec). Plain numbers so the integration is
 * testable without a GameObject; the live pieces below structurally EXTEND this,
 * so `stepConfettiKinematics` integrates them directly with no copying. */
export interface ConfettiKinematics {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  spin: number;
}

/**
 * Advances one piece by `deltaMs` under a constant downward acceleration.
 * Mutates in place ON PURPOSE — this runs for every live piece every frame, and
 * returning a fresh object would allocate per piece per frame (the thing this
 * module's pooling exists to avoid). Still perfectly deterministic and
 * unit-testable: build a state, step it, assert.
 *
 * EXACTLY FRAME-RATE INDEPENDENT. The position uses the closed-form
 * `y += v*dt + g*dt^2/2` rather than the semi-implicit `v += g*dt; y += v*dt`
 * LevelCompleteScene's private integrator used: for CONSTANT acceleration the
 * closed form is exact, so one 16.7ms step and two 8.35ms steps land on
 * bit-identical position AND velocity (tests/confetti.test.ts asserts exact
 * equality). The semi-implicit form does not — it drifts by g*dt^2/2 per step,
 * i.e. a 120Hz display would have rained subtly differently from a 60Hz one.
 * The visible difference from the old scene code is ~0.125px on the first frame
 * (g=900, dt=1/60), well under one pixel of a piece that is already tumbling.
 */
export function stepConfettiKinematics(
  k: ConfettiKinematics,
  deltaMs: number,
  gravityPxPerSec2: number
): void {
  const dt = deltaMs / 1000;
  k.x += k.vx * dt;
  k.y += k.vy * dt + 0.5 * gravityPxPerSec2 * dt * dt;
  k.vy += gravityPxPerSec2 * dt;
  k.rotation += k.spin * dt;
}

/**
 * A burst piece's alpha: fully opaque until `fadeStartFrac` of its life has
 * elapsed, then a linear ramp to 0 at end-of-life, so it settles out instead of
 * vanishing abruptly. Byte-for-byte the curve LevelCompleteScene's private
 * updateConfetti used. Total: a non-positive `lifeMs` reads as "already over"
 * (0), and a `fadeStartFrac` of 1 or more never fades (no divide by zero).
 */
export function confettiFadeAlpha(ageMs: number, lifeMs: number, fadeStartFrac: number): number {
  if (!(lifeMs > 0)) return 0;
  if (fadeStartFrac >= 1) return 1;
  const lifeFrac = ageMs / lifeMs;
  if (lifeFrac <= fadeStartFrac) return 1;
  return Math.max(0, 1 - (lifeFrac - fadeStartFrac) / (1 - fadeStartFrac));
}

/**
 * Wraps a falling piece's x back inside `[0, widthPx)` so a piece that drifts
 * off one side re-enters from the other — the rain never thins out at the edges.
 * Total: a non-positive width is left alone rather than dividing by zero.
 */
export function confettiWrapX(x: number, widthPx: number): number {
  if (!(widthPx > 0)) return x;
  return ((x % widthPx) + widthPx) % widthPx;
}

/** Whether a falling piece has passed the bottom edge and should be recycled to
 * the top. Pure — the one place the rain's recycle rule is defined. */
export function shouldRecycleFallingConfetti(y: number, bottomPx: number): boolean {
  return y > bottomPx;
}

/** Maps a uniform `u01` (0 <= u < 1, i.e. an rng() draw) onto `[min, max]`.
 * The one place this module turns randomness into a number, so every spawn
 * range is testable by feeding a fake rng. */
export function confettiRangeAt(u01: number, min: number, max: number): number {
  return min + u01 * (max - min);
}

/**
 * A burst piece's launch direction, radians, in Phaser's screen convention
 * (y grows downward, so -PI/2 is straight UP): straight up plus/minus
 * `spreadRad`, a fan. `spreadRad = Math.PI` sweeps the FULL circle, which is
 * exactly what a balloon pop wants — so one burst implementation covers both the
 * upward pop and the radial puff with no branching.
 */
export function confettiLaunchAngleRad(u01: number, spreadRad: number): number {
  return -Math.PI / 2 + (u01 * 2 - 1) * spreadRad;
}

/** Picks a color from `colors` by a uniform `u01`. Clamped at both ends so an
 * rng returning exactly 1 can't overflow the array (the pickFailMessage
 * precedent in constants.ts); falls back to white on an empty list rather than
 * returning undefined, since a missing color would otherwise throw deep inside
 * Phaser at draw time. */
export function confettiColorAt(colors: readonly number[], u01: number): number {
  if (colors.length === 0) return PALETTE.white;
  const index = Math.min(colors.length - 1, Math.max(0, Math.floor(u01 * colors.length)));
  return colors[index];
}

// ---------------------------------------------------------------------------
// Burst — a re-triggerable one-shot pop.
// ---------------------------------------------------------------------------

/** Tuning for one burst pool. Every field is supplied by the CONSUMER's own
 * constants block (LEVEL_COMPLETE.confetti* / PARTY.popConfetti*) — see the
 * module doc on why there is no shared CONFETTI block. */
export interface ConfettiBurstOptions {
  /** Pieces launched per burst() call. */
  readonly count: number;
  /** Half-width, px, of the random horizontal band the pieces spawn across,
   * centred on the burst point. 0 = all from the exact point (a balloon pop). */
  readonly originSpreadXPx?: number;
  /** Min/max initial launch speed, px/sec. */
  readonly speedMinPxPerSec: number;
  readonly speedMaxPxPerSec: number;
  /** Launch fan half-angle around straight up, radians (PI = radial). */
  readonly launchSpreadRad: number;
  /** Downward acceleration, px/sec^2 — turns the pop into a settling rain. */
  readonly gravityPxPerSec2: number;
  /** Max absolute tumble spin, rad/sec (each piece draws from +/- this). */
  readonly spinMaxRadPerSec: number;
  /** Min/max piece lifetime, ms — a piece returns to the pool at its life. */
  readonly lifetimeMinMs: number;
  readonly lifetimeMaxMs: number;
  /** Min/max piece edge size, px (small squares). */
  readonly sizeMinPx: number;
  readonly sizeMaxPx: number;
  /** Life fraction (0..1) after which a piece fades 1 -> 0. */
  readonly fadeStartFrac: number;
  /** Render depth of every piece. */
  readonly depth: number;
  /** How many SIMULTANEOUS bursts the pool must cover (default 1). The pool
   * holds `count * this` pieces; a burst fired while the pool is exhausted
   * simply draws fewer pieces rather than allocating (the traffic.ts pool
   * discipline). Balloon pops need >1 — a fast tapper can pop several
   * balloons inside one burst lifetime. */
  readonly concurrentBursts?: number;
  /** Injected randomness (0 <= rng() < 1). Defaults to Math.random; tests and
   * deterministic harnesses pass their own. */
  readonly rng?: () => number;
  /** Color set. Defaults to CONFETTI_COLORS. */
  readonly colors?: readonly number[];
}

/** The handle a scene holds for a burst pool: create-once / update(delta) each
 * frame / destroy() on teardown, mirroring the passenger/traffic/partyCast
 * handles. */
export interface ConfettiBurstHandle {
  /** Fires one burst of `count` pieces from (x, y). Cheap enough to call on
   * every balloon pop; allocates nothing. */
  burst(x: number, y: number): void;
  /** Integrates every live piece. Call once per scene update() with its
   * `delta`. Allocates nothing. */
  update(deltaMs: number): void;
  /** How many pieces are currently in flight (0 once a burst has settled) —
   * the seam a test/harness uses to prove a burst actually appeared and that
   * pieces really do return to the pool. */
  liveCount(): number;
  /** Destroys every Rectangle this handle created. Safe to call twice. */
  destroy(): void;
}

/** One pooled burst piece: its kinematics (extended, so the integrator takes it
 * directly), its Rectangle, and its life bookkeeping. */
interface BurstPiece extends ConfettiKinematics {
  readonly rect: Phaser.GameObjects.Rectangle;
  active: boolean;
  ageMs: number;
  lifeMs: number;
}

/**
 * Builds a pooled confetti burst. `scene` is a runtime handle only (same
 * contract as createBike) — NO Matter body is created, and this module never
 * imports Phaser itself.
 */
export function createConfettiBurst(
  scene: Phaser.Scene,
  opts: ConfettiBurstOptions
): ConfettiBurstHandle {
  const rng = opts.rng ?? Math.random;
  const colors = opts.colors ?? CONFETTI_COLORS;
  const originSpreadXPx = opts.originSpreadXPx ?? 0;
  const poolSize = Math.max(0, Math.floor(opts.count * (opts.concurrentBursts ?? 1)));

  // Allocate the whole pool up front, hidden. Size is rolled once per slot (see
  // the module doc): the pool still spans the full size range, and recycling
  // never has to re-build shape geometry.
  const pool: BurstPiece[] = [];
  for (let i = 0; i < poolSize; i++) {
    const size = confettiRangeAt(rng(), opts.sizeMinPx, opts.sizeMaxPx);
    const rect = scene.add
      .rectangle(0, 0, size, size, confettiColorAt(colors, rng()))
      .setDepth(opts.depth)
      .setVisible(false);
    pool.push({
      rect,
      active: false,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      rotation: 0,
      spin: 0,
      ageMs: 0,
      lifeMs: 0,
    });
  }

  let live = 0;

  function burst(x: number, y: number): void {
    // Destroyed (or built with count 0): fully inert, and silent — a stray
    // burst() after teardown must not log a bogus "pool exhausted".
    if (pool.length === 0) return;
    let spawned = 0;
    for (let i = 0; i < pool.length && spawned < opts.count; i++) {
      const p = pool[i];
      if (p.active) continue;

      const angle = confettiLaunchAngleRad(rng(), opts.launchSpreadRad);
      const speed = confettiRangeAt(rng(), opts.speedMinPxPerSec, opts.speedMaxPxPerSec);
      p.x = x + confettiRangeAt(rng(), -originSpreadXPx, originSpreadXPx);
      p.y = y;
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed;
      p.rotation = 0;
      p.spin = confettiRangeAt(rng(), -opts.spinMaxRadPerSec, opts.spinMaxRadPerSec);
      p.ageMs = 0;
      p.lifeMs = confettiRangeAt(rng(), opts.lifetimeMinMs, opts.lifetimeMaxMs);
      p.active = true;
      live++;
      spawned++;

      p.rect
        .setFillStyle(confettiColorAt(colors, rng()))
        .setPosition(p.x, p.y)
        .setAlpha(1)
        .setVisible(true);
      p.rect.rotation = 0;
    }
    // A pool that ran dry just draws a thinner burst — never an allocation and
    // never a dropped frame. Surfaced in dev only (the traffic.ts precedent).
    if (import.meta.env.DEV && spawned < opts.count) {
      console.warn(`[confetti] burst pool exhausted (${spawned}/${opts.count})`);
    }
  }

  function update(deltaMs: number): void {
    if (live === 0) return;
    // Indexed loop, NOT for...of: this runs every render frame and for...of
    // would allocate a fresh iterator each time. Nothing here allocates.
    for (let i = 0; i < pool.length; i++) {
      const p = pool[i];
      if (!p.active) continue;
      p.ageMs += deltaMs;
      if (p.ageMs >= p.lifeMs) {
        p.active = false;
        live--;
        p.rect.setVisible(false);
        continue;
      }
      stepConfettiKinematics(p, deltaMs, opts.gravityPxPerSec2);
      p.rect.setPosition(p.x, p.y);
      p.rect.rotation = p.rotation;
      p.rect.setAlpha(confettiFadeAlpha(p.ageMs, p.lifeMs, opts.fadeStartFrac));
    }
  }

  function destroy(): void {
    for (let i = 0; i < pool.length; i++) pool[i].rect.destroy();
    // Emptying the pool is what makes a second destroy() a no-op (the
    // partyCast.ts discipline) — and makes a stray burst()/update() after
    // teardown inert rather than a crash.
    pool.length = 0;
    live = 0;
  }

  return { burst, update, liveCount: () => live, destroy };
}

// ---------------------------------------------------------------------------
// Fall — a continuous rain that never runs out.
// ---------------------------------------------------------------------------

/** Tuning for one continuous-fall pool. Supplied by the consumer's own
 * constants (PARTY.confettiFall*). */
export interface ConfettiFallOptions {
  /** How many pieces are in the air at once. This IS the pool size — the rain
   * recycles these forever and never grows. */
  readonly count: number;
  /** Width of the band pieces fall through, px (default DESIGN_WIDTH). */
  readonly widthPx?: number;
  /** Y a piece must pass before it recycles to the top, px (default
   * DESIGN_HEIGHT). */
  readonly bottomPx?: number;
  /** Height of the band ABOVE the top edge that pieces (re-)enter from, px, so
   * the rain drifts in rather than popping into existence at y = 0. */
  readonly spawnAbovePx: number;
  /** Min/max downward speed, px/sec. Constant per piece — a rain settles at
   * terminal velocity, so unlike a burst there is no gravity term. */
  readonly fallSpeedMinPxPerSec: number;
  readonly fallSpeedMaxPxPerSec: number;
  /** Max absolute sideways drift, px/sec (each piece draws from +/- this).
   * A piece that drifts off one edge wraps back in the other side. */
  readonly driftMaxPxPerSec: number;
  /** Max absolute tumble spin, rad/sec. */
  readonly spinMaxRadPerSec: number;
  /** Min/max piece edge size, px. */
  readonly sizeMinPx: number;
  readonly sizeMaxPx: number;
  /** Render depth of every piece. */
  readonly depth: number;
  /** Injected randomness (0 <= rng() < 1). Defaults to Math.random. */
  readonly rng?: () => number;
  /** Color set. Defaults to CONFETTI_COLORS. */
  readonly colors?: readonly number[];
}

/** The handle a scene holds for a continuous fall: create-once /
 * update(delta) each frame / destroy() on teardown. There is no "stop" — the
 * rain runs for the life of the scene, which is exactly what PLAN-09 asks for
 * ("confetti falling continuously"). */
export interface ConfettiFallHandle {
  /** Advances the rain. Call once per scene update() with its `delta`.
   * Allocates nothing. */
  update(deltaMs: number): void;
  /** Pieces in the air — constant (== `count`) for the life of the handle, so
   * a harness can prove the rain neither leaks nor thins out. */
  liveCount(): number;
  /** Destroys every Rectangle this handle created. Safe to call twice. */
  destroy(): void;
}

/** One pooled rain piece. No life bookkeeping: a rain piece never dies, it just
 * wraps back to the top. */
interface FallPiece extends ConfettiKinematics {
  readonly rect: Phaser.GameObjects.Rectangle;
}

/**
 * Builds a pooled, endless confetti fall. `scene` is a runtime handle only —
 * NO Matter body is created.
 *
 * The pool is seeded ALREADY SPREAD across the full height (not queued above
 * the top edge), so the very first frame shows a full rain instead of an empty
 * screen that slowly fills.
 */
export function createConfettiFall(
  scene: Phaser.Scene,
  opts: ConfettiFallOptions
): ConfettiFallHandle {
  const rng = opts.rng ?? Math.random;
  const colors = opts.colors ?? CONFETTI_COLORS;
  const widthPx = opts.widthPx ?? DESIGN_WIDTH;
  const bottomPx = opts.bottomPx ?? DESIGN_HEIGHT;
  const count = Math.max(0, Math.floor(opts.count));

  const pool: FallPiece[] = [];

  /** Re-rolls one piece's look and motion. `y` is the caller's choice: the
   * initial fill spreads it over the whole screen, a recycle drops it back into
   * the band above the top edge. */
  function respawn(p: FallPiece, y: number): void {
    p.x = rng() * widthPx;
    p.y = y;
    p.vx = confettiRangeAt(rng(), -opts.driftMaxPxPerSec, opts.driftMaxPxPerSec);
    p.vy = confettiRangeAt(rng(), opts.fallSpeedMinPxPerSec, opts.fallSpeedMaxPxPerSec);
    p.spin = confettiRangeAt(rng(), -opts.spinMaxRadPerSec, opts.spinMaxRadPerSec);
    p.rect.setFillStyle(confettiColorAt(colors, rng()));
    p.rect.setPosition(p.x, p.y);
  }

  for (let i = 0; i < count; i++) {
    const size = confettiRangeAt(rng(), opts.sizeMinPx, opts.sizeMaxPx);
    const rect = scene.add.rectangle(0, 0, size, size, PALETTE.white).setDepth(opts.depth);
    const piece: FallPiece = { rect, x: 0, y: 0, vx: 0, vy: 0, rotation: 0, spin: 0 };
    // Seed spread over the whole visible band plus the entry band above it.
    respawn(piece, rng() * (bottomPx + opts.spawnAbovePx) - opts.spawnAbovePx);
    piece.rotation = rng() * Math.PI * 2;
    rect.rotation = piece.rotation;
    pool.push(piece);
  }

  function update(deltaMs: number): void {
    // Indexed loop + zero gravity (a rain falls at terminal velocity), so this
    // shares the exact same frame-rate-independent integrator as the bursts.
    for (let i = 0; i < pool.length; i++) {
      const p = pool[i];
      stepConfettiKinematics(p, deltaMs, 0);
      if (shouldRecycleFallingConfetti(p.y, bottomPx)) {
        respawn(p, -rng() * opts.spawnAbovePx);
      } else {
        p.x = confettiWrapX(p.x, widthPx);
      }
      p.rect.setPosition(p.x, p.y);
      p.rect.rotation = p.rotation;
    }
  }

  function destroy(): void {
    for (let i = 0; i < pool.length; i++) pool[i].rect.destroy();
    // See createConfettiBurst.destroy — emptying the pool is the double-destroy
    // guard.
    pool.length = 0;
  }

  return { update, liveCount: () => pool.length, destroy };
}
