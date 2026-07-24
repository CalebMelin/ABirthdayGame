// Per-theme parallax backdrop system (PLAN-05 task 2, art by PLAN-10 ST-5): a
// data table of the 15 city-arc themes (NORTH_STAR §5) plus a Phaser-side
// builder that renders each one as a genuinely-parallaxing, zoom-safe backdrop.
// The LAYER PLUMBING (independent horizontal parallax rates + zoom-safe
// coverage + leak-free teardown) is defined here; the actual PIXEL ART — a
// stepped-gradient sky, a celestial disc, drifting clouds, and a per-layer
// "motif" (skyline / hills / tree-line / houses / bridge / cranes / water /
// party bunting) — lives in the sibling src/systems/backdropArt.ts, dispatched
// per theme by the MOTIF_DRAWERS table. PLAN-05 shipped flat placeholder
// silhouette bands here; ST-5 replaced them with backdropArt's motifs without
// changing this file's zoom-safety contract or the createBackdrop/BackdropHandle
// shape GameScene calls.
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
// there. ST-5 therefore draws the sky as a STEPPED gradient: K flat, stacked,
// camera-fixed, oversized bands whose colors interpolate (integer RGB lerp)
// from sky.top to sky.bottom (backdropArt.drawSteppedSky). Flat fills are
// renderer-safe on BOTH backends; enough bands read as a smooth gradient. A
// theme wanting a flat sky just sets top === bottom.
import type Phaser from 'phaser';
import { DESIGN_WIDTH, DESIGN_HEIGHT, DEPTHS, CAMERA, PALETTE } from './constants';
import type { ThemeId } from '../levels/types';
import type { MotifKind, CelestialSpec, CloudSpec } from './backdropArt';
import {
  MOTIF_DRAWERS,
  drawSteppedSky,
  drawCelestial,
  drawCloud,
  hash01,
  lerpColor,
  wrapX,
} from './backdropArt';

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
  /** The layer's base fill color (the theme's chosen tone for this band). The
   * motif drawer derives its shades/highlights from this (see backdropArt). */
  color: number;
  /** Top of this layer's nominal band, DESIGN-space px. Screen-relative (not
   * world-relative), since the layer is vertically camera-pinned — see the
   * module doc comment. */
  y: number;
  /** Height of the band, design px. The motif is drawn within [y, y + height]
   * (rising from the baseline y + height), so it reads as a skyline/hills/etc.
   * shape, not a flat stripe. */
  height: number;
  /** Which pixel-art motif this layer renders as (backdropArt.MOTIF_DRAWERS
   * dispatches on it). Layers are far -> near, so a theme typically pairs a
   * distant motif (hills/buildings) with a nearer one (houses/water/party). */
  motif: MotifKind;
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
  /** Sky: a top color and a bottom color, rendered as a stepped multi-band
   * gradient (see module doc comment for why not a true WebGL gradient). A
   * theme that wants a flat sky can simply set top === bottom. */
  sky: { top: number; bottom: number };
  /** 2-3 parallax layers, ordered far -> near. */
  layers: ParallaxLayerDef[];
  /** The theme's accent color. Used two ways: decorations.ts tints its
   * signs/billboards/balloons/streamers with it, AND the backdrop motifs use
   * it as their warm accent (lit windows glowing against dusk, house windows,
   * crane hooks, party pennants). Deliberately just one color (YAGNI). */
  props: { accent: number };
  /** Optional camera-fixed celestial disc (a warm sun for dawn themes, a low
   * sun for sunset, a pale moon for the final dusk). Omitted on overcast/urban
   * themes. */
  celestial?: CelestialSpec;
  /** Optional drifting clouds (open-sky themes only). Omitted on
   * overcast/urban/night themes where clouds don't belong. */
  clouds?: CloudSpec;
}

/** The handle GameScene (ST-4) holds for a level's backdrop. Its
 * create-once (via createBackdrop) / destroy()-on-teardown lifecycle mirrors
 * terrain.ts's TerrainHandle; update() is an ADDITION here — TerrainHandle
 * has no such method — see its own doc for what it is (and isn't) for. */
