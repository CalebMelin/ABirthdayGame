import { describe, expect, it } from 'vitest';
import {
  CHARACTER_CREATE,
  DESIGN_WIDTH,
  DESIGN_HEIGHT,
  FAIL,
  failOverlayFontSizePx,
  hexToCss,
  LEVEL_COMPLETE,
  PALETTE,
  PASTEL_BG_COLOR,
  TEXT_COLOR,
  UI_MIN_TOUCH_PX,
} from '../src/systems/constants';
import { BIKE_OPTIONS } from '../src/data/characters';

describe('failOverlayFontSizePx', () => {
  it('keeps the full-size font for the SHORT default toast (visually unchanged)', () => {
    // The pre-PLAN-06 default message must still render at the original 40px.
    expect(failOverlayFontSizePx('Oops! Go again 💛')).toBe(FAIL.overlayFontSizePx);
  });

  it('drops to the smaller font for the LONG L7 / L15 verbatim toasts', () => {
    // These are the exact custom softFail messages PLAN-06 events pass — both
    // overflow DESIGN_WIDTH at 40px, so they must use the smaller wrapped size.
    expect(failOverlayFontSizePx("They really don't see us!! Go again 💛")).toBe(
      FAIL.overlayLongFontSizePx
    );
    expect(failOverlayFontSizePx("They got us!! ...let's pretend that didn't happen 🚔")).toBe(
      FAIL.overlayLongFontSizePx
    );
  });

  it('switches exactly at the threshold length', () => {
    const atThreshold = 'x'.repeat(FAIL.overlayLongThresholdChars);
    const overThreshold = 'x'.repeat(FAIL.overlayLongThresholdChars + 1);
    expect(failOverlayFontSizePx(atThreshold)).toBe(FAIL.overlayFontSizePx);
    expect(failOverlayFontSizePx(overThreshold)).toBe(FAIL.overlayLongFontSizePx);
  });

  it('the wrap box stays inside DESIGN_WIDTH', () => {
    expect(DESIGN_WIDTH - FAIL.overlayWrapMarginPx * 2).toBeGreaterThan(0);
    expect(FAIL.overlayWrapMarginPx * 2).toBeLessThan(DESIGN_WIDTH);
  });
});

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

// ---------------------------------------------------------------------------
// LEVEL_COMPLETE (PLAN-08 task 1) — the level-complete screen lays header /
// tulip tally / note card / buttons out vertically at the fixed 1280x720
// design size. The scene reads every position/size from here (no magic numbers
// in the scene), so guard the load-bearing layout invariants: the note card
// fits the screen width, the two secondary buttons can't overlap, and the rows
// march down the screen in order and stay on-screen. Cheap regression net for a
// future edit that quietly breaks the fit.
// ---------------------------------------------------------------------------

describe('LEVEL_COMPLETE layout', () => {
  it('the note card fits inside DESIGN_WIDTH', () => {
    const cardWidth = LEVEL_COMPLETE.noteWrapWidthPx + LEVEL_COMPLETE.notePaddingXPx * 2;
    expect(cardWidth).toBeLessThanOrEqual(DESIGN_WIDTH);
  });

  it('the two secondary buttons never overlap', () => {
    // Replay is at cx - offset, Level select at cx + offset; their faces are at
    // least secondaryButtonMinWidthPx wide, so the center-to-center gap
    // (2*offset) must clear that width.
    expect(2 * LEVEL_COMPLETE.secondaryButtonOffsetXPx).toBeGreaterThanOrEqual(
      LEVEL_COMPLETE.secondaryButtonMinWidthPx
    );
  });

  it('the rows are ordered top-to-bottom and stay on screen', () => {
    expect(LEVEL_COMPLETE.headerY).toBeLessThan(LEVEL_COMPLETE.tulipEarnedY);
    expect(LEVEL_COMPLETE.tulipEarnedY).toBeLessThan(LEVEL_COMPLETE.tulipTotalY);
    expect(LEVEL_COMPLETE.tulipTotalY).toBeLessThan(LEVEL_COMPLETE.noteCardCenterY);
    expect(LEVEL_COMPLETE.noteCardCenterY).toBeLessThan(LEVEL_COMPLETE.primaryButtonY);
    // The primary and secondary button rows (faces UI_MIN_TOUCH_PX tall) must
    // not vertically overlap: the primary's bottom edge sits above the
    // secondary's top edge.
    expect(LEVEL_COMPLETE.primaryButtonY + UI_MIN_TOUCH_PX / 2).toBeLessThanOrEqual(
      LEVEL_COMPLETE.secondaryButtonY - UI_MIN_TOUCH_PX / 2
    );
    // The secondary row (button faces are UI_MIN_TOUCH_PX tall) stays on-screen.
    expect(LEVEL_COMPLETE.secondaryButtonY + UI_MIN_TOUCH_PX / 2).toBeLessThanOrEqual(DESIGN_HEIGHT);
  });

  it('the typewriter advances (positive reveal speed) and confetti ranges are ordered', () => {
    expect(LEVEL_COMPLETE.typewriterMsPerChar).toBeGreaterThan(0);
    expect(LEVEL_COMPLETE.confettiSizeMinPx).toBeLessThanOrEqual(LEVEL_COMPLETE.confettiSizeMaxPx);
    expect(LEVEL_COMPLETE.confettiSpeedMinPxPerSec).toBeLessThanOrEqual(
      LEVEL_COMPLETE.confettiSpeedMaxPxPerSec
    );
    expect(LEVEL_COMPLETE.confettiLifetimeMinMs).toBeLessThanOrEqual(
      LEVEL_COMPLETE.confettiLifetimeMaxMs
    );
    expect(LEVEL_COMPLETE.confettiFadeStartFrac).toBeGreaterThanOrEqual(0);
    expect(LEVEL_COMPLETE.confettiFadeStartFrac).toBeLessThan(1);
  });
});
