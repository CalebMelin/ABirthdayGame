import Phaser from 'phaser';
import { DESIGN_WIDTH, DESIGN_HEIGHT, PASTEL_BG_COLOR, SCENE_KEYS } from '../systems/constants';
import { createPixelText, createPixelButton } from '../systems/ui';

/** Skeleton credits scene — shows its name and a temp button back to title. */
export class CreditsScene extends Phaser.Scene {
  constructor() {
    super(SCENE_KEYS.credits);
  }

  create(): void {
    this.cameras.main.setBackgroundColor(PASTEL_BG_COLOR);

    createPixelText(this, DESIGN_WIDTH / 2, DESIGN_HEIGHT / 2 - 80, 'CreditsScene', 32);

    createPixelButton(this, {
      x: DESIGN_WIDTH / 2,
      y: DESIGN_HEIGHT / 2 + 40,
      label: 'back to title →',
      onClick: () => {
        this.scene.start(SCENE_KEYS.title);
      },
    });
  }
}
