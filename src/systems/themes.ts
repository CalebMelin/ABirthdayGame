// Per-theme parallax backdrop system (PLAN-05 task 2): a data table of the
// 15 city-arc themes (NORTH_STAR §5) plus a Phaser-side builder that renders
// each one as a genuinely-parallaxing, zoom-safe backdrop. Placeholder art
// (flat-colored silhouette bands + small accent blocks) is intentional — real
// pixel art swaps in during PLAN-10 — but the LAYER PLUMBING (independent
// horizontal parallax rates + leak-free teardown) is real, matching this
// file's own acceptance bar.
//
// IMPORTANT — like terrain.ts/bike.ts/pedals.ts/characterTextures.ts, this
// file must have NO RUNTIME import of 'phaser': Vitest runs in plain Node (no
// DOM/WebGL), and importing the real Phaser module there crashes. `import
// type Phaser` below is erased entirely at compile time
// (verbatimModuleSyntax + tsconfig's erasableSyntaxOnly), so it's safe. Every
// pure helper below (cameraFixedOversizePx / backdropContentRangePx /
// buildSilhouettePoints / evenlySpacedX) never touches Phaser at all and is
// exercised directly by tests/themes.test.ts; `createBackdrop` only ever
// CALLS METHODS on the `scene` object handed to it at runtime by the real
// (browser-side) caller — same contract as createTerrain/createBike.
//
// ---------------------------------------------------------------------------
// THE ZOOM GOTCHA — read this before touching any layout number below.
// ---------------------------------------------------------------------------
// GameScene's play camera is driven manually (cameras.main.centerOn(...) every
// frame, not startFollow) and ZOOMS between CAMERA.zoomMin (0.85) and
// CAMERA.zoomMax (1.0) with speed (see constants.ts's CAMERA block). A
// scrollFactor(0) object is still rendered THROUGH that zoom — it scales
// about the camera's pivot — so any camera-fixed backdrop piece must be
// deliberately oversized or it can reveal an unpainted gap at min zoom
// exactly like the existing fail overlay does (GameScene.failLevel sizes its
// dim rect to DESIGN_WIDTH/CAMERA.zoomMin x DESIGN_HEIGHT/CAMERA.zoomMin,
// centered on the design-screen center, and this file's sky reuses that exact
// technique — see cameraFixedOversizePx).
//
// The harder question is the 2-3 PARALLAX layers, which must move (unlike the
// sky) — verified directly against Phaser 3.90 source
// (node_modules/phaser/src/gameobjects/GetCalcMatrix.js +
// node_modules/phaser/src/cameras/2d/Camera.js's preRender), for this
// project's single, unmodified default camera (x=0, originX=originY=0.5,
// rotation=0), a game object at LOCAL (i.e. its own Graphics/Shape path
// coordinates, with the object's own transform left at the default (0,0))
// position (localX, localY) with scrollFactor (fx, fy) renders on screen at:
//
//   screenX = pivotX + zoom * (localX - scrollX * fx - pivotX)
//   screenY = pivotY + zoom * (localY - scrollY * fy - pivotY)
//
// where pivot = (DESIGN_WIDTH/2, DESIGN_HEIGHT/2) — the exact relationship
// pedals.ts's zoomCompensatedPosition doc comment already describes for the
// fx=fy=0 case, generalized here to any scrollFactor. Two design choices fall
// straight out of this formula:
//
// 1. EVERY backdrop layer uses fy = 0 (vertical always camera-pinned), never
//    a fractional vertical scrollFactor. Per the formula, screenY then has NO
//    dependence on scrollY at all, so a layer's vertical coverage is exactly
//    as provable-safe as the sky's (same cameraFixedOversizePx technique
//    applies to its band placement) — it can NEVER reveal a vertical gap
//    regardless of how far the camera's soft vertical follow wanders. This is
//    a deliberate simplification (real parallax usually drifts vertically
//    too), acceptable because (a) GameScene's vertical camera movement is
//    already soft/damped and small in practice (CAMERA.followLerpY +
//    verticalOffsetPx), so a screen-pinned band reads fine, and (b) it turns
//    "no vertical gap, ever" from "reason carefully about camera bounds" into
//    "provably true by construction" — worth the trade for a placeholder.
// 2. Only HORIZONTAL parallax varies per layer (the far/near "drifts at
//    different rates" requirement), via fx. Per the formula, a layer's
//    required local-x content span to cover the screen at every camera
//    scrollX across a level of length L, at the worst-case zoom (zoomMin),
//    works out (full derivation in tests/themes.test.ts's "geometric coverage
//    guarantee" describe block) to need padding DESIGN_WIDTH/zoomMin beyond
//    [0, L] on EITHER side, for ANY fx in [0, 1) and ANY L — so a single
//    shared padded range (backdropContentRangePx) safely covers every layer
//    regardless of its own fx. Layer content is authored directly in that
//    padded world-x range (never wrapped/tiled), the same way terrain.ts
//    bakes its ground polygon across the whole world once.
//
// Sky rendering note: ThemeDef.sky is a top/bottom pair suggesting a
// gradient, but Phaser's Graphics#fillGradientStyle is `@webglOnly` (see
// node_modules/phaser/src/gameobjects/graphics/Graphics.js) and this project
// boots with `type: Phaser.AUTO` (main.ts), which may fall back to the Canvas
// renderer on a device without WebGL — a gradient sky would silently vanish
// there. The sky is instead drawn as two flat, stacked, camera-fixed bands
// (top color / bottom color), which is explicitly a sanctioned placeholder
// technique ("Graphics rectangles / silhouette bands") and renderer-safe on
// both backends. PLAN-10 can revisit with real art (a pre-baked gradient
// texture, unaffected by this Graphics-specific limitation).
import type Phaser from 'phaser';
import { DESIGN_WIDTH, DESIGN_HEIGHT, DEPTHS, CAMERA, PALETTE } from './constants';
import type { ThemeId } from '../levels/types';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** One horizontally-parallaxing backdrop layer (far skyline/hills silhouette,
 * or near props) — see the module doc comment's zoom-gotcha derivation for
 * why vertical placement is always camera-pinned (never a fractional
 * vertical scrollFactor). */
