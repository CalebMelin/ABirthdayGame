// Pure-logic tests for the level 11 wheelie-rider easter egg (PLAN-07 task 2).
// wheelieRider.ts is import-safe (no runtime Phaser, no ui.ts), so these exercise
// the exported pure helpers directly — the default-x resolution, the trigger
// predicate (grounded + moving + past-x), the speed/displacement math, the
// spawn-x geometry, the ground-follow smoothing step, and the despawn predicate.
// The scene-touching createWheelieRider factory is covered by the browser harness
// (scripts/playtest-level11.mjs), not here.
import { describe, expect, it } from 'vitest';
import {
  resolveWheelieRiderTriggerX,
  shouldTriggerWheelieRider,
  wheelieRiderTopSpeedPxPerStep,
  wheelieRiderDisplacement,
  wheelieRiderSpawnX,
  wheelieRiderNextGroundY,
  shouldDespawnWheelieRider,
} from '../src/systems/wheelieRider';
import { BIKE_TUNING, WHEELIE_RIDER } from '../src/systems/constants';

const BIKE_TOP_SPEED = BIKE_TUNING.maxWheelAngularVelocity * BIKE_TUNING.wheelRadius; // 10.8

describe('resolveWheelieRiderTriggerX', () => {
  it('uses the authored event.x when given', () => {
    expect(resolveWheelieRiderTriggerX(6500, 13000)).toBe(6500);
  });

  it('falls back to mid-worldLength when event.x is omitted', () => {
    expect(resolveWheelieRiderTriggerX(undefined, 13000)).toBe(6500);
    expect(resolveWheelieRiderTriggerX(undefined, 8000)).toBe(4000);
  });

  it('an explicit 0 is a real authored x, not "omitted" (nullish, not falsy)', () => {
    expect(resolveWheelieRiderTriggerX(0, 13000)).toBe(0);
  });
});

describe('shouldTriggerWheelieRider', () => {
  const triggerX = 6500;
  const minSpeed = WHEELIE_RIDER.triggerMinSpeedPxPerStep;

  it('is false while the bike has not yet reached the trigger x', () => {
    expect(shouldTriggerWheelieRider(triggerX - 1, triggerX, false, 5, minSpeed)).toBe(false);
  });

  it('fires exactly at the trigger x (inclusive) when grounded and moving', () => {
    expect(shouldTriggerWheelieRider(triggerX, triggerX, false, 5, minSpeed)).toBe(true);
  });

  it('stays true past the trigger x (the bike only ever moves forward)', () => {
    expect(shouldTriggerWheelieRider(triggerX + 500, triggerX, false, 5, minSpeed)).toBe(true);
  });

  it('is false while airborne, even past the trigger x and moving', () => {
    expect(shouldTriggerWheelieRider(triggerX + 100, triggerX, true, 5, minSpeed)).toBe(false);
  });

  it('is false while stopped/too slow, even grounded and past the trigger x', () => {
    expect(shouldTriggerWheelieRider(triggerX + 100, triggerX, false, 0, minSpeed)).toBe(false);
    expect(shouldTriggerWheelieRider(triggerX + 100, triggerX, false, minSpeed - 0.01, minSpeed)).toBe(false);
  });

  it('the speed threshold is inclusive', () => {
    expect(shouldTriggerWheelieRider(triggerX, triggerX, false, minSpeed, minSpeed)).toBe(true);
  });

  it('requires ALL THREE conditions at once (grounded + moving + past-x)', () => {
    // past-x + grounded, but not moving.
    expect(shouldTriggerWheelieRider(triggerX, triggerX, false, 0, minSpeed)).toBe(false);
    // past-x + moving, but airborne.
    expect(shouldTriggerWheelieRider(triggerX, triggerX, true, 5, minSpeed)).toBe(false);
    // grounded + moving, but short of the trigger x.
    expect(shouldTriggerWheelieRider(triggerX - 1, triggerX, false, 5, minSpeed)).toBe(false);
    // all three satisfied.
    expect(shouldTriggerWheelieRider(triggerX, triggerX, false, 5, minSpeed)).toBe(true);
  });
});

describe('wheelieRiderTopSpeedPxPerStep', () => {
  it('is the bike full-gas top speed times the configured multiplier', () => {
    expect(wheelieRiderTopSpeedPxPerStep(BIKE_TOP_SPEED, 1.3)).toBeCloseTo(14.04, 6);
    expect(wheelieRiderTopSpeedPxPerStep(10, 1.25)).toBe(12.5);
  });

  it('the shipped WHEELIE_RIDER speed comfortably exceeds the bike top speed (the EASY "always overtakes" guarantee)', () => {
    const shipped = wheelieRiderTopSpeedPxPerStep(BIKE_TOP_SPEED, WHEELIE_RIDER.speedMultiplier);
    expect(shipped).toBeGreaterThan(BIKE_TOP_SPEED);
    // Within the PLAN-07 brief's "~1.25-1.4x" guidance.
    expect(WHEELIE_RIDER.speedMultiplier).toBeGreaterThanOrEqual(1.25);
    expect(WHEELIE_RIDER.speedMultiplier).toBeLessThanOrEqual(1.4);
  });
});

