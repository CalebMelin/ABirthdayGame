import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { TitleScene } from './scenes/TitleScene';
import { CharacterCreationScene } from './scenes/CharacterCreationScene';
import { LevelSelectScene } from './scenes/LevelSelectScene';
import { GameScene } from './scenes/GameScene';
import { LevelCompleteScene } from './scenes/LevelCompleteScene';
import { PartyScene } from './scenes/PartyScene';
import { CreditsScene } from './scenes/CreditsScene';
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
  scene: [
    BootScene,
    TitleScene,
    CharacterCreationScene,
    LevelSelectScene,
    GameScene,
    LevelCompleteScene,
    PartyScene,
    CreditsScene,
  ],
};

new Phaser.Game(config);