export interface ParallaxLayerDef {
  /** Horizontal parallax rate: 0 = perfectly camera-fixed (drifts not at
   * all — same as the sky), toward (but always < 1) = drifts almost as fast
   * as the world/terrain itself. Layers are authored far -> near, so this
   * should be non-decreasing across `ThemeDef.layers` (checked by
   * tests/themes.test.ts). Vertical scroll is ALWAYS pinned to the camera
   * regardless of this value. */
  scrollFactor: number;
  /** Placeholder silhouette fill color — flat, not textured. Real pixel art
   * (buildings/hills/props sprites) replaces this in PLAN-10. */
  color: number;
  /** Top of this layer's nominal band, DESIGN-space px. Screen-relative (not
   * world-relative), since the layer is vertically camera-pinned — see the
   * module doc comment. */
  y: number;
  /** Height of the band, design px. The drawn silhouette wobbles within this
   * band (see buildSilhouettePoints) rather than filling it as a flat
   * rectangle, so it reads as a skyline/hills shape, not a stripe. */
  height: number;
}

/** One of the 15 city-arc backdrop themes (NORTH_STAR §5). Placeholder art,
 * real layer plumbing — see the module doc comment. */
export interface ThemeDef {
  /** Ground fill + top-edge stroke colors. Shaped identically to terrain.ts's
   * `TerrainColors` (`{ fill?: number; edge?: number }`) so a theme's ground
   * can be passed straight through: `createTerrain(scene, spec,
   * THEMES[level.theme].ground)`. (Required-not-optional here — every theme
   * always specifies both — which is still structurally assignable to
   * TerrainColors's optional fields.) */
  ground: { fill: number; edge: number };
  /** Sky: a top color and a bottom color, rendered as two flat stacked bands
   * (see module doc comment for why not a true gradient). A theme that wants
   * a flat sky can simply set top === bottom. */
  sky: { top: number; bottom: number };
  /** 2-3 parallax layers, ordered far -> near. */
  layers: ParallaxLayerDef[];
  /** Minimal placeholder prop accent for this theme (e.g. little
   * bushes/signs/lamppost blobs scattered along the nearest layer) — real
   * prop sprites are PLAN-10. Deliberately just one color (YAGNI): enough to
   * give the near layer a bit of variety without inventing a whole prop
   * catalog this task doesn't need yet. */
  props: { accent: number };
}

