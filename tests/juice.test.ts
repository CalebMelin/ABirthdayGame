// Tests for the drive-juice math (PLAN-10 ST-8 — src/systems/juice.ts). Like
// confetti.ts, that module is import-safe (type-only Phaser), so its pure
// integrator / gate / ramp helpers load and run in plain Node with no browser.
//
// BEHAVIORAL, never a constant against itself (the tests/confetti.test.ts /
// tests/notes.test.ts discipline): every expectation is derived INDEPENDENTLY
// here — the linear step re-computed from px/sec * seconds, the semi-implicit
// spark step hand-worked one frame at a time, the ramp re-derived from its
// endpoints — so a sign flip, a dropped dt, or a "simplified" ramp fails loudly
// instead of agreeing with the module.
//
// Two headline guards:
//  - FRAME-RATE INDEPENDENCE of the GRAVITY-FREE pieces (dust + speed lines):
//    the same wall-clock time split 1 / 2 / 8 ways must land on bit-identical
//    numbers, so a 120Hz phone and a 60Hz laptop age them the same. The
//    gravity-bearing sparks are semi-implicit Euler and NOT frame-rate exact —
//    asserted here too, so the difference is pinned rather than assumed away.
//  - THE TAKEOFF-SPARK FIX: flipRateForFrame forces the flip rate to 0 on the
//    frame the bike leaves the ground, so airborneRotation's reset-to-0 at
//    takeoff can't be misread as a huge one-frame flip and spark spuriously —
//    including after a PARTIAL prior rotation, the case the sanity bound alone
//    let through.
import { describe, expect, it } from 'vitest';
import {
  advanceLinearPos,
  flipRateForFrame,
  shouldEmitFlipSpark,
  speedLineAlpha,
  stepJuiceParticle,
} from '../src/systems/juice';
import type { JuiceKinematics } from '../src/systems/juice';
import { JUICE } from '../src/systems/constants';

/** A fresh kinematic state, so no test can leak mutation into another. */
function kin(over: Partial<JuiceKinematics> = {}): JuiceKinematics {
  return { x: 0, y: 0, vx: 0, vy: 0, ...over };
}

describe('advanceLinearPos', () => {
  it('advances position by velocity * seconds', () => {
    // 100px, -50px/sec, for 200ms -> 100 - 50*0.2 = 90.
    expect(advanceLinearPos(100, -50, 200)).toBeCloseTo(90, 12);
    expect(advanceLinearPos(0, 300, 1000)).toBeCloseTo(300, 12);
    expect(advanceLinearPos(7, 0, 999)).toBe(7); // stationary never moves
  });

  it('is a no-op for a zero delta', () => {
    expect(advanceLinearPos(42, 1234, 0)).toBe(42);
  });

  it('is EXACTLY frame-rate independent (1 vs 2 vs 8 sub-steps)', () => {
    // Constant velocity, so summing equal sub-steps lands on the same place.
    const run = (steps: number): number => {
      let x = 5;
      for (let i = 0; i < steps; i++) x = advanceLinearPos(x, -180, 1000 / steps);
      return x;
    };
    const one = run(1);
    for (const steps of [2, 8, 60]) expect(run(steps)).toBeCloseTo(one, 9);
    // ...and it agrees with the closed form -180px/s over 1s = -175 from 5.
    expect(one).toBeCloseTo(5 - 180, 9);
  });
});

