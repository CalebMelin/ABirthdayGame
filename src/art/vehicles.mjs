// Vehicle sprite generators for the PLAN-10 art pipeline (ST-3). Kept in their
// OWN file (sprites.mjs stays character-only). Both vehicles are 110x40 side-view
// sedans facing RIGHT (the bike-base travel convention): traffic.ts flips the car
// with setFlipX(true) for oncoming lanes; police.ts renders the cop unflipped
// (it chases from behind, same direction as the bike). See src/art/palette.mjs's
// STYLE GUIDE (1px PALETTE.outline outline, no anti-aliasing, limited palette).
//
// ZERO Matter bodies — these are plain Images (traffic/police collision is manual
// JS). This file only produces PIXELS.
//
// Two important runtime facts drive the color choices:
//   * tex-car is TINTED at runtime — traffic.ts calls setTint() with each of the 5
//     TRAFFIC.tints (light pastels). setTint MULTIPLIES the whole texture by the
//     tint, so the CAR BODY is painted in near-white PALETTE.white: each pastel
//     tint then reads as a distinct pastel car (the plan's "4-5 variants", realized
//     purely through traffic.ts's existing tint cycle — traffic.ts is NOT changed).
//     Outline / glass / wheels stay fixed dark/neutral tones so they read under any
//     light-pastel tint.
//   * tex-police-car is NOT tinted (police.ts renders it plain), so it uses full
//     fixed colors — a friendly white-over-dark cop sedan with a dark roof light-bar
//     HOUSING. police.ts overlays two small flashing rects (coral RED at cop.x-13,
//     steelBlue BLUE at cop.x+13, each 12px wide, floating LIGHT_ABOVE_PX=6 above the
//     sprite's top edge). The housing here reaches the sprite's TOP row and carries a
//     dim coral/steelBlue lens under each of those exact x-positions, so the overlaid
//     flashes read as those lenses lighting up. NO police.ts logic is changed.
import { PALETTE } from './palette.mjs';

// Committed size — mirrors BootScene TEXTURE_SPECS.car / .policeCar (both 110x40).
// NEVER change a committed size (STYLE GUIDE): traffic.ts/police.ts offset math and
// the committed-PNG dimension test depend on it.
const CAR_W = 110;
const CAR_H = 40;

export const VEHICLE_SIZES = {
  car: { width: CAR_W, height: CAR_H },
  policeCar: { width: CAR_W, height: CAR_H },
};

// -----------------------------------------------------------------------------
// Shared low-level helper (reads the Framebuffer's raw alpha via fb.alphaAt so
// details clip to the painted silhouette). The auto-outliner itself now lives on
// the shared Framebuffer as fb.outlineSilhouette.
// -----------------------------------------------------------------------------

/** fillRect but ONLY over already-opaque pixels — so a detail (two-tone panel,
 * accent light) can never spill past the body silhouette or stomp transparent. */
function fillOverOpaque(fb, x, y, w, h, color) {
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) {
      if (fb.alphaAt(xx, yy) !== 0) fb.setPixel(xx, yy, color);
    }
  }
}

// -----------------------------------------------------------------------------
// Shared sedan silhouette (both vehicles use the same chunky, friendly body so
// they read as one hand). Painted in `bodyColor`; the caller outlines + details.
// A flat hood/trunk at y19 with a raked cabin on top, chamfered outer corners for
// a rounded-cute feel, wheels resting on the sprite bottom (y39) so the cop's
// wheels sit on the road (police.ts centres the 40px sprite half-height above it).
// -----------------------------------------------------------------------------
const WHEELS_CY = 33; // wheel centre y (r=6 -> bottom at y39 = sprite floor)
const WHEEL_X = { rear: 28, front: 82 };

// Cabin (greenhouse) geometry: base spans x34..75, pillars rake inward toward the
// roof peak. cabinBounds(y) is the inclusive [left,right] of the cabin at row y.
const CABIN_BASE_L = 34;
const CABIN_BASE_R = 75;
const CABIN_TOP_Y = 9;
const CABIN_BOT_Y = 19;
const CABIN_RAKE = 6; // top-row inward inset (each side), easing to 0 by the base

