// Per-theme backdrop ART (PLAN-10 ST-5): the reusable "motif drawers" + pure
// geometry helpers that turn each theme's flat silhouette bands (themes.ts's
// placeholder art) into a cohesive, cute pixel-art place — real skylines,
// rolling hills, tree-lines, house rooflines, a bridge truss, construction
// cranes, a shimmering river, and party bunting — plus a stepped-gradient sky,
// a soft celestial disc, and drifting clouds.
//
// SAME CONTRACT AS themes.ts / terrain.ts / decorations.ts: this file has NO
// RUNTIME import of 'phaser' (only `import type Phaser`, erased at compile
// time), so Vitest can import it in plain Node. Every pure helper below
// (lerpColor / hash01 / steppedBands / buildBuildingRects / wrapX) never
// touches Phaser and is exercised directly by tests/backdropArt.test.ts; the
// motif drawers only ever CALL METHODS on the `scene` handle handed to them at
// runtime by themes.ts's createBackdrop (which is called by the real,
// browser-side GameScene). It imports ONLY plain constants (DEPTHS/PALETTE
// from constants.ts, which is itself Phaser-free) plus two already-tested pure
// helpers from themes.ts — buildSilhouettePoints/evenlySpacedX — used only
// INSIDE drawer function bodies (never at module-eval time), so the
// themes<->backdropArt import cycle is inert (function declarations are
// hoisted; nothing cross-module is read while either module is still
// initialising).
//
// ZOOM-SAFETY / DETERMINISM (the load-bearing invariants — see themes.ts's
// module doc "THE ZOOM GOTCHA"):
//   * Parallax motif layers are drawn across the FULL padded range themes.ts
//     hands them (backdropContentRangePx) with scrollFactor(fx, 0) — vertical
//     ALWAYS camera-pinned — so they can never run out of content and reveal a
//     gap at any scroll/zoom. This module trusts that range; it never invents
//     its own narrower one.
//   * Every shape is DETERMINISTIC: per-building / per-house / per-cloud
//     variation is derived from an integer index via hash01 (a pure integer
//     hash), never Math.random — so screenshots stay stable and the geometry
//     helpers are Node-testable.
//   * ZERO Matter bodies — everything here is a plain Graphics / Shape.
//   * Every GameObject created is RETURNED so themes.ts can track + destroy it
//     (leak-free teardown across the sweep's many restarts).
import type Phaser from 'phaser';
import { DEPTHS, PALETTE } from './constants';
import { buildSilhouettePoints, evenlySpacedX } from './themes';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** The set of backdrop motifs a parallax layer can render as. Assigned per
 * layer in themes.ts's THEMES table; createBackdrop dispatches to the matching
 * drawer below. Deliberately a small, reusable set (NORTH_STAR: one hand, not
 * twenty artists) covering the 15-theme city arc. */
export type MotifKind =
  | 'hills' // rolling hills (continuous filled ridge + a lighter highlight)
  | 'trees' // a lumpy tree-line (scalloped canopy over a solid foliage mass)
  | 'buildings' // a city skyline: varied blocks with lit windows
  | 'houses' // a row of cute peaked-roof houses (pastel body + dark roof)
  | 'bridge' // a truss bridge: chords + verticals + diagonals + piers
  | 'cranes' // a construction site: tower cranes + half-built frames
  | 'water' // a river band with a wavy waterline + shimmer dashes
  | 'party'; // festive: bunting garland + distant tents + balloons

/** The minimal shape a motif drawer needs from a parallax layer. themes.ts's
 * ParallaxLayerDef is structurally assignable to this (it adds `motif`). Kept
 * local so backdropArt imports NO value from themes except the two pure
 * helpers (avoids widening the import cycle). */
export interface BackdropLayer {
  /** Horizontal parallax rate (0..1); vertical is always camera-pinned. */
  scrollFactor: number;
  /** The layer's base fill color (the theme's chosen tone for this band). */
  color: number;
  /** Top of the layer's band, DESIGN-space px (screen-relative). */
  y: number;
  /** Band height, design px. The motif is drawn within [y, y + height]. */
  height: number;
}

/** A camera-fixed celestial disc (sun / low sun / moon) for open-sky themes. */
export interface CelestialSpec {
  /** Center, DESIGN-space px (screen-relative — the disc is camera-fixed). */
  x: number;
  y: number;
  /** Disc radius, px. */
  radius: number;
  /** Disc fill color. */
  color: number;
  /** Soft halo color (a larger, faint disc behind). Defaults to `color`. */
  halo?: number;
}

/** Per-theme drifting-cloud config (open-sky themes only). */
export interface CloudSpec {
  /** Cloud body color (defaults to white). Warm-tinted for sunset. */
  color?: number;
  /** How many clouds to scatter (defaults to DEFAULT_CLOUD_COUNT). */
  count?: number;
}

