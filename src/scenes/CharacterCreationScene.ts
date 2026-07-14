import Phaser from 'phaser';
import { DESIGN_WIDTH, DESIGN_HEIGHT, PASTEL_BG_COLOR, TEXT_COLOR, SCENE_KEYS } from '../systems/constants';
import { addTempButton } from './tempButton';

/** Skeleton character creation scene — shows its name and a temp button to advance. */
export class CharacterCreationScene extends Phaser.Scene {
  constructor() {
    super(SCENE_KEYS.characterCreation);
  }

  create(): void {
    this.cameras.main.setBackgroundColor(PASTEL_BG_COLOR);

    this.add
      .text(DESIGN_WIDTH / 2, DESIGN_HEIGHT / 2 - 80, 'CharacterCreationScene', {
        fontFamily: 'Courier New, monospace',
        fontSize: '40px',
        color: TEXT_COLOR,
        align: 'center',
      })
      .setOrigin(0.5);

    addTempButton(this, DESIGN_WIDTH / 2, DESIGN_HEIGHT / 2 + 40, 'next →', () => {
      this.scene.start(SCENE_KEYS.levelSelect);
    });
  }
}
