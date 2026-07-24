// Tiny pixel-art UI kit shared by every menu scene.
// Three helpers only — see CLAUDE.md: no premature options-explosion.
//
// This file keeps a RUNTIME `import Phaser from 'phaser'` (below) — needed
// only by createPixelButton's `Phaser.Geom.Rectangle` hit-area construction —
// so it can never be imported by a module that must stay Node/Vitest-safe.
// createPixelText's own implementation lives in ./pixelText.ts (an
// import-safe extraction, PLAN-07 task 3 code-review fix) precisely so OTHER
// modules can reuse it without inheriting that runtime Phaser dependency;
// this function is now a thin delegating wrapper that keeps its own exported
// name/signature stable for existing callers.
import Phaser from 'phaser';
import { PALETTE, UI_MIN_TOUCH_PX, DEPTHS } from './constants';
import { pixelText } from './pixelText';
import { getAudio } from './audio';

/** Drop-shadow offset for the chunky pixel button/panel look, and the
 * distance a button's face travels when pressed onto its shadow. */
const SHADOW_OFFSET_PX = 4;

/** Outline stroke width for button/panel faces. */
const OUTLINE_WIDTH_PX = 3;

/** Horizontal padding (each side) between a button's label and its edges. */
const BUTTON_PADDING_X_PX = 32;

/**
 * Creates centered pixel-font text using the project's pixel font stack.
 *
 * Press Start 2P is designed on an 8px grid, so `sizePx` is clamped/rounded
 * to the nearest multiple of 8 (minimum 8) via snapFontSize — this keeps
 * glyphs crisp instead of blurry at odd sizes. Delegates to the shared
 * ./pixelText helper (identical rendering: no lineSpacing override, matching
 * this function's own pre-extraction behavior).
 */
export function createPixelText(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  sizePx = 24
): Phaser.GameObjects.Text {
  return pixelText(scene, x, y, text, sizePx);
}

/** Options for {@link createPixelButton}. */
export interface PixelButtonOptions {
  x: number;
  y: number;
  label: string;
  onClick: () => void;
  /** Minimum face width in px; the face still grows to fit the label and
   * never shrinks below UI_MIN_TOUCH_PX. */
  minWidth?: number;
  /** When true, renders the button greyed-out and skips setInteractive and
   * all pointer handlers entirely — a truly inert locked-level cell, not
   * just a dimmed one that still hovers/clicks. */
  disabled?: boolean;
}

/**
 * Creates a chunky pixel-art button: a dark drop-shadow rect, a cream face
 * rect with an outline, and a centered label — all inside one Container
 * positioned at (x, y).
 *
 * Interaction: hover tints the face sunshine-yellow; pressing shifts the
 * face down onto the shadow for a tactile "pushed" look; releasing while
 * still over the button restores it and fires `onClick`; moving off while
 * pressed (or releasing elsewhere) restores it without firing.
 */
