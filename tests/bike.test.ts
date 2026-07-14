import { describe, expect, it } from 'vitest';
import {
  accumulateAirborneRotation,
  airborneChassisAngularVelocity,
  bikeSpawnY,
  nextWheelAngularVelocity,
  normalizeAngle,
  shortestArcToUpright,
} from '../src/systems/bike';
import { BIKE_TUNING } from '../src/systems/constants';

// NOTE ON STYLE: every expectation below is RELATIONAL to BIKE_TUNING (or to
// pure math like π), never a hardcoded magic result — the feel-tuning pass
// (PLAN-02 task 6) will change the tuning values, and these tests assert the
// control-law SHAPES that must survive that tuning.

describe('normalizeAngle', () => {
  it('leaves angles already in [-π, π) unchanged', () => {
    expect(normalizeAngle(0)).toBe(0);
    expect(normalizeAngle(1.2)).toBeCloseTo(1.2, 12);
    expect(normalizeAngle(-3)).toBeCloseTo(-3, 12); // -3 > -π, still in range
  });

  it('wraps full revolutions back to ~0', () => {
    expect(normalizeAngle(2 * Math.PI)).toBeCloseTo(0, 12);
    expect(normalizeAngle(-2 * Math.PI)).toBeCloseTo(0, 12);
    expect(normalizeAngle(6 * Math.PI)).toBeCloseTo(0, 12);
  });

  it('wraps out-of-range angles into [-π, π)', () => {
    expect(normalizeAngle(3 * Math.PI)).toBeCloseTo(-Math.PI, 12); // range is [-π, π): +π lands on -π
    expect(normalizeAngle(7)).toBeCloseTo(7 - 2 * Math.PI, 12);
    expect(normalizeAngle(-7)).toBeCloseTo(-7 + 2 * Math.PI, 12);
  });

  it('never returns a value outside [-π, π) across a sweep', () => {
    for (let a = -25; a <= 25; a += 0.37) {
      const n = normalizeAngle(a);
      expect(n).toBeGreaterThanOrEqual(-Math.PI);
      expect(n).toBeLessThan(Math.PI);
    }
  });
});

describe('shortestArcToUpright', () => {
  it('is zero when already upright', () => {
    expect(shortestArcToUpright(0)).toBe(0);
  });

  it('counter-rotates a small tilt (goes back the short way)', () => {
    expect(shortestArcToUpright(0.4)).toBeCloseTo(-0.4, 12);
    expect(shortestArcToUpright(-0.4)).toBeCloseTo(0.4, 12);
  });

  it('pushes ONWARD through a flip once past the halfway point', () => {
    // 3.3 rad tilted clockwise is past π — completing the rotation (+2.98)
    // is shorter than unwinding it (-3.3). This is the friendly
    // "assist finishes your flips" property the doc comment promises.
    expect(shortestArcToUpright(3.3)).toBeCloseTo(2 * Math.PI - 3.3, 12);
    expect(shortestArcToUpright(3.3)).toBeGreaterThan(0);
  });

  it('never asks for more than half a revolution', () => {
    for (let a = -25; a <= 25; a += 0.37) {
      expect(Math.abs(shortestArcToUpright(a))).toBeLessThanOrEqual(Math.PI);
    }
  });
});

describe('accumulateAirborneRotation', () => {
  it('accumulates simple per-frame deltas', () => {
    let total = accumulateAirborneRotation(0, 0.1, 0.3);
    total = accumulateAirborneRotation(total, 0.3, 0.45);
    expect(total).toBeCloseTo(0.35, 12);
  });

  it('accumulates negative (nose-up / backflip direction) deltas', () => {
    expect(accumulateAirborneRotation(0, 0.2, -0.1)).toBeCloseTo(-0.3, 12);
  });

  it('is wrap-safe when the angle crosses ±π between frames', () => {
    // 3.1 → -3.1 is really a small +0.083 hop across the seam, not -6.2.
    const total = accumulateAirborneRotation(0, 3.1, -3.1);
    expect(total).toBeCloseTo(2 * Math.PI - 6.2, 10);
    expect(Math.abs(total)).toBeLessThan(0.1);
  });

  it('totals a full simulated flip to ~2π even though the angle wraps', () => {
    const stepCount = 100;
    const step = (2 * Math.PI) / stepCount;
    let total = 0;
    let prev = 0;
    for (let i = 1; i <= stepCount; i++) {
      const current = normalizeAngle(i * step); // what Matter-ish wrapped angles look like
      total = accumulateAirborneRotation(total, prev, current);
      prev = current;
    }
    expect(total).toBeCloseTo(2 * Math.PI, 8);
  });
});

