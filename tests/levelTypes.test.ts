import { describe, expect, it } from 'vitest';
import { getLevelTerrainSpec, THEME_IDS, validateLevels } from '../src/levels/types';
import type { LevelConfig, LevelEvent } from '../src/levels/types';
import { LEVEL, TOTAL_LEVELS } from '../src/systems/constants';

/** Minimal, valid LevelConfig fixture. Every field a test doesn't care
 * about gets a sane default so each test only spells out what it's
 * actually exercising — same pattern as terrain.test.ts's baseSpec(). */
function makeLevel(overrides: Partial<LevelConfig> = {}): LevelConfig {
  return {
    id: 1,
    name: 'Test Level',
    theme: 'suburbs',
    terrain: {
      seed: 1,
      length: LEVEL.lengthMinPx,
      hilliness: 0.2,
      jumps: [],
    },
    ...overrides,
  };
}

/** The scripted event a given required level id needs, per NORTH_STAR §5 —
 * an INDEPENDENT reimplementation of validateLevels' own required-event
 * table (not a call into production code), so fixtures can build a
 * genuinely-valid 22-level set without the test oracle and the code under
 * test sharing a single source of truth. */
function requiredEventFor(id: number): LevelEvent | undefined {
  switch (id) {
    case 7:
      return { type: 'traffic' };
    case 11:
      return { type: 'wheelieRider' };
    case 12:
      return { type: 'calebPickup', x: 500 };
    case 15:
      return { type: 'police' };
    case 18:
      return { type: 'billboard', x: 500, text: 'Test billboard' };
    default:
      return undefined;
  }
}

/** A fully valid 22-level set: ids 1..TOTAL_LEVELS exactly once, all
 * lengths in-bounds, every required scripted event present. */
function makeValidLevels(): LevelConfig[] {
  const levels: LevelConfig[] = [];
  for (let id = 1; id <= TOTAL_LEVELS; id++) {
    const event = requiredEventFor(id);
    levels.push(
      makeLevel({
        id,
        name: `Level ${id}`,
        terrain: { seed: id, length: LEVEL.lengthMinPx, hilliness: 0.2, jumps: [] },
        events: event ? [event] : undefined,
      })
    );
  }
  return levels;
}

describe('THEME_IDS', () => {
  it('has exactly 15 theme ids', () => {
    expect(THEME_IDS.length).toBe(15);
  });

  it('contains the exact locked ids from NORTH_STAR §5, in order', () => {
    expect([...THEME_IDS]).toEqual([
      'suburbs',
      'park',
      'smallTown',
      'downtown',
      'construction',
      'highway',
      'riverside',
      'bridge',
      'boulevard',
      'oldTown',
      'hilly',
      'billboardRow',
      'sunset',
      'partyDistrict',
      'finalDusk',
    ]);
  });
});

describe('getLevelTerrainSpec', () => {
  it('maps seed/length/hilliness/jumps/flatZones straight through to a TerrainSpec', () => {
    const config = makeLevel({
      terrain: {
        seed: 42,
        length: 9000,
        hilliness: 0.5,
        jumps: [{ x: 100, width: 200, height: 50 }],
        flatZones: [{ start: 0, end: 300 }],
      },
    });

    expect(getLevelTerrainSpec(config)).toEqual({
      seed: 42,
      length: 9000,
      hilliness: 0.5,
      jumps: [{ x: 100, width: 200, height: 50 }],
      flatZones: [{ start: 0, end: 300 }],
    });
  });

  it('leaves flatZones undefined when the level does not specify any', () => {
    const config = makeLevel({
      terrain: { seed: 1, length: LEVEL.lengthMinPx, hilliness: 0, jumps: [] },
    });

    expect(getLevelTerrainSpec(config).flatZones).toBeUndefined();
  });
});

describe('validateLevels — valid input', () => {
  it('returns no problems for a fully-valid 22-level set', () => {
    expect(validateLevels(makeValidLevels())).toEqual([]);
  });
});

describe('validateLevels — id coverage', () => {
  it('reports a missing id', () => {
    const levels = makeValidLevels().filter((level) => level.id !== 5);
    expect(validateLevels(levels)).toEqual(['Missing level id(s): 5']);
  });

  it('reports a duplicate id', () => {
    const levels = makeValidLevels();
    levels.push({ ...levels[0] }); // id 1 now appears twice; every id still present
    expect(validateLevels(levels)).toEqual(['Duplicate level id(s): 1']);
  });

  it('reports multiple missing ids in one sorted message', () => {
    const levels = makeValidLevels().filter((level) => level.id !== 3 && level.id !== 20);
    expect(validateLevels(levels)).toEqual(['Missing level id(s): 3, 20']);
  });
});

