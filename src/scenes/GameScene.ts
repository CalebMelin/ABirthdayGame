import Phaser from 'phaser';
import { DESIGN_WIDTH, DESIGN_HEIGHT, PASTEL_BG_COLOR, SCENE_KEYS } from '../systems/constants';
import { createPixelText, createPixelButton } from '../systems/ui';
import { normalizeLevel } from './types';
import type { LevelSceneData } from './types';

/** Skeleton game scene — shows the current level number and a temp button to advance. */
export class GameScene extends Phaser.Scene {
  private level = 1;

  constructor() {
    super(SCENE_KEYS.game);
  }

  init(data: LevelSceneData): void {
    this.level = normalizeLevel(data.level);
  }

  create(): void {
    this.cameras.main.setBackgroundColor(PASTEL_BG_COLOR);

    createPixelText(this, DESIGN_WIDTH / 2, DESIGN_HEIGHT / 2 - 80, `GameScene — Level ${this.level}`, 32);

    createPixelButton(this, {
      x: DESIGN_WIDTH / 2,
      y: DESIGN_HEIGHT / 2 + 40,
      label: 'next →',
      onClick: () => {
        this.scene.start(SCENE_KEYS.levelComplete, { level: this.level });
      },
    });
  }
}
