// Prop generators for the PLAN-10 art pipeline. See src/art/palette.mjs's STYLE
// GUIDE. Props are never recolored, so they use fixed real colors only (no
// MARKERS). ST-1 shipped the finish flag; ST-4a adds the two remaining committed
// TEXTURE_KEYS props — tex-tulip (the sentimental flower, used AS-IS) and
// tex-balloon (a party balloon TINTED at runtime, so its body is near-white like
// the ST-3 car). The roadside scenery (signs/billboards/streamers/house) stays
// PROCEDURAL in src/systems/*.ts (it carries dynamic text / sizes-to-fit), so it
// is NOT here.
import { PALETTE } from './palette.mjs';
import { assertGrid } from './sprites.mjs';

// The auto-outliner (fb.outlineSilhouette) lives on the shared Framebuffer now:
// author a shape by its COLOR regions only (no hand-placed 'o') and let it wrap
// the opaque silhouette in a clean 1px dark band — far less error-prone than
// counting outline cells by hand. The tulip's petals/leaf and the balloon's
// round body both rely on it.

// -----------------------------------------------------------------------------
// Finish flag — 24x64 (matches BootScene TEXTURE_SPECS.flag). A checkered
// racing flag on a wooden pole with a gold finial and a little ground base.
// -----------------------------------------------------------------------------
const FLAG_W = 24;
const FLAG_H = 64;

// Cloth region (checkered) and pole geometry.
const CLOTH = { x: 6, y: 6, w: 17, h: 25 };
const CHECK_CELL = 4;

/**
 * Paint the 24x64 finish flag.
 * @param {import('./lib/framebuffer.mjs').Framebuffer} fb
 */
export function drawFlag(fb) {
  // Pole: brown shaft with a darker outline down its left edge, a gold ball
  // finial at the top and a dark ground base at the bottom.
  fb.fillRect(3, 4, 3, 57, PALETTE.brown); // shaft (cols 3-5, rows 4-60)
  fb.vLine(3, 4, 57, PALETTE.outline); // left-edge shade
  fb.fillCircle(4.5, 3, 2.5, PALETTE.sunshine); // finial
  fb.fillRect(1, 60, 8, 3, PALETTE.outline); // ground base

  // Cloth: 1px dark border, then a checker of white / dark cells inside.
  fb.outlineRect(CLOTH.x, CLOTH.y, CLOTH.w, CLOTH.h, PALETTE.outline);
  for (let y = CLOTH.y + 1; y < CLOTH.y + CLOTH.h - 1; y++) {
    for (let x = CLOTH.x + 1; x < CLOTH.x + CLOTH.w - 1; x++) {
      const cx = Math.floor((x - (CLOTH.x + 1)) / CHECK_CELL);
      const cy = Math.floor((y - (CLOTH.y + 1)) / CHECK_CELL);
      fb.setPixel(x, y, (cx + cy) % 2 === 0 ? PALETTE.white : PALETTE.outline);
    }
  }
}

// -----------------------------------------------------------------------------
// tex-tulip — 16x24 (matches BootScene TEXTURE_SPECS.tulip). A cute pink tulip:
// a coral petal cup with a lighter-pink glint over a grass-green stem + one leaf.
// Used AS-IS (never tinted): the tricks.ts bouquet HUD (rotated via setAngle in a
// fan), the PartyScene bouquet Gabby holds, the LevelSelect completed-level badge,
// and the LevelComplete tally icon — so it must read as a flower when scaled down
// AND when rotated. FIXED colors only (no MARKERS): the pink bloom is exactly why
// the old flat-green placeholder was mistaken for a pale-green balloon in the
// party payoff (see constants.ts PARTY.bouquet* doc); a pink flower cannot be.
//
// Authored as COLOR REGIONS only (P/p petals, G stem+leaf) with NO hand-placed
// outline; outlineSilhouette wraps the whole thing in the STYLE-GUIDE 1px dark
// band. Internal petal<->stem color changes need no outline between them (both
// opaque) — only the exterior silhouette does.
// -----------------------------------------------------------------------------
const TULIP_W = 16;
const TULIP_H = 24;

/** @type {readonly string[]} */
const TULIP_GRID = [
  '................', // 0
  '................', // 1
  '....PP.PP.PP....', // 2  three petal tips
  '....PPPPPPPP....', // 3  petals merge into the cup
  '....PpPPPPPP....', // 4  light-pink glint (upper-left)
  '....PpPPPPPP....', // 5
  '....PPPPPPPP....', // 6
  '....PPPPPPPP....', // 7
  '.....PPPPPP.....', // 8  cup tapers
  '.....PPPPPP.....', // 9
  '.....PPPPPP.....', // 10
  '......PPPP......', // 11 cup base
  '......PPPP......', // 12
  '.......GG.......', // 13 stem
  '.......GG.......', // 14
  '.......GG.......', // 15
  '....G..GG.......', // 16 leaf tip
  '...GGG.GG.......', // 17 leaf body
  '...GGGGGG.......', // 18 leaf joins the stem
  '....GG.GG.......', // 19 leaf lower lobe
  '.......GG.......', // 20 stem
  '.......GG.......', // 21
  '................', // 22
  '................', // 23
];