type MotifDrawer = (
  scene: Phaser.Scene,
  layer: BackdropLayer,
  range: { minX: number; maxX: number },
  accent: number
) => Phaser.GameObjects.GameObject[];

// ---------------------------------------------------------------------------
// Pure helpers — no Phaser, tested by tests/backdropArt.test.ts.
// ---------------------------------------------------------------------------

/** Integer RGB lerp between two 0xRRGGBB colors. `t` is clamped to [0,1]; t=0
 * returns `a`, t=1 returns `b`. Renderer-safe (a plain color int, drawn with
 * Graphics#fillStyle) unlike a WebGL-only gradient — see themes.ts's module
 * doc on why fillGradientStyle is avoided. Pure/deterministic. */
export function lerpColor(a: number, b: number, t: number): number {
  const tt = t < 0 ? 0 : t > 1 ? 1 : t;
  const ar = (a >> 16) & 0xff;
  const ag = (a >> 8) & 0xff;
  const ab = a & 0xff;
  const br = (b >> 16) & 0xff;
  const bg = (b >> 8) & 0xff;
  const bb = b & 0xff;
  const r = Math.round(ar + (br - ar) * tt);
  const g = Math.round(ag + (bg - ag) * tt);
  const bl = Math.round(ab + (bb - ab) * tt);
  return (r << 16) | (g << 8) | bl;
}

/** Darken a color toward the shared dark outline (for edge/roof shading). */
export function shade(color: number, amount: number): number {
  return lerpColor(color, PALETTE.outline, amount);
}
/** Lighten a color toward white (for highlights / shimmer / lit hazes). */
export function tint(color: number, amount: number): number {
  return lerpColor(color, PALETTE.white, amount);
}

/** A deterministic pseudo-random value in [0, 1) from an integer key — the
 * one and only source of per-element variation in this module (NEVER
 * Math.random), so every backdrop shape is a pure function of POSITION and
 * screenshots stay stable. A small integer avalanche hash (finalizer-style,
 * all via Math.imul so it stays exact in 32-bit). */
export function hash01(n: number): number {
  let h = Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** One horizontal color band of the stepped-gradient sky. */
export interface GradientBand {
  color: number;
  /** Top edge, design px. */
  y: number;
  /** Band height, design px. */
  height: number;
}

/**
 * Splits [y, y + height] into `count` equal, contiguous bands whose colors
 * step linearly from `top` (first band) to `bottom` (last band) — the
 * renderer-safe stand-in for a true gradient sky (see themes.ts's module doc:
 * Graphics#fillGradientStyle is WebGL-only and would vanish on a Canvas
 * fallback, so we stack flat interpolated bands instead). count<1 is floored
 * to 1; a single band uses `top`. Pure/deterministic. */
export function steppedBands(
  top: number,
  bottom: number,
  count: number,
  y: number,
  height: number
): GradientBand[] {
  const n = count >= 1 ? Math.floor(count) : 1;
  const bandH = height / n;
  const bands: GradientBand[] = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : i / (n - 1);
    bands.push({ color: lerpColor(top, bottom, t), y: y + i * bandH, height: bandH });
  }
  return bands;
}

/** One building slab: a vertical box from `topY` down to the layer baseline. */
export interface BuildingRect {
  /** Left edge, world/local px. */
  x: number;
  /** Width, px. */
  w: number;
  /** Top edge, design px (smaller = taller). */
  topY: number;
  /** Sequence index (0-based) — the deterministic key for its windows/roof. */
  index: number;
}

/** Inputs to buildBuildingRects (named for readable call sites/tests). */
export interface BuildingOptions {
  /** Left/right edges of the range to fill (the padded backdrop range). */
  minX: number;
  maxX: number;
  /** Building width range, px. */
  minW: number;
  maxW: number;
  /** Flat gap between adjacent buildings, px. */
  gap: number;
  /** Building-top y range, design px: minTopY = tallest (smallest y),
   * maxTopY = shortest (largest y). */
  minTopY: number;
  maxTopY: number;
  /** Hash seed so far/near layers get different (but deterministic) skylines. */
  seed: number;
}

/**
 * Marches a deterministic run of building slabs across [minX, maxX], each with
 * a hashed width (in [minW, maxW]) and hashed top y (in [minTopY, maxTopY]),
 * separated by `gap`. Always emits at least the whole requested range (the
 * last slab starts < maxX and may extend past it — the caller draws down to
 * its own baseline). Guards degenerate inputs (minX >= maxX -> [], a non-
 * positive effective step -> floored to 1) so it can never loop forever —
 * same "total function" discipline as themes.ts's buildSilhouettePoints. */
