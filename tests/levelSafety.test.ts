// PLAN-05 ST-5/task 6: pure regression guards for the gas-only-safety
// authoring invariants validateLevels (levelTypes.test.ts) does NOT check —
// jump geometry safety and the spawn/finish flat-zone convention GameScene's
// arithmetic depends on (spawn at LEVEL.spawnXPx, finish flag at
// length - LEVEL.finishMarginPx). TDD'd: written before src/levels/validate.ts
// existed (confirmed RED — "Cannot find module").
//
// `validateJumpSafety(LEVELS)`/`validateFlatZones(LEVELS)` prove the real 22
// configs are safe; the synthetic BAD fixtures below prove the validators
// actually DETECT violations (not vacuously returning [] regardless of
// input) — each fixture is arithmetic-isolated to trip exactly ONE rule at a
// time, so a failing assertion always points at the one rule under test.
import { describe, expect, it } from 'vitest';
import {
  validateJumpSafety,
  validateFlatZones,
  raisedCosinePeakSlope,
  isCollisionGridAlignedKicker,
} from '../src/levels/validate';
import type { LevelConfig } from '../src/levels/types';
import { LEVEL, TERRAIN } from '../src/systems/constants';
import { TERRAIN_COLLISION_GRID_PX } from '../src/systems/terrain';
import { LEVELS } from '../src/levels';

/** Minimal, valid LevelConfig fixture — same pattern as levelTypes.test.ts's
 * makeLevel(): every field a test doesn't care about gets a sane default so
 * each test only spells out what it's actually exercising. */
function makeLevel(overrides: Partial<LevelConfig> = {}): LevelConfig {
  return {
    id: 1,
    name: 'Test Level',
    theme: 'suburbs',
    terrain: {
      seed: 1,
      length: 10000,
      hilliness: 0.2,
      jumps: [],
    },
    ...overrides,
  };
}

describe('validateJumpSafety — real authored levels', () => {
  it('returns no problems for the real 22 LEVELS (ST-3 authored within these floors)', () => {
    expect(validateJumpSafety(LEVELS)).toEqual([]);
  });
});

describe('validateJumpSafety — width', () => {
  it('flags a jump narrower than jumpMinWidthPx (isolated: everything else about it is safe)', () => {
    const levels = [
      makeLevel({
        terrain: {
          seed: 1,
          length: 10000,
          hilliness: 0.2,
          jumps: [{ x: 5000, width: 200, height: 60 }],
        },
      }),
    ];
    expect(validateJumpSafety(levels)).toEqual([
      `Level 1 jump at x=5000: width 200 is below LEVEL.jumpMinWidthPx (${LEVEL.jumpMinWidthPx})`,
    ]);
  });

  it('accepts a jump exactly at jumpMinWidthPx', () => {
    const levels = [
      makeLevel({
        terrain: {
          seed: 1,
          length: 10000,
          hilliness: 0.2,
          jumps: [{ x: 5000, width: LEVEL.jumpMinWidthPx, height: 60 }],
        },
      }),
    ];
    expect(validateJumpSafety(levels)).toEqual([]);
  });
});

describe('validateJumpSafety — height', () => {
  it('flags a jump taller than jumpMaxHeightPx (isolated)', () => {
    const levels = [
      makeLevel({
        terrain: {
          seed: 1,
          length: 10000,
          hilliness: 0.2,
          jumps: [{ x: 5000, width: 500, height: 150 }],
        },
      }),
    ];
    expect(validateJumpSafety(levels)).toEqual([
      `Level 1 jump at x=5000: height 150 exceeds LEVEL.jumpMaxHeightPx (${LEVEL.jumpMaxHeightPx})`,
    ]);
  });

  it('accepts a jump exactly at jumpMaxHeightPx', () => {
    const levels = [
      makeLevel({
        terrain: {
          seed: 1,
          length: 10000,
          hilliness: 0.2,
          jumps: [{ x: 5000, width: 500, height: LEVEL.jumpMaxHeightPx }],
        },
      }),
    ];
    expect(validateJumpSafety(levels)).toEqual([]);
  });
});

