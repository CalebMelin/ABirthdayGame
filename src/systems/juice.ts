// Drive juice (PLAN-10 ST-8): the subtle, pooled, body-free "feel" particles
// GameScene layers over the ride — rear-wheel acceleration dust (#3), the
// landing impact puff (#2, paired with GameScene's camera dip), wheelie/flip
// sparks (#5), and screen-space speed lines at top speed (#4). One handle
// GameScene owns for a run: create() -> update(delta, state) every frame ->
// layout(zoom) for the screen-space lines -> destroy() on SHUTDOWN.
//
// ZERO Matter bodies (NORTH_STAR §8; level 22 is at 99/100): every piece is a
// plain pooled scene.add.rectangle — dust/sparks are world-space, the speed
// lines live in ONE scrollFactor-0 container that layout(zoom) counter-scales
// exactly like the pedals/tulip HUD (same zoomCompensated* helpers). NOTHING
// is allocated per frame or per emit: all pools are built once at create and
// recycled forever (the confetti.ts / traffic.ts pool discipline), and every
// per-frame loop is an indexed for-loop, never for...of (no iterator alloc).
// A piece's SIZE is rolled ONCE per pool slot at creation and never re-rolled
// on recycle (confetti.ts's exact discipline — the pool as a whole still spans
// the full size range, which reads as variety, and no shape geometry is ever
// rebuilt). An exhausted pool simply draws fewer pieces — never an allocation,
// never a dropped frame.
//
// Like bike.ts / terrain.ts / confetti.ts / pedals.ts (and UNLIKE ui.ts), this
// module has NO runtime Phaser import — `import type Phaser` is erased at
// compile time. It only ever CALLS METHODS on the runtime `scene` handle it is
// given (same contract as createBike), and it never references the Phaser
// namespace, so it stays import-safe in Node. All tunables live in the JUICE
// block (constants.ts); the pieces integrate in wall-clock SECONDS so they are
// frame-rate independent (a 120 Hz phone and a 60 Hz desktop age a puff
// identically), mirroring confetti.ts's step.
import type Phaser from 'phaser';
import { PALETTE, DEPTHS, DESIGN_WIDTH, DESIGN_HEIGHT, JUICE } from './constants';
import { zoomCompensatedPosition, zoomCompensatedScale } from './pedals';
import type { Vec2 } from './pedals';

/** The camera's zoom pivot (design-screen center) — the same value the pedals
 * and the tulip HUD counter-transform around. */
const PIVOT: Vec2 = { x: DESIGN_WIDTH / 2, y: DESIGN_HEIGHT / 2 };
/** The speed-line container's design-space origin (children use plain design
 * coordinates; see the tulip HUD's identical derivation). */
const ROOT_ORIGIN: Vec2 = { x: 0, y: 0 };

/** Spark colors, cycled per spark (warm sparkle). Presentation content, so it
 * lives beside the code that draws it (the confetti.ts / tricks.ts precedent). */
const SPARK_COLORS: readonly number[] = [PALETTE.sunshine, PALETTE.coral, PALETTE.white];

/** Per-frame signals GameScene feeds {@link DriveJuiceHandle.update}. Read-only
 * snapshot of the bike + terrain — juice never reaches back into the rig. */
export interface DriveJuiceState {
  /** Chassis centre x (world). */
  bikeX: number;
  /** Chassis centre y (world) — sparks origin. */
  bikeY: number;
  /** Terrain surface y under the bike (world) — accel dust spawns here. */
  groundY: number;
  /** DEBOUNCED grounded (== !bike.trickAirborne) — dust needs the chatter-free
   * signal so a ramp crest doesn't strobe the emitter. */
  grounded: boolean;
  /** Gas held this frame. */
  gas: boolean;
  /** Bike speed, px per physics step (BikeHandle.speed units). */
  speedPxPerStep: number;
  /** Bike speed / CAMERA.fullSpeedPxPerStep, clamped 0..1 — drives speed lines. */
  speedRatio: number;
  /** |airborneRotation change this render frame|, rad — drives flip sparks. */
  flipRateAbs: number;
  /** Whether the bike is in the debounced air phase (sparks only fly airborne). */
  airborne: boolean;
  /** False once the run has ended (crash/finish) — suppresses NEW emission so a
   * crash tumble never throws dust/sparks; live pieces still settle out. */
  emit: boolean;
}