export function buildBuildingRects(opts: BuildingOptions): BuildingRect[] {
  const { minX, maxX, minW, maxW, gap, minTopY, maxTopY, seed } = opts;
  if (minX >= maxX) return [];
  const safeGap = gap >= 0 ? gap : 0;
  const loW = Math.min(minW, maxW);
  const hiW = Math.max(minW, maxW);
  const loT = Math.min(minTopY, maxTopY);
  const hiT = Math.max(minTopY, maxTopY);

  const rects: BuildingRect[] = [];
  let x = minX;
  let i = 0;
  // Hard cap: even at a 1px step the padded range can't need more than this
  // many slabs — a belt for the degenerate loW <= 0 case (step floored to 1).
  const maxCount = 100000;
  while (x < maxX && i < maxCount) {
    const w = loW + hash01(seed + i * 2) * (hiW - loW);
    const topY = loT + hash01(seed + i * 2 + 1) * (hiT - loT);
    rects.push({ x, w, topY, index: i });
    const step = w + safeGap > 0 ? w + safeGap : 1;
    x += step;
    i++;
  }
  return rects;
}

/**
 * Wraps `value` into the half-open window [min, min + width) with true modular
 * arithmetic (handles negatives) — the recycle math for autonomous cloud
 * drift: a cloud whose x marches past the window's right edge reappears at the
 * left. Degenerate width (<= 0 / NaN) returns `min` (never NaN/loop). Pure. */
export function wrapX(value: number, min: number, width: number): number {
  if (!(width > 0)) return min;
  return min + ((((value - min) % width) + width) % width);
}

// ---------------------------------------------------------------------------
// Presentation-only local constants (themes.ts / decorations.ts precedent:
// backdrop-drawing SHAPE knobs with no gameplay effect stay as documented
// local consts, not a constants.ts block). All px at the 1280x720 DESIGN
// scale. Grouped by motif.
// ---------------------------------------------------------------------------

// --- Hills / trees ---------------------------------------------------------
const HILL_STEP_PX = 60;
const HILL_BASE_HEIGHT_FRACTION = 0.6;
const HILL_VARIANCE_FRACTION = 0.35;
const HILL_WAVELENGTH_HEIGHT_MULTIPLIER = 5;
/** A lighter highlight stroke along the ridge top, px. */
const HILL_HIGHLIGHT_PX = 3;
/** Tree-line canopy spacing / radius, px, and how much radius/height wobble. */
const TREE_SPACING_PX = 34;
const TREE_RADIUS_PX = 26;
const TREE_RADIUS_VARIANCE_PX = 10;
const TREE_CROWN_RISE_PX = 18;

// --- Buildings -------------------------------------------------------------
const BUILDING_GAP_PX = 10;
/** Window grid: pitch (center spacing), size, and inset from the slab edges. */
const WINDOW_PITCH_X_PX = 22;
const WINDOW_PITCH_Y_PX = 22;
const WINDOW_SIZE_PX = 10;
const WINDOW_INSET_PX = 9;
/** Gap between a slab's flat top and its first window row, px. */
const WINDOW_TOP_MARGIN_PX = 16;
/** Fraction of a slab's right edge painted a touch darker (a lit/shaded face). */
const BUILDING_SHADE_FRACTION = 0.22;
/** Antenna/parapet: how tall the little roof mast is, px. */
const BUILDING_MAST_PX = 16;

// --- Houses ----------------------------------------------------------------
const HOUSE_MIN_W_PX = 92;
const HOUSE_MAX_W_PX = 150;
const HOUSE_GAP_PX = 16;
/** Body-top y range within the band, as fractions of band height above base. */
const HOUSE_MIN_BODY_FRACTION = 0.34;
const HOUSE_MAX_BODY_FRACTION = 0.6;
/** Roof height + eave overhang, px. */
const HOUSE_ROOF_HEIGHT_PX = 34;
const HOUSE_ROOF_OVERHANG_PX = 8;
const HOUSE_WINDOW_SIZE_PX = 14;
const HOUSE_DOOR_W_PX = 16;
const HOUSE_DOOR_H_PX = 26;

// --- Bridge ----------------------------------------------------------------
const BRIDGE_CHORD_PX = 8;
const BRIDGE_TRUSS_MODULE_PX = 90;
const BRIDGE_TRUSS_HEIGHT_PX = 54;
const BRIDGE_MEMBER_PX = 4;
const BRIDGE_PIER_W_PX = 18;
const BRIDGE_PIER_SPACING_PX = 540;

// --- Cranes / construction -------------------------------------------------
const CRANE_SPACING_PX = 620;
const CRANE_MAST_W_PX = 14;
const CRANE_JIB_PX = 4;
const CRANE_COUNTERWEIGHT_W_PX = 26;
const CRANE_COUNTERWEIGHT_H_PX = 18;
const FRAME_SPACING_PX = 300;
const FRAME_BEAM_PX = 5;

