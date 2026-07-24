// Scene pixel-fade transitions (PLAN-10 ST-8 #7). Two tiny helpers over
// Phaser's built-in camera fade (chosen over a pooled overlay for robustness —
// the camera effect can never leave a stray GameObject behind, and fadeOut
// always completes on its timer). Both fade through PASTEL_BG_COLOR (the app
// chrome / letterbox color) so a fade-out into a fade-in is a seamless cross-
// fade and never a harsh black flash — cute, not seizure-y (the ST-8 mandate).
//
// WHY IT IS SAFE ACROSS THE FLOW:
//  - fadeInScene() is PURELY ADDITIVE: a camera overlay effect that never
//    blocks input, never delays the scene, and cannot create a dead-end or a
//    double-start. It is therefore applied to EVERY target scene, including the
//    finale/never-fail ones whose OUT transition deliberately stays a hard cut.
//  - transitionTo() replaces a hard-cut `scene.start` with a fade-out THEN the
//    same start. It is used only on the plain menu scenes (Title / Character
//    Creation / Level Select / Level Complete) — NEVER on GameScene's
//    finish/fail/arrival hand-offs, the finale Party->Credits, or the
//    `leaving`-latched Credits transitions, which keep their exact navigation
//    semantics (hard cut) and only gain a fade-IN on the incoming scene.
//  - transitionTo() carries its OWN re-entry latch (`__juiceLeaving`), so a
//    rapid double-press / two-finger tap can't queue two `scene.start`s — it
//    actually TIGHTENS the pre-existing project-wide double-start on menu
//    buttons (PROGRESS.md known issue) for every faded transition. The latch is
//    cleared by fadeInScene() on the next entry to that (reused) scene
//    instance, so a later return to the scene transitions normally.
//
// NO runtime-Phaser namespace use (only method/property calls on the scene
// handle), matching the leaf-module discipline; the string event name is used
// rather than the Phaser enum for the same reason.
import type Phaser from 'phaser';
import { JUICE, PALETTE } from './constants';

const FADE_R = (PALETTE.bgPink >> 16) & 0xff;
const FADE_G = (PALETTE.bgPink >> 8) & 0xff;
const FADE_B = PALETTE.bgPink & 0xff;

/** Phaser's Cameras.Scene2D.Events.FADE_OUT_COMPLETE string value (stable). */
const FADE_OUT_COMPLETE = 'camerafadeoutcomplete';

/**
 * Fade the incoming scene in from the pastel chrome color. Call once at the end
 * of a scene's create(). Purely additive (see module doc) — safe on any scene.
 * Also clears the transitionTo re-entry latch on this (reused) scene instance,
 * so a scene that both fades in AND uses transitionTo re-arms cleanly on every
 * entry.
 */
export function fadeInScene(scene: Phaser.Scene, durationMs = JUICE.transitionFadeMs): void {
  (scene as unknown as { __juiceLeaving?: boolean }).__juiceLeaving = false;
  scene.cameras.main.fadeIn(durationMs, FADE_R, FADE_G, FADE_B);
}

/**
 * Fade the current scene OUT (to the pastel chrome color), then hand off to
 * `key` with `data`. Re-entrant-safe: a second call while a fade is already in
 * flight is a no-op (the latch), so a double-press can't double-start.
 */
export function transitionTo(
  scene: Phaser.Scene,
  key: string,
  data?: object,
  durationMs = JUICE.transitionFadeMs
): void {
  const latch = scene as unknown as { __juiceLeaving?: boolean };
  if (latch.__juiceLeaving) return;
  latch.__juiceLeaving = true;
  const cam = scene.cameras.main;
  cam.once(FADE_OUT_COMPLETE, () => scene.scene.start(key, data));
  cam.fadeOut(durationMs, FADE_R, FADE_G, FADE_B);
}
