import { describe, expect, it } from 'vitest';
import { mergePedals } from '../src/systems/input';

// mergePedals is the pure, Phaser-free core of the input system (PLAN-03
// task 1): it OR-merges every gas source and every brake source — each
// source is one mapped key's live isDown, or the touch pedal boolean — into
// the {gas, brake} the bike consumes. The Phaser keyboard/touch wiring in
// createGameInput is browser-verified (same pure-vs-browser split as
// bike.ts/terrain.ts). These tests pin the contract: any source down => that
// pedal down, gas/brake independent, keyboard and touch merged with no mode
// switch, and NO edge-filtering — a raw per-frame snapshot, which is
// load-bearing for the bike's press/release-driven backflip mechanic.

describe('mergePedals — OR-merge of all input sources', () => {
  it('is not pressed when every source is up', () => {
    expect(mergePedals([false, false], [false, false])).toEqual({
      gas: false,
      brake: false,
    });
  });

  it('presses gas when ANY gas source is down (one keyboard key)', () => {
    // Sources model [Right, Up, W, D, touch]; only Right is down here.
    expect(
      mergePedals([true, false, false, false, false], [false, false, false, false, false])
    ).toEqual({ gas: true, brake: false });
  });

  it('presses brake when ANY brake source is down (one keyboard key)', () => {
    // Sources model [Left, Down, S, A, touch]; only S is down here.
    expect(
      mergePedals([false, false, false, false, false], [false, false, true, false, false])
    ).toEqual({ gas: false, brake: true });
  });

  it('presses gas from the touch pedal alone, with no keyboard key down', () => {
    // Every keyboard key up, only the trailing touch source down: proves
    // touch drives simultaneously with keyboard, no mode switch.
    expect(
      mergePedals([false, false, false, false, true], [false, false, false, false, false])
    ).toEqual({ gas: true, brake: false });
  });

  it('keyboard OR touch: either source alone, or both together, presses the pedal', () => {
    // Two-source model [key, touch] for gas.
    expect(mergePedals([true, false], [false, false]).gas).toBe(true); // key only
    expect(mergePedals([false, true], [false, false]).gas).toBe(true); // touch only
    expect(mergePedals([true, true], [false, false]).gas).toBe(true); // both
  });

  it('never fights multiple keys of one action held at once (Right + Up = one gas press)', () => {
    expect(mergePedals([true, true, false, false], [false, false, false, false]).gas).toBe(true);
  });

  it('reports gas and brake independently (one never leaks into the other)', () => {
    expect(mergePedals([true], [false]).brake).toBe(false);
    expect(mergePedals([false], [true]).gas).toBe(false);
  });

  it('passes a simultaneous gas+brake press through untouched (no conflict resolution, no drop)', () => {
    // bike.ts owns gas-vs-brake resolution and reads real press/release
    // edges — the merge must not swallow, debounce, or prioritize either
    // signal, or the deliberate mid-air backflip input would break.
    expect(mergePedals([true], [true])).toEqual({ gas: true, brake: true });
  });

  it('treats an empty source list as up (keyboard unavailable and no touch)', () => {
    expect(mergePedals([], [])).toEqual({ gas: false, brake: false });
  });
});
