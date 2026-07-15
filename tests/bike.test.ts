import { describe, expect, it } from 'vitest';
import {
  accumulateAirborneRotation,
  airPitchAuthority,
  airborneChassisAngularVelocity,
  bikeSpawnY,
  brakingChassisAngularVelocity,
  isTrickAirPhase,
  nextGroundedSteps,
  nextHeldSteps,
  nextPedalAirFresh,
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

  it('brakes the front wheel at only frontBrakeFraction strength (anti-endo)', () => {
    const next = nextWheelAngularVelocity(0.5, false, true, false);
    expect(next).toBeCloseTo(
      0.5 * (1 - BIKE_TUNING.brakeDampingFactor * BIKE_TUNING.frontBrakeFraction),
      12
    );
    // Strictly gentler than the rear's braking.
    expect(next).toBeGreaterThan(nextWheelAngularVelocity(0.5, false, true, true));
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

describe('nextPedalAirFresh — the deliberate-trick input detector', () => {
  it('a press that BEGINS mid-air is fresh', () => {
    expect(nextPedalAirFresh(false, true, false, true)).toBe(true);
  });

  it('a pedal held since the ground never becomes fresh in the air', () => {
    // wasHeld=true when airborne starts: the press began on the ground.
    expect(nextPedalAirFresh(false, true, true, true)).toBe(false);
  });

  it('stays fresh while held airborne', () => {
    expect(nextPedalAirFresh(true, true, true, true)).toBe(true);
  });

  it('releasing the pedal clears freshness', () => {
    expect(nextPedalAirFresh(true, false, true, true)).toBe(false);
  });

  it('touching the ground clears freshness (held through a landing)', () => {
    expect(nextPedalAirFresh(true, true, true, false)).toBe(false);
  });

  it('is never fresh on the ground, even for a brand-new press', () => {
    expect(nextPedalAirFresh(false, true, false, false)).toBe(false);
  });

  it('a release + re-press mid-air is fresh again', () => {
    // step 1: held from ground into air -> not fresh
    let fresh = nextPedalAirFresh(false, true, true, true);
    expect(fresh).toBe(false);
    // step 2: released mid-air
    fresh = nextPedalAirFresh(fresh, false, true, true);
    expect(fresh).toBe(false);
    // step 3: pressed again mid-air -> fresh
    fresh = nextPedalAirFresh(fresh, true, false, true);
    expect(fresh).toBe(true);
  });

  it('press buffering: a just-pressed pedal counts at the takeoff step', () => {
    // Held (wasHeld=true, so not a brand-new press), but the press is
    // younger than the buffer window and the bike takes off THIS step.
    const young = BIKE_TUNING.trickPressBufferSteps;
    expect(nextPedalAirFresh(false, true, true, true, true, young)).toBe(true);
  });

  it('press buffering rejects an old (grandma cruise) hold at takeoff', () => {
    const old = BIKE_TUNING.trickPressBufferSteps + 1;
    expect(nextPedalAirFresh(false, true, true, true, true, old)).toBe(false);
  });

  it('press buffering only applies on the takeoff step itself', () => {
    const young = BIKE_TUNING.trickPressBufferSteps;
    expect(nextPedalAirFresh(false, true, true, true, false, young)).toBe(false);
  });
});

describe('nextHeldSteps / nextGroundedSteps — trick-input counters', () => {
  it('counts held steps and resets on release', () => {
    let steps = 0;
    steps = nextHeldSteps(steps, true);
    expect(steps).toBe(1);
    steps = nextHeldSteps(steps, true);
    expect(steps).toBe(2);
    steps = nextHeldSteps(steps, false);
    expect(steps).toBe(0);
  });

  it('saturates just past the press-buffer window', () => {
    let steps = 0;
    for (let i = 0; i < BIKE_TUNING.trickPressBufferSteps * 5; i++) {
      steps = nextHeldSteps(steps, true);
    }
    expect(steps).toBe(BIKE_TUNING.trickPressBufferSteps + 1);
  });

  it('grounded counter resets to zero the moment the bike is airborne', () => {
    expect(nextGroundedSteps(BIKE_TUNING.trickGroundDebounceSteps, true)).toBe(0);
  });

  it('grounded counter saturates at the debounce window', () => {
    let steps = 0;
    for (let i = 0; i < BIKE_TUNING.trickGroundDebounceSteps * 3; i++) {
      steps = nextGroundedSteps(steps, false);
    }
    expect(steps).toBe(BIKE_TUNING.trickGroundDebounceSteps);
  });
});

describe('isTrickAirPhase — ground-contact debounce', () => {
  it('is true while actually airborne', () => {
    expect(isTrickAirPhase(true, BIKE_TUNING.trickGroundDebounceSteps)).toBe(true);
  });

  it('stays true through a ground touch shorter than the debounce', () => {
    expect(isTrickAirPhase(false, BIKE_TUNING.trickGroundDebounceSteps - 1)).toBe(true);
  });

  it('ends once grounded for the full debounce window', () => {
    expect(isTrickAirPhase(false, BIKE_TUNING.trickGroundDebounceSteps)).toBe(false);
  });
});

describe('airPitchAuthority — grandma-proof pitch gating', () => {
  it('gives full authority immediately to a mid-air press', () => {
    expect(airPitchAuthority(0, true)).toBe(1);
    expect(airPitchAuthority(1, true)).toBe(1);
  });

  it('gives ZERO authority to a held-from-ground pedal before the delay', () => {
    expect(airPitchAuthority(0, false)).toBe(0);
    expect(airPitchAuthority(BIKE_TUNING.heldPitchDelaySteps, false)).toBe(0);
  });

  it('ramps held-pedal authority linearly after the delay', () => {
    const midway = BIKE_TUNING.heldPitchDelaySteps + BIKE_TUNING.heldPitchRampSteps / 2;
    expect(airPitchAuthority(midway, false)).toBeCloseTo(0.5, 12);
  });

  it('saturates held-pedal authority at 1 after delay + ramp', () => {
    const full = BIKE_TUNING.heldPitchDelaySteps + BIKE_TUNING.heldPitchRampSteps;
    expect(airPitchAuthority(full, false)).toBe(1);
    expect(airPitchAuthority(full * 10, false)).toBe(1);
  });

  it('never leaves [0, 1] across a sweep', () => {
    for (let steps = -10; steps <= 500; steps += 7) {
      const a = airPitchAuthority(steps, false);
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThanOrEqual(1);
    }
  });
});

describe('airborneChassisAngularVelocity — pitch authority scaling', () => {
  it('scales the pedal pitch step by the authority factor', () => {
    const half = airborneChassisAngularVelocity(0, 0, true, false, 0.5);
    expect(half).toBeCloseTo(-BIKE_TUNING.airSpinStepPerStep * 0.5, 12);
  });

  it('zero authority + pedal held falls back to the full assist (the grandma safety net)', () => {
    const withPedal = airborneChassisAngularVelocity(0.03, 1.2, true, false, 0);
    const noPedal = airborneChassisAngularVelocity(0.03, 1.2, false, false);
    expect(withPedal).toBeCloseTo(noPedal, 12);
  });

  it('partial authority blends pedal pitch with the assist', () => {
    const authority = 0.25;
    const blended = airborneChassisAngularVelocity(0.03, 1.2, true, false, authority);
    const fullPedal = airborneChassisAngularVelocity(0.03, 1.2, true, false, 1);
    const fullAssist = airborneChassisAngularVelocity(0.03, 1.2, false, false);
    expect(blended).toBeCloseTo(authority * fullPedal + (1 - authority) * fullAssist, 12);
  });

  it('defaults to full authority (backward-compatible call shape)', () => {
    expect(airborneChassisAngularVelocity(0, 0, true, false)).toBeCloseTo(
      -BIKE_TUNING.airSpinStepPerStep,
      12
    );
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

describe('brakingChassisAngularVelocity — grounded anti-endo damping', () => {
  it('bleeds off pitch rate by exactly brakeGroundStabilization per step', () => {
    expect(brakingChassisAngularVelocity(0.1)).toBeCloseTo(
      0.1 * (1 - BIKE_TUNING.brakeGroundStabilization),
      12
    );
  });

  it('is pure damping: zero stays zero (never fights a slope attitude)', () => {
    expect(brakingChassisAngularVelocity(0)).toBe(0);
  });

  it('damps both pitch directions symmetrically', () => {
    expect(brakingChassisAngularVelocity(-0.1)).toBeCloseTo(-brakingChassisAngularVelocity(0.1), 12);
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
