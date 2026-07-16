// Pure-logic tests for the level 7 traffic model (PLAN-06 task B). traffic.ts
// is import-safe (no runtime Phaser, no ui.ts), so these exercise the exported
// pure helpers directly — the lane-descent curve, the collision predicate, the
// telegraph spawn distance, encounter layout, and the spawn trigger. The
// scene-touching createTraffic factory is covered by the browser harness
// (scripts/playtest-level07.mjs), not here.
import { describe, expect, it } from 'vitest';
import {
  trafficClamp01,
  trafficLaneFraction,
  trafficLaneY,
  isTrafficCollision,
  trafficSpawnAheadPx,
  trafficCarDisplacement,
  trafficEncounterCenters,
  shouldTriggerEncounter,
  TRAFFIC_FAIL_MESSAGE,
} from '../src/systems/traffic';

describe('TRAFFIC_FAIL_MESSAGE', () => {
  it('is the verbatim NORTH_STAR §5 personal copy (byte-exact incl. the heart)', () => {
    // Never paraphrase (CLAUDE.md Rule 4). Compared here against a code-point
    // literal so an accidental smart-quote/emoji swap fails the test.
    expect(TRAFFIC_FAIL_MESSAGE).toBe("They really don't see us!! Go again \u{1F49B}");
    expect(TRAFFIC_FAIL_MESSAGE).toBe('They really don\'t see us!! Go again 💛');
  });
});

describe('trafficClamp01', () => {
  it('clamps to [0, 1]', () => {
    expect(trafficClamp01(-0.5)).toBe(0);
    expect(trafficClamp01(0)).toBe(0);
    expect(trafficClamp01(0.4)).toBe(0.4);
    expect(trafficClamp01(1)).toBe(1);
    expect(trafficClamp01(2)).toBe(1);
  });
});

describe('trafficLaneFraction', () => {
  const zoneHalf = 260;
  const drift = 130;

  it('is 0 (far/harmless lane) well outside the window on either side', () => {
    expect(trafficLaneFraction(1000, 0, zoneHalf, drift)).toBe(0);
    expect(trafficLaneFraction(-1000, 0, zoneHalf, drift)).toBe(0);
    expect(trafficLaneFraction(zoneHalf, 0, zoneHalf, drift)).toBe(0); // exactly at the edge
  });

  it('is 1 (fully near lane) within zoneHalf - drift of the centre', () => {
    expect(trafficLaneFraction(0, 0, zoneHalf, drift)).toBe(1);
    expect(trafficLaneFraction(zoneHalf - drift, 0, zoneHalf, drift)).toBe(1);
    expect(trafficLaneFraction(-(zoneHalf - drift), 0, zoneHalf, drift)).toBe(1);
  });

  it('ramps linearly across the drift band and is symmetric about the centre', () => {
    const mid = zoneHalf - drift / 2; // halfway through the drift band
    expect(trafficLaneFraction(mid, 0, zoneHalf, drift)).toBeCloseTo(0.5, 6);
    expect(trafficLaneFraction(-mid, 0, zoneHalf, drift)).toBeCloseTo(0.5, 6);
  });

  it('degenerates to a hard step when driftPx <= 0', () => {
    expect(trafficLaneFraction(200, 0, zoneHalf, 0)).toBe(1);
    expect(trafficLaneFraction(300, 0, zoneHalf, 0)).toBe(0);
  });
});

describe('trafficLaneY', () => {
  it('sits the car at the far offset when f=0 and the near offset when f=1', () => {
    expect(trafficLaneY(500, 0, 150, 34)).toBe(500 - 150);
    expect(trafficLaneY(500, 1, 150, 34)).toBe(500 - 34);
  });
  it('blends linearly (near lane is lower on screen / closer to the road)', () => {
    expect(trafficLaneY(500, 0.5, 150, 34)).toBe(500 - 92);
  });
});

describe('isTrafficCollision', () => {
  const half = 70;
  const threshold = 0.5;

  it('hits only when descended into the near lane AND horizontally overlapping', () => {
    expect(isTrafficCollision(100, 100, 1, half, threshold)).toBe(true); // dead-on, near lane
    expect(isTrafficCollision(100, 100, 0.2, half, threshold)).toBe(false); // still far lane
    expect(isTrafficCollision(100, 300, 1, half, threshold)).toBe(false); // near lane but far apart
  });

  it('is forgiving at the horizontal edge (<= halfWidth counts, beyond does not)', () => {
    expect(isTrafficCollision(100, 100 + half, 1, half, threshold)).toBe(true);
    expect(isTrafficCollision(100, 100 + half + 1, 1, half, threshold)).toBe(false);
  });

  it('uses the lane threshold as the descent cutoff', () => {
    expect(isTrafficCollision(0, 0, threshold, half, threshold)).toBe(true);
    expect(isTrafficCollision(0, 0, threshold - 0.01, half, threshold)).toBe(false);
  });
});