/**
 * Paint the 16x24 tulip. See the block comment.
 * @param {import('./lib/framebuffer.mjs').Framebuffer} fb
 */
export function drawTulip(fb) {
  assertGrid(TULIP_GRID, TULIP_W, TULIP_H, 'tulip');
  fb.drawPixels(0, 0, TULIP_GRID, {
    '.': null,
    P: PALETTE.coral, // pink/red petal
    p: PALETTE.bgPink, // lighter-pink glint
    G: PALETTE.grass, // stem + leaf
  });
  fb.outlineSilhouette(PALETTE.outline);
}

// -----------------------------------------------------------------------------
// tex-balloon — 24x32 (matches BootScene TEXTURE_SPECS.balloon). A round party
// balloon: a teardrop body + a small dark tied knot at the bottom. CRITICAL — it
// is TINTED at runtime (decorations.ts setTint(accent) and partyBalloons.ts
// setTint(spawn.tint) recolor it many ways), and setTint MULTIPLIES the whole
// texture, so — exactly like the ST-3 car — the BODY is painted near-white
// (PALETTE.white): each tint multiplies white to that hue, giving a distinct,
// clean balloon per color. A darker crescent (PALETTE.overcast) on the lower-
// right reads as consistent ROUNDNESS shading under any tint (~20% darker in
// every channel), and the dark PALETTE.outline / knot stay dark under any tint.
// The short STRING is drawn SEPARATELY by the callers (each adds its own rect
// hanging from the knot), so this texture is just the balloon body + knot.
//
// Authored procedurally by per-row spans (a clean teardrop) rather than a hand
// grid: fill the body white, outlineSilhouette the whole thing, shade the
// crescent over interior white, then fill the knot solid dark.
// -----------------------------------------------------------------------------
const BALLOON_W = 24;
const BALLOON_H = 32;

/** Teardrop body rows: [y, leftCol, rightCol] inclusive (near-white interior).
 * Round top, widest in the upper third, tapering to a short neck — the classic
 * balloon read. Max width is cols 3..20 (outline lands at cols 2/21, inside 24). */
const BALLOON_BODY_SPANS = [
  [1, 10, 13],
  [2, 8, 15],
  [3, 6, 17],
  [4, 5, 18],
  [5, 4, 19],
  [6, 4, 19],
  [7, 3, 20],
  [8, 3, 20],
  [9, 3, 20],
  [10, 3, 20],
  [11, 3, 20],
  [12, 3, 20],
  [13, 4, 19],
  [14, 4, 19],
  [15, 5, 18],
  [16, 5, 18],
  [17, 6, 17],
  [18, 6, 17],
  [19, 7, 16],
  [20, 8, 15],
  [21, 8, 15],
  [22, 9, 14],
  [23, 10, 13],
  [24, 10, 13],
  [25, 11, 12],
  [26, 11, 12],
  [27, 11, 12],
];

/** The tied knot at the bottom — a small dark nub below the neck. */
const BALLOON_KNOT_SPANS = [
  [28, 10, 13],
  [29, 10, 13],
  [30, 11, 12],
];

/**
 * Paint the 24x32 balloon. Body near-white for the runtime tint (see the block
 * comment); dark outline + knot + a subtle roundness crescent.
 * @param {import('./lib/framebuffer.mjs').Framebuffer} fb
 */
export function drawBalloon(fb) {
  // Body + knot as one white silhouette so the outline wraps them together.
  for (const [y, l, r] of BALLOON_BODY_SPANS) fb.hLine(l, y, r - l + 1, PALETTE.white);
  for (const [y, l, r] of BALLOON_KNOT_SPANS) fb.hLine(l, y, r - l + 1, PALETTE.white);
  fb.outlineSilhouette(PALETTE.outline);
  // Roundness crescent: darken the lower-right interior (never the outline —
  // r is the rightmost INTERIOR cell, the outline sits one past it at r+1).
  for (const [y, , r] of BALLOON_BODY_SPANS) {
    if (y < 9 || y > 22) continue;
    const w = y < 13 ? 1 : 2;
    for (let x = r - w + 1; x <= r; x++) fb.setPixel(x, y, PALETTE.overcast);
  }
  // Solid dark tied knot (over the white nub reserved above).
  for (const [y, l, r] of BALLOON_KNOT_SPANS) fb.hLine(l, y, r - l + 1, PALETTE.outline);
}

export const PROP_SIZES = {
  flag: { width: FLAG_W, height: FLAG_H },
  tulip: { width: TULIP_W, height: TULIP_H },
  balloon: { width: BALLOON_W, height: BALLOON_H },
};