/** The handle GameScene (ST-4) holds for a level's backdrop. Mirrors
 * terrain.ts's TerrainHandle pattern: build once via createBackdrop, call
 * update() every render frame, destroy() on level teardown/restart. */
export interface BackdropHandle {
  /** Called every render frame to reposition/repaint layers for the current
   * camera. NOTE: this is currently a documented no-op — see createBackdrop's
   * doc comment for why (every layer uses Phaser's native scrollFactor, which
   * Phaser itself reprojects every frame; there is no extra per-frame work
   * for this module to do). The method still exists so GameScene can call it
   * unconditionally without caring which parallax technique this file uses
   * internally, and so a future change (e.g. genuine vertical drift) has
   * somewhere to live without changing the handle's shape. */
  update(): void;
  /** Destroys every GameObject createBackdrop created. Call on level
   * teardown/restart — same lifecycle as TerrainHandle.destroy. */
  destroy(): void;
}

// ---------------------------------------------------------------------------
// Presentation-only local constants (terrain.ts/ui.ts precedent: tunable
// GAMEPLAY numbers live in constants.ts; these are backdrop-drawing shape
// knobs with no gameplay effect, so — like terrain.ts's OCTAVE_DETUNE_* —
// they stay local, documented constants rather than a new constants.ts block.
// Theme COLORS are the one thing explicitly promoted to PALETTE, since
// they're shared/reusable; everything below is purely "how the placeholder
// shapes are drawn").
// ---------------------------------------------------------------------------

/** Horizontal parallax rate for every theme's FAR (skyline/hills) layer. */
const FAR_SCROLL_FACTOR = 0.2;
/** Horizontal parallax rate for every theme's NEAR (props) layer — faster
 * than far, still well under 1 (the world/terrain's own rate), so "near
 * drifts faster than far" always genuinely holds. */
const NEAR_SCROLL_FACTOR = 0.45;

/** Horizontal spacing (world/local px) between silhouette polyline vertices —
 * a smooth-enough curve at a cheap point count even across the padded range
 * of the longest level (see backdropContentRangePx). Mirrors terrain.ts's
 * sampleSpacingPx idea, just for a cosmetic (non-physics) polygon. */
const SILHOUETTE_STEP_PX = 60;
/** How far above a layer's baseline (the bottom of its nominal band) the
 * silhouette's AVERAGE height sits, as a fraction of the band's own
 * `height`. */
const SILHOUETTE_BASE_HEIGHT_FRACTION = 0.6;
/** How much the silhouette wobbles above/below its average height, as a
 * fraction of `height`. Kept below SILHOUETTE_BASE_HEIGHT_FRACTION so the
 * silhouette's lowest dip never reaches down to (or past) its own baseline. */
const SILHOUETTE_VARIANCE_FRACTION = 0.35;
/** The wobble's horizontal wavelength, as a multiple of the layer's own
 * `height` — a taller band (e.g. downtown's skyscraper-tall far layer) gets a
 * proportionally broader silhouette shape; a short/low band (e.g. highway's
 * open-sky far layer) gets a tighter, gentler one. Deliberately derived from
 * each layer's own height (not a separate parallel table indexed alongside
 * `theme.layers`) so there is nothing that could drift out of sync if a
 * theme's layer count or order ever changes. */
const SILHOUETTE_WAVELENGTH_HEIGHT_MULTIPLIER = 5;

/** Center-to-center spacing (world/local px) between "props" accent blocks
 * scattered along the nearest layer's baseline. */
const PROP_SPACING_PX = 420;
/** Accent block size, design px (a small, abstract bush/sign/lamppost
 * placeholder — real prop sprites are PLAN-10). */
