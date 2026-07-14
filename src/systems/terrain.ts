// Procedural ground generator for a level: rolling hills, authored jump
// ramps, and flat "scripted event" zones, built from a seeded PRNG so the
// exact same LevelConfig always produces the exact same ground (tests and
// feel-tuning both depend on that — see CLAUDE.md / PLAN-02 acceptance
// criteria: "Deterministic terrain (unit test: same seed -> same heights)").
//
// IMPORTANT — this file must have NO RUNTIME import of 'phaser'. Vitest
// runs in plain Node (no DOM/WebGL); importing the real Phaser module
// there crashes. `import type Phaser` below is erased entirely at compile
// time (verbatimModuleSyntax + tsconfig's erasableSyntaxOnly), so it's
// safe. `generateHeightmap` (the pure math) never touches Phaser at all —
// it's exercised directly by tests/terrain.test.ts. `createTerrain` only
// ever CALLS METHODS on a `scene` object handed to it at runtime by the
// real (browser-side) caller; it never imports or constructs Phaser
// itself, so it stays test-import-safe even though it's Matter/Graphics
// aware.
import type Phaser from 'phaser';
import { PALETTE, DEPTHS, TERRAIN } from './constants';

/** Matter label stamped on every static ground body. Collision logic in
 * bike.ts (wheel-contact/airborne tracking and head-sensor fail detection,
 * PLAN-02 task 2) recognizes ground by comparing against this constant —
 * import it rather than re-typing the string. */