describe('nextWheelAngularVelocity — gas', () => {
  it('spins the driven wheel up by exactly the per-step torque limit', () => {
    const next = nextWheelAngularVelocity(0.1, true, false, true);
    expect(next).toBeCloseTo(0.1 + BIKE_TUNING.gasSpinUpPerStep, 12);
  });

  it('caps driven spin at maxWheelAngularVelocity (easygoing top speed)', () => {
    const nearMax = BIKE_TUNING.maxWheelAngularVelocity - BIKE_TUNING.gasSpinUpPerStep / 2;
    expect(nextWheelAngularVelocity(nearMax, true, false, true)).toBe(
      BIKE_TUNING.maxWheelAngularVelocity
    );
  });

  it('leaves an overspun wheel alone (downhill gas must never brake)', () => {
    const overspun = BIKE_TUNING.maxWheelAngularVelocity + 0.2;
    expect(nextWheelAngularVelocity(overspun, true, false, true)).toBe(overspun);
  });

  it('never drives the undriven (front) wheel', () => {
    expect(nextWheelAngularVelocity(0.1, true, false, false)).toBe(0.1);
  });
});

describe('nextWheelAngularVelocity — brake', () => {
  it('damps forward spin multiplicatively', () => {
    const next = nextWheelAngularVelocity(0.5, false, true, true);
    expect(next).toBeCloseTo(0.5 * (1 - BIKE_TUNING.brakeDampingFactor), 12);
  });

  it('wins over gas when both pedals are held', () => {
    const bothHeld = nextWheelAngularVelocity(0.5, true, true, true);
    const brakeOnly = nextWheelAngularVelocity(0.5, false, true, true);
    expect(bothHeld).toBe(brakeOnly);
  });

  it('creeps the stopped driven wheel gently backward (mild reverse)', () => {
    const next = nextWheelAngularVelocity(0, false, true, true);
    expect(next).toBeCloseTo(-BIKE_TUNING.reverseSpinUpPerStep, 12);
  });

  it('caps the reverse creep at maxReverseWheelAngularVelocity', () => {
    const atCap = -BIKE_TUNING.maxReverseWheelAngularVelocity;
    expect(nextWheelAngularVelocity(atCap, false, true, true)).toBe(atCap);
  });

  it('never reverses the undriven (front) wheel', () => {
    expect(nextWheelAngularVelocity(0, false, true, false)).toBe(0);
  });

  it('damps (not snaps) a wheel rolling backward faster than the reverse cap', () => {
    const fastBackward = -3 * BIKE_TUNING.maxReverseWheelAngularVelocity;
    const next = nextWheelAngularVelocity(fastBackward, false, true, true);
    expect(next).toBeCloseTo(fastBackward * (1 - BIKE_TUNING.brakeDampingFactor), 12);
  });
});

describe('nextWheelAngularVelocity — coasting', () => {
  it('leaves the wheel untouched with no pedal held (physics owns coasting)', () => {
    expect(nextWheelAngularVelocity(0.37, false, false, true)).toBe(0.37);
    expect(nextWheelAngularVelocity(-0.1, false, false, false)).toBe(-0.1);
  });
});

