// Tests for the persistent passenger (PLAN-06 Task A).
//
// Two halves. First, deriveCalebPickedUp — the pure derivation that decides
// whether Caleb is aboard at spawn. It must never READ from storage or touch
// Phaser: it takes (level, progress) and returns a boolean, so it runs in plain
// Node. Second, createPassenger's own VISIBILITY LIFECYCLE, driven against
// tests/fakeScene.ts's duck-typed scene (passenger.ts is import-safe — its
// Phaser import is type-only — and only ever calls methods on the handles it is
// given). The sprite's per-frame PINNING is still browser territory; what is
// asserted here is the activate/hide state machine that levels 12 and 22 drive.
import { describe, expect, it } from 'vitest';
import { deriveCalebPickedUp } from '../src/systems/save';
import type { LevelProgress } from '../src/systems/save';
import { TEXTURE_KEYS, TOTAL_LEVELS } from '../src/systems/constants';
import { createPassenger } from '../src/systems/passenger';
import type { BikeHandle } from '../src/systems/bike';
import { createFakeScene } from './fakeScene';

/** The slice of BikeHandle the passenger sprite actually reads. */
function fakeBike(): BikeHandle {
  return {
    x: 100,
    y: 200,
    angle: 0,
    chassis: { position: { x: 100, y: 200 } },
  } as unknown as BikeHandle;
}

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

  it('tolerates an ABSENT completed array (optional-chaining guard → false, no throw)', () => {
    const noArray = { highestUnlocked: 1 } as unknown as LevelProgress;
    expect(() => deriveCalebPickedUp(13, noArray)).not.toThrow();
    expect(deriveCalebPickedUp(13, noArray)).toBe(false);
  });
});

describe('createPassenger — visibility lifecycle', () => {
  /** The one sprite the passenger owns, found by its texture rather than by
   * position in the ledger. */
  function calebSprite(fake: ReturnType<typeof createFakeScene>) {
    const sprites = fake.created.filter((o) => o.textureKey === TEXTURE_KEYS.caleb);
    expect(sprites).toHaveLength(1);
    return sprites[0];
  }

  it('spawns hidden when Caleb is not aboard yet (levels < 12)', () => {
    const fake = createFakeScene();
    const passenger = createPassenger(fake.scene, fakeBike(), { active: false });
    expect(passenger.active).toBe(false);
    expect(calebSprite(fake).visible).toBe(false);
  });

  it('spawns visible when Caleb is already aboard (levels 13-22)', () => {
    const fake = createFakeScene();
    const passenger = createPassenger(fake.scene, fakeBike(), { active: true });
    expect(passenger.active).toBe(true);
    expect(calebSprite(fake).visible).toBe(true);
  });

  it('activate() reveals him and is idempotent (level 12\u{2019}s pickup)', () => {
    const fake = createFakeScene();
    const passenger = createPassenger(fake.scene, fakeBike(), { active: false });
    passenger.activate();
    passenger.activate();
    expect(passenger.active).toBe(true);
    expect(calebSprite(fake).visible).toBe(true);
  });

  it('hide() takes him off again and is idempotent (level 22\u{2019}s arrival dismount)', () => {
    const fake = createFakeScene();
    const passenger = createPassenger(fake.scene, fakeBike(), { active: true });
    passenger.hide();
    passenger.hide();
    expect(passenger.active).toBe(false);
    expect(calebSprite(fake).visible).toBe(false);
  });

  it('hide() on a passenger who was never aboard is a no-op, not a re-show', () => {
    const fake = createFakeScene();
    const passenger = createPassenger(fake.scene, fakeBike(), { active: false });
    passenger.hide();
    expect(passenger.active).toBe(false);
    expect(calebSprite(fake).visible).toBe(false);
  });

  it('hide() then activate() round-trips (the two are exact inverses)', () => {
    const fake = createFakeScene();
    const passenger = createPassenger(fake.scene, fakeBike(), { active: true });
    passenger.hide();
    passenger.activate();
    expect(passenger.active).toBe(true);
    expect(calebSprite(fake).visible).toBe(true);
  });

  it('update() is a no-op once hidden (a hidden sprite is never re-pinned)', () => {
    const fake = createFakeScene();
    const passenger = createPassenger(fake.scene, fakeBike(), { active: true });
    passenger.update();
    const pinnedAt = { x: calebSprite(fake).x, y: calebSprite(fake).y };
    passenger.hide();
    // A quarter of PASSENGER.bobPeriodMs — the peak of the idle bob, so a
    // still-pinning update() would visibly move the sprite and fail this.
    fake.advance(225);
    passenger.update();
    expect(calebSprite(fake).x).toBe(pinnedAt.x);
    expect(calebSprite(fake).y).toBe(pinnedAt.y);
  });

  it('destroy() frees the sprite', () => {
    const fake = createFakeScene();
    const passenger = createPassenger(fake.scene, fakeBike(), { active: true });
    passenger.destroy();
    expect(calebSprite(fake).destroyed).toBe(true);
  });
});