// --- Water -----------------------------------------------------------------
const WATER_WAVE_AMPLITUDE_PX = 6;
const WATER_WAVELENGTH_PX = 220;
const WATER_SHIMMER_ROWS = 3;
const WATER_SHIMMER_DASH_PX = 34;
const WATER_SHIMMER_SPACING_PX = 96;

// --- Party -----------------------------------------------------------------
const BUNTING_SPACING_PX = 46;
const BUNTING_SAG_PX = 16;
const BUNTING_FLAG_W_PX = 26;
const BUNTING_FLAG_H_PX = 30;
const TENT_SPACING_PX = 520;
const TENT_W_PX = 130;
const TENT_H_PX = 96;
const PARTY_BALLOON_SPACING_PX = 250;
const PARTY_BALLOON_R_PX = 13;
const PARTY_BALLOON_STRING_PX = 34;

// A cheap "party" trio of pastel balloon colors (deterministic per-index). */
const PARTY_BALLOON_COLORS = [PALETTE.coral, PALETTE.lavender, PALETTE.sunshine];

// ---------------------------------------------------------------------------
// Sky + celestial + clouds (camera-fixed pieces).
// ---------------------------------------------------------------------------

/**
 * Stacks `count` flat, camera-fixed, oversized bands stepping from sky.top to
 * sky.bottom across the [pivotY - height/2, pivotY + height/2] oversized
 * vertical span — the zoom-safe replacement for themes.ts's old two flat sky
 * bands (same cameraFixedOversizePx technique, more bands). Each band is 1px
 * taller than its slot so rounding can never open a seam between bands.
 */
export function drawSteppedSky(
  scene: Phaser.Scene,
  top: number,
  bottom: number,
  count: number,
  pivotX: number,
  pivotY: number,
  width: number,
  height: number
): Phaser.GameObjects.GameObject[] {
  const bands = steppedBands(top, bottom, count, pivotY - height / 2, height);
  return bands.map((b) => {
    const rect = scene.add.rectangle(pivotX, b.y + b.height / 2, width, b.height + 1, b.color);
    rect.setScrollFactor(0);
    rect.setDepth(DEPTHS.background);
    return rect;
  });
}

/** A soft camera-fixed celestial disc: a faint halo behind a solid disc. */
export function drawCelestial(
  scene: Phaser.Scene,
  spec: CelestialSpec
): Phaser.GameObjects.GameObject[] {
  const halo = scene.add.circle(spec.x, spec.y, spec.radius * 1.8, spec.halo ?? spec.color, 0.22);
  halo.setScrollFactor(0);
  halo.setDepth(DEPTHS.background);
  const disc = scene.add.circle(spec.x, spec.y, spec.radius, spec.color, 1);
  disc.setScrollFactor(0);
  disc.setDepth(DEPTHS.background);
  return [halo, disc];
}

/** Draws ONE puffy cloud centered on the Graphics' own (0,0) so the caller can
 * cheaply move it by setting `.x` / `.y` each frame (the autonomous drift).
 * A soft grey underside shadow, then the light body on top. Camera-fixed +
 * depth are set by the caller (createBackdrop). */
export function drawCloud(
  scene: Phaser.Scene,
  scale: number,
  color: number,
  shadowColor: number
): Phaser.GameObjects.Graphics {
  const s = scale;
  const g = scene.add.graphics();
  // Underside shadow (same silhouette, nudged down a touch).
  g.fillStyle(shadowColor, 1);
  cloudBody(g, s, 4 * s);
  // Body.
  g.fillStyle(color, 1);
  cloudBody(g, s, 0);
  return g;
}

/** The puffy-cloud silhouette (3 bumps + a flat base slab), drawn at a given
 * vertical offset — shared by the shadow + body passes of drawCloud. */
function cloudBody(g: Phaser.GameObjects.Graphics, s: number, dy: number): void {
  g.fillCircle(-30 * s, -2 * s + dy, 18 * s);
  g.fillCircle(-6 * s, -13 * s + dy, 25 * s);
  g.fillCircle(22 * s, -4 * s + dy, 21 * s);
  g.fillRect(-48 * s, -6 * s + dy, 94 * s, 8 * s);
}

// ---------------------------------------------------------------------------
// Motif drawers. Each draws its whole layer into a SINGLE Graphics (batched
// fills — cheap, one GameObject) spanning `range`, at scrollFactor(fx, 0) and
// DEPTHS.background, and returns [that graphics] (+ any extra objects) for
// teardown tracking.
// ---------------------------------------------------------------------------

/** Attaches the standard parallax + depth to a freshly-added graphics. */
function pinLayer(g: Phaser.GameObjects.Graphics, layer: BackdropLayer): void {
  g.setScrollFactor(layer.scrollFactor, 0);
  g.setDepth(DEPTHS.background);
}