const PROP_WIDTH_PX = 28;
const PROP_HEIGHT_PX = 34;

// ---------------------------------------------------------------------------
// THEMES — the 15 city-arc backdrop themes (NORTH_STAR §5), keyed by EVERY
// ThemeId so a missing theme is a compile error (Record<ThemeId, ThemeDef>).
// Both parallax layers on every theme use the SAME two scrollFactors
// (FAR_SCROLL_FACTOR / NEAR_SCROLL_FACTOR) — the "how fast layers drift" rate
// is plumbing, not a per-theme creative choice; only color and band
// placement vary per theme below, which is what actually differentiates
// them. See DECISIONS.md for the palette-direction reasoning per theme.
// ---------------------------------------------------------------------------

export const THEMES: Record<ThemeId, ThemeDef> = {
  // 1 — Gabby's street at sunrise / suburbs: bright, warm dawn tint, green.
  suburbs: {
    ground: { fill: PALETTE.grass, edge: PALETTE.outline },
    sky: { top: PALETTE.coral, bottom: PALETTE.sky },
    layers: [
      { scrollFactor: FAR_SCROLL_FACTOR, color: PALETTE.mint, y: 310, height: 100 },
      { scrollFactor: NEAR_SCROLL_FACTOR, color: PALETTE.grass, y: 380, height: 150 },
    ],
    props: { accent: PALETTE.sunshine },
  },

  // 2 — Park, tulip-field backdrop: greener, leafier.
  park: {
    ground: { fill: PALETTE.grass, edge: PALETTE.outline },
    sky: { top: PALETTE.sky, bottom: PALETTE.mint },
    layers: [
      { scrollFactor: FAR_SCROLL_FACTOR, color: PALETTE.mint, y: 290, height: 120 },
      { scrollFactor: NEAR_SCROLL_FACTOR, color: PALETTE.grass, y: 370, height: 170 },
    ],
    props: { accent: PALETTE.bgPink },
  },

  // 3 — Small-town main street: warm neutral.
  smallTown: {
    ground: { fill: PALETTE.sunshine, edge: PALETTE.outline },
    sky: { top: PALETTE.cream, bottom: PALETTE.sky },
    layers: [
      { scrollFactor: FAR_SCROLL_FACTOR, color: PALETTE.cream, y: 280, height: 130 },
      { scrollFactor: NEAR_SCROLL_FACTOR, color: PALETTE.sunshine, y: 360, height: 170 },
    ],
    props: { accent: PALETTE.coral },
  },

  // 4 — Downtown: greyer sky, grey buildings (tallest bands so far).
  downtown: {
    ground: { fill: PALETTE.slate, edge: PALETTE.outline },
    sky: { top: PALETTE.overcast, bottom: PALETTE.sky },
    layers: [
      { scrollFactor: FAR_SCROLL_FACTOR, color: PALETTE.overcast, y: 240, height: 170 },
      { scrollFactor: NEAR_SCROLL_FACTOR, color: PALETTE.slate, y: 340, height: 200 },
    ],
    props: { accent: PALETTE.sunshine },
  },

  // 5 — Construction zone: dusty tan/orange-grey.
  construction: {
    ground: { fill: PALETTE.dustyTan, edge: PALETTE.outline },
    sky: { top: PALETTE.overcast, bottom: PALETTE.sunshine },
    layers: [
      { scrollFactor: FAR_SCROLL_FACTOR, color: PALETTE.overcast, y: 300, height: 110 },
      { scrollFactor: NEAR_SCROLL_FACTOR, color: PALETTE.dustyTan, y: 380, height: 160 },
    ],
    props: { accent: PALETTE.sunshine },
  },

  // 6 — Overpass/highway: open sky, grey concrete, low/minimal bands.
  highway: {
    ground: { fill: PALETTE.slate, edge: PALETTE.outline },
    sky: { top: PALETTE.sky, bottom: PALETTE.white },
    layers: [
      { scrollFactor: FAR_SCROLL_FACTOR, color: PALETTE.sky, y: 340, height: 70 },
      { scrollFactor: NEAR_SCROLL_FACTOR, color: PALETTE.slate, y: 420, height: 110 },
    ],
    props: { accent: PALETTE.overcast },
  },

  // 7 — Riverside road: blue-green, watery.
  riverside: {
    ground: { fill: PALETTE.riverTeal, edge: PALETTE.outline },
    sky: { top: PALETTE.sky, bottom: PALETTE.riverTeal },
    layers: [
      { scrollFactor: FAR_SCROLL_FACTOR, color: PALETTE.sky, y: 310, height: 100 },
      { scrollFactor: NEAR_SCROLL_FACTOR, color: PALETTE.riverTeal, y: 390, height: 150 },
    ],
    props: { accent: PALETTE.mint },
  },

  // 8 — River bridge: blue, structural.
  bridge: {
    ground: { fill: PALETTE.slate, edge: PALETTE.outline },
    sky: { top: PALETTE.sky, bottom: PALETTE.steelBlue },
    layers: [
      { scrollFactor: FAR_SCROLL_FACTOR, color: PALETTE.sky, y: 260, height: 150 },
      { scrollFactor: NEAR_SCROLL_FACTOR, color: PALETTE.steelBlue, y: 360, height: 190 },
    ],
    props: { accent: PALETTE.white },
  },

  // 9 — City boulevard: warmer urban.
  boulevard: {
    ground: { fill: PALETTE.slate, edge: PALETTE.outline },
    sky: { top: PALETTE.lavender, bottom: PALETTE.coral },
    layers: [
      { scrollFactor: FAR_SCROLL_FACTOR, color: PALETTE.lavender, y: 270, height: 140 },
      { scrollFactor: NEAR_SCROLL_FACTOR, color: PALETTE.coral, y: 360, height: 180 },
    ],
    props: { accent: PALETTE.sunshine },
  },

  // 10 — Old town: warm brick tones.
  oldTown: {
    ground: { fill: PALETTE.brickRed, edge: PALETTE.outline },
    sky: { top: PALETTE.cream, bottom: PALETTE.sunshine },
    layers: [
      { scrollFactor: FAR_SCROLL_FACTOR, color: PALETTE.cream, y: 300, height: 110 },
      { scrollFactor: NEAR_SCROLL_FACTOR, color: PALETTE.brickRed, y: 380, height: 160 },
    ],
    props: { accent: PALETTE.dustyTan },
  },

  // 11 — Hilly district: rolling green, big open sky.
  hilly: {
    ground: { fill: PALETTE.grass, edge: PALETTE.outline },
    sky: { top: PALETTE.sky, bottom: PALETTE.white },
    layers: [
      { scrollFactor: FAR_SCROLL_FACTOR, color: PALETTE.mint, y: 350, height: 80 },
      { scrollFactor: NEAR_SCROLL_FACTOR, color: PALETTE.grass, y: 420, height: 120 },
    ],
    props: { accent: PALETTE.bgPink },
  },

  // 12 — Billboard row: urban with colorful sign accents.
  billboardRow: {
    ground: { fill: PALETTE.slate, edge: PALETTE.outline },
    sky: { top: PALETTE.overcast, bottom: PALETTE.lavender },
    layers: [
      { scrollFactor: FAR_SCROLL_FACTOR, color: PALETTE.overcast, y: 260, height: 150 },
      { scrollFactor: NEAR_SCROLL_FACTOR, color: PALETTE.slate, y: 360, height: 190 },
    ],
    props: { accent: PALETTE.coral },
  },

  // 13 — Sunset streets: orange/pink evening sky.
  sunset: {
    ground: { fill: PALETTE.coral, edge: PALETTE.outline },
    sky: { top: PALETTE.lavender, bottom: PALETTE.sunsetGlow },
    layers: [
      { scrollFactor: FAR_SCROLL_FACTOR, color: PALETTE.lavender, y: 290, height: 120 },
      { scrollFactor: NEAR_SCROLL_FACTOR, color: PALETTE.sunsetGlow, y: 370, height: 170 },
    ],
    props: { accent: PALETTE.bgPink },
  },

  // 14 — Party district outskirts: festive, brighter/pinker (balloons start
  // appearing here — actual balloon decorations are a later PLAN-05 task).
  partyDistrict: {
    ground: { fill: PALETTE.bgPink, edge: PALETTE.outline },
    sky: { top: PALETTE.bgPink, bottom: PALETTE.lavender },
    layers: [
      { scrollFactor: FAR_SCROLL_FACTOR, color: PALETTE.lavender, y: 300, height: 120 },
      { scrollFactor: NEAR_SCROLL_FACTOR, color: PALETTE.bgPink, y: 380, height: 160 },
    ],
    props: { accent: PALETTE.sunshine },
  },

  // 15 — Final stretch, dusk: deep purple/indigo, arrival at night.
  finalDusk: {
    ground: { fill: PALETTE.plum, edge: PALETTE.outline },
    sky: { top: PALETTE.duskIndigo, bottom: PALETTE.plum },
    layers: [
      { scrollFactor: FAR_SCROLL_FACTOR, color: PALETTE.duskIndigo, y: 280, height: 140 },
      { scrollFactor: NEAR_SCROLL_FACTOR, color: PALETTE.plum, y: 370, height: 180 },
    ],
    props: { accent: PALETTE.sunshine }, // warm lit-window glow against the dusk
  },
};