describe('validateJumpSafety — placement fraction', () => {
  it('flags a jump placed before jumpPlacementMinFrac (isolated: clearance from spawn is otherwise fine)', () => {
    // x=1800, length=10000 -> frac 0.18 (< 0.25), but spawn clearance
    // 1800-250=1550 already clears jumpClearancePx (1500) on its own, so
    // only the placement rule should fire.
    const levels = [
      makeLevel({
        terrain: {
          seed: 1,
          length: 10000,
          hilliness: 0.2,
          jumps: [{ x: 1800, width: 500, height: 60 }],
        },
      }),
    ];
    expect(validateJumpSafety(levels)).toEqual([
      `Level 1 jump at x=1800: placement fraction 0.18 is outside [${LEVEL.jumpPlacementMinFrac}, ${LEVEL.jumpPlacementMaxFrac}]`,
    ]);
  });

  it('flags a jump placed after jumpPlacementMaxFrac (isolated: clearance from finish is otherwise fine)', () => {
    // x=7800, length=10000 -> frac 0.78 (> 0.75), finish clearance
    // (10000-500)-7800=1700 already clears jumpClearancePx on its own.
    const levels = [
      makeLevel({
        terrain: {
          seed: 1,
          length: 10000,
          hilliness: 0.2,
          jumps: [{ x: 7800, width: 500, height: 60 }],
        },
      }),
    ];
    expect(validateJumpSafety(levels)).toEqual([
      `Level 1 jump at x=7800: placement fraction 0.78 is outside [${LEVEL.jumpPlacementMinFrac}, ${LEVEL.jumpPlacementMaxFrac}]`,
    ]);
  });
});

describe('validateJumpSafety — clearance from spawn/finish', () => {
  it('flags a jump too close to spawn (isolated: placement fraction is otherwise fine)', () => {
    // x=1100, length=4000 -> frac 0.275 (inside [0.25,0.75]); spawn
    // clearance 1100-250=850 (< jumpClearancePx 1500).
    const levels = [
      makeLevel({
        terrain: {
          seed: 1,
          length: 4000,
          hilliness: 0.2,
          jumps: [{ x: 1100, width: 500, height: 60 }],
        },
      }),
    ];
    expect(validateJumpSafety(levels)).toEqual([
      `Level 1 jump at x=1100: only 850px clear of spawn, need >= LEVEL.jumpClearancePx (${LEVEL.jumpClearancePx})`,
    ]);
  });

  it('flags a jump too close to the finish (isolated: placement fraction is otherwise fine)', () => {
    // x=2900, length=4000 -> frac 0.725 (inside [0.25,0.75]); finish
    // clearance (4000-500)-2900=600 (< jumpClearancePx 1500).
    const levels = [
      makeLevel({
        terrain: {
          seed: 1,
          length: 4000,
          hilliness: 0.2,
          jumps: [{ x: 2900, width: 500, height: 60 }],
        },
      }),
    ];
    expect(validateJumpSafety(levels)).toEqual([
      `Level 1 jump at x=2900: only 600px clear of finish, need >= LEVEL.jumpClearancePx (${LEVEL.jumpClearancePx})`,
    ]);
  });
});

describe('validateJumpSafety — hilliness ceiling on jump-bearing levels', () => {
  it('flags a jump level with hilliness 0.5 (isolated: the jump itself is otherwise safe)', () => {
    const levels = [
      makeLevel({
        terrain: {
          seed: 1,
          length: 10000,
          hilliness: 0.5,
          jumps: [{ x: 5000, width: 500, height: 60 }],
        },
      }),
    ];
    expect(validateJumpSafety(levels)).toEqual([
      `Level 1 has 1 jump(s) but hilliness 0.5 exceeds LEVEL.jumpLevelMaxHilliness (${LEVEL.jumpLevelMaxHilliness})`,
    ]);
  });

  it('accepts hilliness exactly at jumpLevelMaxHilliness', () => {
    const levels = [
      makeLevel({
        terrain: {
          seed: 1,
          length: 10000,
          hilliness: LEVEL.jumpLevelMaxHilliness,
          jumps: [{ x: 5000, width: 500, height: 60 }],
        },
      }),
    ];
    expect(validateJumpSafety(levels)).toEqual([]);
  });

  it('does not check hilliness at all when a level has zero jumps, however hilly', () => {
    const levels = [
      makeLevel({
        terrain: { seed: 1, length: 10000, hilliness: 0.9, jumps: [] },
      }),
    ];
    expect(validateJumpSafety(levels)).toEqual([]);
  });
});

