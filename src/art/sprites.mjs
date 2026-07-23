// Character/bike/wheel sprite generators for the PLAN-10 art pipeline. Each
// takes a Framebuffer and paints in place; src/art/build.mjs sizes the buffer,
// calls one of these, and writes the PNG. See src/art/palette.mjs for the
// STYLE GUIDE these follow (1px dark outline, no AA, marker colors on
// recolorable regions).
//
// RECOLOR CONTRACT (do not break): the rider's hair/eyes/suit and the bike's
// body are painted in MARKERS.* so src/systems/palette.ts's recolorTexture can
// exact-RGB-swap them per the player's CharacterConfig. drawRider/drawBike take
// the region colors as parameters ONLY so the same shapes can render two ways:
//   * the *-base texture -> MARKERS.* (the recolorable master), and
//   * the raw tex-gabby / tex-bike fallback -> the default-character colors,
// so no placeholder rectangle can flash before a scene recolors.
import { MARKERS, PALETTE } from './palette.mjs';

// -----------------------------------------------------------------------------
// Rider — 24x48 (matches BootScene TEXTURE_SPECS.gabby; BIKE_TUNING.riderOffsetY
// assumes a 48px-tall rider). Hand-authored pixel grid: a front-facing helmeted
// -free Gabby seated on the bike. The two 'E' eye squares sit at rows 15-16,
// cols 9-10 / 13-14 — inside the CharacterCreation blink eyelid band
// (CHARACTER_CREATE.eyeBandOffsetY / eyeBandWidthPx, derived from
// GABBY_BASE_LAYOUT) so the preview blink overlay still lands over them. 'H'
// (hair), 'E' (eyes), 'R' (suit) are the recolorable marker regions; 'S' skin
// and 'o' outline are fixed; '.' is transparent.
// -----------------------------------------------------------------------------
const RIDER_W = 24;
const RIDER_H = 48;

/** @type {readonly string[]} */
const RIDER_GRID = [
  '........................', // 0
  '........................', // 1
  '.........oooooo.........', // 2  hair crown (outline)
  '........oHHHHHHo........', // 3
  '.......oHHHHHHHHo.......', // 4
  '.......oHHHHHHHHo.......', // 5
  '.......oHHHHHHHHo.......', // 6
  '.......oHHHHHHHHo.......', // 7
  '.......oHHHHHHHHo.......', // 8
  '.......oHSSSSSSHo.......', // 9  face opens, hair frames the sides
  '.......oHSSSSSSHo.......', // 10
  '.......oHSSSSSSHo.......', // 11
  '.......oHSSSSSSHo.......', // 12
  '.......oSSSSSSSSo.......', // 13
  '.......oSSSSSSSSo.......', // 14
  '.......oSEESSEESo.......', // 15 eyes (cols 9-10 / 13-14)
  '.......oSEESSEESo.......', // 16
  '.......oSSSSSSSSo.......', // 17
  '.......oSSSooSSSo.......', // 18 mouth (cols 11-12)
  '.......oSSSSSSSSo.......', // 19
  '.......oooSSSSooo.......', // 20 jaw outline + neck (cols 10-13)
  '......oRRRRRRRRRRo......', // 21 shoulders / suit begins
  '......oRRRRRRRRRRo......', // 22
  '......oRRRRRRRRRRo......', // 23
  '......oRRRRRRRRRRo......', // 24
  '......oRRRRRRRRRRo......', // 25
  '......oRRRRRRRRRRo......', // 26
  '......oRRRRRRRRRRo......', // 27
  '......oRRRRRRRRRRo......', // 28
  '......oRRRRRRRRRRo......', // 29
  '......oRRRRRRRRRRo......', // 30
  '.....SoRRRRRRRRRRoS.....', // 31 hands on the bars (cols 5 / 18)
  '.....SoRRRRRRRRRRoS.....', // 32
  '......oRRRRRRRRRRo......', // 33
  '......oRRRRooRRRRo......', // 34 legs split
  '......oRRRRooRRRRo......', // 35
  '......oRRRRooRRRRo......', // 36
  '......oRRRRooRRRRo......', // 37
  '......oRRRRooRRRRo......', // 38
  '......oRRRRooRRRRo......', // 39
  '......oRRRRooRRRRo......', // 40
  '......oRRRRooRRRRo......', // 41
  '......oRRRRooRRRRo......', // 42
  '......oRRRRooRRRRo......', // 43
  '......ooooo..ooooo......', // 44 boots
  '......ooooo..ooooo......', // 45
  '......ooooo..ooooo......', // 46
  '........................', // 47
];