// ---------------------------------------------------------------------------
// Public API: pure generation — no Phaser, exercised directly by
// tests/themes.test.ts.
// ---------------------------------------------------------------------------

/**
 * The size a scrollFactor(0) rectangle must be to always cover the full
 * DESIGN_WIDTH x DESIGN_HEIGHT viewport at any zoom down to `zoomMin`,
 * centered on the design-screen center — the exact technique
 * GameScene.failLevel already uses for its dim rect. See the module doc
 * comment's zoom-gotcha derivation for why this formula is correct. Guards a
 * degenerate (zero/negative) zoomMin by falling back to 1 (no oversize),
 * rather than dividing by zero.
 */
export function cameraFixedOversizePx(zoomMin: number): { width: number; height: number } {
  const safeZoom = zoomMin > 0 ? zoomMin : 1;
  return { width: DESIGN_WIDTH / safeZoom, height: DESIGN_HEIGHT / safeZoom };
}

/**
 * The world-space x-range a horizontally-parallaxing (scrollFactor < 1),
 * vertically camera-pinned backdrop layer must draw its content across so it
 * can never run out of content and reveal a gap, for ANY camera scroll
 * position across a level of length `worldLength` and ANY zoom down to
 * `zoomMin` — see the module doc comment for the full derivation, and
 * tests/themes.test.ts's "geometric coverage guarantee" for a proof against
 * Phaser's actual (independently re-derived) transform formula.
 *
 * A single padding amount (DESIGN_WIDTH / zoomMin, on BOTH sides) safely
 * covers every scrollFactor in [0, 1) simultaneously — the tightest case is
 * scrollFactor approaching 1, and the pad is sized for that, so every layer
 * (whatever its own rate) can share one range. Deliberately more generous
 * than the tightest provable minimum (which is asymmetric and smaller on the
 * left) for a simpler, easier-to-verify formula.
 *
 * Guards a degenerate (negative/NaN) worldLength by flooring it to 0, never
 * throwing (same "total function" style as terrain.ts's normalizeSpec).
 */
