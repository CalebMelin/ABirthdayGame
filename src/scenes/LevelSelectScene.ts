import Phaser from 'phaser';
import { DESIGN_WIDTH, DESIGN_HEIGHT, PASTEL_BG_COLOR, SCENE_KEYS } from '../systems/constants';
import { createPixelText, createPixelButton } from '../systems/ui';

/** Skeleton level select scene — shows its name and a temp button to advance. */
export class LevelSelectScene extends Phaser.Scene {
  constructor() {
    super(SCENE_KEYS.levelSelect);
  }

  create(): void {
    this.cameras.main.setBackgroundColor(PASTEL_BG_COLOR);

    createPixelText(this, DESIGN_WIDTH / 2, DESIGN_HEIGHT / 2 - 80, 'LevelSelectScene', 32);

    createPixelButton(this, {
      x: DESIGN_WIDTH / 2,
      y: DESIGN_HEIGHT / 2 + 40,
      label: 'next →',
      onClick: () => {
        this.scene.start(SCENE_KEYS.game, { level: 1 });
      },
    });
  }
}
