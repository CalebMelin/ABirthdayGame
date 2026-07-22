// Persistent passenger (Caleb) sprite (PLAN-06 Task A). Once Gabby picks
// Caleb up in level 12 he rides pillion BEHIND her for the rest of the game
// (levels 13-22 and any replay of >= 12 — see calebPickedUp derivation in
// save.ts). This module renders ONLY a cosmetic sprite: it creates NO Matter
// bodies and never touches the bike's mass or handling (NORTH_STAR §8's
// <100-body budget + PLAN-06's "handling must not get harder"). Each frame it
// pins the Caleb sprite to a chassis-local offset rotated into world space —
// the SAME math as bike.ts's syncSprites rider block — plus a small
// independent vertical bob so the pillion reads as alive.
//
// Like decorations.ts (NOT terrain.ts/bike.ts), this is a browser-only system
// module: it calls scene.add.* through the `scene` handle it's given. Its own
// Phaser import is type-only (`import type Phaser`, erased at compile time), so
// nothing here pulls Phaser into a Node/Vitest context — but no pure-logic test
// imports it either (its whole job is GameObject plumbing). It only ever CALLS
// METHODS on the `scene`/`bike` handles handed in at runtime.
import type Phaser from 'phaser';
import type { BikeHandle } from './bike';
import { PASSENGER, TEXTURE_KEYS } from './constants';

const TWO_PI = Math.PI * 2;

/** The handle GameScene (Task A) holds for the persistent passenger.
 * Create-once (via createPassenger) / update()-per-frame / destroy()-on-
 * teardown, mirroring the bike/decoration handles. `activate()` reveals Caleb
 * mid-level (level 12's pickup cutscene calls it), `hide()` takes him off again
 * (level 22's arrival dismount); `active` reflects whether he is currently
 * shown. */
export interface PassengerHandle {
  /** Re-pins Caleb behind Gabby for this render frame (no-op while hidden).
   * Call once per GameScene.update(), after bike.update(). */
  update(): void;
  /** Reveals Caleb (level 12's pickup cutscene flips him on). Idempotent. */
  activate(): void;
  /** Hides Caleb again — the exact inverse of activate(), and the ONLY way he
   * ever leaves the bike: level 22's arrival cutscene (src/systems/arrival.ts)
   * calls it at the instant he DISMOUNTS at the party venue, and immediately
   * draws its own standing Caleb in his place. Idempotent, and `active` reads
   * false afterwards (so update() stops pinning a hidden sprite), exactly as if
   * he had never been activated. Cosmetic only — like the rest of this module it
   * touches no Matter body and no gameplay state; Caleb being "picked up" is
   * DERIVED from save progress (save.ts's deriveCalebPickedUp), never from this
   * flag, so hiding the sprite can't lose him. */
  hide(): void;
  /** True while Caleb is shown. */
  readonly active: boolean;
  /** Destroys the Caleb sprite. Call on level teardown/restart. */
  destroy(): void;
}

/**
 * Creates the persistent passenger. `opts.active` seeds visibility: true when
 * Caleb is already aboard at spawn (levels 13-22 / replays of >= 12), false on
 * levels < 12 and at the start of level 12 (its pickup cutscene calls
 * activate() mid-level).
 *
 * `scene` and `bike` are used purely as runtime handles (same contract as
 * createBike/createDecorations). No Matter body is created; the sprite is
 * visual-only, pinned to the bike each update().
 */
export function createPassenger(
  scene: Phaser.Scene,
  bike: BikeHandle,
  opts: { active: boolean }
): PassengerHandle {
  let active = opts.active;

  const sprite = scene.add
    .image(bike.chassis.position.x, bike.chassis.position.y, TEXTURE_KEYS.caleb)
    .setDepth(PASSENGER.depth)
    .setVisible(active);

  function update(): void {
    if (!active) return;
    // Chassis-local offset rotated into world space — mirrors bike.ts
    // syncSprites' rider block (read the compound body's position + angle).
    const angle = bike.angle;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    // Small independent vertical bob, applied in the chassis-local frame
    // (so it stays "vertical" relative to the leaning bike) before rotation.
    const bob = Math.sin((scene.time.now / PASSENGER.bobPeriodMs) * TWO_PI) * PASSENGER.bobAmplitudePx;
    const ox = PASSENGER.offsetX;
    const oy = PASSENGER.offsetY + bob;
    const { x, y } = bike.chassis.position;
    sprite.setPosition(x + ox * cos - oy * sin, y + ox * sin + oy * cos);
    sprite.setRotation(angle);
  }

  function activate(): void {
    if (active) return;
    active = true;
    sprite.setVisible(true);
    update();
  }

  function hide(): void {
    if (!active) return;
    active = false;
    sprite.setVisible(false);
  }

  function destroy(): void {
    sprite.destroy();
  }

  return {
    update,
    activate,
    hide,
    get active() {
      return active;
    },
    destroy,
  };
}