export function backdropContentRangePx(
  worldLength: number,
  zoomMin: number
): { minX: number; maxX: number } {
  const pad = cameraFixedOversizePx(zoomMin).width;
  const safeLength = Number.isFinite(worldLength) ? Math.max(worldLength, 0) : 0;
  return { minX: -pad, maxX: safeLength + pad };
}

/** One vertex of a silhouette polyline (world/local px). */
export interface SilhouettePoint {
  x: number;
  y: number;
}

/** Inputs to buildSilhouettePoints — named so call sites (and tests) read
 * clearly rather than passing a long positional argument list. */
export interface SilhouetteOptions {
  /** Left/right edges of the x-range to tile, world/local px (see
   * backdropContentRangePx). */
  minX: number;
  maxX: number;
  /** Horizontal spacing between vertices. */
  stepPx: number;
  /** The band's bottom edge (y grows downward, so this is the LARGEST y the
   * silhouette ever reaches). */
  baselineY: number;
  /** Average rise above baselineY. */
  baseHeightPx: number;
  /** How far the rise wobbles above/below baseHeightPx. */
  variancePx: number;
  /** Horizontal wavelength of the wobble. */
  wavelengthPx: number;
}

/**
 * Generates a deterministic, wavy silhouette-top polyline across [minX,
 * maxX] — a simple sine wobble around `baseHeightPx` above `baselineY`, so
 * the drawn shape reads as a skyline/hills silhouette rather than a flat
 * stripe. Pure and deterministic (same inputs -> byte-identical output, no
 * RNG): every level of a given theme shares the same backdrop shape, which
 * is expected for this placeholder system (real per-level variety is a
 * PLAN-10 art concern, not this task's).
 *
 * Mirrors terrain.ts's buildSampleXs pattern: steps from minX to maxX by
 * stepPx, then always appends the exact endpoint maxX (never overshoots it).
 * Guards degenerate inputs (stepPx <= 0, wavelengthPx <= 0, minX >= maxX)
 * without throwing or looping forever.
 */