describe('kicker geometry pure helpers (PLAN-07 task 4)', () => {
  it('raisedCosinePeakSlope = height*pi/width, Infinity on non-positive width', () => {
    expect(raisedCosinePeakSlope(106, 336)).toBeCloseTo((106 * Math.PI) / 336, 6);
    expect(raisedCosinePeakSlope(106, 0)).toBe(Infinity);
    expect(raisedCosinePeakSlope(106, -10)).toBe(Infinity);
  });

  it('the 168px collision grid is what the terrain builder actually uses', () => {
    // Guards the constant the kicker alignment rule is authored against.
    expect(TERRAIN_COLLISION_GRID_PX).toBe(168);
  });

  it('isCollisionGridAlignedKicker: x a multiple of grid AND width a multiple of 2*grid', () => {
    const g = TERRAIN_COLLISION_GRID_PX;
    expect(isCollisionGridAlignedKicker(4032, 336)).toBe(true); // 4032=24g, 336=2g
    expect(isCollisionGridAlignedKicker(4032 + 1, 336)).toBe(false); // x off grid
    expect(isCollisionGridAlignedKicker(4032, 3 * g)).toBe(false); // width not a multiple of 2g
    expect(isCollisionGridAlignedKicker(4032, 4 * g)).toBe(true); // 672 = 2*(2g)
  });
});

describe('validateJumpSafety — kickers (PLAN-07 task 4: own bounds, not the hump floors)', () => {
  function withKicker(kicker: { x: number; width: number; height: number }, length = 10000): LevelConfig[] {
    return [
      makeLevel({
        terrain: {
          seed: 1,
          length,
          hilliness: 0.2,
          jumps: [{ ...kicker, kind: 'kicker' }],
        },
      }),
    ];
  }

  it('accepts the proven 336x106 grid-aligned kicker (would FAIL the hump floors)', () => {
    // 336 < jumpMinWidthPx(400) and would also be fine on height — the point
    // is a kicker is judged by kicker bounds, not the hump width floor.
    expect(validateJumpSafety(withKicker({ x: 5040, width: 336, height: 106 }))).toEqual([]);
  });

  it('flags a kicker wider than kickerMaxWidthPx (isolated: grid-aligned, slope fine)', () => {
    expect(validateJumpSafety(withKicker({ x: 5040, width: 1344, height: 106 }))).toEqual([
      `Level 1 kicker at x=5040: width 1344 is outside kicker range [${LEVEL.kickerMinWidthPx}, ${LEVEL.kickerMaxWidthPx}]`,
    ]);
  });

  it('flags a kicker taller than kickerMaxHeightPx (isolated: wide enough that slope is still fine)', () => {
    expect(validateJumpSafety(withKicker({ x: 5040, width: 672, height: 130 }))).toEqual([
      `Level 1 kicker at x=5040: height 130 is outside kicker range [${LEVEL.kickerMinHeightPx}, ${LEVEL.kickerMaxHeightPx}]`,
    ]);
  });

  it('flags a kicker shorter than kickerMinHeightPx (a full flip is not comfortably achievable)', () => {
    expect(validateJumpSafety(withKicker({ x: 5040, width: 672, height: 60 }))).toEqual([
      `Level 1 kicker at x=5040: height 60 is outside kicker range [${LEVEL.kickerMinHeightPx}, ${LEVEL.kickerMaxHeightPx}]`,
    ]);
  });

  it('flags a kicker whose base x is off the collision grid (no clean launch triangle)', () => {
    // x=5000 is not a multiple of 168; width 336 is fine, height/slope/range fine.
    expect(validateJumpSafety(withKicker({ x: 5000, width: 336, height: 106 }))).toEqual([
      `Level 1 kicker at x=5000: not aligned to the ${TERRAIN_COLLISION_GRID_PX}px collision grid (x must be a multiple of ${TERRAIN_COLLISION_GRID_PX}, width a multiple of ${2 * TERRAIN_COLLISION_GRID_PX})`,
    ]);
  });

  it('flags a kicker whose peak slope would auto-widen it off the grid (isolated)', () => {
    // 112px tall at the min 336px width -> slope 112*pi/336 = 1.047 > maxJumpSlope(1);
    // height 112 is still within [90,112] and the geometry is grid-aligned, so ONLY
    // the slope rule fires.
    const slope = raisedCosinePeakSlope(112, 336);
    expect(validateJumpSafety(withKicker({ x: 5040, width: 336, height: 112 }))).toEqual([
      `Level 1 kicker at x=5040: peak slope ${slope.toFixed(3)} exceeds TERRAIN.maxJumpSlope (${TERRAIN.maxJumpSlope}) — terrain.ts would auto-widen it off the grid`,
    ]);
  });

  it('still applies the shared spawn-clearance rule to a kicker', () => {
    // x=1176 (=7*168, grid-aligned), length 4000 -> frac 0.294 (inside placement),
    // spawn clearance 1176-250=926 < jumpClearancePx(1500).
    expect(validateJumpSafety(withKicker({ x: 1176, width: 336, height: 106 }, 4000))).toEqual([
      `Level 1 kicker at x=1176: only 926px clear of spawn, need >= LEVEL.jumpClearancePx (${LEVEL.jumpClearancePx})`,
    ]);
  });
});