describe('stepJuiceParticle', () => {
  it('reproduces one hand-worked semi-implicit Euler step under gravity', () => {
    // dt = 0.1s, g = 320: vy += 320*0.1 = 32; x += 10*0.1 = 1; y += (new vy)*0.1
    // = 3.2. The y uses the UPDATED velocity — that is the semi-implicit order.
    const k = kin({ vx: 10, vy: 0 });
    stepJuiceParticle(k, 100, 320);
    expect(k.vy).toBeCloseTo(32, 12);
    expect(k.x).toBeCloseTo(1, 12);
    expect(k.y).toBeCloseTo(3.2, 12);
  });

  it('carries the DUST case (gravity 0) at constant velocity', () => {
    const k = kin({ vx: 120, vy: -40 });
    for (let i = 0; i < 10; i++) stepJuiceParticle(k, 100, 0);
    expect(k.x).toBeCloseTo(120, 10); // 120px/s for 1s
    expect(k.y).toBeCloseTo(-40, 10);
    expect(k.vy).toBe(-40); // never accelerates without gravity
  });

  it('is EXACTLY frame-rate independent for the gravity-free (dust) case', () => {
    const simulate = (steps: number): JuiceKinematics => {
      const k = kin({ x: 3, y: 9, vx: 200, vy: -75 });
      for (let i = 0; i < steps; i++) stepJuiceParticle(k, 1000 / steps, 0);
      return k;
    };
    const one = simulate(1);
    for (const steps of [2, 8, 60]) {
      const many = simulate(steps);
      expect(many.x).toBeCloseTo(one.x, 9);
      expect(many.y).toBeCloseTo(one.y, 9);
      expect(many.vy).toBeCloseTo(one.vy, 9);
    }
  });

  it('is NOT frame-rate exact WITH gravity (semi-implicit, by design)', () => {
    // Honesty guard (the confetti.ts precedent): document that the spark path
    // really does diverge across sub-step counts, so nobody later "fixes" a
    // gravity-free assertion into this path and quietly breaks it.
    const fallY = (steps: number): number => {
      const k = kin();
      for (let i = 0; i < steps; i++) stepJuiceParticle(k, 1000 / steps, 900);
      return k.y;
    };
    // 1 big step over-falls vs many small ones (each step applies its END
    // velocity across the whole step): 1-step y is strictly the larger.
    expect(fallY(1)).toBeGreaterThan(fallY(8) + 1);
  });

  it('is a no-op for a zero delta', () => {
    const k = kin({ x: 3, y: 4, vx: 9, vy: -9 });
    stepJuiceParticle(k, 0, 900);
    expect(k).toEqual(kin({ x: 3, y: 4, vx: 9, vy: -9 }));
  });
});

describe('speedLineAlpha', () => {
  // Hand-chosen params (not the JUICE block) so the ramp math is pinned on its
  // own, independent numbers: on at 0.5, full at 1.0, peak 0.2.
  const ON = 0.5;
  const FULL = 1.0;
  const MAX = 0.2;

  it('is 0 at or below the "on" ratio (invisible until fast enough)', () => {
    expect(speedLineAlpha(0, ON, FULL, MAX)).toBe(0);
    expect(speedLineAlpha(0.4, ON, FULL, MAX)).toBe(0);
    expect(speedLineAlpha(ON, ON, FULL, MAX)).toBe(0);
  });

  it('ramps linearly from "on" up to peak at "full"', () => {
    expect(speedLineAlpha(0.625, ON, FULL, MAX)).toBeCloseTo(0.05, 12); // 25%
    expect(speedLineAlpha(0.75, ON, FULL, MAX)).toBeCloseTo(0.1, 12); // 50%
    expect(speedLineAlpha(FULL, ON, FULL, MAX)).toBeCloseTo(MAX, 12); // 100%
  });

  it('holds at peak above "full" (clamped, never brighter than max)', () => {
    expect(speedLineAlpha(1.5, ON, FULL, MAX)).toBeCloseTo(MAX, 12);
    expect(speedLineAlpha(999, ON, FULL, MAX)).toBeCloseTo(MAX, 12);
  });

  it('is monotonically non-decreasing across the ratio range', () => {
    let prev = -1;
    for (let r = 0; r <= 1.2; r += 0.02) {
      const a = speedLineAlpha(r, ON, FULL, MAX);
      expect(a).toBeGreaterThanOrEqual(prev - 1e-12);
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThanOrEqual(MAX + 1e-12);
      prev = a;
    }
  });

  it('honours the game constants at the boundaries (wiring check)', () => {
    // Below the real "on" ratio the lines are fully invisible; at/above the real
    // "full" ratio they sit at the real peak. Derived from the constants' MEANING
    // (invisible below on, peak at full), not read back from the ramp.
    expect(
      speedLineAlpha(
        JUICE.speedLineRatioOn - 0.01,
        JUICE.speedLineRatioOn,
        JUICE.speedLineFullRatio,
        JUICE.speedLineMaxAlpha
      )
    ).toBe(0);
    expect(
      speedLineAlpha(1, JUICE.speedLineRatioOn, JUICE.speedLineFullRatio, JUICE.speedLineMaxAlpha)
    ).toBeCloseTo(JUICE.speedLineMaxAlpha, 12);
  });
});