export function buildSilhouettePoints(opts: SilhouetteOptions): SilhouettePoint[] {
  const { minX, maxX, stepPx, baselineY, baseHeightPx, variancePx, wavelengthPx } = opts;
  const safeStep = stepPx > 0 ? stepPx : 1;

  const elevationAt = (x: number): number => {
    const wave = wavelengthPx > 0 ? Math.sin((x / wavelengthPx) * Math.PI * 2) : 0;
    return baselineY - baseHeightPx - variancePx * wave;
  };

  if (minX >= maxX) {
    return [{ x: minX, y: elevationAt(minX) }];
  }

  const points: SilhouettePoint[] = [];
  for (let x = minX; x < maxX; x += safeStep) {
    points.push({ x, y: elevationAt(x) });
  }
  points.push({ x: maxX, y: elevationAt(maxX) });
  return points;
}

/**
 * Evenly-spaced x positions covering [minX, maxX], `spacing` apart, starting
 * exactly at minX — used to place the sparse "props" accent blocks along a
 * layer's baseline. Returns [] for a degenerate (minX > maxX) range; guards a
 * degenerate (zero/negative) spacing by flooring it to 1 so it can never
 * loop forever.
 */
export function evenlySpacedX(minX: number, maxX: number, spacing: number): number[] {
  const safeSpacing = spacing > 0 ? spacing : 1;
  const xs: number[] = [];
  for (let x = minX; x <= maxX; x += safeSpacing) xs.push(x);
  return xs;
}

// ---------------------------------------------------------------------------
// Public API: Phaser construction (never imports Phaser at runtime — see
// module doc comment).
// ---------------------------------------------------------------------------

/** Draws one parallax layer as a single filled Graphics polygon (silhouette
 * top edge from buildSilhouettePoints, closed along the layer's baseline) —
 * mirrors terrain.ts's drawGround structure. scrollFactor is (layer's own
 * rate, 0): horizontal genuinely parallaxes, vertical is camera-pinned (see
 * module doc comment). */
function drawSilhouetteLayer(
  scene: Phaser.Scene,
  layer: ParallaxLayerDef,
  range: { minX: number; maxX: number }
): Phaser.GameObjects.Graphics {
  const baselineY = layer.y + layer.height;
  const points = buildSilhouettePoints({
    minX: range.minX,
    maxX: range.maxX,
    stepPx: SILHOUETTE_STEP_PX,
    baselineY,
    baseHeightPx: layer.height * SILHOUETTE_BASE_HEIGHT_FRACTION,
    variancePx: layer.height * SILHOUETTE_VARIANCE_FRACTION,
    wavelengthPx: layer.height * SILHOUETTE_WAVELENGTH_HEIGHT_MULTIPLIER,
  });

  const graphics = scene.add.graphics();
  graphics.fillStyle(layer.color, 1);
  graphics.beginPath();
  graphics.moveTo(points[0].x, baselineY);
  for (const p of points) graphics.lineTo(p.x, p.y);
  graphics.lineTo(points[points.length - 1].x, baselineY);
  graphics.closePath();
  graphics.fillPath();

  graphics.setScrollFactor(layer.scrollFactor, 0);
  graphics.setDepth(DEPTHS.background);
  return graphics;
}

