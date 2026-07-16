import { describe, expect, it } from 'vitest';
import { createSaveSystem, getSave, SAVE_VERSION } from '../src/systems/save';
import type { CharacterConfig, KVStorage } from '../src/systems/save';
import { TOTAL_LEVELS } from '../src/systems/constants';

/** Simple Map-backed fake that implements the KVStorage structural subset
 * of DOM Storage, so tests never need jsdom/localStorage. */
function createFakeStorage(): KVStorage {
  const map = new Map<string, string>();
  return {
    getItem(key: string): string | null {
      return map.has(key) ? map.get(key)! : null;
    },
    setItem(key: string, value: string): void {
      map.set(key, value);
    },
    removeItem(key: string): void {
      map.delete(key);
    },
  };
}

/** A KVStorage whose every method throws, simulating Safari private-mode
 * or a fully unavailable localStorage. */
function createThrowingStorage(): KVStorage {
  return {
    getItem(): string | null {
      throw new Error('storage unavailable');
    },
    setItem(): void {
      throw new Error('storage unavailable');
    },
    removeItem(): void {
      throw new Error('storage unavailable');
    },
  };
}

/** A KVStorage that works normally until its write budget is exhausted,
 * then throws on every further setItem (reads/removes keep working) —
 * simulates hitting the localStorage quota mid-session. */
function createQuotaStorage(
  seed: Record<string, string>,
  allowedWrites: number
): { storage: KVStorage; backing: Map<string, string> } {
  const backing = new Map(Object.entries(seed));
  let writes = 0;
  const storage: KVStorage = {
    getItem(key: string): string | null {
      return backing.has(key) ? backing.get(key)! : null;
    },
    setItem(key: string, value: string): void {
      writes++;
      if (writes > allowedWrites) throw new Error('quota exceeded');
      backing.set(key, value);
    },
    removeItem(key: string): void {
      backing.delete(key);
    },
  };
  return { storage, backing };
}

const sampleCharacter: CharacterConfig = {
  hairColor: 'brown',
  eyeColor: 'green',
  bikeColor: 'coral',
  outfit: 'default',
};

describe('character', () => {
  it('round-trips a saved character', () => {
    const save = createSaveSystem(createFakeStorage());
    save.saveCharacter(sampleCharacter);
    expect(save.loadCharacter()).toEqual(sampleCharacter);
  });

  it('returns null when unset', () => {
    const save = createSaveSystem(createFakeStorage());
    expect(save.loadCharacter()).toBeNull();
  });
});

describe('progress defaults', () => {
  it('defaults to highestUnlocked 1 and all levels incomplete', () => {
    const save = createSaveSystem(createFakeStorage());
    const progress = save.loadProgress();
    expect(progress.highestUnlocked).toBe(1);
    expect(progress.completed).toHaveLength(TOTAL_LEVELS);
    expect(progress.completed.every((c) => c === false)).toBe(true);
  });
});

describe('markLevelCompleted', () => {
  it('marks level 1 completed and unlocks level 2', () => {
    const save = createSaveSystem(createFakeStorage());
    save.markLevelCompleted(1);
    const progress = save.loadProgress();
    expect(progress.completed[0]).toBe(true);
    expect(progress.highestUnlocked).toBe(2);
  });

  it('caps highestUnlocked at TOTAL_LEVELS when completing the last level', () => {
    const save = createSaveSystem(createFakeStorage());
    save.markLevelCompleted(TOTAL_LEVELS);
    const progress = save.loadProgress();
    expect(progress.completed[TOTAL_LEVELS - 1]).toBe(true);
    expect(progress.highestUnlocked).toBe(TOTAL_LEVELS);
  });

  it('does not lower highestUnlocked when replaying an earlier level', () => {
    const save = createSaveSystem(createFakeStorage());
    save.markLevelCompleted(TOTAL_LEVELS);
    save.markLevelCompleted(1);
    const progress = save.loadProgress();
    expect(progress.highestUnlocked).toBe(TOTAL_LEVELS);
    expect(progress.completed[0]).toBe(true);
  });

  it('ignores out-of-range and non-integer input', () => {
    const save = createSaveSystem(createFakeStorage());
    save.markLevelCompleted(0);
    save.markLevelCompleted(TOTAL_LEVELS + 1);
    save.markLevelCompleted(Number.NaN);
    const progress = save.loadProgress();
    expect(progress.highestUnlocked).toBe(1);
    expect(progress.completed.every((c) => c === false)).toBe(true);
  });
});

describe('persistence across instances (simulated reload)', () => {
  it('reads back data written by a previous SaveSystem instance over the same storage', () => {
    const storage = createFakeStorage();
    const first = createSaveSystem(storage);
    first.saveCharacter(sampleCharacter);
    first.markLevelCompleted(3);
    first.addTulips(5);
    first.markNoteSeen(2);

    const second = createSaveSystem(storage);
    expect(second.loadCharacter()).toEqual(sampleCharacter);
    expect(second.loadProgress().completed[2]).toBe(true);
    expect(second.loadProgress().highestUnlocked).toBe(4);
    expect(second.getTulips()).toBe(5);
    expect(second.getNotesSeen()).toEqual([2]);
  });
});