describe('wheelieRiderDisplacement (frame-rate independence)', () => {
  const speed = 14; // px per 60 Hz step

  it('advances one 60 Hz step worth of px for a single fixed step', () => {
    expect(wheelieRiderDisplacement(speed, 1000 / 60)).toBeCloseTo(speed, 6);
  });

  it('gives EQUAL wall-time displacement at 30 / 60 / 120 Hz', () => {
    // Integrated over the SAME 1000ms of wall time, total displacement must be
    // identical regardless of how many fixed steps subdivide it — 14px * 60 = 840.
    // A raw per-render-frame `x += speed` would instead give 420 / 840 / 1680.
    const totalOver = (steps: number, dtMs: number): number => {
      let d = 0;
      for (let i = 0; i < steps; i++) d += wheelieRiderDisplacement(speed, dtMs);
      return d;
    };
    const at60 = totalOver(60, 1000 / 60);
    const at30 = totalOver(30, 1000 / 30);
    const at120 = totalOver(120, 1000 / 120);
    expect(at60).toBeCloseTo(840, 6);
    expect(at30).toBeCloseTo(at60, 6);
    expect(at120).toBeCloseTo(at60, 6);
  });

  it('scales linearly with elapsed time', () => {
    expect(wheelieRiderDisplacement(speed, 2 * (1000 / 60))).toBeCloseTo(2 * speed, 6);
    expect(wheelieRiderDisplacement(speed, 0)).toBe(0);
  });
});

describe('wheelieRiderSpawnX', () => {
  it('is the camera left edge minus the margin', () => {
    expect(wheelieRiderSpawnX(1000, 150)).toBe(850);
    expect(wheelieRiderSpawnX(0, 150)).toBe(-150); // fine even near world start — terrain.heightAt clamps
  });
});

describe('wheelieRiderNextGroundY', () => {
  it('interpolates toward the target by the lerp fraction', () => {
    expect(wheelieRiderNextGroundY(100, 200, 0.5)).toBe(150);
    expect(wheelieRiderNextGroundY(100, 200, 0.25)).toBe(125);
  });

  it('lerp 0 never moves; lerp 1 snaps straight to the target', () => {
    expect(wheelieRiderNextGroundY(100, 999, 0)).toBe(100);
    expect(wheelieRiderNextGroundY(100, 999, 1)).toBe(999);
  });

  it('is a no-op once already at the target', () => {
    expect(wheelieRiderNextGroundY(500, 500, 0.15)).toBe(500);
  });
});

describe('shouldDespawnWheelieRider', () => {
  const cameraRight = 2000;
  const cameraMargin = 150;
  const bikeX = 1500;
  const bikeLead = 900;

  it('is false while still within the camera view', () => {
    expect(shouldDespawnWheelieRider(1900, cameraRight, cameraMargin, bikeX, bikeLead)).toBe(false);
  });

  it('is false when clear of the camera edge but not yet clear of the bike lead', () => {
    // Clears cameraRight + margin (2150) but not bikeX + lead (2400).
    expect(shouldDespawnWheelieRider(2200, cameraRight, cameraMargin, bikeX, bikeLead)).toBe(false);
  });

  it('is false when clear of the bike lead but not yet clear of the camera edge', () => {
    // A slow/stationary bike (bikeX small) whose lead threshold the rider has
    // already passed, but the camera (independently) hasn't been cleared yet.
    expect(shouldDespawnWheelieRider(2100, cameraRight, cameraMargin, 500, bikeLead)).toBe(false);
  });

  it('requires BOTH conditions — true only once past camera edge AND bike lead', () => {
    expect(shouldDespawnWheelieRider(2500, cameraRight, cameraMargin, bikeX, bikeLead)).toBe(true);
  });

  it('the camera-edge bound is strict (exactly at the margin does not yet despawn)', () => {
    expect(shouldDespawnWheelieRider(cameraRight + cameraMargin, cameraRight, cameraMargin, 0, 0)).toBe(false);
    expect(shouldDespawnWheelieRider(cameraRight + cameraMargin + 1, cameraRight, cameraMargin, 0, 0)).toBe(true);
  });

  it('the bike-lead bound is strict (exactly at the lead does not yet despawn)', () => {
    expect(shouldDespawnWheelieRider(bikeX + bikeLead, 0, 0, bikeX, bikeLead)).toBe(false);
    expect(shouldDespawnWheelieRider(bikeX + bikeLead + 1, 0, 0, bikeX, bikeLead)).toBe(true);
  });
});
