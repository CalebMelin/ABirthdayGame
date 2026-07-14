import Phaser from 'phaser';
import { DESIGN_WIDTH, DESIGN_HEIGHT, PASTEL_BG_COLOR, TEXT_COLOR, SCENE_KEYS } from '../systems/constants';
import { addTempButton } from './tempButton';
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

    this.add
      .text(DESIGN_WIDTH / 2, DESIGN_HEIGHT / 2 - 80, `GameScene — Level ${this.level}`, {
        fontFamily: 'Courier New, monospace',
        fontSize: '40px',
        color: TEXT_COLOR,
        align: 'center',
      })
      .setOrigin(0.5);

    addTempButton(this, DESIGN_WIDTH / 2, DESIGN_HEIGHT / 2 + 40, 'next →', () => {
      this.scene.start(SCENE_KEYS.levelComplete, { level: this.level });
    });
  }
}
