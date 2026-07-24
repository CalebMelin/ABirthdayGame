// App-icon generator for the PLAN-10 art pipeline (ST-4b). Produces the 180x180
// public/apple-touch-icon.png — the "Add to Home Screen" / tab icon Caleb sees.
// Replaces the old scripts/gen-app-icon.mjs placeholder (a headless-Chrome "22"
// screenshot); the deterministic zero-dep pipeline is the source of truth now
// (see DECISIONS 2026-07-23, PLAN-10 ST-4b). Follows src/art/palette.mjs's STYLE
// GUIDE (1px dark outline, no anti-aliasing, shared palette).
//
// The icon is a single cute tulip — the game's sentimental collectible (NORTH_STAR
// tricks & tulips) — blooming over a soft pastel gradient with a scatter of party
// confetti. NOTE the whole 180x180 square is painted OPAQUE (iOS masks its own
// rounded corners over a full square, and a home-screen icon must never be
// transparent), so — unlike the transparent-background sprites — the outline can't
// come from outlineSilhouette on the main buffer (nothing is transparent there).
// Instead the tulip is drawn on a SEPARATE transparent buffer, outlined with the
// shared fb.outlineSilhouette, then composited over the background.
import { Framebuffer } from './lib/framebuffer.mjs';
import { PALETTE } from './palette.mjs';

/** Committed size of public/apple-touch-icon.png (the standard apple-touch-icon
 * dimension; iOS downscales it for smaller slots). */
export const ICON_SIZE = 180;

/** Linear blend of two 0xRRGGBB colors; t in [0,1] (0 -> a, 1 -> b). Used for
 * the smooth top->bottom background wash (one solid color per row, so it stays
 * hard-edged / no anti-aliasing while still reading as a gradient). */
function blend(a, b, t) {
  const ar = (a >> 16) & 0xff;
  const ag = (a >> 8) & 0xff;
  const ab = a & 0xff;
  const br = (b >> 16) & 0xff;
  const bg = (b >> 8) & 0xff;
  const bb = b & 0xff;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bl;
}

/** Fixed confetti scatter: [x, y, size, color]. Deterministic (no RNG) and kept
 * clear of the central tulip so it reads as sparkle, not clutter. */
const CONFETTI = [
  [22, 30, 6, PALETTE.sunshine],
  [150, 26, 6, PALETTE.coral],
  [40, 70, 5, PALETTE.mint],
  [140, 62, 5, PALETTE.lavender],
  [18, 120, 5, PALETTE.sunshine],
  [158, 118, 6, PALETTE.white],
  [30, 158, 6, PALETTE.coral],
  [150, 156, 5, PALETTE.mint],
  [78, 20, 5, PALETTE.white],
  [104, 16, 4, PALETTE.sunsetGlow],
];

/** Paint the tulip's opaque color regions (no outline) onto the given buffer.
 * Kept separate so the shared silhouette outliner can wrap ONLY the flower. */
function paintTulip(fg) {
  const cx = 90;
  const grass = PALETTE.grass;
  const petal = PALETTE.coral;

  // ---- stem (drawn first, so the bloom overlaps its top cleanly) ----
  fg.fillRect(cx - 4, 104, 8, 50, grass);

  // ---- leaves: two organic blades, each a brush of shrinking discs along a
  // diagonal so the outliner wraps a smooth pointed leaf ----
  const leaf = (x0, y0, x1, y1, rMax) => {
    const steps = 22;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = x0 + (x1 - x0) * t;
      const y = y0 + (y1 - y0) * t;
      // Fat in the middle, pointed at both ends.
      const r = rMax * Math.sin(Math.PI * t);
      fg.fillCircle(x, y, Math.max(1, r), grass);
    }
  };
  leaf(cx - 2, 138, 54, 112, 8); // left blade, sweeping up-left
  leaf(cx + 2, 148, 122, 128, 7); // right blade, lower, sweeping up-right

  // ---- bloom: three rounded petals for a lobed crown, over a cup that widens
  // under the petals then tapers to the stem ----
  for (let y = 44; y <= 112; y++) {
    let hw;
    if (y <= 66) hw = 30;
    else hw = 30 - ((y - 66) * 20) / 46; // taper 30 -> 10
    const half = Math.round(hw);
    fg.fillRect(cx - half, y, half * 2, 1, petal);
  }
  fg.fillCircle(cx, 44, 20, petal); // middle petal (tallest)
  fg.fillCircle(cx - 20, 52, 17, petal); // left petal
  fg.fillCircle(cx + 20, 52, 17, petal); // right petal

  // ---- petal seams: two short dark strokes from the crown notches, angling
  // outward, so the bloom reads as a three-petal TULIP rather than a plain dome.
  const seam = (x0, y0, x1, y1) => {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      fg.fillRect(Math.round(x0 + (x1 - x0) * t), Math.round(y0 + (y1 - y0) * t), 2, 1, PALETTE.outline);
    }
  };
  seam(cx - 12, 40, cx - 17, 64); // left petal division
  seam(cx + 11, 40, cx + 16, 64); // right petal division

  // ---- glint: a soft lighter-pink highlight, upper-left of the bloom (interior,
  // so it takes no outline — same read as tex-tulip's 'p' glint) ----
  fg.fillCircle(cx - 12, 44, 6, PALETTE.bgPink);
}

/**
 * Paint the 180x180 app icon.
 * @param {import('./lib/framebuffer.mjs').Framebuffer} fb
 */
export function drawAppIcon(fb) {
  // ---- background: a gentle lavender -> pink vertical wash (one solid color per
  // row). Warm and soft, and cool enough up top that the warm coral tulip pops.
  const top = blend(PALETTE.lavender, PALETTE.white, 0.35);
  const bottom = PALETTE.bgPink;
  for (let y = 0; y < ICON_SIZE; y++) {
    const row = blend(top, bottom, y / (ICON_SIZE - 1));
    fb.fillRect(0, y, ICON_SIZE, 1, row);
  }

  // ---- confetti sparkle behind the flower ----
  for (const [x, y, s, color] of CONFETTI) {
    fb.fillRect(x, y, s, s, color);
  }

  // ---- tulip on a transparent buffer -> shared 1px dark outline -> composite ----
  const fg = new Framebuffer(ICON_SIZE, ICON_SIZE);
  paintTulip(fg);
  fg.outlineSilhouette(PALETTE.outline);
  for (let y = 0; y < ICON_SIZE; y++) {
    for (let x = 0; x < ICON_SIZE; x++) {
      if (fg.alphaAt(x, y) === 0) continue;
      const i = (y * ICON_SIZE + x) * 4;
      const color = (fg.data[i] << 16) | (fg.data[i + 1] << 8) | fg.data[i + 2];
      fb.setPixel(x, y, color);
    }
  }
}