describe('tulips', () => {
  it('defaults to 0', () => {
    const save = createSaveSystem(createFakeStorage());
    expect(save.getTulips()).toBe(0);
  });

  it('accumulates added tulips', () => {
    const save = createSaveSystem(createFakeStorage());
    save.addTulips(3);
    save.addTulips(4);
    expect(save.getTulips()).toBe(7);
  });

  it('ignores negative and non-finite counts', () => {
    const save = createSaveSystem(createFakeStorage());
    save.addTulips(5);
    save.addTulips(-10);
    save.addTulips(Number.NaN);
    save.addTulips(Number.POSITIVE_INFINITY);
    expect(save.getTulips()).toBe(5);
  });

  it('truncates fractional counts (whole tulips only)', () => {
    const save = createSaveSystem(createFakeStorage());
    save.addTulips(1.9);
    expect(save.getTulips()).toBe(1);
    save.addTulips(2.5);
    expect(save.getTulips()).toBe(3);
  });

  // The PLAN-07 "persists across levels AND sessions" criterion: each new
  // SaveSystem over the same storage models a fresh page load / session, and
  // awards from a later session must STACK on the earlier session's total
  // (the plain read-back of one instance's writes is covered above in
  // 'persistence across instances').
  it('accumulates across sessions (a later instance adds onto an earlier one)', () => {
    const storage = createFakeStorage();
    const session1 = createSaveSystem(storage);
    session1.addTulips(3);

    const session2 = createSaveSystem(storage);
    expect(session2.getTulips()).toBe(3);
    session2.addTulips(4);
    expect(session2.getTulips()).toBe(7);

    const session3 = createSaveSystem(storage);
    expect(session3.getTulips()).toBe(7);
  });
});

describe('notesSeen', () => {
  it('defaults to an empty array', () => {
    const save = createSaveSystem(createFakeStorage());
    expect(save.getNotesSeen()).toEqual([]);
  });

  it('does not add duplicate indices', () => {
    const save = createSaveSystem(createFakeStorage());
    save.markNoteSeen(4);
    save.markNoteSeen(4);
    save.markNoteSeen(7);
    expect(save.getNotesSeen()).toEqual([4, 7]);
  });

  it('ignores negative and non-integer indices', () => {
    const save = createSaveSystem(createFakeStorage());
    save.markNoteSeen(-1);
    save.markNoteSeen(2.5);
    save.markNoteSeen(Number.NaN);
    expect(save.getNotesSeen()).toEqual([]);
  });
});

describe('resetAll', () => {
  it('clears every gabby22 key and restores defaults', () => {
    const storage = createFakeStorage();
    const save = createSaveSystem(storage);
    save.saveCharacter(sampleCharacter);
    save.markLevelCompleted(5);
    save.addTulips(9);
    save.markNoteSeen(1);

    save.resetAll();

    expect(save.loadCharacter()).toBeNull();
    const progress = save.loadProgress();
    expect(progress.highestUnlocked).toBe(1);
    expect(progress.completed.every((c) => c === false)).toBe(true);
    expect(save.getTulips()).toBe(0);
    expect(save.getNotesSeen()).toEqual([]);

    expect(storage.getItem('gabby22.character')).toBeNull();
    expect(storage.getItem('gabby22.progress')).toBeNull();
    expect(storage.getItem('gabby22.tulips')).toBeNull();
    expect(storage.getItem('gabby22.notesSeen')).toBeNull();
    expect(storage.getItem('gabby22.saveVersion')).toBeNull();
  });
});

describe('corrupt data handling', () => {
  it('falls back to defaults for unparseable JSON', () => {
    const storage = createFakeStorage();
    storage.setItem('gabby22.character', '{oops');
    storage.setItem('gabby22.progress', '{oops');
    storage.setItem('gabby22.tulips', '{oops');
    storage.setItem('gabby22.notesSeen', '{oops');
    const save = createSaveSystem(storage);

    expect(save.loadCharacter()).toBeNull();
    expect(save.loadProgress()).toEqual({
      highestUnlocked: 1,
      completed: Array(TOTAL_LEVELS).fill(false),
    });
    expect(save.getTulips()).toBe(0);
    expect(save.getNotesSeen()).toEqual([]);
  });

  it('falls back to defaults for wrong-shape JSON (array where object expected)', () => {
    const storage = createFakeStorage();
    storage.setItem('gabby22.character', '[]');
    storage.setItem('gabby22.progress', '[]');
    const save = createSaveSystem(storage);

    expect(save.loadCharacter()).toBeNull();
    expect(save.loadProgress().highestUnlocked).toBe(1);
  });

  it('normalizes wrong types inside a progress object instead of throwing', () => {
    const storage = createFakeStorage();
    storage.setItem(
      'gabby22.progress',
      JSON.stringify({ highestUnlocked: 'nine', completed: ['yes', true, 1, false] })
    );
    const save = createSaveSystem(storage);
    const progress = save.loadProgress();

    expect(progress.highestUnlocked).toBeGreaterThanOrEqual(1);
    expect(progress.highestUnlocked).toBeLessThanOrEqual(TOTAL_LEVELS);
    expect(progress.completed).toHaveLength(TOTAL_LEVELS);
    expect(progress.completed[1]).toBe(true);
  });

  it('rejects a character object with wrong field types', () => {
    const storage = createFakeStorage();
    storage.setItem(
      'gabby22.character',
      JSON.stringify({ hairColor: 1, eyeColor: 'green', bikeColor: 'coral', outfit: 'x' })
    );
    const save = createSaveSystem(storage);
    expect(save.loadCharacter()).toBeNull();
  });
});