/** The handle GameScene holds for the drive juice over one run. */
export interface DriveJuiceHandle {
  /** Integrate every live piece, emit new dust/sparks per the state (rate-
   * capped), and set the speed-line alpha from the speed ratio. Allocation-
   * free. `deltaMs` is the render-frame delta. */
  update(deltaMs: number, state: DriveJuiceState): void;
  /** Fling an impact puff at (x, y) — GameScene calls this on the landing edge;
   * `strength` (0..1, scaled by airtime) sizes the burst. */
  landingPuff(x: number, y: number, strength: number): void;
  /** Re-position + re-scale the screen-space speed-line container so it holds
   * its fixed on-screen spot under the camera `zoom` (identical math to the
   * pedals / tulip HUD). Call every frame AFTER updateCamera(). */
  layout(zoom: number): void;
  /** Destroy every pooled GameObject this handle created. Safe to call twice. */
  destroy(): void;
}

/** One pooled world-space particle (dust or spark). Plain numbers + a
 * Rectangle (whose SIZE was rolled once at creation); the integrator mutates it
 * in place (no per-frame alloc). */
interface Particle {
  readonly rect: Phaser.GameObjects.Rectangle;
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  ageMs: number;
  lifeMs: number;
  /** Peak alpha this piece fades from. */
  peakAlpha: number;
  /** Scale this piece grows to over its life (1 = no growth, for sparks). */
  growTo: number;
  /** Downward accel, px/sec^2 (0 for dust, gravity for sparks). */
  gravity: number;
}

/** One pooled screen-space streak line. */
interface StreakLine {
  readonly rect: Phaser.GameObjects.Rectangle;
  /** Local x (design space) — decreases each frame, wraps right. */
  x: number;
  len: number;
  speedPxPerSec: number;
}

/**
 * Builds the drive-juice system for a run. `scene` is a runtime handle only
 * (same contract as createBike); NO Matter body is created.
 */
