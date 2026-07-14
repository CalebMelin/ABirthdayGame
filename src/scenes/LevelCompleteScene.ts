import Phaser from 'phaser';
import { DESIGN_WIDTH, DESIGN_HEIGHT, PASTEL_BG_COLOR, TOTAL_LEVELS, SCENE_KEYS } from '../systems/constants';
import { createPixelText, createPixelButton } from '../systems/ui';
import { getSave } from '../systems/save';
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
    // Minimal stub wiring so LevelSelect shows real, reload-surviving
    // progress (PLAN-01 acceptance criterion); the full level-complete flow
    // (notes, tulips) lands in PLAN-05/PLAN-08.
    getSave().markLevelCompleted(this.level);

    this.cameras.main.setBackgroundColor(PASTEL_BG_COLOR);

    createPixelText(this, DESIGN_WIDTH / 2, DESIGN_HEIGHT / 2 - 80, `Level ${this.level} complete!`, 32);

    createPixelButton(this, {
      x: DESIGN_WIDTH / 2,
      y: DESIGN_HEIGHT / 2 + 40,
      label: 'next →',
      onClick: () => {
        if (this.level < TOTAL_LEVELS) {
          this.scene.start(SCENE_KEYS.game, { level: this.level + 1 });
        } else {
          this.scene.start(SCENE_KEYS.party);
        }
      },
    });
  }
}