/** Rolling hills: a deterministic wavy filled ridge (themes.ts's
 * buildSilhouettePoints) with a lighter highlight stroke along the crest. */
export const drawHillsMotif: MotifDrawer = (scene, layer, range) => {
  const baselineY = layer.y + layer.height;
  const points = buildSilhouettePoints({
    minX: range.minX,
    maxX: range.maxX,
    stepPx: HILL_STEP_PX,
    baselineY,
    baseHeightPx: layer.height * HILL_BASE_HEIGHT_FRACTION,
    variancePx: layer.height * HILL_VARIANCE_FRACTION,
    wavelengthPx: layer.height * HILL_WAVELENGTH_HEIGHT_MULTIPLIER,
  });

  const g = scene.add.graphics();
  g.fillStyle(layer.color, 1);
  g.beginPath();
  g.moveTo(points[0].x, baselineY);
  for (const p of points) g.lineTo(p.x, p.y);
  g.lineTo(points[points.length - 1].x, baselineY);
  g.closePath();
  g.fillPath();

  g.lineStyle(HILL_HIGHLIGHT_PX, tint(layer.color, 0.4), 1);
  g.beginPath();
  g.moveTo(points[0].x, points[0].y);
  for (const p of points) g.lineTo(p.x, p.y);
  g.strokePath();

  pinLayer(g, layer);
  return [g];
};

/** A lumpy tree-line: a solid foliage mass up to a mid line, then scalloped
 * canopy circles (with a few darker ones for depth) cresting above it. */
export const drawTreesMotif: MotifDrawer = (scene, layer, range) => {
  const baselineY = layer.y + layer.height;
  const crownY = layer.y + layer.height * 0.45; // where the solid mass tops out
  const g = scene.add.graphics();

  // Solid foliage mass from crownY down to baseline.
  g.fillStyle(layer.color, 1);
  g.fillRect(range.minX, crownY, range.maxX - range.minX, baselineY - crownY);

  // Scalloped canopy: overlapping circles cresting above crownY.
  const dark = shade(layer.color, 0.18);
  let i = 0;
  for (let x = range.minX; x <= range.maxX; x += TREE_SPACING_PX) {
    const r = TREE_RADIUS_PX + hash01(i * 5 + 1) * TREE_RADIUS_VARIANCE_PX;
    const cy = crownY - hash01(i * 5 + 2) * TREE_CROWN_RISE_PX;
    g.fillStyle(hash01(i * 5 + 3) > 0.7 ? dark : layer.color, 1);
    g.fillCircle(x, cy, r);
    i++;
  }
  // A lighter dab on some crowns for a sunlit top.
  g.fillStyle(tint(layer.color, 0.32), 1);
  i = 0;
  for (let x = range.minX; x <= range.maxX; x += TREE_SPACING_PX * 2) {
    const cy = crownY - hash01(i * 5 + 2) * TREE_CROWN_RISE_PX;
    g.fillCircle(x - 6, cy - 6, 6);
    i += 2;
  }

  pinLayer(g, layer);
  return [g];
};

/** A city skyline: varied slabs rising to the baseline, each with a shaded
 * face, a lit/unlit window grid, and (some) a little roof mast. `accent` is
 * the lit-window glow (warm sunshine on dusk themes -> windows glow). Far vs
 * near differ only via band geometry (themes.ts sets the y/height). */
export const drawBuildingsMotif: MotifDrawer = (scene, layer, range, accent) => {
  const baselineY = layer.y + layer.height;
  const g = scene.add.graphics();
  const shadeColor = shade(layer.color, BUILDING_SHADE_FRACTION);
  const unlit = shade(layer.color, 0.4);
  // Slab widths/heights scale with the band so a short band (highway) gets
  // squat blocks and a tall one (downtown) gets skyscrapers.
  const minW = Math.max(46, layer.height * 0.42);
  const maxW = Math.max(minW + 20, layer.height * 0.95);
  const minTopY = layer.y; // tallest reaches the band top
  const maxTopY = layer.y + layer.height * 0.55; // shortest
  const seed = Math.round(layer.y * 13 + layer.height * 7);

  const slabs = buildBuildingRects({
    minX: range.minX,
    maxX: range.maxX,
    minW,
    maxW,
    gap: BUILDING_GAP_PX,
    minTopY,
    maxTopY,
    seed,
  });

  for (const b of slabs) {
    const h = baselineY - b.topY;
    g.fillStyle(layer.color, 1);
    g.fillRect(b.x, b.topY, b.w, h);
    // A slightly darker right face for a hint of pixel-art volume.
    g.fillStyle(shadeColor, 1);
    g.fillRect(b.x + b.w * (1 - 0.28), b.topY, b.w * 0.28, h);
    // A thin dark cap along the roof edge (the STYLE-GUIDE 1px-ish accent).
    g.fillStyle(PALETTE.outline, 1);
    g.fillRect(b.x, b.topY, b.w, 2);
    // Some slabs get a little roof mast/antenna.
    if (hash01(b.index * 17 + 3) > 0.6) {
      g.fillRect(b.x + b.w * 0.5 - 1, b.topY - BUILDING_MAST_PX, 3, BUILDING_MAST_PX);
    }
    drawWindows(g, b, baselineY, accent, unlit);
  }

  pinLayer(g, layer);
  return [g];
};

