// The ONE place that knows what a standing Caleb looks like (PLAN-09 ST-5
// code-review follow-up).
//
// WHY THIS FILE EXISTS: three modules had each grown a verbatim copy of the same
// figure — a `TEXTURE_KEYS.caleb` Image under a `PALETTE.brown` rectangle band —
// in pickup.ts (level 12's standing Caleb waiting outside his house),
// partyCast.ts (the party Caleb) and arrival.ts (level 22's dismounted Caleb).
// src/systems/pixelText.ts's module doc records what this project thinks of copy
// #4 of a helper: it was extracted only at the FOURTH replica, by which point
// the copies had already diverged. This one was extracted at the third, before
// they could.
//
// PLAN-10 ST-2 COLLAPSED THE BAND AWAY: tex-caleb is now real brown-haired art
// (src/art/sprites.mjs drawCaleb — a committed PNG BootScene loads), so the
// separate `PALETTE.brown` hair-band overlay every site used to draw ON TOP of
// the flat sky-blue placeholder became redundant (it would double up on the
// baked-in hair). As the PLAN-09 extraction anticipated ("one place to delete
// when tex-caleb gets real brown-haired art"), this module is now just the
// Image — the band, and the geometry it needed, are gone.
//
// Import-safe in Node (`import type Phaser` only, erased at compile time), like
// every module that consumes it, so none of them lose their Vitest-importability
// by using it. It only ever CALLS METHODS on the `scene` handle it is given.
import type Phaser from 'phaser';
import { TEXTURE_KEYS } from './constants';

/**
 * The whole standing Caleb, as the GameObject(s) to hand to a Container: just
 * his bottom-anchored sprite now that tex-caleb bakes in the brown hair.
 * Returned as an array so the call sites (pickup.ts / arrival.ts) keep spreading
 * it straight into a Container unchanged.
 */
export function calebFigureParts(scene: Phaser.Scene): Phaser.GameObjects.GameObject[] {
  return [scene.add.image(0, 0, TEXTURE_KEYS.caleb).setOrigin(0.5, 1)];
}