/** Palette for RIDER_GRID given the (possibly marker) region colors. */
function riderPalette(hair, eyes, suit) {
  return {
    '.': null,
    o: PALETTE.outline,
    H: hair,
    S: PALETTE.skin,
    E: eyes,
    R: suit,
  };
}

/**
 * Paint the 24x48 rider. Region colors default to the four MARKERS (the
 * recolorable master, tex-gabby-base). Pass default-character colors to render
 * the raw tex-gabby fallback.
 * @param {import('./lib/framebuffer.mjs').Framebuffer} fb
 * @param {{ hair?: number, eyes?: number, suit?: number }} [colors]
 */
export function drawRider(fb, colors = {}) {
  assertGrid(RIDER_GRID, RIDER_W, RIDER_H, 'rider');
  const hair = colors.hair ?? MARKERS.hair;
  const eyes = colors.eyes ?? MARKERS.eyes;
  const suit = colors.suit ?? MARKERS.suit;
  fb.drawPixels(0, 0, RIDER_GRID, riderPalette(hair, eyes, suit));
}

// -----------------------------------------------------------------------------
// Caleb — 24x48 (matches BootScene TEXTURE_SPECS.caleb; shares the rider's
// proportions so he seats coherently on the pillion behind Gabby, passenger.ts,
// and stands via calebFigure.ts). NOT a recolored character (NORTH_STAR §5:
// Caleb is BROWN-haired to read distinct from blonde Dom), so every color here
// is a FIXED palette tone and NONE is a MARKERS.* value — this sprite must never
// be palette-swapped. His look: a short brown crop (with tiny sideburns) that
// reads male and distinct from Gabby's longer frame, a friendly face, a
// steelBlue casual top and slate jeans (a two-tone casual outfit, not a racing
// suit), bare skin hands. 'H' brown hair, 'S' skin, 'e' dark eyes, 'T' top,
// 'L' legs are all fixed; 'o' outline; '.' transparent.
// -----------------------------------------------------------------------------
const CALEB_W = 24;
const CALEB_H = 48;