/** Lit/unlit window grid for one building slab, deterministic per window. */
function drawWindows(
  g: Phaser.GameObjects.Graphics,
  b: BuildingRect,
  baselineY: number,
  accent: number,
  unlit: number
): void {
  const left = b.x + WINDOW_INSET_PX;
  const right = b.x + b.w - WINDOW_INSET_PX - WINDOW_SIZE_PX;
  const top = b.topY + WINDOW_TOP_MARGIN_PX;
  const bottom = baselineY - WINDOW_INSET_PX - WINDOW_SIZE_PX;
  for (let wy = top; wy <= bottom; wy += WINDOW_PITCH_Y_PX) {
    for (let wx = left; wx <= right; wx += WINDOW_PITCH_X_PX) {
      const lit = hash01(b.index * 977 + Math.round(wx) * 3 + Math.round(wy) * 5) > 0.42;
      g.fillStyle(lit ? accent : unlit, 1);
      g.fillRect(wx, wy, WINDOW_SIZE_PX, WINDOW_SIZE_PX);
    }
  }
}

/** A row of cute peaked-roof houses: soft-pastel bodies (theme color eased
 * toward cream), a darker overhanging roof, a warm lit window + a door. */
export const drawHousesMotif: MotifDrawer = (scene, layer, range, accent) => {
  const baselineY = layer.y + layer.height;
  const g = scene.add.graphics();
  const bodyColor = lerpColor(layer.color, PALETTE.cream, 0.35);
  const roofColor = shade(layer.color, 0.42);
  const doorColor = shade(layer.color, 0.55);

  const houses = buildBuildingRects({
    minX: range.minX,
    maxX: range.maxX,
    minW: HOUSE_MIN_W_PX,
    maxW: HOUSE_MAX_W_PX,
    gap: HOUSE_GAP_PX,
    minTopY: layer.y + layer.height * (1 - HOUSE_MAX_BODY_FRACTION),
    maxTopY: layer.y + layer.height * (1 - HOUSE_MIN_BODY_FRACTION),
    seed: Math.round(layer.y * 5 + layer.height * 3 + 101),
  });

  for (const hs of houses) {
    const bodyTop = hs.topY;
    // Body.
    g.fillStyle(bodyColor, 1);
    g.fillRect(hs.x, bodyTop, hs.w, baselineY - bodyTop);
    // Peaked roof (overhanging both eaves), drawn as a filled triangle.
    g.fillStyle(roofColor, 1);
    g.fillTriangle(
      hs.x - HOUSE_ROOF_OVERHANG_PX,
      bodyTop,
      hs.x + hs.w + HOUSE_ROOF_OVERHANG_PX,
      bodyTop,
      hs.x + hs.w / 2,
      bodyTop - HOUSE_ROOF_HEIGHT_PX
    );
    // A warm lit window (accent) and a door.
    const winX = hs.x + hs.w * 0.5 - HOUSE_WINDOW_SIZE_PX / 2;
    const winY = bodyTop + 12;
    g.fillStyle(accent, 1);
    g.fillRect(winX, winY, HOUSE_WINDOW_SIZE_PX, HOUSE_WINDOW_SIZE_PX);
    g.fillStyle(PALETTE.outline, 1);
    g.fillRect(winX + HOUSE_WINDOW_SIZE_PX / 2 - 1, winY, 2, HOUSE_WINDOW_SIZE_PX); // muntin
    g.fillStyle(doorColor, 1);
    g.fillRect(hs.x + hs.w * 0.22, baselineY - HOUSE_DOOR_H_PX, HOUSE_DOOR_W_PX, HOUSE_DOOR_H_PX);
  }

  pinLayer(g, layer);
  return [g];
};

/** A truss bridge: a top chord + deck chord across the range, vertical posts
 * and alternating diagonals between them (the truss web), and thicker piers
 * dropping to the baseline at wide intervals. */
