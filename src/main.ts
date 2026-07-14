import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { DESIGN_WIDTH, DESIGN_HEIGHT, PASTEL_BG_COLOR } from './systems/constants';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'app',
  pixelArt: true,
  backgroundColor: PASTEL_BG_COLOR,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    autoRound: true,
    width: DESIGN_WIDTH,
    height: DESIGN_HEIGHT,
  },
  scene: [BootScene],
};

new Phaser.Game(config);