/** @type {readonly string[]} */
const CALEB_GRID = [
  '........................', // 0
  '........................', // 1
  '.........oooooo.........', // 2  hair crown (outline)
  '........oHHHHHHo........', // 3
  '.......oHHHHHHHHo.......', // 4
  '.......oHHHHHHHHo.......', // 5
  '.......oHHHHHHHHo.......', // 6
  '.......oHHHHHHHHo.......', // 7
  '.......oHHHHHHHHo.......', // 8  bangs end flat (short crop)
  '.......oHSSSSSSHo.......', // 9  short sideburns, face opens
  '.......oHSSSSSSHo.......', // 10
  '.......oSSSSSSSSo.......', // 11 face fully open below (no long frame)
  '.......oSSSSSSSSo.......', // 12
  '.......oSSSSSSSSo.......', // 13
  '.......oSSSSSSSSo.......', // 14
  '.......oSeeSSeeSo.......', // 15 eyes (cols 9-10 / 13-14)
  '.......oSeeSSeeSo.......', // 16
  '.......oSSSSSSSSo.......', // 17
  '.......oSSSooSSSo.......', // 18 mouth (cols 11-12)
  '.......oSSSSSSSSo.......', // 19
  '.......oooSSSSooo.......', // 20 jaw outline + neck
  '......oTTTTTTTTTTo......', // 21 shoulders / casual top begins
  '......oTTTTTTTTTTo......', // 22
  '......oTTTTTTTTTTo......', // 23
  '......oTTTTTTTTTTo......', // 24
  '......oTTTTTTTTTTo......', // 25
  '......oTTTTTTTTTTo......', // 26
  '......oTTTTTTTTTTo......', // 27
  '......oTTTTTTTTTTo......', // 28
  '......oTTTTTTTTTTo......', // 29
  '......oTTTTTTTTTTo......', // 30
  '.....SoTTTTTTTTTToS.....', // 31 bare hands (cols 5 / 18)
  '.....SoTTTTTTTTTToS.....', // 32
  '......oTTTTTTTTTTo......', // 33
  '......oLLLLooLLLLo......', // 34 legs split (jeans)
  '......oLLLLooLLLLo......', // 35
  '......oLLLLooLLLLo......', // 36
  '......oLLLLooLLLLo......', // 37
  '......oLLLLooLLLLo......', // 38
  '......oLLLLooLLLLo......', // 39
  '......oLLLLooLLLLo......', // 40
  '......oLLLLooLLLLo......', // 41
  '......oLLLLooLLLLo......', // 42
  '......oLLLLooLLLLo......', // 43
  '......ooooo..ooooo......', // 44 shoes
  '......ooooo..ooooo......', // 45
  '......ooooo..ooooo......', // 46
  '........................', // 47
];

/**
 * Paint the 24x48 brown-haired Caleb. Fixed colors only (never recolored) — see
 * the block comment.
 * @param {import('./lib/framebuffer.mjs').Framebuffer} fb
 */
export function drawCaleb(fb) {
  assertGrid(CALEB_GRID, CALEB_W, CALEB_H, 'caleb');
  fb.drawPixels(0, 0, CALEB_GRID, {
    '.': null,
    o: PALETTE.outline,
    H: PALETTE.brown, // brown hair (NORTH_STAR §5 — distinct from blonde Dom)
    S: PALETTE.skin,
    e: PALETTE.outline, // dark friendly eyes (fixed, never a marker)
    T: PALETTE.steelBlue, // casual top
    L: PALETTE.slate, // jeans
  });
}

// -----------------------------------------------------------------------------
// Wheelie rider — 24x48 (matches TEXTURE_KEYS.wheelieRider / BIKE_TUNING rider
// placement math, so the level-11 easter egg seats on its yellow bike exactly
// as Gabby seats on hers). NORTH_STAR §5 row 11: a rider ALL IN BLACK with a
// black helmet. Fixed colors, NO markers (never recolored). The three near-black
// tones are bespoke off-palette darks for this one all-black cameo — deliberately
// outside the harmonised pastel PALETTE (an all-black rider has no pastel to draw
// from), matching the color intent of the old lazy-gen this replaces: pure-black
// helmet dome, near-black suit/gloves, and one lighter grey visor stripe so the
// helmet silhouettes with a visor line rather than reading as a flat block. The
// 1px silhouette outline is still PALETTE.outline (STYLE GUIDE). 'K' helmet,
// 'v' visor, 'B' body/suit/gloves; 'o' outline; '.' transparent.
// -----------------------------------------------------------------------------
const WHEELIE_RIDER_W = 24;
const WHEELIE_RIDER_H = 48;

/** Bespoke fixed darks for the all-black cameo (see block comment). */
const WHEELIE_HELMET = 0x000000; // pure black helmet dome
const WHEELIE_BODY = 0x141414; // near-black suit / gloves
const WHEELIE_VISOR = 0x3a3a3a; // subtle grey visor stripe