describe('validateLevels — length bounds', () => {
  it('reports a level whose length is over lengthMaxPx', () => {
    const levels = makeValidLevels();
    levels[0] = { ...levels[0], terrain: { ...levels[0].terrain, length: LEVEL.lengthMaxPx + 1 } };
    expect(validateLevels(levels)).toEqual([
      `Level 1 length ${LEVEL.lengthMaxPx + 1} is outside [${LEVEL.lengthMinPx}, ${LEVEL.lengthMaxPx}]`,
    ]);
  });

  it('reports a level whose length is under lengthMinPx', () => {
    const levels = makeValidLevels();
    levels[0] = { ...levels[0], terrain: { ...levels[0].terrain, length: LEVEL.lengthMinPx - 1 } };
    expect(validateLevels(levels)).toEqual([
      `Level 1 length ${LEVEL.lengthMinPx - 1} is outside [${LEVEL.lengthMinPx}, ${LEVEL.lengthMaxPx}]`,
    ]);
  });

  it('accepts lengths exactly at the min/max boundary', () => {
    const levels = makeValidLevels();
    levels[0] = { ...levels[0], terrain: { ...levels[0].terrain, length: LEVEL.lengthMinPx } };
    levels[1] = { ...levels[1], terrain: { ...levels[1].terrain, length: LEVEL.lengthMaxPx } };
    expect(validateLevels(levels)).toEqual([]);
  });
});

describe('validateLevels — required scripted events', () => {
  const requiredCases: Array<{ id: number; type: LevelEvent['type'] }> = [
    { id: 7, type: 'traffic' },
    { id: 11, type: 'wheelieRider' },
    { id: 12, type: 'calebPickup' },
    { id: 15, type: 'police' },
    { id: 18, type: 'billboard' },
  ];

  for (const { id, type } of requiredCases) {
    it(`reports level ${id} missing its required '${type}' event`, () => {
      const levels = makeValidLevels();
      const index = levels.findIndex((level) => level.id === id);
      levels[index] = { ...levels[index], events: undefined };
      expect(validateLevels(levels)).toEqual([`Level ${id} is missing its required '${type}' event`]);
    });

    it(`accepts level ${id} when its events array has other events plus the required '${type}' one`, () => {
      const levels = makeValidLevels();
      const index = levels.findIndex((level) => level.id === id);
      const required = requiredEventFor(id);
      if (!required) throw new Error('test setup error: no required event for this id');
      levels[index] = { ...levels[index], events: [{ type: 'wheelieRider' }, required] };
      expect(validateLevels(levels)).toEqual([]);
    });
  }
});

describe('validateLevels — defensive/total behavior', () => {
  it('never throws on an empty array, and reports every id + required event missing', () => {
    expect(() => validateLevels([])).not.toThrow();
    const expectedMissingIds = Array.from({ length: TOTAL_LEVELS }, (_, i) => i + 1).join(', ');
    expect(validateLevels([])).toEqual([
      `Missing level id(s): ${expectedMissingIds}`,
      "Level 7 is missing its required 'traffic' event",
      "Level 11 is missing its required 'wheelieRider' event",
      "Level 12 is missing its required 'calebPickup' event",
      "Level 15 is missing its required 'police' event",
      "Level 18 is missing its required 'billboard' event",
    ]);
  });

  it('never throws when configs itself is not an array', () => {
    // reason: exercising defensive behavior against a caller that violates
    // the declared type at runtime (e.g. bad JSON/import), same spirit as
    // save.ts's total-function guards.
    const notAnArray = undefined as unknown as LevelConfig[];
    expect(() => validateLevels(notAnArray)).not.toThrow();
    expect(validateLevels(notAnArray)).toEqual(validateLevels([]));
  });

  it('never throws on malformed entries (missing fields, null/undefined holes)', () => {
    // reason: same as above — deliberately-bad entries to prove the
    // validator degrades to problem strings instead of crashing.
    const malformed = [null, { id: 1 }, undefined] as unknown as LevelConfig[];
    expect(() => validateLevels(malformed)).not.toThrow();
  });
});