export const TERRAIN_BODY_LABEL = 'terrain';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** A distance range along the level, px. Used for flat zones reserved for
 * scripted events (Caleb's house, the finish flag, etc). Shadows the DOM
 * `Range` (text-selection) type by name, but only within modules that
 * import this one — harmless, since nothing here needs the DOM version. */
export interface Range {
  /** Start distance along the level, px. */
  start: number;
  /** End distance along the level, px. Must be > start to have any effect;
   * a zone with end <= start is ignored. */
  end: number;
}

/** An authored "launch ramp" jump: a smooth raised-cosine hump added on top
 * of the rolling-hill terrain — tall/short enough to get the bike airborne
 * for a trick without requiring one (see NORTH_STAR §4 tricks & tulips).
 * Beatable by just driving over it at speed; flips are optional. */
export interface JumpSpec {
  /** Distance along the level where the ramp begins (its base), px. */
  x: number;
  /** Horizontal footprint of the ramp, px (base to base). Widened up to
   * TERRAIN.minJumpWidthPx if smaller, and further widened if needed to
   * keep the ramp's steepest point under TERRAIN.maxJumpSlope for a given
   * height (height is never reduced to compensate — see applyJumps). */
  width: number;
  /** Peak rise above the surrounding terrain at the ramp's midpoint, px.
   * Clamped to TERRAIN.maxJumpHeightPx regardless of what's requested. */
  height: number;
}

/** Terrain generation input — the `terrain` sub-object of a level's
 * `LevelConfig` (the full `LevelConfig` type lands in PLAN-05; this shape
 * matches what PLAN-02's task text specifies so that plan can adopt it
 * directly). */
export interface TerrainSpec {
  /** Seeds the deterministic PRNG. Same seed + same rest of spec always
   * produces byte-identical heights (see module doc comment). */
  seed: number;
  /** Total horizontal length of the level, px. */
  length: number;
  /** Rolling-hill amplitude, roughly 0 (flat road) .. 1 (hilliest any of
   * the 22 levels gets). Clamped to [0, 1] — see TERRAIN.maxAmplitudePx. */
  hilliness: number;
  /** Authored jump ramps to insert. Defaults to none. */
  jumps?: JumpSpec[];
  /** Flat stretches reserved for scripted events/finish flag. Defaults to
   * none. */
  flatZones?: Range[];
}

/** One sample of the ground surface polyline, screen-space px. */
export interface TerrainPoint {
  x: number;
  y: number;
}

/** Optional overrides for the ground's rendered colors; both default to
 * PALETTE values (real per-level theming arrives in PLAN-05). */
export interface TerrainColors {
  /** Solid fill color under the ground surface. */
  fill?: number;
  /** Color of the thicker top-edge "dirt/asphalt" stroke. */
  edge?: number;
}

/** Everything a scene needs after building a level's ground. */
export interface TerrainHandle {
  /** The final heightmap samples actually used (post hilliness/jump/flat-
   * zone processing), left to right, x from 0 to worldLength. */
  points: TerrainPoint[];
  /** Total horizontal extent of this terrain, px (the normalized spec
   * length — see {@link generateHeightmap}). */
  worldLength: number;
  /** Ground surface Y at any x, linearly interpolated between the nearest
   * two samples and clamped to the ends outside [0, worldLength]. Used to
   * spawn the bike and place the finish flag on the surface. */
  heightAt(x: number): number;
  /** Static Matter bodies forming the ground collision chain, each labeled
   * 'terrain' so later collision logic (head-sensor fail detection,
   * PLAN-02 task 2) can recognize ground contacts. */
  bodies: MatterJS.BodyType[];
  /** The Graphics object the ground was drawn into. */
  graphics: Phaser.GameObjects.Graphics;
  /** Removes every ground body from the Matter world and destroys the
   * Graphics — call when tearing down/restarting a level. */
  destroy(): void;
}

// ---------------------------------------------------------------------------
// Small deterministic math helpers
// ---------------------------------------------------------------------------

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Ken Perlin's "smootherstep" easing: like smoothstep, but its FIRST AND
 * SECOND derivatives are also zero at both ends. Anything blended in/out
 * with it (flat zones, the value-noise layer) therefore has no visible
 * slope kink at the seam, not just no height jump — load-bearing for the
 * "blend smoothly, no discontinuities" requirement on flat zones/ramps. */
function smootherstep(t: number): number {
  const x = clamp(t, 0, 1);
  return x * x * x * (x * (x * 6 - 15) + 10);
}

/** mulberry32 — a tiny public-domain seeded PRNG. Deterministic: the same
 * 32-bit seed always produces the same sequence of [0, 1) floats. Used
 * instead of Math.random() everywhere below so terrain is reproducible
 * from a level's seed alone (see module doc comment / CLAUDE.md). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Spec normalization — every field is defensively sane before it drives
// any math. Never throws: a malformed spec just degrades to something
// still-renderable (same total-function philosophy as save.ts).
// ---------------------------------------------------------------------------

interface NormalizedSpec {
  seed: number;
  length: number;
  hilliness: number;
  jumps: JumpSpec[];
  flatZones: Range[];
}

function normalizeSpec(spec: TerrainSpec): NormalizedSpec {
  const seed = Number.isFinite(spec.seed) ? spec.seed >>> 0 : 0;

  // A degenerate (zero/negative/NaN) length would produce a single-point,
  // useless "terrain" — floor it to a small-but-valid minimum instead.
  const minLength = TERRAIN.sampleSpacingPx * 4;
  const length = Number.isFinite(spec.length) ? Math.max(spec.length, minLength) : minLength;

  const hilliness = Number.isFinite(spec.hilliness) ? clamp(spec.hilliness, 0, 1) : 0;

  const jumps = Array.isArray(spec.jumps) ? spec.jumps : [];
  const flatZones = Array.isArray(spec.flatZones) ? spec.flatZones : [];

  return { seed, length, hilliness, jumps, flatZones };
}

// ---------------------------------------------------------------------------
// Rolling-hill shape: layered sine octaves + a value-noise layer, each
// bounded to [-1, 1] so their weighted sum is too — scaling by amplitude
// afterward keeps the whole thing provably within [-amplitude, amplitude]
// with no extra clamping needed for this part.
// ---------------------------------------------------------------------------

interface Octave {
  frequency: number;
  phase: number;
  weight: number;
}

/** Per-octave random wavelength detune range — center of the range (1.0)
 * means "exactly half the previous octave's wavelength"; the spread below
 * is a shape-design detail (not gameplay-tunable difficulty), so it lives
 * here as a named local constant rather than in constants.ts, matching
 * ui.ts's convention for presentation-only local constants. */
const OCTAVE_DETUNE_CENTER = 1;
const OCTAVE_DETUNE_SPREAD = 0.15; // +-15%

function buildOctaves(rng: () => number): Octave[] {
  const octaves: Octave[] = [];
  let wavelength = TERRAIN.baseWavelengthPx;
  let weight = 1;
  for (let i = 0; i < TERRAIN.octaves; i++) {
    // Random detune per octave so repeated levels/seeds don't share an
    // obviously identical hill cadence.
    const detune = OCTAVE_DETUNE_CENTER + (rng() * 2 - 1) * OCTAVE_DETUNE_SPREAD;
    octaves.push({ frequency: (2 * Math.PI) / (wavelength * detune), phase: rng() * Math.PI * 2, weight });
    wavelength *= 0.5; // each octave doubles the frequency (halves wavelength)
    weight *= TERRAIN.persistence;
  }
  return octaves;
}

function sineElevationUnit(x: number, octaves: Octave[]): number {
  let sum = 0;
  let weightSum = 0;
  for (const oct of octaves) {
    sum += oct.weight * Math.sin(x * oct.frequency + oct.phase);
    weightSum += oct.weight;
  }
  return weightSum > 0 ? sum / weightSum : 0; // weighted average of sines, so bounded to [-1, 1]
}

/** Random control points spaced `noiseControlSpacingPx` apart, each in
 * [-1, 1]. The count depends only on `length` (not hilliness), so the RNG
 * is consumed identically for any hilliness at the same seed/length. */
function buildNoiseControlPoints(rng: () => number, length: number): number[] {
  const count = Math.max(2, Math.floor(length / TERRAIN.noiseControlSpacingPx) + 2);
  const values: number[] = [];
  for (let i = 0; i < count; i++) values.push(rng() * 2 - 1);
  return values;
}

/** Smootherstep-interpolated value noise between the nearest two control
 * points — C2-continuous everywhere (see smootherstep doc comment), so it
 * never introduces a slope kink on its own. Bounded to [-1, 1]. */
function noiseElevationUnit(x: number, controlPoints: number[], length: number): number {
  const spacing = TERRAIN.noiseControlSpacingPx;
  const pos = clamp(x, 0, length) / spacing;
  const i0 = Math.min(Math.floor(pos), controlPoints.length - 1);
  const i1 = Math.min(i0 + 1, controlPoints.length - 1);
  const t = smootherstep(pos - i0);
  return lerp(controlPoints[i0], controlPoints[i1], t);
}

function baseElevationUnit(x: number, octaves: Octave[], controlPoints: number[], length: number): number {
  return (
    (1 - TERRAIN.noiseWeight) * sineElevationUnit(x, octaves) +
    TERRAIN.noiseWeight * noiseElevationUnit(x, controlPoints, length)
  );
}

// ---------------------------------------------------------------------------
// Sampling grid.
// ---------------------------------------------------------------------------

/** Sample x-positions from 0 up to (and always including) `length`, spaced
 * `sampleSpacingPx` apart. The final gap may be shorter than a full step
 * (never longer) when `length` isn't an exact multiple of the spacing. */
function buildSampleXs(length: number): number[] {
  const xs: number[] = [];
  for (let x = 0; x < length; x += TERRAIN.sampleSpacingPx) xs.push(x);
  xs.push(length);
  return xs;
}

/** Simple box-blur smoothing, applied in sample-index space (not px) for
 * `passes` rounds. With the smootherstep-based inputs above this mostly
 * shaves off residual jaggedness rather than reshaping the curve — see
 * PLAN-02: "layered sine/noise, smoothed". */
function smoothArray(values: number[], passes: number, halfWindow: number): number[] {
  let current = values;
  for (let p = 0; p < passes; p++) {
    const next = current.slice();
    for (let i = 0; i < current.length; i++) {
      let sum = 0;
      let count = 0;
      for (let k = -halfWindow; k <= halfWindow; k++) {
        const j = clamp(i + k, 0, current.length - 1);
        sum += current[j];
        count++;
      }
      next[i] = sum / count;
    }
    current = next;
  }
  return current;
}

// ---------------------------------------------------------------------------
// Jump ramps: a raised-cosine hump added on top of the rolling-hill
// elevation, zero (and zero-slope) at both ends so it always blends
// seamlessly into whatever terrain surrounds it.
// ---------------------------------------------------------------------------

function applyJumps(elevation: number[], xs: number[], jumps: JumpSpec[]): number[] {
  const out = elevation.slice();
  for (const jump of jumps) {
    if (!Number.isFinite(jump.x) || !Number.isFinite(jump.width) || !Number.isFinite(jump.height)) continue;

    const height = clamp(jump.height, 0, TERRAIN.maxJumpHeightPx);
    if (height <= 0) continue; // nothing to add

    // The raised-cosine ramp's steepest point has slope = height*pi/width
    // (reached a quarter of the way up, not at the peak itself — see the
    // comment on the bump formula below). A tall request paired with a
    // narrow width would otherwise produce a near-vertical, unclimbable
    // wall, so widen (never shrink height) until the steepest point is
    // under TERRAIN.maxJumpSlope.
    const minWidthForSlope = (height * Math.PI) / TERRAIN.maxJumpSlope;
    const width = Math.max(jump.width, TERRAIN.minJumpWidthPx, minWidthForSlope);

    // Deliberately NOT clamped to [0, length] here: `xs` itself never goes
    // outside that range, so a ramp that starts before 0 or runs past the
    // end of the level is naturally (and correctly) truncated by the loop
    // below — it just renders however much of the shape overlaps the
    // level. Clamping startX/endX instead would compress the same 0..1
    // shape into a shorter on-screen span near the world edges, which
    // would silently steepen it back past maxJumpSlope — exactly the bug
    // this whole function exists to prevent.
    const startX = jump.x;
    const endX = startX + width;

    for (let i = 0; i < xs.length; i++) {
      const x = xs[i];
      if (x < startX || x > endX) continue;
      const t = (x - startX) / width;
      // 0.5 * (1 - cos(2*pi*t)): 0 at t=0 and t=1 (WITH zero derivative
      // there too, same reasoning as smootherstep), peaking at `height`
      // when t=0.5 — a smooth launch hump, not a hard-edged wedge.
      out[i] += height * 0.5 * (1 - Math.cos(2 * Math.PI * t));
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Flat zones: force a constant height across [start, end], blended in/out
// over `flatBlendPx` on each side so scripted-event ground never has a
// height discontinuity where it meets the rolling hills.
// ---------------------------------------------------------------------------

/** Linearly-interpolated lookup into a same-length (elevation, xs) sample
 * pair at an arbitrary x. Used to pick a flat zone's target height even
 * when its `start` doesn't land exactly on a sample boundary. Plain linear
 * scan is fine — called a handful of times per level (once per flat zone),
 * never per-frame. */
function elevationAt(elevation: number[], xs: number[], x: number): number {
  const clampedX = clamp(x, xs[0], xs[xs.length - 1]);
  let i = 0;
  while (i < xs.length - 1 && xs[i + 1] < clampedX) i++;
  const i1 = Math.min(i + 1, xs.length - 1);
  const x0 = xs[i];
  const x1 = xs[i1];
  const t = x1 > x0 ? (clampedX - x0) / (x1 - x0) : 0;
  return lerp(elevation[i], elevation[i1], t);
}

function applyFlatZones(elevation: number[], xs: number[], flatZones: Range[]): number[] {
  const out = elevation.slice();
  const blend = TERRAIN.flatBlendPx;

  for (const zone of flatZones) {
    if (!Number.isFinite(zone.start) || !Number.isFinite(zone.end) || zone.end <= zone.start) continue;

    // Each zone blends against the PRE-flatten elevation (not `out`, which
    // may already carry an earlier zone's edits) so nearby/overlapping
    // zones don't compound into a weirder shape than either alone.
    const flatTarget = elevationAt(elevation, xs, zone.start);

    for (let i = 0; i < xs.length; i++) {
      const x = xs[i];
      if (x >= zone.start && x <= zone.end) {
        out[i] = flatTarget;
      } else if (x >= zone.start - blend && x < zone.start) {
        const t = smootherstep((x - (zone.start - blend)) / blend);
        out[i] = lerp(elevation[i], flatTarget, t);
      } else if (x > zone.end && x <= zone.end + blend) {
        const t = smootherstep((x - zone.end) / blend);
        out[i] = lerp(elevation[i], flatTarget, 1 - t);
      }
    }
  }

  return out;
}

// ---------------------------------------------------------------------------
// Public API: pure generation.
// ---------------------------------------------------------------------------

/**
 * Generates a deterministic ground heightmap from a `TerrainSpec`: the same
 * seed (and the same rest of the spec) always produces byte-identical
 * output — no Math.random(), no Date.now(), no hidden global state.
 *
 * Pipeline: seeded layered sine octaves + a value-noise layer (both bounded
 * to the level's amplitude budget) -> box-blur smoothing -> authored jump
 * ramps added on top -> flat zones stamped in with a smooth blend at their
 * edges. Every stage is written to never introduce a height discontinuity.
 *
 * Pure function — no Phaser/Matter/DOM involved, safe to call from Node
 * (this is exactly what tests/terrain.test.ts exercises).
 */
export function generateHeightmap(spec: TerrainSpec): TerrainPoint[] {
  const { seed, length, hilliness, jumps, flatZones } = normalizeSpec(spec);

  const rng = mulberry32(seed);
  const octaves = buildOctaves(rng);
  const controlPoints = buildNoiseControlPoints(rng, length);

  const xs = buildSampleXs(length);
  const amplitude = TERRAIN.maxAmplitudePx * hilliness;

  const rawElevation = xs.map((x) =>
    clamp(amplitude * baseElevationUnit(x, octaves, controlPoints, length), -amplitude, amplitude)
  );

  const smoothed = smoothArray(rawElevation, TERRAIN.smoothingPasses, TERRAIN.smoothingHalfWindow);
  const withJumps = applyJumps(smoothed, xs, jumps);
  const finalElevation = applyFlatZones(withJumps, xs, flatZones);

  return xs.map((x, i) => ({ x, y: TERRAIN.baseGroundYPx - finalElevation[i] }));
}

// ---------------------------------------------------------------------------
// Public API: Phaser/Matter construction (never imports Phaser at runtime —
// see module doc comment).
// ---------------------------------------------------------------------------

function heightAtPoints(points: TerrainPoint[], x: number): number {
  const clampedX = clamp(x, points[0].x, points[points.length - 1].x);
  let lo = 0;
  let hi = points.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (points[mid].x <= clampedX) lo = mid;
    else hi = mid;
  }
  const a = points[lo];
  const b = points[hi];
  const t = b.x > a.x ? (clampedX - a.x) / (b.x - a.x) : 0;
  return lerp(a.y, b.y, t);
}

function drawGround(
  scene: Phaser.Scene,
  points: TerrainPoint[],
  worldLength: number,
  colors: TerrainColors
): Phaser.GameObjects.Graphics {
  const fill = colors.fill ?? PALETTE.grass;
  const edge = colors.edge ?? PALETTE.outline;
  const bottomY = TERRAIN.groundFillBottomYPx;

  const graphics = scene.add.graphics();
  graphics.setDepth(DEPTHS.terrain);

  // Solid theme-colored fill: trace the surface left-to-right, then close
  // the polygon along the world bottom back to the start.
  graphics.fillStyle(fill, 1);
  graphics.beginPath();
  graphics.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) graphics.lineTo(points[i].x, points[i].y);
  graphics.lineTo(worldLength, bottomY);
  graphics.lineTo(0, bottomY);
  graphics.closePath();
  graphics.fillPath();

  // Thicker top-edge stroke for a crisp dirt/asphalt lip along the surface.
  graphics.lineStyle(TERRAIN.edgeThicknessPx, edge, 1);
  graphics.beginPath();
  graphics.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) graphics.lineTo(points[i].x, points[i].y);
  graphics.strokePath();

  return graphics;
}

/** Builds one static Matter rectangle body spanning `a` to `b`, its top
 * face aligned to the a-b line: the body's center is offset half a
 * thickness along the segment's downward normal, so the rectangle sits
 * BELOW the rendered surface line rather than straddling it (which would
 * otherwise float the physical ground half a thickness above what's
 * drawn). */
function makeSegmentBody(scene: Phaser.Scene, a: TerrainPoint, b: TerrainPoint): MatterJS.BodyType {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const segLength = Math.max(Math.hypot(dx, dy), 1); // guard a zero-length segment
  const angle = Math.atan2(dy, dx);

  let nx = -dy / segLength;
  let ny = dx / segLength;
  if (ny < 0) {
    nx = -nx;
    ny = -ny;
  } // pick whichever perpendicular points downward (into the ground)

  const half = TERRAIN.bodyThicknessPx / 2;
  const cx = (a.x + b.x) / 2 + nx * half;
  const cy = (a.y + b.y) / 2 + ny * half;

  return scene.matter.add.rectangle(cx, cy, segLength, TERRAIN.bodyThicknessPx, {
    isStatic: true,
    angle,
    friction: TERRAIN.groundFriction,
    label: TERRAIN_BODY_LABEL,
  });
}

/** Builds the ground collision chain from far fewer/longer segments than
 * the (dense) visual heightmap — see TERRAIN.segmentTargetPx doc comment
 * for the physics-body budget this respects. */
function buildGroundBodies(scene: Phaser.Scene, points: TerrainPoint[]): MatterJS.BodyType[] {
  const stride = Math.max(1, Math.round(TERRAIN.segmentTargetPx / TERRAIN.sampleSpacingPx));
  const bodies: MatterJS.BodyType[] = [];

  for (let i = 0; i < points.length - 1; i += stride) {
    const a = points[i];
    const b = points[Math.min(i + stride, points.length - 1)];
    bodies.push(makeSegmentBody(scene, a, b));
  }

  return bodies;
}

/**
 * Builds a level's ground: generates the heightmap, draws it (theme-
 * colored fill + a thicker dirt/asphalt top edge), and builds the Matter
 * static collision chain — then returns a handle for the consuming scene
 * (spawn the bike / place the finish flag via `heightAt`, tear down via
 * `destroy` on restart).
 *
 * `scene` is used purely as a runtime handle to Phaser's Graphics/Matter
 * factories — this function never imports Phaser itself (see module doc
 * comment), so it's the caller's job to pass a real, already-constructed
 * Phaser.Scene from browser code.
 */
export function createTerrain(scene: Phaser.Scene, spec: TerrainSpec, colors: TerrainColors = {}): TerrainHandle {
  const points = generateHeightmap(spec);
  const worldLength = points[points.length - 1].x;

  const graphics = drawGround(scene, points, worldLength, colors);
  const bodies = buildGroundBodies(scene, points);

  function heightAt(x: number): number {
    return heightAtPoints(points, x);
  }

  function destroy(): void {
    scene.matter.world.remove(bodies);
    graphics.destroy();
  }

  return { points, worldLength, heightAt, bodies, graphics, destroy };
}
