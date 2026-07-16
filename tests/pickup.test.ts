// Pure-logic tests for the level 12 Caleb-pickup cutscene (PLAN-06 task C).
// pickup.ts is import-safe (no runtime Phaser, no ui.ts), so these exercise its
// exported pure helpers directly — the approach trigger, the stop predicate, the
// cutscene state machine, and the two verbatim personal strings. The
// scene-touching createPickup factory is covered by the browser harness
// (scripts/playtest-level12.mjs), not here.
import { describe, expect, it } from 'vitest';
import {
  MAILBOX_LABEL,
  PICKUP_TOAST_MESSAGE,
  shouldBeginPickup,
  isStoppedForPickup,
  nextPickupPhase,
} from '../src/systems/pickup';
import type { PickupPhase, PickupSignals } from '../src/systems/pickup';

describe('verbatim personal content', () => {
  it('the mailbox nameplate is byte-exact MELIN (never paraphrase — CLAUDE.md Rule 4)', () => {
    expect(MAILBOX_LABEL).toBe('MELIN');
    // Assert the actual code points so an accidental homoglyph (e.g. Cyrillic
    // 'М'/'Е') or casing swap fails the test even if it renders identically.
    expect([...MAILBOX_LABEL].map((c) => c.codePointAt(0))).toEqual([77, 69, 76, 73, 78]);
  });

  it('the pickup toast is byte-exact "Caleb hopped on!!" (never paraphrase)', () => {
    expect(PICKUP_TOAST_MESSAGE).toBe('Caleb hopped on!!');
    expect(PICKUP_TOAST_MESSAGE.endsWith('!!')).toBe(true);
  });
});

describe('shouldBeginPickup', () => {
  const pickupX = 6250;
  const stopWindow = 380;

  it('is false while the bike is still left of the trigger window', () => {
    expect(shouldBeginPickup(5000, pickupX, stopWindow)).toBe(false);
    expect(shouldBeginPickup(pickupX - stopWindow - 1, pickupX, stopWindow)).toBe(false);
  });

  it('triggers exactly at stopWindowPx to the left of the pickup x', () => {
    expect(shouldBeginPickup(pickupX - stopWindow, pickupX, stopWindow)).toBe(true);
  });

  it('stays triggered at and past the pickup x (defensive against overshoot)', () => {
    expect(shouldBeginPickup(pickupX, pickupX, stopWindow)).toBe(true);
    expect(shouldBeginPickup(pickupX + 500, pickupX, stopWindow)).toBe(true);
  });
});

describe('isStoppedForPickup', () => {
  it('counts the bike as stopped only at/below the speed threshold', () => {
    expect(isStoppedForPickup(0, 2)).toBe(true);
    expect(isStoppedForPickup(2, 2)).toBe(true);
    expect(isStoppedForPickup(2.01, 2)).toBe(false);
    expect(isStoppedForPickup(10.8, 2)).toBe(false); // full-gas cruise
  });
});

describe('nextPickupPhase', () => {
  const hopMs = 1800;
  const notYet: PickupSignals = { atTrigger: false, stopped: false, hopElapsedMs: 0 };
  const atTrigger: PickupSignals = { atTrigger: true, stopped: false, hopElapsedMs: 0 };
  const stoppedNow: PickupSignals = { atTrigger: true, stopped: true, hopElapsedMs: 0 };

  it('stays approaching until the bike reaches the trigger', () => {
    expect(nextPickupPhase('approaching', notYet, hopMs)).toBe('approaching');
    expect(nextPickupPhase('approaching', atTrigger, hopMs)).toBe('braking');
  });

  it('brakes until the bike has stopped', () => {
    expect(nextPickupPhase('braking', atTrigger, hopMs)).toBe('braking'); // still rolling
    expect(nextPickupPhase('braking', stoppedNow, hopMs)).toBe('stopped');
  });

  it('advances stopped -> hopping immediately (transient beat kick-off)', () => {
    expect(nextPickupPhase('stopped', notYet, hopMs)).toBe('hopping');
  });

  it('holds hopping until the hop duration elapses, then done', () => {
    expect(nextPickupPhase('hopping', { ...notYet, hopElapsedMs: 0 }, hopMs)).toBe('hopping');
    expect(nextPickupPhase('hopping', { ...notYet, hopElapsedMs: hopMs - 1 }, hopMs)).toBe('hopping');
    expect(nextPickupPhase('hopping', { ...notYet, hopElapsedMs: hopMs }, hopMs)).toBe('done');
  });

  it('is terminal at done (never re-triggers)', () => {
    expect(nextPickupPhase('done', stoppedNow, hopMs)).toBe('done');
    expect(nextPickupPhase('done', atTrigger, hopMs)).toBe('done');
  });

  it('drives a full run in order with one transition per call', () => {
    const seen: PickupPhase[] = [];
    let phase: PickupPhase = 'approaching';
    const feed: PickupSignals[] = [
      notYet, // approaching
      atTrigger, // -> braking
      atTrigger, // still braking (rolling)
      stoppedNow, // -> stopped
      notYet, // -> hopping
      { ...notYet, hopElapsedMs: 500 }, // still hopping
      { ...notYet, hopElapsedMs: hopMs }, // -> done
      stoppedNow, // stays done
    ];
    for (const s of feed) {
      phase = nextPickupPhase(phase, s, hopMs);
      seen.push(phase);
    }
    expect(seen).toEqual([
      'approaching',
      'braking',
      'braking',
      'stopped',
      'hopping',
      'hopping',
      'done',
      'done',
    ]);
  });
});