export const drawBridgeMotif: MotifDrawer = (scene, layer, range) => {
  const baselineY = layer.y + layer.height;
  const deckY = layer.y + layer.height * 0.42;
  const topY = deckY - BRIDGE_TRUSS_HEIGHT_PX;
  const g = scene.add.graphics();
  const member = shade(layer.color, 0.25);

  // Chords.
  g.fillStyle(layer.color, 1);
  g.fillRect(range.minX, topY, range.maxX - range.minX, BRIDGE_CHORD_PX);
  g.fillRect(range.minX, deckY, range.maxX - range.minX, BRIDGE_CHORD_PX);

  // Truss web: verticals + alternating diagonals per module.
  g.lineStyle(BRIDGE_MEMBER_PX, member, 1);
  let i = 0;
  for (let x = range.minX; x <= range.maxX; x += BRIDGE_TRUSS_MODULE_PX) {
    g.beginPath();
    g.moveTo(x, topY);
    g.lineTo(x, deckY);
    g.strokePath();
    g.beginPath();
    if (i % 2 === 0) {
      g.moveTo(x, topY);
      g.lineTo(x + BRIDGE_TRUSS_MODULE_PX, deckY);
    } else {
      g.moveTo(x, deckY);
      g.lineTo(x + BRIDGE_TRUSS_MODULE_PX, topY);
    }
    g.strokePath();
    i++;
  }

  // Piers down to the baseline (the river/road passes beneath).
  g.fillStyle(shade(layer.color, 0.12), 1);
  for (const px of evenlySpacedX(range.minX, range.maxX, BRIDGE_PIER_SPACING_PX)) {
    g.fillRect(px - BRIDGE_PIER_W_PX / 2, deckY, BRIDGE_PIER_W_PX, baselineY - deckY);
  }

  pinLayer(g, layer);
  return [g];
};

/** A construction site: half-built building frames + tower cranes (mast, jib,
 * counterweight, hook line) at deterministic intervals. */
export const drawCranesMotif: MotifDrawer = (scene, layer, range, accent) => {
  const baselineY = layer.y + layer.height;
  const g = scene.add.graphics();
  const frameColor = shade(layer.color, 0.18);

  // Half-built frames: short boxes with a girder grid.
  g.lineStyle(FRAME_BEAM_PX, frameColor, 1);
  let f = 0;
  for (let x = range.minX; x <= range.maxX; x += FRAME_SPACING_PX) {
    const fw = 120 + hash01(f * 3 + 1) * 90;
    const fh = layer.height * (0.35 + hash01(f * 3 + 2) * 0.35);
    const fy = baselineY - fh;
    g.strokeRect(x, fy, fw, fh);
    // A couple of floor beams.
    const floors = 2 + Math.floor(hash01(f * 3 + 3) * 2);
    for (let k = 1; k < floors; k++) {
      const yy = fy + (fh / floors) * k;
      g.beginPath();
      g.moveTo(x, yy);
      g.lineTo(x + fw, yy);
      g.strokePath();
    }
    f++;
  }

  // Tower cranes.
  const craneColor = shade(layer.color, 0.35);
  let c = 0;
  for (const cx of evenlySpacedX(range.minX + 200, range.maxX, CRANE_SPACING_PX)) {
    const mastTop = layer.y - hash01(c * 7 + 1) * 30; // rises above the band top
    // Mast.
    g.fillStyle(craneColor, 1);
    g.fillRect(cx - CRANE_MAST_W_PX / 2, mastTop, CRANE_MAST_W_PX, baselineY - mastTop);
    // Jib (long right arm) + counter-jib (short left) with a counterweight.
    const jibLen = 150 + hash01(c * 7 + 2) * 90;
    g.fillRect(cx, mastTop, jibLen, CRANE_JIB_PX + 2);
    g.fillRect(cx - 60, mastTop, 60, CRANE_JIB_PX + 2);
    g.fillRect(
      cx - 60 - CRANE_COUNTERWEIGHT_W_PX,
      mastTop - 4,
      CRANE_COUNTERWEIGHT_W_PX,
      CRANE_COUNTERWEIGHT_H_PX
    );
    // Hook line + a little accent hook block near the jib tip.
    const hookX = cx + jibLen * (0.6 + hash01(c * 7 + 3) * 0.3);
    const hookLen = 40 + hash01(c * 7 + 4) * 60;
    g.fillRect(hookX - 1, mastTop, 2, hookLen);
    g.fillStyle(accent, 1);
    g.fillRect(hookX - 5, mastTop + hookLen, 10, 8);
    c++;
  }

  pinLayer(g, layer);
  return [g];
};

/** A river band: a solid fill under a gently wavy waterline, plus a few rows
 * of lighter shimmer dashes (reflections) offset per row. */
