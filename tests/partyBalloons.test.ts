// Tests for the party's poppable balloons (PLAN-09 ST-2 —
// src/systems/partyBalloons.ts). That module is import-safe (type-only Phaser),
// so its pure rise/sway/recycle/spawn/dedupe helpers load and run in plain Node;
// the Container/Zone wiring is browser-verified instead.
//
// BEHAVIORAL, never a constant against itself (the tests/notes.test.ts /
// tests/finale.test.ts discipline): the motion expectations are re-derived here
// from first principles (distance = speed x time; a sine's own zeros and peaks),
// the spawn bounds are checked against the SCREEN rather than against the
// constants that produced them wherever possible, and the balloon-count guard
// is written against PLAN-09's literal acceptance criterion (>= 20), not
// against PARTY.balloonCount.
import { describe, expect, it } from 'vitest';
import {
  BALLOON_TINTS,
  balloonHitCenterY,
  balloonRiseY,
  balloonSpawn,
  balloonSwayOffsetPx,
  isDuplicatePopEvent,
  popEventKey,
  shouldRecycleBalloon,
} from '../src/systems/partyBalloons';
import { DEPTHS, DESIGN_HEIGHT, DESIGN_WIDTH, PALETTE, PARTY, UI_MIN_TOUCH_PX } from '../src/systems/constants';

/** A deterministic rng that walks a fixed list of draws, wrapping — so a spawn
 * roll is fully reproducible without depending on how many draws it makes. */