describe('airborneChassisAngularVelocity — pedal air control', () => {
  it('gas pitches nose-up (negative spin in screen coords)', () => {
    const next = airborneChassisAngularVelocity(0, 0, true, false);
    expect(next).toBeCloseTo(-BIKE_TUNING.airSpinStepPerStep, 12);
  });

  it('brake pitches nose-down (positive spin)', () => {
    const next = airborneChassisAngularVelocity(0, 0, false, true);
    expect(next).toBeCloseTo(BIKE_TUNING.airSpinStepPerStep, 12);
  });

  it('both pedals cancel (no spin change, and no assist either)', () => {
    expect(airborneChassisAngularVelocity(0.03, 1.2, true, true)).toBe(0.03);
  });

  it('lands exactly ON the cap when a pedal step would overshoot it', () => {
    const nearCap =
      BIKE_TUNING.maxAirAngularVelocity - BIKE_TUNING.airSpinStepPerStep / 2;
    expect(airborneChassisAngularVelocity(nearCap, 0, false, true)).toBe(
      BIKE_TUNING.maxAirAngularVelocity
    );
    expect(airborneChassisAngularVelocity(-nearCap, 0, true, false)).toBe(
      -BIKE_TUNING.maxAirAngularVelocity
    );
  });

  it('refuses to add spin beyond the air-control cap', () => {
    const atCap = BIKE_TUNING.maxAirAngularVelocity;
    expect(airborneChassisAngularVelocity(atCap, 0, false, true)).toBe(atCap);
    expect(airborneChassisAngularVelocity(-atCap, 0, true, false)).toBe(-atCap);
  });

  it('still allows pedaling back down from beyond the cap (no snap)', () => {
    const beyond = BIKE_TUNING.maxAirAngularVelocity * 2;
    const next = airborneChassisAngularVelocity(beyond, 0, true, false); // gas = negative direction
    expect(next).toBeCloseTo(beyond - BIKE_TUNING.airSpinStepPerStep, 12);
  });
});

describe('airborneChassisAngularVelocity — auto-stabilization assist', () => {
  it('does nothing when upright and not spinning', () => {
    expect(airborneChassisAngularVelocity(0, 0, false, false)).toBe(0);
  });

  it('corrects a clockwise tilt with counter-clockwise spin', () => {
    const next = airborneChassisAngularVelocity(0, 0.4, false, false);
    expect(next).toBeLessThan(0);
  });

  it('corrects a counter-clockwise tilt with clockwise spin', () => {
    const next = airborneChassisAngularVelocity(0, -0.4, false, false);
    expect(next).toBeGreaterThan(0);
  });

  it('pushes a past-halfway flip ONWARD to completion, never backward', () => {
    const next = airborneChassisAngularVelocity(0, 3.3, false, false); // past π clockwise
    expect(next).toBeGreaterThan(0); // keep rotating clockwise to finish the flip
  });

  it('bleeds off existing spin (damping) even when upright', () => {
    const next = airborneChassisAngularVelocity(0.1, 0, false, false);
    expect(next).toBeCloseTo(0.1 * (1 - BIKE_TUNING.stabilizationDamping), 12);
    expect(Math.abs(next)).toBeLessThan(0.1);
  });

  it('converges a tilted, motionless bike to upright when iterated', () => {
    // Simulate the assist alone (no gravity/physics — this is only the
    // control law's fixed-point behavior): from a 1-radian tilt with no
    // spin, angle + spin must settle to ~0 well within a long jump's
    // airtime worth of steps.
    let angle = 1;
    let spin = 0;
    for (let i = 0; i < 600; i++) {
      spin = airborneChassisAngularVelocity(spin, angle, false, false);
      angle = normalizeAngle(angle + spin);
    }
    expect(Math.abs(angle)).toBeLessThan(0.05);
    expect(Math.abs(spin)).toBeLessThan(0.01);
  });
});

describe('bikeSpawnY', () => {
  it('spawns the chassis so wheels clear the ground by spawnClearancePx', () => {
    const groundY = 500;
    expect(bikeSpawnY(groundY)).toBe(
      groundY -
        (BIKE_TUNING.wheelDropPx + BIKE_TUNING.wheelRadius + BIKE_TUNING.spawnClearancePx)
    );
  });

  it('is always strictly above the ground surface (smaller y)', () => {
    expect(bikeSpawnY(500)).toBeLessThan(500);
  });
});