/** @type {readonly string[]} */
const WHEELIE_RIDER_GRID = [
  '........................', // 0
  '........................', // 1
  '.........oooooo.........', // 2  helmet crown (outline)
  '........oKKKKKKo........', // 3
  '.......oKKKKKKKKo.......', // 4
  '.......oKKKKKKKKo.......', // 5
  '.......oKKKKKKKKo.......', // 6
  '.......oKKKKKKKKo.......', // 7
  '.......oKvvvvvvKo.......', // 8  visor stripe (grey, inset)
  '.......oKvvvvvvKo.......', // 9
  '.......oKKKKKKKKo.......', // 10 chin bar
  '.......oKKKKKKKKo.......', // 11
  '.......oKKKKKKKKo.......', // 12
  '.......oKKKKKKKKo.......', // 13
  '.......oKKKKKKKKo.......', // 14
  '.......oKKKKKKKKo.......', // 15
  '.......oKKKKKKKKo.......', // 16
  '........oKKKKKKo........', // 17 jaw narrows
  '.........oKKKKo.........', // 18 neck
  '.........oKKKKo.........', // 19
  '........ooKKKKoo........', // 20 neck base into shoulders
  '......oBBBBBBBBBBo......', // 21 shoulders / suit begins
  '......oBBBBBBBBBBo......', // 22
  '......oBBBBBBBBBBo......', // 23
  '......oBBBBBBBBBBo......', // 24
  '......oBBBBBBBBBBo......', // 25
  '......oBBBBBBBBBBo......', // 26
  '......oBBBBBBBBBBo......', // 27
  '......oBBBBBBBBBBo......', // 28
  '......oBBBBBBBBBBo......', // 29
  '......oBBBBBBBBBBo......', // 30
  '.....BoBBBBBBBBBBoB.....', // 31 gloved hands (cols 5 / 18)
  '.....BoBBBBBBBBBBoB.....', // 32
  '......oBBBBBBBBBBo......', // 33
  '......oBBBBooBBBBo......', // 34 legs split
  '......oBBBBooBBBBo......', // 35
  '......oBBBBooBBBBo......', // 36
  '......oBBBBooBBBBo......', // 37
  '......oBBBBooBBBBo......', // 38
  '......oBBBBooBBBBo......', // 39
  '......oBBBBooBBBBo......', // 40
  '......oBBBBooBBBBo......', // 41
  '......oBBBBooBBBBo......', // 42
  '......oBBBBooBBBBo......', // 43
  '......ooooo..ooooo......', // 44 boots
  '......ooooo..ooooo......', // 45
  '......ooooo..ooooo......', // 46
  '........................', // 47
];

/**
 * Paint the 24x48 all-black wheelie rider. Fixed colors only (never recolored) —
 * see the block comment.
 * @param {import('./lib/framebuffer.mjs').Framebuffer} fb
 */
export function drawWheelieRider(fb) {
  assertGrid(WHEELIE_RIDER_GRID, WHEELIE_RIDER_W, WHEELIE_RIDER_H, 'wheelie-rider');
  fb.drawPixels(0, 0, WHEELIE_RIDER_GRID, {
    '.': null,
    o: PALETTE.outline,
    K: WHEELIE_HELMET,
    v: WHEELIE_VISOR,
    B: WHEELIE_BODY,
  });
}

// -----------------------------------------------------------------------------
// Bike chassis — 96x28 (matches BootScene TEXTURE_SPECS.bike /
// BIKE_TUNING.chassisWidth x chassisHeight). Side view, facing RIGHT (the
// travel direction). Wheels are NOT part of this texture (they are the separate
// never-recolored tex-wheel, placed by bike.ts). Built as a union of body rects
// painted in `bodyColor`, given a 1px dark outline by a slightly-larger dark
// underlay, then fixed dark/cream detail on top.
// -----------------------------------------------------------------------------
const BIKE_W = 96;
const BIKE_H = 28;

// [x, y, w, h] body rects, rear (left) -> front (right).
const BIKE_BODY_RECTS = [
  [12, 15, 72, 6], // low engine / frame bar
  [30, 8, 34, 8], // tank + seat hump (centre mass)
  [6, 10, 26, 6], // rear tail
  [66, 5, 10, 11], // front fork riser
  [74, 9, 12, 8], // headlight housing / nose
  [70, 4, 14, 3], // handlebar
];

