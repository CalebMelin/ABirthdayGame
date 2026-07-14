import Phaser from 'phaser';
import { DESIGN_WIDTH, DESIGN_HEIGHT, PASTEL_BG_COLOR, SCENE_KEYS } from '../systems/constants';
import { createPixelText, createPixelButton } from '../systems/ui';

/** Skeleton party scene — shows its name and a temp button to advance. */
export class PartyScene extends Phaser.Scene {
  constructor() {
    super(SCENE_KEYS.party);
  }

  create(): void {
    this.cameras.main.setBackgroundColor(PASTEL_BG_COLOR);

    createPixelText(this, DESIGN_WIDTH / 2, DESIGN_HEIGHT / 2 - 80, 'PartyScene', 32);

    createPixelButton(this, {
      x: DESIGN_WIDTH / 2,
      y: DESIGN_HEIGHT / 2 + 40,
      label: 'next →',
      onClick: () => {
        this.scene.start(SCENE_KEYS.credits);
      },
    });
  }
}