describe('flipRateForFrame — the takeoff-spike fix', () => {
  it('is |airborneRotation change| while ALREADY airborne', () => {
    expect(flipRateForFrame(true, 1.2, 1.05)).toBeCloseTo(0.15, 12);
    expect(flipRateForFrame(true, 1.0, 1.3)).toBeCloseTo(0.3, 12); // abs of a negative delta
    expect(flipRateForFrame(true, 2.0, 2.0)).toBe(0); // no spin this frame
  });

  it('is FORCED to 0 on the takeoff frame (grounded last frame), for ANY prior total', () => {
    // airborneRotation resets to 0 at takeoff while prevAirRot still holds the
    // prior air phase's frozen total. Without the guard this would read as that
    // whole total; with it, the rising-edge rate is exactly 0.
    expect(flipRateForFrame(false, 0, 0.8)).toBe(0); // a PARTIAL prior rotation
    expect(flipRateForFrame(false, 0, 6.0)).toBe(0); // a near-full prior flip
    expect(flipRateForFrame(false, 0, 0)).toBe(0); // a fresh run, nothing prior
  });
});

describe('shouldEmitFlipSpark — the flip-rate gate', () => {
  const THRESH = JUICE.sparkFlipRateThreshRad; // 0.11
  const SANITY = JUICE.sparkFlipRateSanityRad; // 1.5

  it('emits only for a rate above the threshold and below the sanity ceiling', () => {
    expect(shouldEmitFlipSpark(0, THRESH, SANITY)).toBe(false);
    expect(shouldEmitFlipSpark(THRESH, THRESH, SANITY)).toBe(false); // not strictly greater
    expect(shouldEmitFlipSpark(0.2, THRESH, SANITY)).toBe(true);
    expect(shouldEmitFlipSpark(SANITY, THRESH, SANITY)).toBe(false); // not strictly less
    expect(shouldEmitFlipSpark(2.0, THRESH, SANITY)).toBe(false); // over the ceiling
  });

  it('NO spark on a partial-rotation takeoff (the Fix-1 case end to end)', () => {
    // A wheelie / small hop leaves a prior total of ~0.8 rad. The naive
    // |airRot - prevAirRot| on the takeoff frame is 0.8 — which the sanity bound
    // does NOT reject (0.11 < 0.8 < 1.5), so it WOULD have sparked...
    expect(shouldEmitFlipSpark(0.8, THRESH, SANITY)).toBe(true);
    // ...but flipRateForFrame zeroes the rising edge, so the gate sees 0 and the
    // takeoff correctly stays dark.
    const rate = flipRateForFrame(false, 0, 0.8);
    expect(rate).toBe(0);
    expect(shouldEmitFlipSpark(rate, THRESH, SANITY)).toBe(false);
  });

  it('the sanity bound alone catches only a NEAR-FULL prior flip (why the guard is needed)', () => {
    // A ~2*PI prior total would have been rejected by the ceiling even without
    // the guard — which is exactly why the old comment thought takeoff was safe.
    expect(shouldEmitFlipSpark(2 * Math.PI, THRESH, SANITY)).toBe(false);
    // The partial case (above) proves the ceiling was not enough on its own.
  });
});
