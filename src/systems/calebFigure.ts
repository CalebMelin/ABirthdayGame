// The ONE place that knows what a standing Caleb looks like (PLAN-09 ST-5
// code-review follow-up).
//
// WHY THIS FILE EXISTS: three modules had each grown a verbatim copy of the same
// figure — a `TEXTURE_KEYS.caleb` Image under a `PALETTE.brown` rectangle band,
// with an identical 12px band height and an identical
// `-SPRITE_HEIGHT + BAND / 2` local-y — in pickup.ts (level 12's standing Caleb
// waiting outside his house), partyCast.ts (the party Caleb) and arrival.ts
// (level 22's dismounted Caleb). src/systems/pixelText.ts's module doc records
// what this project thinks of copy #4 of a helper: it was extracted only at the
// FOURTH replica, by which point the copies had already diverged. This one is
// extracted at the third, before they can.
//
// WHAT THE BAND IS: Caleb is BROWN-haired so he reads distinct from blonde Dom
// (NORTH_STAR §5 / DECISIONS.md 2026-07-15), and the placeholder tex-caleb is a
// flat sky-blue block with no hair at all — so every site that draws him
// standing overlays this band. PLACEHOLDER ART: PLAN-10 replaces tex-caleb with
// real brown-haired art, at which point this whole module should collapse to
// nothing (delete the band, keep the Image) — one edit here instead of three.
//
// Import-safe in Node (`import type Phaser` only, erased at compile time), like
// every module that consumes it, so none of them lose their Vitest-importability
// by using it. It only ever CALLS METHODS on the `scene` handle it is given.
import type Phaser from 'phaser';
import { PALETTE, TEXTURE_KEYS } from './constants';

/** Matches BootScene's tex-caleb placeholder (24x48). Kept here as well as at
 * the call sites because this module has to position the band against it; the
 * call sites keep their own copies for their own unrelated geometry (name-tag
 * placement, container anchoring). */
const SPRITE_WIDTH_PX = 24;
const SPRITE_HEIGHT_PX = 48;
/** Height of the brown hair band across the top of the sprite, px. */
const HAIR_BAND_HEIGHT_PX = 12;

/**
 * Caleb's brown hair band, in a bottom-anchored figure's LOCAL space (i.e. for
 * a Container whose origin is at his feet, matching an Image drawn with
 * `setOrigin(0.5, 1)`).
 *
 * Exposed separately from {@link calebFigureParts} because partyCast.ts builds
 * every guest's base Image through one generic path and only needs the overlay.
 */
export function calebHairBand(scene: Phaser.Scene): Phaser.GameObjects.Rectangle {
  return scene.add.rectangle(
    0,
    -SPRITE_HEIGHT_PX + HAIR_BAND_HEIGHT_PX / 2,
    SPRITE_WIDTH_PX,
    HAIR_BAND_HEIGHT_PX,
    PALETTE.brown
  );
}

/**
 * The whole standing Caleb, as the two GameObjects to hand to a Container: his
 * bottom-anchored sprite, then the hair band over it. Order matters — the band
 * must be added second so it draws on top.
 */
export function calebFigureParts(scene: Phaser.Scene): Phaser.GameObjects.GameObject[] {
  return [
    scene.add.image(0, 0, TEXTURE_KEYS.caleb).setOrigin(0.5, 1),
    calebHairBand(scene),
  ];
}