function seededRng(values: readonly number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

/** An rng that returns the same draw every time (pins a spawn to one corner of
 * every range at once). */
const constantRng = (value: number): (() => number) => () => value;

describe('PLAN-09 acceptance: at least 20 balloons', () => {
  it('keeps the pool at or above the plan\'s 20-balloon floor', () => {
    // The literal acceptance criterion from plans/PLAN-09-party-credits.md:
    // ">= 20 balloons + background crowd present". Guarded (not merely
    // satisfied) so a future "let's trim the pool" tweak fails here.
    expect(PARTY.balloonCount).toBeGreaterThanOrEqual(20);
  });

  it('keeps enough headroom that the VISIBLE count stays above 20 too', () => {
    // A balloon is off-screen for the slice of each flight spent below the
    // bottom edge or clearing the top, so the pool has to exceed 20 by that
    // fraction. Derived here from the geometry rather than trusting the
    // constant's own doc comment: a flight runs from (screen bottom +
    // spawnBelow) up to (-recycleAbove), and the balloon is visible while its
    // knot is between the bottom edge and -bodyHeight.
    const bodyHeightPx = 32 * 2.4; // tex-balloon (24x32) at the module's 2.4 scale
    const flightPx = DESIGN_HEIGHT + PARTY.balloonSpawnBelowPx + PARTY.balloonRecycleAbovePx;
    const visiblePx = DESIGN_HEIGHT + bodyHeightPx;
    const expectedVisible = PARTY.balloonCount * (visiblePx / flightPx);
    expect(expectedVisible).toBeGreaterThan(20);
  });

  it('gives every balloon a thumb-sized hit target (NORTH_STAR §8)', () => {
    expect(PARTY.balloonHitSizePx).toBeGreaterThanOrEqual(UI_MIN_TOUCH_PX);
    // ...and it really is BIGGER than the drawn balloon, or the decoupled
    // visible-face/hit-area split would be pointless.
    expect(PARTY.balloonHitSizePx).toBeGreaterThan(24 * 2.4);
  });

  it('layers balloons above the cast and their pop puffs above the balloons', () => {
    // ST-1 recorded the invariant that nameTagDepth stays below DEPTHS.fx
    // precisely so this layer can sit above the cast — honour it.
    expect(PARTY.nameTagDepth).toBeLessThan(DEPTHS.fx);
    expect(PARTY.confettiFallDepth).toBeGreaterThan(PARTY.nameTagDepth);
    expect(PARTY.balloonDepth).toBeGreaterThan(PARTY.confettiFallDepth);
    expect(PARTY.popConfettiDepth).toBeGreaterThan(PARTY.balloonDepth);
  });
});

describe('balloonRiseY', () => {
  it('rises (screen y decreases) by exactly speed x time', () => {
    // 40 px/s for 3s = 120px up from y = 500.
    expect(balloonRiseY(500, 40, 3000)).toBeCloseTo(380, 10);
  });

  it('is frame-rate independent by construction (closed form, not an accumulator)', () => {
    // Sampling the same 2s at 60Hz, 120Hz or once must land on the same y.
    const at = (t: number) => balloonRiseY(800, 37, t);
    for (const stepMs of [1000 / 60, 1000 / 120, 250, 2000]) {
      let t = 0;
      while (t < 2000) t = Math.min(2000, t + stepMs);
      expect(at(t)).toBeCloseTo(at(2000), 12);
    }
    expect(at(2000)).toBeCloseTo(800 - 37 * 2, 10);
  });

  it('is the identity at t = 0 and monotonic thereafter', () => {
    expect(balloonRiseY(720, 50, 0)).toBe(720);
    let previous = 720;
    for (let t = 0; t <= 10_000; t += 250) {
      const y = balloonRiseY(720, 50, t);
      expect(y).toBeLessThanOrEqual(previous);
      previous = y;
    }
  });

  it('eventually clears the top of the screen at the SLOWEST configured speed', () => {
    // The endless supply depends on even the laziest balloon recycling.
    const slowest = PARTY.balloonRiseMinPxPerSec;
    const start = DESIGN_HEIGHT + PARTY.balloonSpawnBelowPx;
    const y = balloonRiseY(start, slowest, 120_000); // two minutes
    expect(y).toBeLessThan(-PARTY.balloonRecycleAbovePx);
  });
});

describe('balloonSwayOffsetPx', () => {
  const AMP = 20;
  const PERIOD = 3000;

  it('starts at 0 and peaks a quarter-cycle later (a plain sine)', () => {
    expect(balloonSwayOffsetPx(0, 0, AMP, PERIOD)).toBeCloseTo(0, 10);
    expect(balloonSwayOffsetPx(PERIOD / 4, 0, AMP, PERIOD)).toBeCloseTo(AMP, 10);
    expect(balloonSwayOffsetPx(PERIOD / 2, 0, AMP, PERIOD)).toBeCloseTo(0, 10);
    expect(balloonSwayOffsetPx((PERIOD * 3) / 4, 0, AMP, PERIOD)).toBeCloseTo(-AMP, 10);
  });

  it('never exceeds its amplitude, and uses BOTH directions', () => {
    let sawLeft = false;
    let sawRight = false;
    for (let t = 0; t < 4 * PERIOD; t += 37) {
      const offset = balloonSwayOffsetPx(t, 0.13, AMP, PERIOD);
      expect(Math.abs(offset)).toBeLessThanOrEqual(AMP + 1e-9);
      if (offset < -AMP * 0.9) sawLeft = true;
      if (offset > AMP * 0.9) sawRight = true;
    }
    expect(sawLeft).toBe(true);
    expect(sawRight).toBe(true);
  });

  it('repeats exactly once per period', () => {
    for (let t = 0; t < PERIOD; t += 91) {
      expect(balloonSwayOffsetPx(t + PERIOD, 0.4, AMP, PERIOD)).toBeCloseTo(
        balloonSwayOffsetPx(t, 0.4, AMP, PERIOD),
        9
      );
    }
  });

  it('separates two balloons that differ ONLY in phase', () => {
    // Half a cycle apart => exactly opposite offsets, so a flock never sways
    // as one sheet.
    for (let t = 0; t < PERIOD; t += 101) {
      expect(balloonSwayOffsetPx(t, 0.5, AMP, PERIOD)).toBeCloseTo(
        -balloonSwayOffsetPx(t, 0, AMP, PERIOD),
        9
      );
    }
  });

  it('is SMOOTH, not the cast\'s deliberate 2-frame flip', () => {
    // partyCast's castBounceOffsetPx only ever returns 0 or -amplitude; a
    // balloon on a string must take intermediate values.
    const samples = new Set<number>();
    for (let t = 0; t < PERIOD; t += 50) {
      samples.add(Number(balloonSwayOffsetPx(t, 0, AMP, PERIOD).toFixed(4)));
    }
    expect(samples.size).toBeGreaterThan(10);
  });

  it('is total for a degenerate period', () => {
    expect(balloonSwayOffsetPx(1234, 0.2, AMP, 0)).toBe(0);
    expect(balloonSwayOffsetPx(1234, 0.2, AMP, -5)).toBe(0);
  });
});

describe('shouldRecycleBalloon', () => {
  const LIMIT = -PARTY.balloonRecycleAbovePx;

  it('holds a balloon anywhere on screen', () => {
    for (const y of [DESIGN_HEIGHT + 60, DESIGN_HEIGHT, 360, 0]) {
      expect(shouldRecycleBalloon(y, LIMIT)).toBe(false);
    }
  });

  it('recycles only once the knot is fully past the top limit', () => {
    expect(shouldRecycleBalloon(LIMIT, LIMIT)).toBe(false);
    expect(shouldRecycleBalloon(LIMIT - 0.1, LIMIT)).toBe(true);
  });

  it('does not recycle while any part of the balloon is still visible', () => {
    // The body floats ABOVE the knot, so a knot at y = 0 still shows nothing —
    // but a knot just above 0 must NOT recycle, or balloons would vanish
    // mid-screen. The limit has to clear the drawn body height (32 x 2.4).
    expect(PARTY.balloonRecycleAbovePx).toBeGreaterThan(32 * 2.4);
    expect(shouldRecycleBalloon(-1, LIMIT)).toBe(false);
  });
});

describe('balloonHitCenterY', () => {
  it('centres the hit area on the BODY, which floats above the knot', () => {
    expect(balloonHitCenterY(500, 80)).toBe(460);
  });

  it('defaults to the drawn placeholder body height', () => {
    // 32px texture at 2.4 scale = 76.8 tall, so the centre sits 38.4 above.
    expect(balloonHitCenterY(500)).toBeCloseTo(500 - (32 * 2.4) / 2, 10);
  });

  it('always sits above its knot (never below it)', () => {
    for (const knot of [-100, 0, 360, 900]) {
      expect(balloonHitCenterY(knot)).toBeLessThan(knot);
    }
  });
});

describe('popEventKey / isDuplicatePopEvent', () => {
  it('treats the SAME physical press as one press', () => {
    const key = popEventKey(1, 12_345);
    expect(isDuplicatePopEvent(key, popEventKey(1, 12_345))).toBe(true);
  });

  it('treats a LATER press by the same pointer as a new press', () => {
    expect(isDuplicatePopEvent(popEventKey(1, 12_345), popEventKey(1, 12_346))).toBe(false);
  });

  it('treats a SECOND finger landing at the same instant as a new press', () => {
    // Multitouch: two thumbs can land on the same millisecond and must pop two
    // balloons. Only the (id, time) PAIR identifies a press.
    expect(isDuplicatePopEvent(popEventKey(1, 12_345), popEventKey(2, 12_345))).toBe(false);
  });

  it('accepts the very first press of a session', () => {
    expect(isDuplicatePopEvent(null, popEventKey(1, 0))).toBe(false);
  });
});

describe('BALLOON_TINTS', () => {
  it('offers genuinely varied colors (the plan asks for varied colors)', () => {
    expect(BALLOON_TINTS.length).toBeGreaterThanOrEqual(6);
    expect(new Set(BALLOON_TINTS).size).toBe(BALLOON_TINTS.length);
  });

  it('draws every tint from the game palette', () => {
    const palette = new Set<number>(Object.values(PALETTE));
    for (const tint of BALLOON_TINTS) expect(palette.has(tint)).toBe(true);
  });

  it('never tints a balloon in the dark outline color (it would read as a hole)', () => {
    expect(BALLOON_TINTS).not.toContain(PALETTE.outline);
    expect(BALLOON_TINTS).not.toContain(PALETTE.plum);
  });
});

describe('balloonSpawn', () => {
  it('keeps every balloon fully inside the screen horizontally', () => {
    // Swept across the whole draw range, not just the midpoint, and checked
    // against the SCREEN — the balloon is ~58px wide at placeholder scale, so
    // half of it (29) must still fit inside whatever margin was chosen.
    const halfWidthPx = (24 * 2.4) / 2;
    for (let u = 0; u < 1; u += 0.02) {
      const spawn = balloonSpawn(constantRng(u), 'recycle');
      expect(spawn.baseX - halfWidthPx).toBeGreaterThan(0);
      expect(spawn.baseX + halfWidthPx).toBeLessThan(DESIGN_WIDTH);
    }
  });

  it('keeps a swaying balloon on screen too (margin covers the sway)', () => {
    const halfWidthPx = (24 * 2.4) / 2;
    const worst = balloonSpawn(constantRng(0.999999), 'recycle');
    expect(worst.baseX + PARTY.balloonSwayMaxPx + halfWidthPx).toBeLessThanOrEqual(DESIGN_WIDTH);
    const leftmost = balloonSpawn(constantRng(0), 'recycle');
    expect(leftmost.baseX - PARTY.balloonSwayMaxPx - halfWidthPx).toBeGreaterThanOrEqual(0);
  });

  it('brings a RECYCLED balloon in from below the bottom edge', () => {
    for (const u of [0, 0.25, 0.5, 0.75, 0.99]) {
      expect(balloonSpawn(constantRng(u), 'recycle').spawnY).toBeGreaterThan(DESIGN_HEIGHT);
    }
  });

  it('seeds the INITIAL pool across the screen so the party starts full', () => {
    const low = balloonSpawn(constantRng(0.02), 'initial');
    const high = balloonSpawn(constantRng(0.9), 'initial');
    expect(low.spawnY).toBeLessThan(DESIGN_HEIGHT / 2);
    expect(high.spawnY).toBeGreaterThan(DESIGN_HEIGHT / 2);
    // ...and never above the top edge, which would waste a balloon.
    for (let u = 0; u < 1; u += 0.05) {
      expect(balloonSpawn(constantRng(u), 'initial').spawnY).toBeGreaterThanOrEqual(0);
    }
  });

  it('always rises (a balloon never sinks) at a speed inside the configured band', () => {
    for (let u = 0; u < 1; u += 0.02) {
      const spawn = balloonSpawn(constantRng(u), 'recycle');
      expect(spawn.riseSpeedPxPerSec).toBeGreaterThan(0);
      expect(spawn.riseSpeedPxPerSec).toBeGreaterThanOrEqual(PARTY.balloonRiseMinPxPerSec);
      expect(spawn.riseSpeedPxPerSec).toBeLessThanOrEqual(PARTY.balloonRiseMaxPxPerSec);
    }
  });

  it('always sways visibly, with a real period', () => {
    for (let u = 0; u < 1; u += 0.02) {
      const spawn = balloonSpawn(constantRng(u), 'recycle');
      expect(spawn.swayAmplitudePx).toBeGreaterThan(0);
      expect(spawn.swayPeriodMs).toBeGreaterThan(0);
      expect(spawn.swayPhase01).toBeGreaterThanOrEqual(0);
      expect(spawn.swayPhase01).toBeLessThanOrEqual(1);
    }
  });

  it('only ever picks a tint from BALLOON_TINTS, including at rng() === 1', () => {
    const tints = new Set(BALLOON_TINTS);
    for (let u = 0; u <= 1; u += 0.01) {
      expect(tints.has(balloonSpawn(constantRng(u), 'recycle').tint)).toBe(true);
    }
    // Math.random() never returns 1, but an injected rng might — must not
    // index past the end.
    expect(tints.has(balloonSpawn(constantRng(1), 'recycle').tint)).toBe(true);
  });

  it('reaches EVERY tint across a uniform sweep (no dead color)', () => {
    const seen = new Set<number>();
    for (let u = 0; u < 1; u += 0.005) seen.add(balloonSpawn(constantRng(u), 'recycle').tint);
    expect(seen.size).toBe(BALLOON_TINTS.length);
  });

  it('produces DIFFERENT flights from different draws (a flock, not a row)', () => {
    const a = balloonSpawn(seededRng([0.1, 0.2, 0.3, 0.4, 0.5, 0.6]), 'recycle');
    const b = balloonSpawn(seededRng([0.9, 0.8, 0.7, 0.6, 0.5, 0.4]), 'recycle');
    expect(a.baseX).not.toBe(b.baseX);
    expect(a.riseSpeedPxPerSec).not.toBe(b.riseSpeedPxPerSec);
    expect(a.swayPeriodMs).not.toBe(b.swayPeriodMs);
  });

  it('is deterministic for a given rng sequence (a seeded harness reproduces it)', () => {
    const draws = [0.11, 0.22, 0.33, 0.44, 0.55, 0.66, 0.77];
    expect(balloonSpawn(seededRng(draws), 'recycle')).toEqual(
      balloonSpawn(seededRng(draws), 'recycle')
    );
  });
});
