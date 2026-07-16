// Pure-logic tests for the trick/tulip system (PLAN-07 task 1). tricks.ts is
// import-safe (no runtime Phaser, no ui.ts — same discipline as police.ts /
// pickup.ts), so these exercise the exported pure helpers directly — the
// flip-count-from-rotation rule, the radians->degrees conversion, the
// direction->toast mapping, the bouquet growth-stage mapping, and the
// landing-transition predicate. The scene-touching createTricks factory
// (HUD container, toast/arc tweens, beforeupdate wiring) is covered by the
// browser harness (scripts/playtest-tulips.mjs), not here.
import { describe, expect, it } from 'vitest';
import {
  BACKFLIP_TOAST_MESSAGE,
  FRONTFLIP_TOAST_MESSAGE,
  rotationDegrees,
  flipsFromDegrees,
  flipToastMessage,
  bouquetStage,
  isLandingStep,
} from '../src/systems/tricks';
import { TRICKS } from '../src/systems/constants';

describe('trick toast verbatim copy (byte-exact — CLAUDE.md Rule 4)', () => {
  it('backflip toast is exactly "Backflip!! 🌷" (TULIP emoji U+1F337)', () => {
    // Straight from PLAN-07 task 1 — never paraphrase/restyle. Compared against
    // a code-point literal too, so an accidental emoji/punctuation swap fails.
    expect(BACKFLIP_TOAST_MESSAGE).toBe('Backflip!! \u{1F337}');
    expect(BACKFLIP_TOAST_MESSAGE).toBe('Backflip!! 🌷');
  });

  it('frontflip toast is exactly "Frontflip!! 🌷"', () => {
    expect(FRONTFLIP_TOAST_MESSAGE).toBe('Frontflip!! \u{1F337}');
    expect(FRONTFLIP_TOAST_MESSAGE).toBe('Frontflip!! 🌷');
  });
});

describe('rotationDegrees', () => {
  it('converts radians to degrees without Phaser', () => {
    expect(rotationDegrees(Math.PI)).toBeCloseTo(180, 10);
    expect(rotationDegrees(-2 * Math.PI)).toBeCloseTo(-360, 10);
    expect(rotationDegrees(0)).toBe(0);
  });

  it('preserves sign (negative accumulated rotation = backflip direction)', () => {
    expect(rotationDegrees(-1)).toBeLessThan(0);
    expect(rotationDegrees(1)).toBeGreaterThan(0);
  });
});

describe('flipsFromDegrees (the award rule)', () => {
  it('awards n flips when |rotation| >= n*360 - 30 (threshold 330)', () => {
    // The forgiving-threshold rule from PLAN-07: flips = floor((|deg|+30)/360).
    expect(flipsFromDegrees(0)).toBe(0);
    expect(flipsFromDegrees(100)).toBe(0);
    expect(flipsFromDegrees(329.9)).toBe(0);
    expect(flipsFromDegrees(330)).toBe(1);
    expect(flipsFromDegrees(360)).toBe(1);
    expect(flipsFromDegrees(689)).toBe(1);
    expect(flipsFromDegrees(690)).toBe(2);
    expect(flipsFromDegrees(1049)).toBe(2);
    expect(flipsFromDegrees(1050)).toBe(3);
  });

  it('counts from |rotation| — negative (backflip) rotation awards identically', () => {
    expect(flipsFromDegrees(-329.9)).toBe(0);
    expect(flipsFromDegrees(-330)).toBe(1);
    expect(flipsFromDegrees(-689)).toBe(1);
    expect(flipsFromDegrees(-690)).toBe(2);
  });

  it('awards 1 flip for the PLAN-02 measured real backflip landings (-376 / -508 deg)', () => {
    expect(flipsFromDegrees(-376)).toBe(1);
    expect(flipsFromDegrees(-508)).toBe(1);
  });

  it('tracks the TRICKS threshold constants exactly at every n-flip boundary', () => {
    const grace = TRICKS.fullFlipDeg - TRICKS.flipThresholdDeg;
    for (let n = 1; n <= 4; n++) {
      const boundary = n * TRICKS.fullFlipDeg - grace;
      expect(flipsFromDegrees(boundary)).toBe(n);
      expect(flipsFromDegrees(boundary - 0.001)).toBe(n - 1);
    }
  });

  it('is total: non-finite input awards 0 instead of NaN/throwing', () => {
    expect(flipsFromDegrees(Number.NaN)).toBe(0);
    expect(flipsFromDegrees(Number.POSITIVE_INFINITY)).toBe(0);
    expect(flipsFromDegrees(Number.NEGATIVE_INFINITY)).toBe(0);
  });
});

describe('flipToastMessage (direction from the rotation sign)', () => {
  it('negative rotation (gas / nose-up direction) reads as a backflip', () => {
    expect(flipToastMessage(-376)).toBe(BACKFLIP_TOAST_MESSAGE);
    expect(flipToastMessage(-690)).toBe(BACKFLIP_TOAST_MESSAGE);
  });

  it('positive rotation (brake / nose-down direction) reads as a frontflip', () => {
    expect(flipToastMessage(376)).toBe(FRONTFLIP_TOAST_MESSAGE);
    expect(flipToastMessage(690)).toBe(FRONTFLIP_TOAST_MESSAGE);
  });
});

describe('bouquetStage (HUD growth mapping)', () => {
  it('starts as a single tulip icon, including at count 0', () => {
    expect(bouquetStage(0)).toBe('single');
    expect(bouquetStage(1)).toBe('single');
    expect(bouquetStage(TRICKS.bunchAtCount - 1)).toBe('single');
  });

  it('grows to a small bunch at the bunch threshold', () => {
    expect(bouquetStage(TRICKS.bunchAtCount)).toBe('bunch');
    expect(bouquetStage(TRICKS.bouquetAtCount - 1)).toBe('bunch');
  });

  it('grows to the full bouquet at the bouquet threshold and stays there', () => {
    expect(bouquetStage(TRICKS.bouquetAtCount)).toBe('bouquet');
    expect(bouquetStage(22)).toBe('bouquet');
    expect(bouquetStage(1000)).toBe('bouquet');
  });

  it('is total: garbage counts read as the starting single-tulip stage', () => {
    expect(bouquetStage(-5)).toBe('single');
    expect(bouquetStage(Number.NaN)).toBe('single');
  });
});

describe('isLandingStep (award gating)', () => {
  it('is true ONLY on the airborne -> grounded transition of an uncrashed bike', () => {
    expect(isLandingStep(true, false, false)).toBe(true);
  });

  it('is false in every other state (no mid-air, no rolling, no crashed award)', () => {
    expect(isLandingStep(true, true, false)).toBe(false); // still airborne
    expect(isLandingStep(false, false, false)).toBe(false); // rolling on ground
    expect(isLandingStep(false, true, false)).toBe(false); // takeoff step
    expect(isLandingStep(true, false, true)).toBe(false); // crashed landing
    expect(isLandingStep(true, true, true)).toBe(false);
    expect(isLandingStep(false, false, true)).toBe(false);
    expect(isLandingStep(false, true, true)).toBe(false);
  });
});
