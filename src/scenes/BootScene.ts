import Phaser from 'phaser';
import { SCENE_KEYS } from '../systems/constants';
import { loadPixelFont } from '../systems/fonts';

/**
 * Trivial boot scene — waits for the pixel font (or its timeout) then hands
 * off to TitleScene. The real loader (progress bar, generated textures) is a
 * later task.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super(SCENE_KEYS.boot);
  }

  create(): void {
    void loadPixelFont().then(() => {
      this.scene.start(SCENE_KEYS.title);
    });
  }
}