export function createPixelButton(
  scene: Phaser.Scene,
  opts: PixelButtonOptions
): Phaser.GameObjects.Container {
  const { x, y, label, onClick, minWidth, disabled } = opts;

  const labelText = createPixelText(scene, 0, 0, label);
  // labelText.width is read synchronously — correct because BootScene's
  // font-gate (loadPixelFont) resolves the pixel font before any menu scene.
  const width = Math.max(labelText.width + BUTTON_PADDING_X_PX * 2, minWidth ?? 0, UI_MIN_TOUCH_PX);
  const height = UI_MIN_TOUCH_PX;

  const shadow = scene.add.rectangle(0, SHADOW_OFFSET_PX, width, height, PALETTE.outline).setOrigin(0.5);

  const face = scene.add
    .rectangle(0, 0, width, height, PALETTE.cream)
    .setOrigin(0.5)
    .setStrokeStyle(OUTLINE_WIDTH_PX, PALETTE.outline);

  const container = scene.add.container(Math.round(x), Math.round(y), [shadow, face, labelText]);
  container.setDepth(DEPTHS.ui);

  if (disabled) {
    container.setAlpha(0.55);
    return container;
  }

  // The hit area lives on the CONTAINER with static geometry (container
  // local space, (0,0) at its center) — NOT on the face rect, which shifts
  // +4px while pressed and would otherwise drag the hit shape with it and
  // drop the pointer mid-press. Only the face/label visuals move on press.
  // Do NOT call setSize() on this container: a non-zero container size gives
  // it a displayOrigin of size/2, which Phaser adds to the local point before
  // hit-testing — silently shifting this rect by (+w/2, +h/2).
  container.setInteractive({
    hitArea: new Phaser.Geom.Rectangle(-width / 2, -height / 2, width, height),
    hitAreaCallback: Phaser.Geom.Rectangle.Contains,
    useHandCursor: true,
  });

  const restore = (): void => {
    face.setFillStyle(PALETTE.cream);
    face.y = 0;
    labelText.y = 0;
  };

  /**
   * Pointer ids that pressed DOWN on this button and have not left or been
   * released yet. `pointerup` only fires `onClick` for a pointer in here, so a
   * press that began somewhere else and merely ENDED over this button cannot
   * activate it.
   *
   * WHY THIS EXISTS (PLAN-09 ST-4 code review, browser-reproduced): Phaser's
   * GAMEOBJECT_UP fires for whatever the pointer is over at release, regardless
   * of where it went down. Without this latch EVERY button in the game was
   * activatable by pressing empty space and releasing over it — including a
   * button that only APPEARED during the hold. Measured on the credits screen,
   * whose two buttons build ~3.2s in, in the lower-centre of the screen where a
   * phone thumb rests: a 300ms hold did nothing, a 420ms hold (past
   * CREDITS.tailFadeMs) skipped the reveal AND fired "Play again?", ejecting the
   * player off the last screen of the gift. Fixed HERE rather than in that scene
   * because it was never that scene's bug.
   *
   * KEYED PER POINTER, not a single boolean, so multi-touch semantics are
   * unchanged: two fingers that each press and release on the same button still
   * produce two `onClick`s exactly as before. That matters because the scenes'
   * own double-press guards (PartyScene/CreditsScene's `leaving` latch) are
   * built for precisely that case, and collapsing it here would quietly make
   * those guards — and the harness checks that prove them — untestable.
   * `pointer.id` is the same idiom partyBalloons.ts's press dedupe uses.
   */
  const pressedPointers = new Set<number>();

  container.on('pointerover', () => {
    face.setFillStyle(PALETTE.sunshine);
  });

  // Covers both plain hover-out and "dragged off while pressed" — Phaser
  // fires pointerout the moment the pointer leaves the hit area, before any
  // pointerup/pointerupoutside, so this always restores the pressed state
  // AND drops that pointer's claim (dragging off then back on must not arm it
  // again without a fresh press).
  container.on('pointerout', (pointer: Phaser.Input.Pointer) => {
    pressedPointers.delete(pointer.id);
    restore();
  });

  container.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
    pressedPointers.add(pointer.id);
    face.y = SHADOW_OFFSET_PX;
    labelText.y = SHADOW_OFFSET_PX;
  });

  // Fires only while the pointer is still inside the hit area (releasing
  // outside never reaches this listener) AND only if that same pointer pressed
  // down here first — see pressedPointers.
  container.on('pointerup', (pointer: Phaser.Input.Pointer) => {
    const wasPressedHere = pressedPointers.delete(pointer.id);
    restore();
    if (wasPressedHere) {
      // Soft menu-button blip (PLAN-10 ST-7a). Fired BEFORE onClick so the click
      // is heard even when onClick transitions scenes (the audio engine is a
      // module-level singleton, independent of any scene's lifetime). Fully
      // guarded + a no-op while muted / before the first gesture unlocks audio.
      getAudio().playSfx('click');
      onClick();
    }
  });

  return container;
}

/**
 * Creates a static pixel-art panel: a dark drop-shadow rect behind a cream
 * face rect with an outline, sized (width, height) and centered at (x, y).
 * No interactivity — purely a backdrop for other content.
 */
export function createPixelPanel(
  scene: Phaser.Scene,
  x: number,
  y: number,
  width: number,
  height: number
): Phaser.GameObjects.Container {
  const shadow = scene.add.rectangle(0, SHADOW_OFFSET_PX, width, height, PALETTE.outline).setOrigin(0.5);

  const face = scene.add
    .rectangle(0, 0, width, height, PALETTE.cream)
    .setOrigin(0.5)
    .setStrokeStyle(OUTLINE_WIDTH_PX, PALETTE.outline);

  const container = scene.add.container(Math.round(x), Math.round(y), [shadow, face]);
  container.setDepth(DEPTHS.ui);

  return container;
}
