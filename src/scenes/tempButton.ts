// TEMPORARY — replaced by the pixel UI kit in PLAN-01 Task 5 (UI kit task).
import Phaser from 'phaser';
import { PALETTE, TEXT_COLOR, hexToCss } from '../systems/constants';

/** Adds a clickable temp text "button" — monospace label on a pastel panel. */
export function addTempButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  label: string,
  onClick: () => void
): Phaser.GameObjects.Text {
  return scene.add
    .text(x, y, label, {
      fontFamily: 'Courier New, monospace',
      fontSize: '28px',
      color: TEXT_COLOR,
      backgroundColor: hexToCss(PALETTE.cream),
      padding: { x: 24, y: 12 },
    })
    .setOrigin(0.5)
    .setInteractive({ useHandCursor: true })
    .on('pointerdown', onClick);
}
