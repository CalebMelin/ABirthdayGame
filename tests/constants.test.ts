import { describe, expect, it } from 'vitest';
import {
  CHARACTER_CREATE,
  DESIGN_WIDTH,
  hexToCss,
  PALETTE,
  PASTEL_BG_COLOR,
  TEXT_COLOR,
  UI_MIN_TOUCH_PX,
} from '../src/systems/constants';
import { BIKE_OPTIONS } from '../src/data/characters';

describe('hexToCss', () => {
  it('pads small values to 6 hex digits', () => {
    expect(hexToCss(0x0000ff)).toBe('#0000ff');
  });

  it('converts a full RGB value', () => {
    expect(hexToCss(0xffd6e8)).toBe('#ffd6e8');
  });

  it('clamps out-of-range inputs to the low 24 bits', () => {
    expect(hexToCss(-1)).toBe('#ffffff');
    expect(hexToCss(0x1ffffff)).toBe('#ffffff');
  });
});

describe('derived colors', () => {
  it('keeps PASTEL_BG_COLOR identical to PALETTE.bgPink', () => {
    expect(PASTEL_BG_COLOR).toBe(PALETTE.bgPink);
    expect(PASTEL_BG_COLOR).toBe(0xffd6e8);
  });

  it('keeps TEXT_COLOR as the plum CSS string', () => {
    expect(TEXT_COLOR).toBe('#4a2c40');
  });
});

// ---------------------------------------------------------------------------
// CHARACTER_CREATE (PLAN-04 task 3) — the thumb-friendly swatch-row budget is
// a hard acceptance criterion (NORTH_STAR §8: touch targets >= 88px, and hit
// areas must never overlap), so it gets a regression guard here rather than
// relying solely on eyeballing a screenshot: a future edit to any of these
// numbers that quietly breaks the fit should fail a test, not just look
// slightly off in a manual pass.
// ---------------------------------------------------------------------------

describe('CHARACTER_CREATE swatch thumb-friendly budget', () => {
  it('swatch hit size meets the minimum touch target', () => {
    expect(CHARACTER_CREATE.swatchHitSizePx).toBeGreaterThanOrEqual(UI_MIN_TOUCH_PX);
  });

  it('swatch center spacing is wide enough that adjacent hit areas never touch or overlap', () => {
    // Strict > (not >=): the constant's doc comment promises adjacent 88px
    // hit areas "never touch/overlap"; at spacing exactly == hit size the
    // two hit areas would share an edge (touch), which the comment's
    // contract forbids. Today's 90 vs 88 satisfies strict with a 2px gutter.
    expect(CHARACTER_CREATE.swatchCenterSpacingPx).toBeGreaterThan(CHARACTER_CREATE.swatchHitSizePx);
  });

  it('the widest row (BIKE, 8 swatches) fits inside DESIGN_WIDTH with its full hit area', () => {
    const lastIndex = BIKE_OPTIONS.length - 1;
    const lastSwatchCenterX = CHARACTER_CREATE.rowStartX + lastIndex * CHARACTER_CREATE.swatchCenterSpacingPx;
    const lastSwatchHitRightEdge = lastSwatchCenterX + CHARACTER_CREATE.swatchHitSizePx / 2;
    expect(lastSwatchHitRightEdge).toBeLessThanOrEqual(DESIGN_WIDTH);
  });

  it('the first swatch hit area does not run off the left edge', () => {
    const firstSwatchHitLeftEdge = CHARACTER_CREATE.rowStartX - CHARACTER_CREATE.swatchHitSizePx / 2;
    expect(firstSwatchHitLeftEdge).toBeGreaterThanOrEqual(0);
  });

  it('the visible swatch face is no larger than its hit area (decoupled, pedals.ts-style)', () => {
    expect(CHARACTER_CREATE.swatchVisibleSizePx).toBeLessThanOrEqual(CHARACTER_CREATE.swatchHitSizePx);
  });
});
