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
//    double-start. It is applied at the end of create() on every PLAIN scene
//    (Title / Character Creation / Level Select / Level Complete / GameScene) so
//    an incoming scene fades UP from the pastel chrome. The two FINALE scenes —
//    PartyScene and CreditsScene — DELIBERATELY do NOT call it: their dusk
//    backdrop would show a pink FLASH on a fade-up-from-pink, so a transition
//    INTO the party (LevelComplete->Party, Title->Party) fades OUT to pink and
//    then HARD-CUTS to the finale — fade-out-then-cut, no fade-in, by design.
//    (Do NOT wire fadeInScene into Party/Credits; the missing fade-in is the
//    point, not an omission.)
//  - transitionTo() replaces a hard-cut `scene.start` with a fade-out THEN the
//    same start. Its CALLERS are only the plain menu scenes (Title / Character
//    Creation / Level Select / Level Complete) — NEVER GameScene's
//    finish/fail/arrival hand-offs, the finale Party->Credits, or the
//    `leaving`-latched Credits transitions, which keep their exact navigation
//    semantics (hard cut). Those incoming scenes gain a fade-IN only when they
//    are a plain scene that calls fadeInScene (LevelComplete on finish, GameScene
//    on a fail-restart); the finale scenes intentionally do not.
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
 * The re-entry latch decision, isolated so it is unit-testable without a scene:
 * a transitionTo() call may START a fade-out only when one is not already in
 * flight (`__juiceLeaving` unset/false). This is what makes a rapid double-press
 * a single start — the SECOND call, seeing the latch set, is a no-op. Pure.
 */
export function shouldStartTransition(alreadyLeaving: boolean | undefined): boolean {
  return !alreadyLeaving;
}

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
  if (!shouldStartTransition(latch.__juiceLeaving)) return;
  latch.__juiceLeaving = true;
  const cam = scene.cameras.main;
  cam.once(FADE_OUT_COMPLETE, () => scene.scene.start(key, data));
  cam.fadeOut(durationMs, FADE_R, FADE_G, FADE_B);
}
