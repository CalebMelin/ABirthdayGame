import Phaser from 'phaser';
import { SCENE_KEYS } from '../systems/constants';

/**
 * Trivial boot scene — immediately hands off to TitleScene.
 * The real loader (progress bar, generated textures) is a later task.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super(SCENE_KEYS.boot);
  }

  create(): void {
    this.scene.start(SCENE_KEYS.title);
  }
}
