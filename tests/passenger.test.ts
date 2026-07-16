// Pure-logic tests for the persistent-passenger derivation (PLAN-06 Task A).
// deriveCalebPickedUp is the ONLY node-testable pure logic Task A introduces
// (the passenger sprite + event seam are Phaser-only plumbing exercised by the
// browser harness). It must never READ from storage or touch Phaser — it takes
// (level, progress) and returns a boolean, so these tests run in plain Node.
import { describe, expect, it } from 'vitest';
import { deriveCalebPickedUp } from '../src/systems/save';
import type { LevelProgress } from '../src/systems/save';
import { TOTAL_LEVELS } from '../src/systems/constants';

/** A LevelProgress with level 12 (completed index 11) set as given, and every
 * other level marked completed:false. */
function progressWith12Completed(level12Completed: boolean): LevelProgress {
  const completed = Array<boolean>(TOTAL_LEVELS).fill(false);
  completed[11] = level12Completed; // index 11 == level 12 (1-indexed)
  return { highestUnlocked: 1, completed };
}

describe('deriveCalebPickedUp', () => {
  it('is false on every level below 12, regardless of progress (Gabby solo)', () => {
    const done = progressWith12Completed(true);
    for (let level = 1; level < 12; level++) {
      expect(deriveCalebPickedUp(level, done)).toBe(false);
    }
  });

  it('is false at spawn on level 12 (the pickup cutscene flips it mid-level)', () => {
    expect(deriveCalebPickedUp(12, progressWith12Completed(false))).toBe(false);
    // Even on a REPLAY of level 12 (12 already completed) he starts solo and is
    // re-picked-up by the cutscene — never aboard at spawn on level 12.
    expect(deriveCalebPickedUp(12, progressWith12Completed(true))).toBe(false);
  });

  it('is true on levels 13..22 when level 12 is completed', () => {
    const done = progressWith12Completed(true);
    for (let level = 13; level <= TOTAL_LEVELS; level++) {
      expect(deriveCalebPickedUp(level, done)).toBe(true);
    }
  });

  it('is false on levels 13..22 when level 12 is NOT completed', () => {
    const notDone = progressWith12Completed(false);
    for (let level = 13; level <= TOTAL_LEVELS; level++) {
      expect(deriveCalebPickedUp(level, notDone)).toBe(false);
    }
  });

  it('tolerates a malformed/short completed array (missing index 11 → false)', () => {
    // Total-function contract: a corrupt progress object must not throw.
    const malformed = { highestUnlocked: 1, completed: [] } as unknown as LevelProgress;
    expect(deriveCalebPickedUp(13, malformed)).toBe(false);
    expect(deriveCalebPickedUp(5, malformed)).toBe(false);
  });
});