/**
 * Paint the 96x28 bike chassis. `bodyColor` defaults to MARKERS.bikeBody (the
 * recolorable master, tex-bike-base); pass the default bike color for the raw
 * tex-bike fallback.
 * @param {import('./lib/framebuffer.mjs').Framebuffer} fb
 * @param {number} [bodyColor]
 */
export function drawBike(fb, bodyColor = MARKERS.bikeBody) {
  // Dark underlay for every rect first, then the body fill: where rects abut,
  // the body of one covers the underlay of its neighbour, leaving a single 1px
  // dark outline around the merged silhouette.
  for (const [x, y, w, h] of BIKE_BODY_RECTS) {
    fb.fillRect(x - 1, y - 1, w + 2, h + 2, PALETTE.outline);
  }
  for (const [x, y, w, h] of BIKE_BODY_RECTS) {
    fb.fillRect(x, y, w, h, bodyColor);
  }
  // Fixed detail (never recolored): a tank/engine split line, a rear exhaust
  // stub poking out the back, and a warm headlight lens at the nose.
  fb.hLine(30, 15, 34, PALETTE.outline);
  fb.fillRect(0, 18, 14, 3, PALETTE.outline); // exhaust
  fb.fillCircle(81, 12, 3, PALETTE.cream); // headlight lens
}

// -----------------------------------------------------------------------------
// Wheel — 36x36 (2 x BIKE_TUNING.wheelRadius). Never recolored: fixed dark tyre,
// grey rim, spokes, cream hub. Centre (18,18).
// -----------------------------------------------------------------------------
const WHEEL_SIZE = 36;
const WHEEL_C = WHEEL_SIZE / 2; // 18

/**
 * Paint the 36x36 wheel.
 * @param {import('./lib/framebuffer.mjs').Framebuffer} fb
 */
export function drawWheel(fb) {
  fb.fillCircle(WHEEL_C, WHEEL_C, 17.5, PALETTE.outline); // tyre (dark rubber)
  fb.fillCircle(WHEEL_C, WHEEL_C, 13.5, PALETTE.slate); // metal rim
  // Spokes: dark radial arms across the rim.
  for (const deg of [0, 45, 90, 135]) {
    const a = (deg * Math.PI) / 180;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    for (let r = 5; r <= 13; r++) {
      fb.setPixel(Math.round(WHEEL_C + cos * r), Math.round(WHEEL_C + sin * r), PALETTE.outline);
      fb.setPixel(Math.round(WHEEL_C - cos * r), Math.round(WHEEL_C - sin * r), PALETTE.outline);
    }
  }
  fb.fillCircle(WHEEL_C, WHEEL_C, 5.5, PALETTE.cream); // hub
  fb.fillCircle(WHEEL_C, WHEEL_C, 2.5, PALETTE.outline); // hub bolt
}

// -----------------------------------------------------------------------------
// Shared: assert a hand-authored grid is exactly the committed size. Catches a
// mis-counted row the moment `npm run art` runs (a silent size drift would move
// downstream offset math).
// -----------------------------------------------------------------------------
/**
 * @param {readonly string[]} grid
 * @param {number} w
 * @param {number} h
 * @param {string} name
 */
export function assertGrid(grid, w, h, name) {
  if (grid.length !== h) {
    throw new Error(`${name} grid has ${grid.length} rows, expected ${h}`);
  }
  for (let i = 0; i < grid.length; i++) {
    if (grid[i].length !== w) {
      throw new Error(`${name} grid row ${i} is ${grid[i].length} wide, expected ${w}`);
    }
  }
}

export const SPRITE_SIZES = {
  rider: { width: RIDER_W, height: RIDER_H },
  caleb: { width: CALEB_W, height: CALEB_H },
  wheelieRider: { width: WHEELIE_RIDER_W, height: WHEELIE_RIDER_H },
  bike: { width: BIKE_W, height: BIKE_H },
  wheel: { width: WHEEL_SIZE, height: WHEEL_SIZE },
};
