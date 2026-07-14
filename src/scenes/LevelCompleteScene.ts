import Phaser from 'phaser';
import { DESIGN_WIDTH, DESIGN_HEIGHT, PASTEL_BG_COLOR, TEXT_COLOR, TOTAL_LEVELS, SCENE_KEYS } from '../systems/constants';
import { addTempButton } from './tempButton';
import { normalizeLevel } from './types';
import type { LevelSceneData } from './types';

/** Skeleton level-complete scene — shows the completed level and advances
 * to the next level, or to PartyScene after the final level. */
export class LevelCompleteScene extends Phaser.Scene {
  private level = 1;

  constructor() {
    super(SCENE_KEYS.levelComplete);
  }

  init(data: LevelSceneData): void {
    this.level = normalizeLevel(data.level);
  }

  create(): void {
    this.cameras.main.setBackgroundColor(PASTEL_BG_COLOR);

    this.add
      .text(DESIGN_WIDTH / 2, DESIGN_HEIGHT / 2 - 80, `Level ${this.level} complete!`, {
        fontFamily: 'Courier New, monospace',
        fontSize: '40px',
        color: TEXT_COLOR,
        align: 'center',
      })
      .setOrigin(0.5);

    addTempButton(this, DESIGN_WIDTH / 2, DESIGN_HEIGHT / 2 + 40, 'next →', () => {
      if (this.level < TOTAL_LEVELS) {
        this.scene.start(SCENE_KEYS.game, { level: this.level + 1 });
      } else {
        this.scene.start(SCENE_KEYS.party);
      }
    });
  }
}