describe('validateJumpSafety — multiple jumps/levels are checked independently', () => {
  it('reports only the offending jump when a level has one safe and one unsafe jump', () => {
    const levels = [
      makeLevel({
        id: 2,
        terrain: {
          seed: 1,
          length: 10000,
          hilliness: 0.2,
          jumps: [
            { x: 5000, width: 500, height: 60 }, // safe
            { x: 5200, width: 100, height: 60 }, // width too narrow
          ],
        },
      }),
    ];
    expect(validateJumpSafety(levels)).toEqual([
      `Level 2 jump at x=5200: width 100 is below LEVEL.jumpMinWidthPx (${LEVEL.jumpMinWidthPx})`,
    ]);
  });

  it('attributes problems to the correct level id across multiple configs', () => {
    const levels = [
      makeLevel({
        id: 1,
        terrain: { seed: 1, length: 10000, hilliness: 0.2, jumps: [] },
      }),
      makeLevel({
        id: 5,
        terrain: {
          seed: 5,
          length: 10000,
          hilliness: 0.2,
          jumps: [{ x: 5000, width: 200, height: 60 }],
        },
      }),
    ];
    expect(validateJumpSafety(levels)).toEqual([
      `Level 5 jump at x=5000: width 200 is below LEVEL.jumpMinWidthPx (${LEVEL.jumpMinWidthPx})`,
    ]);
  });
});

describe('validateJumpSafety — defensive/total behavior', () => {
  it('never throws on an empty array', () => {
    expect(() => validateJumpSafety([])).not.toThrow();
    expect(validateJumpSafety([])).toEqual([]);
  });

  it('never throws when configs itself is not an array', () => {
    const notAnArray = undefined as unknown as LevelConfig[];
    expect(() => validateJumpSafety(notAnArray)).not.toThrow();
    expect(validateJumpSafety(notAnArray)).toEqual([]);
  });

  it('never throws on malformed entries (missing terrain, non-finite jump fields)', () => {
    const malformed = [
      null,
      { id: 1 },
      { id: 2, terrain: {} },
      { id: 3, terrain: { jumps: [{ x: NaN, width: undefined, height: 'nope' }] } },
    ] as unknown as LevelConfig[];
    expect(() => validateJumpSafety(malformed)).not.toThrow();
  });
});

describe('validateFlatZones — real authored levels', () => {
  it('returns no problems for the real 22 LEVELS', () => {
    expect(validateFlatZones(LEVELS)).toEqual([]);
  });
});