function cabinInset(y) {
  return Math.max(0, CABIN_RAKE - (y - CABIN_TOP_Y));
}
function cabinBounds(y) {
  const inset = cabinInset(y);
  return [CABIN_BASE_L + inset, CABIN_BASE_R - inset];
}

/** Paint the shared body silhouette (no outline, no details) in `bodyColor`. */
function paintSedanBody(fb, bodyColor) {
  // Flat body: top/bottom chamfer strips (inset 2px -> rounded outer corners)
  // sandwiching the full-width middle slab.
  fb.fillRect(10, 19, 90, 2, bodyColor); // top strip  (y19..20, x10..99)
  fb.fillRect(8, 21, 94, 11, bodyColor); // middle     (y21..31, x8..101)
  fb.fillRect(10, 32, 90, 2, bodyColor); // bottom strip(y32..33, x10..99)
  // Raked cabin on top, one row at a time.
  for (let y = CABIN_TOP_Y; y <= CABIN_BOT_Y; y++) {
    const [l, r] = cabinBounds(y);
    fb.fillRect(l, y, r - l + 1, 1, bodyColor);
  }
}

/** Two windows (dark glass with a lighter top-corner glint) split by a centre
 * B-pillar, inset 2px inside the cabin so the body frames them. */
function drawWindows(fb, glass) {
  const pillarL = 54;
  const pillarR = 55;
  for (let y = 11; y <= 16; y++) {
    const [cl, cr] = cabinBounds(y);
    const l = cl + 2;
    const r = cr - 2;
    fb.fillRect(l, y, r - l + 1, 1, glass);
  }
  // B-pillar in body-less dark so the two panes read distinctly.
  fb.vLine(pillarL, 11, 6, PALETTE.outline);
  fb.vLine(pillarR, 11, 6, PALETTE.outline);
  // Tiny sky glints in the top-left of each pane (fixed light accent).
  fb.setPixel(cabinBounds(11)[0] + 3, 11, PALETTE.sky);
  fb.setPixel(pillarR + 2, 11, PALETTE.sky);
}

/** A clearly-a-wheel disc (dark tyre / grey rim / light hub — the drawWheel look
 * at car scale) at each axle, resting on the sprite floor. Drawn over the body. */
function drawWheels(fb) {
  for (const cx of [WHEEL_X.rear, WHEEL_X.front]) {
    fb.fillCircle(cx, WHEELS_CY, 6, PALETTE.outline); // tyre
    fb.fillCircle(cx, WHEELS_CY, 3.5, PALETTE.slate); // rim
    fb.fillCircle(cx, WHEELS_CY, 1.5, PALETTE.cream); // hub
  }
}

/** A small dark-framed accent light (headlight/taillight), clipped to the body. */
function accentLight(fb, x, y, w, h, color) {
  fillOverOpaque(fb, x - 1, y - 1, w + 2, h + 2, PALETTE.outline);
  fillOverOpaque(fb, x, y, w, h, color);
}

// -----------------------------------------------------------------------------
// tex-car (110x40) — cute tintable pastel sedan. BODY = near-white so each of
// TRAFFIC.tints multiplies to a distinct pastel car; fixed dark/neutral detail.
// -----------------------------------------------------------------------------
/**
 * Paint the 110x40 traffic car. Body painted in PALETTE.white for the runtime
 * tint (see file header).
 * @param {import('./lib/framebuffer.mjs').Framebuffer} fb
 */
export function drawCar(fb) {
  paintSedanBody(fb, PALETTE.white);
  fb.outlineSilhouette(PALETTE.outline);
  drawWindows(fb, PALETTE.steelBlue);
  // Front headlight (warm) at the right; rear taillight (coral) at the left.
  accentLight(fb, 97, 24, 3, 4, PALETTE.sunshine);
  accentLight(fb, 10, 24, 3, 4, PALETTE.coral);
  // A short door seam + handle for a little sedan detail.
  fb.vLine(55, 22, 9, PALETTE.outline);
  fb.hLine(58, 25, 3, PALETTE.outline);
  drawWheels(fb);
}

