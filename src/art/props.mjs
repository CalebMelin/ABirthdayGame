// Prop generators for the PLAN-10 art pipeline. See src/art/palette.mjs's STYLE
// GUIDE. Props are never recolored, so they use fixed real colors only (no
// MARKERS). More props (ramps, signs, billboards, house, balloons, tulip
// stages...) land in later PLAN-10 subtasks; ST-1 ships the finish flag as the
// first real prop proof.
import { PALETTE } from './palette.mjs';

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

export const PROP_SIZES = {
  flag: { width: FLAG_W, height: FLAG_H },
};
