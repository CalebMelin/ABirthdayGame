// Tests for the scene pixel-fade transitions (PLAN-10 ST-8 #7 —
// src/systems/transition.ts). That module is import-safe (type-only Phaser, only
// method calls on the scene handle), so it loads in plain Node.
//
// The thing worth pinning is the RE-ENTRY LATCH (`__juiceLeaving`): a rapid
// double-press must not queue two scene.start()s. The pure decision is unit-
// tested directly (shouldStartTransition); the actual single-start / re-arm
// WIRING is exercised through a tiny duck-typed scene + camera (the
// tests/palette.test.ts pattern — a plain object exposing only the handful of
// members the module touches, bridged with `as unknown as Phaser.Scene`, never
// `any`). No DOM, no runtime Phaser, no browser.
import { describe, expect, it } from 'vitest';
import type Phaser from 'phaser';
import { fadeInScene, shouldStartTransition, transitionTo } from '../src/systems/transition';

/** Phaser's Cameras.Scene2D.Events.FADE_OUT_COMPLETE string (matches the value
 * transition.ts registers its hand-off on). */
const FADE_OUT_COMPLETE = 'camerafadeoutcomplete';

/** A duck-typed stand-in for the slice of a Scene + its main camera that
 * transition.ts calls: cameras.main.{once,fadeOut,fadeIn} and scene.start, plus
 * the `__juiceLeaving` latch it stashes on the scene object itself. */
function createFakeTransitionScene() {
  const starts: Array<{ key: string; data?: object }> = [];
  const fadeOutMs: number[] = [];
  const fadeInMs: number[] = [];
  const onceListeners: Array<{ event: string; cb: () => void }> = [];

  const cam = {
    once(event: string, cb: () => void) {
      onceListeners.push({ event, cb });
      return cam;
    },
    fadeOut(durationMs: number) {
      fadeOutMs.push(durationMs);
      return cam;
    },
    fadeIn(durationMs: number) {
      fadeInMs.push(durationMs);
      return cam;
    },
  };

  const scene = {
    cameras: { main: cam },
    scene: {
      start: (key: string, data?: object) => {
        starts.push({ key, data });
      },
    },
  } as unknown as Phaser.Scene;

  return {
    scene,
    starts,
    fadeOutMs,
    fadeInMs,
    /** Fire the fade-out-complete event the way Phaser's camera would. Models
     * once() faithfully: each matching listener fires a SINGLE time and is then
     * removed, so a later fade-out can't re-fire a spent hand-off. */
    completeFadeOut() {
      const firing = onceListeners.filter((l) => l.event === FADE_OUT_COMPLETE);
      for (const l of firing) onceListeners.splice(onceListeners.indexOf(l), 1);
      for (const l of firing) l.cb();
    },
    /** Read the latch transition.ts writes on the scene object. */
    isLeaving(): boolean {
      return (scene as unknown as { __juiceLeaving?: boolean }).__juiceLeaving === true;
    },
  };
}

describe('shouldStartTransition — the pure latch decision', () => {
  it('starts when no transition is in flight (latch unset or false)', () => {
    expect(shouldStartTransition(undefined)).toBe(true);
    expect(shouldStartTransition(false)).toBe(true);
  });

  it('refuses to start a SECOND transition while one is already leaving', () => {
    expect(shouldStartTransition(true)).toBe(false);
  });
});

describe('transitionTo — fade-out then hand off', () => {
  it('fades out, latches, and only starts the target AFTER the fade completes', () => {
    const fake = createFakeTransitionScene();
    transitionTo(fake.scene, 'GameScene', { level: 3 });

    // Fade-out began and the latch is set, but the scene has NOT started yet —
    // the hand-off waits for the fade to finish.
    expect(fake.fadeOutMs).toHaveLength(1);
    expect(fake.isLeaving()).toBe(true);
    expect(fake.starts).toHaveLength(0);

    fake.completeFadeOut();
    expect(fake.starts).toEqual([{ key: 'GameScene', data: { level: 3 } }]);
  });

  it('is idempotent: a second call while leaving is a NO-OP (single start)', () => {
    const fake = createFakeTransitionScene();
    transitionTo(fake.scene, 'FirstTarget');
    transitionTo(fake.scene, 'SecondTarget'); // double-press / two-finger tap

    // Exactly one fade-out was started...
    expect(fake.fadeOutMs).toHaveLength(1);
    // ...and completing it starts ONLY the first target, never the second.
    fake.completeFadeOut();
    expect(fake.starts).toHaveLength(1);
    expect(fake.starts[0].key).toBe('FirstTarget');
  });
});

describe('fadeInScene — re-arms the latch on scene entry', () => {
  it('clears the latch so a later transition from the reused scene works again', () => {
    const fake = createFakeTransitionScene();

    // A first transition leaves the latch set (as it stays until the scene is
    // re-entered — the real flow clears it in the incoming create()).
    transitionTo(fake.scene, 'A');
    fake.completeFadeOut();
    expect(fake.isLeaving()).toBe(true);
    // While still latched, another transition is correctly a no-op.
    transitionTo(fake.scene, 'B');
    expect(fake.fadeOutMs).toHaveLength(1);

    // Re-entering the scene fades it in AND clears the latch.
    fadeInScene(fake.scene);
    expect(fake.fadeInMs).toHaveLength(1);
    expect(fake.isLeaving()).toBe(false);

    // Now a fresh transition starts normally.
    transitionTo(fake.scene, 'C');
    expect(fake.fadeOutMs).toHaveLength(2);
    fake.completeFadeOut();
    expect(fake.starts.map((s) => s.key)).toEqual(['A', 'C']);
  });
});