describe('unavailable storage (in-memory fallback)', () => {
  it('works fully via in-memory fallback when every storage method throws', () => {
    const save = createSaveSystem(createThrowingStorage());

    expect(() => save.saveCharacter(sampleCharacter)).not.toThrow();
    expect(save.loadCharacter()).toEqual(sampleCharacter);

    expect(() => save.markLevelCompleted(2)).not.toThrow();
    expect(save.loadProgress().highestUnlocked).toBe(3);

    expect(() => save.addTulips(2)).not.toThrow();
    expect(save.getTulips()).toBe(2);
  });
});

describe('mid-session partial degradation (writes fail, reads still work)', () => {
  it('still reads data persisted before this session after a write failure', () => {
    // "Previous session" data lives in the underlying storage; version is
    // current so createSaveSystem performs no writes during construction.
    const { storage } = createQuotaStorage(
      {
        'gabby22.saveVersion': String(SAVE_VERSION),
        'gabby22.progress': JSON.stringify({
          highestUnlocked: 7,
          completed: Array(TOTAL_LEVELS).fill(false),
        }),
        'gabby22.tulips': '11',
      },
      0 // the very first write this session hits "quota"
    );
    const save = createSaveSystem(storage);

    // Trigger degradation via a write the save system must swallow.
    expect(() => save.saveCharacter(sampleCharacter)).not.toThrow();
    expect(save.loadCharacter()).toEqual(sampleCharacter);

    // Keys never touched this session must read through to the real
    // storage — not silently reset to defaults (that would wipe progress).
    expect(save.loadProgress().highestUnlocked).toBe(7);
    expect(save.getTulips()).toBe(11);
  });

  it('does not resurrect keys removed after degradation (resetAll still works)', () => {
    const { storage, backing } = createQuotaStorage(
      {
        'gabby22.saveVersion': String(SAVE_VERSION),
        'gabby22.tulips': '5',
      },
      0
    );
    const save = createSaveSystem(storage);
    save.saveCharacter(sampleCharacter); // degrades
    expect(save.getTulips()).toBe(5); // read-through works

    save.resetAll();

    expect(save.getTulips()).toBe(0);
    expect(backing.has('gabby22.tulips')).toBe(false);
  });
});

describe('production defaults (no injected storage)', () => {
  it('no-arg createSaveSystem works and round-trips under node (window undefined)', () => {
    const save = createSaveSystem();
    expect(() => save.saveCharacter(sampleCharacter)).not.toThrow();
    expect(save.loadCharacter()).toEqual(sampleCharacter);
    save.resetAll();
    expect(save.loadCharacter()).toBeNull();
  });

  it('getSave returns the same singleton on every call', () => {
    expect(getSave()).toBe(getSave());
  });
});

// NOTE: while migrate() is a no-op stub these versioning tests only pin the
// version-stamp bookkeeping (write-when-absent, bump-when-older, leave-when-
// current). When the first REAL migration lands (SAVE_VERSION bump in a later
// plan), add assertions here that old-shape data is actually transformed.
describe('versioning', () => {
  it('writes the current save version to fresh storage', () => {
    const storage = createFakeStorage();
    createSaveSystem(storage);
    expect(storage.getItem('gabby22.saveVersion')).toBe(String(SAVE_VERSION));
  });

  it('migrates storage pre-seeded with an older version without destroying parseable data', () => {
    const storage = createFakeStorage();
    storage.setItem('gabby22.saveVersion', '0');
    storage.setItem('gabby22.tulips', '12');

    const save = createSaveSystem(storage);

    expect(storage.getItem('gabby22.saveVersion')).toBe(String(SAVE_VERSION));
    expect(save.getTulips()).toBe(12);
  });

  it('leaves data alone when the stored version is already current', () => {
    const storage = createFakeStorage();
    storage.setItem('gabby22.saveVersion', String(SAVE_VERSION));
    storage.setItem('gabby22.tulips', '3');

    const save = createSaveSystem(storage);

    expect(save.getTulips()).toBe(3);
  });
});