// -----------------------------------------------------------------------------
// tex-police-car (110x40) — friendly white-over-dark cop sedan with a roof
// light-bar housing. NOT tinted; full fixed colors. The housing reaches the
// sprite's TOP row and carries dim coral/steelBlue lenses aligned under police.ts's
// overlaid flashing rects (cop.x-13 / cop.x+13) so the flashes read as those lenses.
// -----------------------------------------------------------------------------
/** Police.ts light geometry, mirrored so the housing lenses line up under the
 * flashing rects (LIGHT_WIDTH_PX=12, LIGHT_SPREAD_PX=13; the 110px sprite's centre
 * origin puts cop.x at local x=55). Red sits LEFT (cop.x-13), blue RIGHT (cop.x+13).
 * HAND-MIRRORED from police.ts; POLICE_LIGHT_MIRROR (below) exposes them so
 * tests/art-png.test.ts can assert they equal police.ts's source and catch drift. */
const SPRITE_CX = CAR_W / 2; // 55
const LIGHT_SPREAD = 13;
const LIGHT_W = 12;
const RED_LENS_X = SPRITE_CX - LIGHT_SPREAD - LIGHT_W / 2; // 36 (span 36..47)
const BLUE_LENS_X = SPRITE_CX + LIGHT_SPREAD - LIGHT_W / 2; // 62 (span 62..73)

/** The mirrored police light geometry, EXPORTED for the cross-module drift guard:
 * if police.ts's LIGHT_SPREAD_PX / LIGHT_WIDTH_PX change, the baked lenses here
 * silently misalign under the still-firing flash rects and no PNG test fails —
 * tests/art-png.test.ts asserts { spread, width } equals police.ts's source. */
export const POLICE_LIGHT_MIRROR = { spread: LIGHT_SPREAD, width: LIGHT_W };

/**
 * Paint the 110x40 police car. Full fixed colors (never tinted).
 * @param {import('./lib/framebuffer.mjs').Framebuffer} fb
 */
export function drawPoliceCar(fb) {
  paintSedanBody(fb, PALETTE.white);
  // Two-tone: dark lower body (classic black-&-white cruiser). Clipped to the body
  // so it respects the chamfered lower corners.
  // LOAD-BEARING: painted in PALETTE.outline — the SAME tone as the auto-silhouette
  // outline — which is why the lower body needs no separate outline AND why the
  // coral taillight's dark frame reads against it. Recoloring this to a non-outline
  // tone means re-adding the lower-body outline + the taillight's dark framing.
  fillOverOpaque(fb, 8, 24, 94, 10, PALETTE.outline);
  fb.outlineSilhouette(PALETTE.outline);
  drawWindows(fb, PALETTE.steelBlue);
  // Headlight / taillight (same placement as the car).
  accentLight(fb, 97, 24, 3, 4, PALETTE.sunshine);
  accentLight(fb, 10, 24, 3, 4, PALETTE.coral);
  drawWheels(fb);

  // Roof light-bar HOUSING: a dark mount from the sprite's top row (y0) down to the
  // cabin roof (y9), spanning both lens x-positions. police.ts's flashing rects
  // float 6px above y0 and align to the two dim lenses embedded in this housing.
  // Derived from the cabin silhouette consts — byte-identical to fillRect(34,0,42,9):
  // spans the cabin base x-range across the full housing height above the roof.
  fb.fillRect(CABIN_BASE_L, 0, CABIN_BASE_R - CABIN_BASE_L + 1, CABIN_TOP_Y, PALETTE.outline); // housing (y0..8, x34..75)
  fb.fillRect(RED_LENS_X + 1, 1, LIGHT_W - 2, 2, PALETTE.coral); // dim RED lens (left)
  fb.fillRect(BLUE_LENS_X + 1, 1, LIGHT_W - 2, 2, PALETTE.steelBlue); // dim BLUE lens (right)
}