describe('validateFlatZones — spawn zone coverage', () => {
  it('flags a level missing its spawn flat zone', () => {
    const levels = [
      makeLevel({
        terrain: {
          seed: 1,
          length: 10000,
          hilliness: 0.2,
          jumps: [],
          flatZones: [{ start: 9500, end: 10000 }], // finish only
        },
      }),
    ];
    const spawnCoverTo = LEVEL.spawnXPx + 200; // see SPAWN_FLAT_ZONE_MARGIN_PX doc in validate.ts
    expect(validateFlatZones(levels)).toEqual([
      `Level 1 has no flat zone covering the spawn runway [0, ${spawnCoverTo}] (LEVEL.spawnXPx ${LEVEL.spawnXPx} + 200px margin)`,
    ]);
  });

  it('accepts a spawn zone that covers exactly [0, spawnXPx + margin]', () => {
    const spawnCoverTo = LEVEL.spawnXPx + 200;
    const levels = [
      makeLevel({
        terrain: {
          seed: 1,
          length: 10000,
          hilliness: 0.2,
          jumps: [],
          flatZones: [
            { start: 0, end: spawnCoverTo },
            { start: 9500, end: 10000 },
          ],
        },
      }),
    ];
    expect(validateFlatZones(levels)).toEqual([]);
  });
});

describe('validateFlatZones — finish zone coverage', () => {
  it("flags a level missing its finish flat zone (the plan's required fixture)", () => {
    const levels = [
      makeLevel({
        terrain: {
          seed: 1,
          length: 10000,
          hilliness: 0.2,
          jumps: [],
          flatZones: [{ start: 0, end: 700 }], // spawn only
        },
      }),
    ];
    expect(validateFlatZones(levels)).toEqual([
      'Level 1 has no flat zone covering the finish flag [9500, 10000] (length - LEVEL.finishMarginPx through length)',
    ]);
  });

  it('accepts a finish zone that covers exactly [length - finishMarginPx, length]', () => {
    const levels = [
      makeLevel({
        terrain: {
          seed: 1,
          length: 10000,
          hilliness: 0.2,
          jumps: [],
          flatZones: [
            { start: 0, end: 700 },
            { start: 9500, end: 10000 },
          ],
        },
      }),
    ];
    expect(validateFlatZones(levels)).toEqual([]);
  });
});

describe('validateFlatZones — both zones missing', () => {
  it('reports both problems, spawn before finish, when flatZones is entirely absent', () => {
    const levels = [
      makeLevel({
        terrain: { seed: 1, length: 10000, hilliness: 0.2, jumps: [] }, // no flatZones at all
      }),
    ];
    const spawnCoverTo = LEVEL.spawnXPx + 200;
    expect(validateFlatZones(levels)).toEqual([
      `Level 1 has no flat zone covering the spawn runway [0, ${spawnCoverTo}] (LEVEL.spawnXPx ${LEVEL.spawnXPx} + 200px margin)`,
      'Level 1 has no flat zone covering the finish flag [9500, 10000] (length - LEVEL.finishMarginPx through length)',
    ]);
  });
});

describe('validateFlatZones — defensive/total behavior', () => {
  it('never throws on an empty array', () => {
    expect(() => validateFlatZones([])).not.toThrow();
    expect(validateFlatZones([])).toEqual([]);
  });

  it('never throws when configs itself is not an array', () => {
    const notAnArray = undefined as unknown as LevelConfig[];
    expect(() => validateFlatZones(notAnArray)).not.toThrow();
    expect(validateFlatZones(notAnArray)).toEqual([]);
  });

  it('never throws on malformed entries (missing terrain, non-finite length, non-finite zone bounds)', () => {
    const malformed = [
      null,
      { id: 1 },
      { id: 2, terrain: {} },
      { id: 3, terrain: { length: NaN, flatZones: [{ start: 'x', end: undefined }] } },
    ] as unknown as LevelConfig[];
    expect(() => validateFlatZones(malformed)).not.toThrow();
  });
});