export const drawWaterMotif: MotifDrawer = (scene, layer, range) => {
  const baselineY = layer.y + layer.height;
  const waterlineY = layer.y + layer.height * 0.3;
  const g = scene.add.graphics();

  // Solid water under a wavy top edge.
  g.fillStyle(layer.color, 1);
  g.beginPath();
  g.moveTo(range.minX, baselineY);
  for (let x = range.minX; x <= range.maxX; x += 24) {
    const y = waterlineY - Math.sin((x / WATER_WAVELENGTH_PX) * Math.PI * 2) * WATER_WAVE_AMPLITUDE_PX;
    g.lineTo(x, y);
  }
  g.lineTo(range.maxX, baselineY);
  g.closePath();
  g.fillPath();

  // Shimmer: staggered lighter dashes on a few rows.
  const shimmer = tint(layer.color, 0.4);
  g.fillStyle(shimmer, 1);
  for (let r = 0; r < WATER_SHIMMER_ROWS; r++) {
    const rowY = waterlineY + 18 + r * 26;
    const offset = (r % 2) * (WATER_SHIMMER_SPACING_PX / 2);
    for (const x of evenlySpacedX(range.minX + offset, range.maxX, WATER_SHIMMER_SPACING_PX)) {
      g.fillRect(x, rowY, WATER_SHIMMER_DASH_PX, 3);
    }
  }

  pinLayer(g, layer);
  return [g];
};

/** Festive party trimmings: a draped bunting garland of alternating
 * accent/cream pennants across the band top, a couple of striped tents on the
 * baseline, and a few distant balloons on strings. */
export const drawPartyMotif: MotifDrawer = (scene, layer, range, accent) => {
  const baselineY = layer.y + layer.height;
  const g = scene.add.graphics();

  // Tents on the baseline (deterministic positions).
  let t = 0;
  for (const tx of evenlySpacedX(range.minX + 120, range.maxX, TENT_SPACING_PX)) {
    const tentColor = t % 2 === 0 ? accent : PALETTE.coral;
    const apexY = baselineY - TENT_H_PX - hash01(t * 3 + 1) * 20;
    g.fillStyle(tentColor, 1);
    g.fillTriangle(tx - TENT_W_PX / 2, baselineY, tx + TENT_W_PX / 2, baselineY, tx, apexY);
    // A cream stripe down the middle.
    g.fillStyle(PALETTE.cream, 1);
    g.fillTriangle(tx - TENT_W_PX * 0.12, baselineY, tx + TENT_W_PX * 0.12, baselineY, tx, apexY);
    // Little pennant on top.
    g.fillStyle(PALETTE.coral, 1);
    g.fillTriangle(tx, apexY, tx, apexY - 14, tx + 16, apexY - 7);
    t++;
  }

  // Distant balloons on strings.
  let bi = 0;
  for (const bx of evenlySpacedX(range.minX + 60, range.maxX, PARTY_BALLOON_SPACING_PX)) {
    const by = layer.y + 24 + hash01(bi * 9 + 1) * 40;
    const col = PARTY_BALLOON_COLORS[bi % PARTY_BALLOON_COLORS.length];
    g.lineStyle(2, shade(col, 0.3), 1);
    g.beginPath();
    g.moveTo(bx, by + PARTY_BALLOON_R_PX);
    g.lineTo(bx, by + PARTY_BALLOON_R_PX + PARTY_BALLOON_STRING_PX);
    g.strokePath();
    g.fillStyle(col, 1);
    g.fillCircle(bx, by, PARTY_BALLOON_R_PX);
    bi++;
  }

  // Bunting garland across the band top: a sagging cord + hanging pennants.
  const cordY = layer.y + 8;
  g.lineStyle(2, PALETTE.outline, 1);
  const half = BUNTING_FLAG_W_PX / 2;
  let fi = 0;
  for (let x = range.minX; x <= range.maxX; x += BUNTING_SPACING_PX) {
    const sag = Math.abs(Math.sin((x / BUNTING_SPACING_PX) * Math.PI)) * BUNTING_SAG_PX;
    const py = cordY + sag;
    // Cord segment to the next point.
    const nx = x + BUNTING_SPACING_PX;
    const nsag = Math.abs(Math.sin((nx / BUNTING_SPACING_PX) * Math.PI)) * BUNTING_SAG_PX;
    g.beginPath();
    g.moveTo(x, py);
    g.lineTo(nx, cordY + nsag);
    g.strokePath();
    // Hanging pennant.
    g.fillStyle(fi % 2 === 0 ? accent : PALETTE.cream, 1);
    g.fillTriangle(x - half, py, x + half, py, x, py + BUNTING_FLAG_H_PX);
    fi++;
  }

  pinLayer(g, layer);
  return [g];
};

/** The motif dispatch table — createBackdrop looks a layer's `motif` up here. */
export const MOTIF_DRAWERS: Record<MotifKind, MotifDrawer> = {
  hills: drawHillsMotif,
  trees: drawTreesMotif,
  buildings: drawBuildingsMotif,
  houses: drawHousesMotif,
  bridge: drawBridgeMotif,
  cranes: drawCranesMotif,
  water: drawWaterMotif,
  party: drawPartyMotif,
};