export function createDriveJuice(scene: Phaser.Scene): DriveJuiceHandle {
  const rng = Math.random;
  const range = (min: number, max: number): number => min + rng() * (max - min);

  // --- pooled world-space particles. Size is rolled ONCE per slot at creation
  //     (confetti.ts discipline); two pools so dust/sparks keep independent
  //     sizes/budgets. ---
  function buildPool(size: number, sizeMin: number, sizeMax: number, color: number): Particle[] {
    const pool: Particle[] = [];
    for (let i = 0; i < size; i++) {
      const edge = Math.max(1, Math.round(range(sizeMin, sizeMax)));
      const rect = scene.add
        .rectangle(0, 0, edge, edge, color)
        .setDepth(DEPTHS.fx)
        .setVisible(false);
      pool.push({
        rect,
        active: false,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        ageMs: 0,
        lifeMs: 0,
        peakAlpha: 1,
        growTo: 1,
        gravity: 0,
      });
    }
    return pool;
  }

  const dustPool = buildPool(JUICE.dustPoolSize, JUICE.dustSizeMinPx, JUICE.dustSizeMaxPx, PALETTE.dustyTan);
  const sparkPool = buildPool(JUICE.sparkPoolSize, JUICE.sparkSizeMinPx, JUICE.sparkSizeMaxPx, PALETTE.sunshine);

  /** Claim an inactive slot from a pool. A dry pool returns undefined (the
   * caller just draws fewer pieces — never an allocation). */
  function claim(pool: Particle[]): Particle | undefined {
    for (let i = 0; i < pool.length; i++) {
      if (!pool[i].active) return pool[i];
    }
    return undefined;
  }

  /** Spawn one dust puff at (x, y) with the given velocity (px/sec). */
  function spawnDust(x: number, y: number, vx: number, vy: number): void {
    const p = claim(dustPool);
    if (!p) return;
    p.active = true;
    p.x = x;
    p.y = y;
    p.vx = vx;
    p.vy = vy;
    p.ageMs = 0;
    p.lifeMs = range(JUICE.dustLifeMinMs, JUICE.dustLifeMaxMs);
    p.peakAlpha = JUICE.dustPeakAlpha;
    p.growTo = JUICE.dustGrowTo;
    p.gravity = 0;
    p.rect.setScale(1).setPosition(x, y).setAlpha(p.peakAlpha).setVisible(true);
  }

  /** Spawn one spark at (x, y). */
  function spawnSpark(x: number, y: number): void {
    const p = claim(sparkPool);
    if (!p) return;
    const angle = rng() * Math.PI * 2;
    const speed = range(JUICE.sparkSpeedMinPxPerSec, JUICE.sparkSpeedMaxPxPerSec);
    const color = SPARK_COLORS[Math.min(SPARK_COLORS.length - 1, Math.floor(rng() * SPARK_COLORS.length))];
    p.active = true;
    p.x = x + range(-JUICE.sparkSpreadPx, JUICE.sparkSpreadPx);
    p.y = y + range(-JUICE.sparkSpreadPx, JUICE.sparkSpreadPx);
    p.vx = Math.cos(angle) * speed;
    p.vy = Math.sin(angle) * speed - JUICE.sparkSpeedMinPxPerSec; // bias slightly up
    p.ageMs = 0;
    p.lifeMs = range(JUICE.sparkLifeMinMs, JUICE.sparkLifeMaxMs);
    p.peakAlpha = JUICE.sparkPeakAlpha;
    p.growTo = 1;
    p.gravity = JUICE.sparkGravityPxPerSec2;
    p.rect.setFillStyle(color).setScale(1).setPosition(p.x, p.y).setAlpha(p.peakAlpha).setVisible(true);
  }

  /** Advance every live piece in a pool by dtMs (wall clock). */
  function stepPool(pool: Particle[], dtMs: number): void {
    const dt = dtMs / 1000;
    for (let i = 0; i < pool.length; i++) {
      const p = pool[i];
      if (!p.active) continue;
      p.ageMs += dtMs;
      if (p.ageMs >= p.lifeMs) {
        p.active = false;
        p.rect.setVisible(false);
        continue;
      }
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const lifeFrac = p.ageMs / p.lifeMs;
      p.rect.setPosition(p.x, p.y);
      if (p.growTo !== 1) p.rect.setScale(1 + (p.growTo - 1) * lifeFrac);
      p.rect.setAlpha(p.peakAlpha * (1 - lifeFrac));
    }
  }

  // --- screen-space speed lines (one scrollFactor-0 container, zoom-comped
  //     every frame exactly like the tulip HUD root) ---
  const speedLineRoot = scene.add
    .container(ROOT_ORIGIN.x, ROOT_ORIGIN.y)
    .setScrollFactor(0)
    .setDepth(DEPTHS.fx)
    .setAlpha(0);
  const speedLines: StreakLine[] = [];
  for (let i = 0; i < JUICE.speedLineCount; i++) {
    const len = range(JUICE.speedLineLenMinPx, JUICE.speedLineLenMaxPx);
    const rect = scene.add
      .rectangle(range(0, DESIGN_WIDTH), range(0, DESIGN_HEIGHT), len, JUICE.speedLineThicknessPx, PALETTE.white)
      .setOrigin(0, 0.5)
      .setAlpha(range(0.5, 1));
    speedLineRoot.add(rect);
    speedLines.push({
      rect,
      x: rect.x,
      len,
      speedPxPerSec: JUICE.speedLineSpeedPxPerSec * range(0.8, 1.2),
    });
  }

  /** The container alpha ramp for a speed ratio: 0 below `On`, up to
   * speedLineMaxAlpha at `Full`. */
  function speedLineAlpha(ratio: number): number {
    const t = (ratio - JUICE.speedLineRatioOn) / (JUICE.speedLineFullRatio - JUICE.speedLineRatioOn);
    return Math.max(0, Math.min(1, t)) * JUICE.speedLineMaxAlpha;
  }

  // --- emit-rate timers ---
  let dustTimerMs = 0;
  let sparkTimerMs = 0;

  function landingPuff(x: number, y: number, strength: number): void {
    const count = Math.max(1, Math.round(JUICE.landingPuffCount * strength));
    for (let i = 0; i < count; i++) {
      const dir = rng() < 0.5 ? -1 : 1;
      spawnDust(
        x,
        y,
        dir * range(0, JUICE.landingPuffSpreadPxPerSec) * strength,
        -range(0, JUICE.landingPuffUpPxPerSec) * strength
      );
    }
  }

  function update(deltaMs: number, s: DriveJuiceState): void {
    // Integrate live pieces first (they settle regardless of run state).
    stepPool(dustPool, deltaMs);
    stepPool(sparkPool, deltaMs);

    // Rear-wheel acceleration dust: grounded (debounced) + gas + moving, rate-
    // capped. Reset the timer to 0 when the condition is off so re-engaging
    // emits promptly (never a stale backlog).
    if (s.emit && s.grounded && s.gas && s.speedPxPerStep > JUICE.dustMinSpeedPxPerStep) {
      dustTimerMs -= deltaMs;
      if (dustTimerMs <= 0) {
        dustTimerMs = JUICE.dustIntervalMs;
        spawnDust(
          s.bikeX - JUICE.dustBehindPx + range(-JUICE.dustJitterPx, JUICE.dustJitterPx),
          s.groundY,
          -range(0, JUICE.dustBackDriftPxPerSec),
          -JUICE.dustRiseSpeedPxPerSec
        );
      }
    } else {
      dustTimerMs = 0;
    }

    // Wheelie/flip sparks: airborne + spinning fast (but below the takeoff-reset
    // sanity bound), rate-capped.
    if (
      s.emit &&
      s.airborne &&
      s.flipRateAbs > JUICE.sparkFlipRateThreshRad &&
      s.flipRateAbs < JUICE.sparkFlipRateSanityRad
    ) {
      sparkTimerMs -= deltaMs;
      if (sparkTimerMs <= 0) {
        sparkTimerMs = JUICE.sparkIntervalMs;
        for (let i = 0; i < JUICE.sparkCountPerEmit; i++) spawnSpark(s.bikeX, s.bikeY);
      }
    } else {
      sparkTimerMs = 0;
    }

    // Speed lines: streak leftward in design space, wrap right; fade the whole
    // container in with the speed ratio (invisible below the "on" ratio).
    speedLineRoot.setAlpha(speedLineAlpha(s.speedRatio));
    const dt = deltaMs / 1000;
    for (let i = 0; i < speedLines.length; i++) {
      const line = speedLines[i];
      line.x -= line.speedPxPerSec * dt;
      if (line.x + line.len < 0) {
        line.x = DESIGN_WIDTH + range(0, DESIGN_WIDTH * 0.5);
        line.rect.y = range(0, DESIGN_HEIGHT);
      }
      line.rect.x = line.x;
    }
  }

  function layout(zoom: number): void {
    const p = zoomCompensatedPosition(ROOT_ORIGIN, PIVOT, zoom);
    speedLineRoot.setPosition(p.x, p.y);
    speedLineRoot.setScale(zoomCompensatedScale(zoom));
  }
  // Place once at native zoom so the lines sit correctly on the first frame.
  layout(1);

  function destroy(): void {
    for (let i = 0; i < dustPool.length; i++) dustPool[i].rect.destroy();
    for (let i = 0; i < sparkPool.length; i++) sparkPool[i].rect.destroy();
    dustPool.length = 0;
    sparkPool.length = 0;
    // The container owns the streak Rectangles — one destroy sweeps them all.
    speedLineRoot.destroy();
    speedLines.length = 0;
  }

  return { update, landingPuff, layout, destroy };
}