/** Scatters small accent-colored blocks along `layer`'s baseline (the
 * "props" placeholder) — same scrollFactor as the layer they ride on, so
 * they parallax attached to it. */
function drawPropAccents(
  scene: Phaser.Scene,
  layer: ParallaxLayerDef,
  accentColor: number,
  range: { minX: number; maxX: number }
): Phaser.GameObjects.Rectangle[] {
  const baselineY = layer.y + layer.height;
  const xs = evenlySpacedX(range.minX, range.maxX, PROP_SPACING_PX);
  return xs.map((x) => {
    const rect = scene.add.rectangle(
      x,
      baselineY - PROP_HEIGHT_PX / 2,
      PROP_WIDTH_PX,
      PROP_HEIGHT_PX,
      accentColor
    );
    rect.setScrollFactor(layer.scrollFactor, 0);
    rect.setDepth(DEPTHS.background);
    return rect;
  });
}

/**
 * Builds a level's parallax backdrop for `themeId`: a camera-fixed, oversized
 * two-band sky, then 2-3 horizontally-parallaxing silhouette layers (far ->
 * near, each a single Graphics polygon), then sparse accent props riding the
 * nearest layer. Every piece sits at DEPTHS.background; creation order is
 * far-to-near so Phaser's (stable) same-depth render order stacks them
 * correctly without needing distinct depth values.
 *
 * `scene` is used purely as a runtime handle to Phaser's GameObject
 * factories (same contract as createTerrain/createBike/createPedals) — this
 * function never imports Phaser itself (see module doc comment).
 *
 * update() is an intentional no-op — see BackdropHandle.update's doc comment
 * for why: every object here uses Phaser's native scrollFactor, which Phaser
 * itself reprojects every render frame with no help needed from this module.
 */
export function createBackdrop(
  scene: Phaser.Scene,
  themeId: ThemeId,
  worldLength: number
): BackdropHandle {
  const theme = THEMES[themeId];
  const objects: Phaser.GameObjects.GameObject[] = [];

  // ---- sky: two flat, stacked, camera-fixed, oversized bands ----
  const oversize = cameraFixedOversizePx(CAMERA.zoomMin);
  const pivotX = DESIGN_WIDTH / 2;
  const pivotY = DESIGN_HEIGHT / 2;
  const skyTop = scene.add.rectangle(
    pivotX,
    pivotY - oversize.height / 4,
    oversize.width,
    oversize.height / 2,
    theme.sky.top
  );
  const skyBottom = scene.add.rectangle(
    pivotX,
    pivotY + oversize.height / 4,
    oversize.width,
    oversize.height / 2,
    theme.sky.bottom
  );
  for (const sky of [skyTop, skyBottom]) {
    sky.setScrollFactor(0);
    sky.setDepth(DEPTHS.background);
    objects.push(sky);
  }

  // ---- far -> near parallax silhouette layers ----
  const range = backdropContentRangePx(worldLength, CAMERA.zoomMin);
  for (const layer of theme.layers) {
    objects.push(drawSilhouetteLayer(scene, layer, range));
  }

  // ---- sparse prop accents, riding the NEAREST (last) layer ----
  const nearestLayer = theme.layers[theme.layers.length - 1];
  objects.push(...drawPropAccents(scene, nearestLayer, theme.props.accent, range));

  return {
    update(): void {
      // Intentional no-op — see this function's doc comment.
    },
    destroy(): void {
      for (const obj of objects) obj.destroy();
      objects.length = 0;
    },
  };
}