describe('trafficSpawnAheadPx', () => {
  it('spawns a car far enough right to telegraph for telegraphMs before the near lane', () => {
    // 3s at 60fps * 6px/frame = 1080 travel, + zoneHalf(260) to the near-lane
    // edge + buffer(100) = 1440.
    expect(trafficSpawnAheadPx(260, 6, 3000, 100, 60)).toBe(1440);
  });
  it('scales the telegraph distance with speed and time', () => {
    expect(trafficSpawnAheadPx(0, 10, 1000, 0, 60)).toBe(600); // 1s * 60 * 10
  });
});

describe('trafficCarDisplacement (frame-rate independence)', () => {
  const speed = 6; // px per 60 Hz frame

  it('advances one 60 Hz frame worth of px for a single fixed step', () => {
    expect(trafficCarDisplacement(speed, 1000 / 60)).toBeCloseTo(speed, 6);
  });

  it('gives EQUAL wall-time displacement at 30 / 60 / 120 Hz', () => {
    // The whole point of the fix: integrated over the SAME 1000ms of wall time,
    // total displacement must be identical regardless of how many frames
    // (fixed steps or dt-scaled render frames) subdivide it — 6px * 60 = 360.
    // A raw per-render-frame `x -= speed` would instead give 180 / 360 / 720.
    const totalOver = (steps: number, dtMs: number): number => {
      let d = 0;
      for (let i = 0; i < steps; i++) d += trafficCarDisplacement(speed, dtMs);
      return d;
    };
    const at60 = totalOver(60, 1000 / 60);
    const at30 = totalOver(30, 1000 / 30);
    const at120 = totalOver(120, 1000 / 120);
    expect(at60).toBeCloseTo(360, 6);
    expect(at30).toBeCloseTo(360, 6);
    expect(at120).toBeCloseTo(360, 6);
    expect(at30).toBeCloseTo(at60, 6);
    expect(at120).toBeCloseTo(at60, 6);
  });

  it('scales linearly with elapsed time', () => {
    expect(trafficCarDisplacement(speed, 2 * (1000 / 60))).toBeCloseTo(2 * speed, 6);
    expect(trafficCarDisplacement(speed, 0)).toBe(0);
  });
});

describe('trafficEncounterCenters', () => {
  it('lays out evenly spaced encounter centres', () => {
    expect(trafficEncounterCenters(2800, 1500, 6)).toEqual([2800, 4300, 5800, 7300, 8800, 10300]);
  });
  it('returns an empty list for a zero count', () => {
    expect(trafficEncounterCenters(1000, 500, 0)).toEqual([]);
  });
});

describe('shouldTriggerEncounter', () => {
  it('triggers once the bike is within triggerLeadPx to the left of the centre', () => {
    expect(shouldTriggerEncounter(699, 2800, 2100)).toBe(false);
    expect(shouldTriggerEncounter(700, 2800, 2100)).toBe(true);
    expect(shouldTriggerEncounter(3000, 2800, 2100)).toBe(true); // already past the centre
  });
});

// A small integration-style check of the design invariant the harness also
// asserts: with the level07 numbers, the fixed danger zones never cover the
// whole gap between encounters, so there is ALWAYS a safe stretch to hang back
// in — i.e. every encounter is avoidable by braking.
describe('level 7 avoidability invariant', () => {
  it('leaves clear road between adjacent danger zones', () => {
    const spacing = 1500;
    const zoneHalf = 260;
    const drift = 130;
    const threshold = 0.5;
    const collisionHalf = 70;
    // A car is dangerous within |dx| <= zoneHalf - threshold*drift of its
    // centre; the bike is at risk within that + collisionHalf of the centre.
    const dangerHalf = zoneHalf - threshold * drift + collisionHalf; // 195 + 70 = 265
    const clearRoad = spacing - 2 * dangerHalf;
    expect(clearRoad).toBeGreaterThan(300); // comfortable room to stop and wait
  });
});
