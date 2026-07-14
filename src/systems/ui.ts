// Tiny pixel-art UI kit shared by every menu scene.
// Three helpers only — see CLAUDE.md: no premature options-explosion.
import Phaser from 'phaser';
import {
  PALETTE,
  FONT_STACK_PIXEL,
  TEXT_COLOR,
  UI_MIN_TOUCH_PX,
  DEPTHS,
  snapFontSize,
} from './constants';

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
 * glyphs crisp instead of blurry at odd sizes.
 */
export function createPixelText(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  sizePx = 24
): Phaser.GameObjects.Text {
  return scene.add
    .text(Math.round(x), Math.round(y), text, {
      fontFamily: FONT_STACK_PIXEL,
      fontSize: `${snapFontSize(sizePx)}px`,
      color: TEXT_COLOR,
      align: 'center',
    })
    .setOrigin(0.5);
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

  container.on('pointerover', () => {
    face.setFillStyle(PALETTE.sunshine);
  });

  // Covers both plain hover-out and "dragged off while pressed" — Phaser
  // fires pointerout the moment the pointer leaves the hit area, before any
  // pointerup/pointerupoutside, so this always restores the pressed state.
  container.on('pointerout', restore);

  container.on('pointerdown', () => {
    face.y = SHADOW_OFFSET_PX;
    labelText.y = SHADOW_OFFSET_PX;
  });

  // Only fires while the pointer is still inside the hit area, i.e. a
  // genuine click/tap — releasing outside never reaches this listener.
  container.on('pointerup', () => {
    restore();
    onClick();
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