export interface BackdropHandle {
  /** Per-frame hook GameScene calls every render frame. Horizontal PARALLAX
   * still needs no work here — Phaser reprojects each scrollFactor layer from
   * the live camera scroll every frame (see the module doc comment). ST-5 put
   * this hook to its long-anticipated use: it drives the autonomous CLOUD
   * DRIFT (open-sky themes) — reading elapsed time from the scene clock
   * (scene.time.now, NOT Date.now) and sliding each pooled cloud's x, wrapping
   * it so clouds recycle. ALLOCATION-FREE: it never creates an object per
   * frame, it just moves the existing clouds; themes with no clouds do nothing
   * here. */
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
// they're shared/reusable. The per-MOTIF shape knobs live next to their
// drawers in backdropArt.ts; what stays here is the parallax rates + the
// sky/cloud orchestration this file owns.
// ---------------------------------------------------------------------------

/** Horizontal parallax rate for every theme's FAR (skyline/hills) layer. */
const FAR_SCROLL_FACTOR = 0.2;
/** Horizontal parallax rate for every theme's NEAR layer — faster than far,
 * still well under 1 (the world/terrain's own rate), so "near drifts faster
 * than far" always genuinely holds. */
const NEAR_SCROLL_FACTOR = 0.45;

/** How many stepped bands compose the gradient sky. Enough that the flat
 * bands read as a smooth top->bottom gradient (see backdropArt.steppedBands);
 * cheap (a handful of camera-fixed rectangles). */
const SKY_BAND_COUNT = 8;

// --- Drifting clouds (camera-fixed, autonomous horizontal drift in update).
/** Default cloud count when a theme's clouds config omits `count`. */
const DEFAULT_CLOUD_COUNT = 6;
/** Cloud sprite scale range (deterministic per-cloud via hash01). */
const CLOUD_MIN_SCALE = 0.7;
const CLOUD_MAX_SCALE = 1.5;
/** Cloud vertical placement range, design px (upper sky). Camera-pinned. */
const CLOUD_MIN_Y_PX = 62;
const CLOUD_MAX_Y_PX = 210;
/** Autonomous drift speed range, px per MILLISECOND (slow — ~5-11 px/s).
 * Read against scene.time.now so it's refresh-rate independent. */
const CLOUD_MIN_SPEED = 0.005;
const CLOUD_MAX_SPEED = 0.011;
/** Extra margin (px) added to each side of the oversized camera-fixed band
 * that clouds wrap within, so a cloud recycles (wraps L<->R) OFF-screen — even
 * at CAMERA.zoomMin, where the visible region is widest — never popping in
 * view. Sized past one cloud half-width. */
const CLOUD_WRAP_MARGIN_PX = 180;

// ---------------------------------------------------------------------------
// THEMES — the 15 city-arc backdrop themes (NORTH_STAR §5), keyed by EVERY
// ThemeId so a missing theme is a compile error (Record<ThemeId, ThemeDef>).
// Both parallax layers on every theme use the SAME two scrollFactors
// (FAR_SCROLL_FACTOR / NEAR_SCROLL_FACTOR) — the "how fast layers drift" rate
// is plumbing, not a per-theme creative choice. What differentiates the themes
// is the palette (sky/ground/layer colors) PLUS the per-layer MOTIF (the
// pixel-art shape each layer draws as — see backdropArt.ts) and the optional
// celestial disc / drifting clouds. See DECISIONS.md for the per-theme
// palette + motif reasoning.
// ---------------------------------------------------------------------------

export const THEMES: Record<ThemeId, ThemeDef> = {
  // 1 — Gabby's street at sunrise / suburbs: warm dawn sun, green hills behind
  // a row of little houses, soft clouds.
  suburbs: {
    ground: { fill: PALETTE.grass, edge: PALETTE.outline },
    sky: { top: PALETTE.coral, bottom: PALETTE.sky },
    layers: [
      { scrollFactor: FAR_SCROLL_FACTOR, color: PALETTE.mint, y: 310, height: 100, motif: 'hills' },
      { scrollFactor: NEAR_SCROLL_FACTOR, color: PALETTE.grass, y: 380, height: 150, motif: 'houses' },
    ],
    props: { accent: PALETTE.sunshine },
    celestial: { x: 1010, y: 150, radius: 52, color: PALETTE.sunshine, halo: PALETTE.coral },
    clouds: {},
  },

  // 2 — Park, tulip-field backdrop: rolling hills behind a leafy tree-line.
  park: {
    ground: { fill: PALETTE.grass, edge: PALETTE.outline },
    sky: { top: PALETTE.sky, bottom: PALETTE.mint },
    layers: [
      { scrollFactor: FAR_SCROLL_FACTOR, color: PALETTE.mint, y: 290, height: 120, motif: 'hills' },
      { scrollFactor: NEAR_SCROLL_FACTOR, color: PALETTE.grass, y: 370, height: 170, motif: 'trees' },
    ],
    props: { accent: PALETTE.bgPink },
    clouds: {},
  },

  // 3 — Small-town main street: warm neutral, a low sun, house rooflines.
  smallTown: {
    ground: { fill: PALETTE.sunshine, edge: PALETTE.outline },
    sky: { top: PALETTE.cream, bottom: PALETTE.sky },
    layers: [
      { scrollFactor: FAR_SCROLL_FACTOR, color: PALETTE.cream, y: 280, height: 130, motif: 'hills' },
      { scrollFactor: NEAR_SCROLL_FACTOR, color: PALETTE.sunshine, y: 360, height: 170, motif: 'houses' },
    ],
    props: { accent: PALETTE.coral },
    celestial: { x: 300, y: 140, radius: 46, color: PALETTE.sunshine, halo: PALETTE.coral },
    clouds: {},
  },

  // 4 — Downtown: greyer overcast sky, a tall grey skyline with lit windows.
  downtown: {
    ground: { fill: PALETTE.slate, edge: PALETTE.outline },
    sky: { top: PALETTE.overcast, bottom: PALETTE.sky },
    layers: [
      { scrollFactor: FAR_SCROLL_FACTOR, color: PALETTE.overcast, y: 240, height: 170, motif: 'buildings' },
      { scrollFactor: NEAR_SCROLL_FACTOR, color: PALETTE.slate, y: 340, height: 200, motif: 'buildings' },
    ],
    props: { accent: PALETTE.sunshine },
  },

  // 5 — Construction zone: dusty tan/grey, a hazy skyline behind tower cranes.
  construction: {
    ground: { fill: PALETTE.dustyTan, edge: PALETTE.outline },
    sky: { top: PALETTE.overcast, bottom: PALETTE.sunshine },
    layers: [
      { scrollFactor: FAR_SCROLL_FACTOR, color: PALETTE.overcast, y: 300, height: 110, motif: 'buildings' },
      { scrollFactor: NEAR_SCROLL_FACTOR, color: PALETTE.dustyTan, y: 380, height: 160, motif: 'cranes' },
    ],
    props: { accent: PALETTE.sunshine },
  },

  // 6 — Overpass/highway: open sky + clouds, distant haze hills, low concrete.
  highway: {
    ground: { fill: PALETTE.slate, edge: PALETTE.outline },
    sky: { top: PALETTE.sky, bottom: PALETTE.white },
    layers: [
      { scrollFactor: FAR_SCROLL_FACTOR, color: PALETTE.sky, y: 340, height: 70, motif: 'hills' },
      { scrollFactor: NEAR_SCROLL_FACTOR, color: PALETTE.slate, y: 420, height: 110, motif: 'buildings' },
    ],
    props: { accent: PALETTE.overcast },
    clouds: { count: 7 },
  },

  // 7 — Riverside road: far bank hills over a shimmering river band.
  riverside: {
    ground: { fill: PALETTE.riverTeal, edge: PALETTE.outline },
    sky: { top: PALETTE.sky, bottom: PALETTE.riverTeal },
    layers: [
      { scrollFactor: FAR_SCROLL_FACTOR, color: PALETTE.mint, y: 310, height: 100, motif: 'hills' },
      { scrollFactor: NEAR_SCROLL_FACTOR, color: PALETTE.riverTeal, y: 390, height: 150, motif: 'water' },
    ],
    props: { accent: PALETTE.mint },
    clouds: {},
  },

  // 8 — River bridge: distant hills behind a steel truss bridge.
  bridge: {
    ground: { fill: PALETTE.slate, edge: PALETTE.outline },
    sky: { top: PALETTE.sky, bottom: PALETTE.steelBlue },
    layers: [
      { scrollFactor: FAR_SCROLL_FACTOR, color: PALETTE.mint, y: 260, height: 150, motif: 'hills' },
      { scrollFactor: NEAR_SCROLL_FACTOR, color: PALETTE.steelBlue, y: 360, height: 190, motif: 'bridge' },
    ],
    props: { accent: PALETTE.white },
    clouds: {},
  },

  // 9 — City boulevard: warmer urban, lavender + coral skyline with lit windows.
  boulevard: {
    ground: { fill: PALETTE.slate, edge: PALETTE.outline },
    sky: { top: PALETTE.lavender, bottom: PALETTE.coral },
    layers: [
      { scrollFactor: FAR_SCROLL_FACTOR, color: PALETTE.lavender, y: 270, height: 140, motif: 'buildings' },
      { scrollFactor: NEAR_SCROLL_FACTOR, color: PALETTE.coral, y: 360, height: 180, motif: 'buildings' },
    ],
    props: { accent: PALETTE.sunshine },
  },

  // 10 — Old town: warm brick, two rows of cozy pitched rooftops.
  oldTown: {
    ground: { fill: PALETTE.brickRed, edge: PALETTE.outline },
    sky: { top: PALETTE.cream, bottom: PALETTE.sunshine },
    layers: [
      { scrollFactor: FAR_SCROLL_FACTOR, color: PALETTE.cream, y: 300, height: 110, motif: 'houses' },
      { scrollFactor: NEAR_SCROLL_FACTOR, color: PALETTE.brickRed, y: 380, height: 160, motif: 'houses' },
    ],
    props: { accent: PALETTE.dustyTan },
    clouds: {},
  },

  // 11 — Hilly district: rolling green ridges, big open cloudy sky.
  hilly: {
    ground: { fill: PALETTE.grass, edge: PALETTE.outline },
    sky: { top: PALETTE.sky, bottom: PALETTE.white },
    layers: [
      { scrollFactor: FAR_SCROLL_FACTOR, color: PALETTE.mint, y: 350, height: 80, motif: 'hills' },
      { scrollFactor: NEAR_SCROLL_FACTOR, color: PALETTE.grass, y: 420, height: 120, motif: 'hills' },
    ],
    props: { accent: PALETTE.bgPink },
    clouds: { count: 7 },
  },

  // 12 — Billboard row: urban skyline (the level-18 egg + decoy billboards
  // ride the decorations layer in front of this).
  billboardRow: {
    ground: { fill: PALETTE.slate, edge: PALETTE.outline },
    sky: { top: PALETTE.overcast, bottom: PALETTE.lavender },
    layers: [
      { scrollFactor: FAR_SCROLL_FACTOR, color: PALETTE.overcast, y: 260, height: 150, motif: 'buildings' },
      { scrollFactor: NEAR_SCROLL_FACTOR, color: PALETTE.slate, y: 360, height: 190, motif: 'buildings' },
    ],
    props: { accent: PALETTE.coral },
  },

  // 13 — Sunset streets: a big low sun, hazy hills, a warm city silhouette.
  sunset: {
    ground: { fill: PALETTE.coral, edge: PALETTE.outline },
    sky: { top: PALETTE.lavender, bottom: PALETTE.sunsetGlow },
    layers: [
      { scrollFactor: FAR_SCROLL_FACTOR, color: PALETTE.lavender, y: 290, height: 120, motif: 'hills' },
      { scrollFactor: NEAR_SCROLL_FACTOR, color: PALETTE.sunsetGlow, y: 370, height: 170, motif: 'buildings' },
    ],
    props: { accent: PALETTE.bgPink },
    celestial: { x: 360, y: 300, radius: 84, color: PALETTE.sunsetGlow, halo: PALETTE.coral },
    clouds: { color: PALETTE.coral, count: 5 },
  },

  // 14 — Party district outskirts: festive — a skyline behind bunting, tents
  // and distant balloons (the real balloon decorations sit in front of this).
  partyDistrict: {
    ground: { fill: PALETTE.bgPink, edge: PALETTE.outline },
    sky: { top: PALETTE.bgPink, bottom: PALETTE.lavender },
    layers: [
      { scrollFactor: FAR_SCROLL_FACTOR, color: PALETTE.lavender, y: 300, height: 120, motif: 'buildings' },
      { scrollFactor: NEAR_SCROLL_FACTOR, color: PALETTE.bgPink, y: 380, height: 160, motif: 'party' },
    ],
    props: { accent: PALETTE.sunshine },
    clouds: {},
  },

  // 15 — Final stretch, dusk: a pale moon, a warm-lit-window skyline glowing
  // against the indigo dusk, and party trimmings at the venue.
  finalDusk: {
    ground: { fill: PALETTE.plum, edge: PALETTE.outline },
    sky: { top: PALETTE.duskIndigo, bottom: PALETTE.plum },
    layers: [
      { scrollFactor: FAR_SCROLL_FACTOR, color: PALETTE.duskIndigo, y: 280, height: 140, motif: 'buildings' },
      { scrollFactor: NEAR_SCROLL_FACTOR, color: PALETTE.plum, y: 370, height: 180, motif: 'party' },
    ],
    props: { accent: PALETTE.sunshine }, // warm lit-window glow against the dusk
    celestial: { x: 1000, y: 120, radius: 44, color: PALETTE.cream, halo: PALETTE.lavender },
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
 * exactly at minX — used by backdropArt's motifs to place regularly-spaced
 * elements across a layer's range (bridge piers, water-shimmer dashes, party
 * tents / balloons / bunting). Returns [] for a degenerate (minX > maxX)
 * range; guards a degenerate (zero/negative) spacing by flooring it to 1 so it
 * can never loop forever.
 */
export function evenlySpacedX(minX: number, maxX: number, spacing: number): number[] {
  const safeSpacing = spacing > 0 ? spacing : 1;
  const xs: number[] = [];
  for (let x = minX; x <= maxX; x += safeSpacing) xs.push(x);
  return xs;
}

// ---------------------------------------------------------------------------
// Public API: Phaser construction (never imports Phaser at runtime — see
// module doc comment). The actual per-motif / sky / cloud DRAWING lives in
// backdropArt.ts; this function just assembles a theme's pieces in the right
// order and owns the cloud-drift + teardown lifecycle.
// ---------------------------------------------------------------------------

/** One drifting cloud's live handle: the (movable) Graphics plus the pure
 * inputs update() needs to reposition it — its home x and its drift speed. */
interface DriftingCloud {
  g: Phaser.GameObjects.Graphics;
  baseX: number;
  /** px per millisecond (see CLOUD_MIN/MAX_SPEED). */
  speed: number;
}

/**
 * Builds a level's parallax backdrop for `themeId`, in strict far->near
 * creation order (Phaser's stable same-depth ordering stacks them at the
 * shared DEPTHS.background):
 *   1. a stepped-gradient sky (camera-fixed, OVERSIZED so zoom-out never gaps),
 *   2. an optional celestial disc (camera-fixed),
 *   3. optional drifting clouds (camera-fixed; animated in update()),
 *   4. the far->near parallax MOTIF layers (each spanning the full padded
 *      backdropContentRangePx so it can never run out of content at any
 *      scroll/zoom — see the module doc comment).
 *
 * `scene` is used purely as a runtime handle to Phaser's GameObject factories
 * (same contract as createTerrain/createBike) — this function never imports
 * Phaser itself. ZERO Matter bodies are created (backdrops are pure visuals).
 */
export function createBackdrop(
  scene: Phaser.Scene,
  themeId: ThemeId,
  worldLength: number
): BackdropHandle {
  const theme = THEMES[themeId];
  const objects: Phaser.GameObjects.GameObject[] = [];

  const oversize = cameraFixedOversizePx(CAMERA.zoomMin);
  const pivotX = DESIGN_WIDTH / 2;
  const pivotY = DESIGN_HEIGHT / 2;

  // ---- 1. sky: a stepped multi-band gradient, camera-fixed + oversized ----
  objects.push(
    ...drawSteppedSky(
      scene,
      theme.sky.top,
      theme.sky.bottom,
      SKY_BAND_COUNT,
      pivotX,
      pivotY,
      oversize.width,
      oversize.height
    )
  );

  // ---- 2. celestial disc (camera-fixed), in front of the sky ----
  if (theme.celestial) {
    objects.push(...drawCelestial(scene, theme.celestial));
  }

  // ---- 3. drifting clouds (camera-fixed), in front of the sun ----
  // Clouds wrap within an oversized band (margin past the min-zoom viewport)
  // so their recycle wrap always happens OFF-screen. Vertical is camera-pinned
  // (scrollFactor 0) like everything camera-fixed here.
  const clouds: DriftingCloud[] = [];
  const cloudBandMinX = pivotX - oversize.width / 2 - CLOUD_WRAP_MARGIN_PX;
  const cloudBandWidth = oversize.width + CLOUD_WRAP_MARGIN_PX * 2;
  if (theme.clouds) {
    const cloudColor = theme.clouds.color ?? PALETTE.white;
    const shadowColor = lerpColor(cloudColor, PALETTE.slate, 0.35);
    const count = theme.clouds.count ?? DEFAULT_CLOUD_COUNT;
    for (let i = 0; i < count; i++) {
      const scale = CLOUD_MIN_SCALE + hash01(i * 3 + 1) * (CLOUD_MAX_SCALE - CLOUD_MIN_SCALE);
      const g = drawCloud(scene, scale, cloudColor, shadowColor);
      g.x = cloudBandMinX + hash01(i * 3 + 2) * cloudBandWidth;
      g.y = CLOUD_MIN_Y_PX + hash01(i * 3 + 3) * (CLOUD_MAX_Y_PX - CLOUD_MIN_Y_PX);
      g.setScrollFactor(0);
      g.setDepth(DEPTHS.background);
      clouds.push({
        g,
        baseX: g.x,
        speed: CLOUD_MIN_SPEED + hash01(i * 7 + 5) * (CLOUD_MAX_SPEED - CLOUD_MIN_SPEED),
      });
      objects.push(g);
    }
  }

  // ---- 4. far -> near parallax motif layers ----
  const range = backdropContentRangePx(worldLength, CAMERA.zoomMin);
  for (const layer of theme.layers) {
    objects.push(...MOTIF_DRAWERS[layer.motif](scene, layer, range, theme.props.accent));
  }

  return {
    update(): void {
      // Autonomous cloud drift: slide each cloud by elapsed scene time (NOT
      // Date.now), wrapping so it recycles off-screen. ALLOCATION-FREE — no
      // per-frame objects (a classic index loop, so not even an iterator), just
      // moving the existing clouds. No clouds -> the loop body never runs.
      if (clouds.length === 0) return;
      const now = scene.time ? scene.time.now : 0;
      for (let i = 0; i < clouds.length; i++) {
        const c = clouds[i];
        c.g.x = wrapX(c.baseX + now * c.speed, cloudBandMinX, cloudBandWidth);
      }
    },
    destroy(): void {
      for (const obj of objects) obj.destroy();
      objects.length = 0;
      clouds.length = 0;
    },
  };
}
