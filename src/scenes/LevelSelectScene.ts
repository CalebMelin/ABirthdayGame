import Phaser from 'phaser';
import { DESIGN_WIDTH, PASTEL_BG_COLOR, PALETTE, DEPTHS, SCENE_KEYS, TEXTURE_KEYS, TOTAL_LEVELS } from '../systems/constants';
import { createPixelText, createPixelButton } from '../systems/ui';
import { getSave } from '../systems/save';

/** Grid layout constants — 6 columns x 4 rows (22 cells, last row has 4). */
const GRID_COLS = 6;
const CELL_W = 150;
const CELL_H = 110;
const FIRST_CELL_X = DESIGN_WIDTH / 2 - ((GRID_COLS - 1) * CELL_W) / 2;
const FIRST_ROW_Y = 220;

/** 22 numbered level buttons in a grid; locked levels greyed with a lock
 * badge, completed levels get a tulip badge. Reads fresh from the save
 * system every time this scene is entered. */
export class LevelSelectScene extends Phaser.Scene {
  constructor() {
    super(SCENE_KEYS.levelSelect);
  }

  create(): void {
    this.cameras.main.setBackgroundColor(PASTEL_BG_COLOR);

    const progress = getSave().loadProgress();

    createPixelText(this, DESIGN_WIDTH / 2, 96, 'Pick a level!', 40);

    for (let n = 1; n <= TOTAL_LEVELS; n++) {
      const col = (n - 1) % GRID_COLS;
      const row = Math.floor((n - 1) / GRID_COLS);
      const x = FIRST_CELL_X + col * CELL_W;
      const y = FIRST_ROW_Y + row * CELL_H;
      const locked = n > progress.highestUnlocked;

      createPixelButton(this, {
        x,
        y,
        label: String(n),
        minWidth: 96,
        onClick: () => {
          this.scene.start(SCENE_KEYS.game, { level: n });
        },
        disabled: locked,
      });

      if (locked) {
        this.addLockBadge(x + 40, y - 32);
      } else if (progress.completed[n - 1] === true) {
        this.add
          .image(x + 40, y - 32, TEXTURE_KEYS.tulip)
          .setScale(0.75)
          .setDepth(DEPTHS.ui + 1);
      }
    }

    createPixelButton(this, {
      x: 140,
      y: 656,
      label: '← back',
      onClick: () => {
        this.scene.start(SCENE_KEYS.title);
      },
    });
  }

  /** Tiny pixel lock icon: a filled body with a stroke-only shackle above
   * it, centered at (x, y). Used to mark locked level cells. */
  private addLockBadge(x: number, y: number): void {
    this.add
      .rectangle(x, y + 3, 16, 12, PALETTE.plum)
      .setDepth(DEPTHS.ui + 1);
    this.add
      .rectangle(x, y - 5, 12, 10, undefined)
      .setStrokeStyle(3, PALETTE.plum)
      .setDepth(DEPTHS.ui + 1);
  }
}
