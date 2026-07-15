import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { TitleScene } from './scenes/TitleScene';
import { CharacterCreationScene } from './scenes/CharacterCreationScene';
import { LevelSelectScene } from './scenes/LevelSelectScene';
import { GameScene } from './scenes/GameScene';
import { LevelCompleteScene } from './scenes/LevelCompleteScene';
import { PartyScene } from './scenes/PartyScene';
import { CreditsScene } from './scenes/CreditsScene';
import { DESIGN_WIDTH, DESIGN_HEIGHT, PASTEL_BG_COLOR, GRAVITY_Y } from './systems/constants';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'app',
  pixelArt: true,
  backgroundColor: PASTEL_BG_COLOR,
  physics: {
    default: 'matter',
    matter: {
      gravity: { x: 0, y: GRAVITY_Y },
      debug: false,
    },
  },
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

const game = new Phaser.Game(config);

// Dev-only: expose the game instance so browser-automation playtests
// (scripts/playtest-drive.mjs) can poll scene state / Matter body counts.
// import.meta.env.DEV is statically false in production builds, so Vite
// dead-code-eliminates this entire block from the deployed bundle.
if (import.meta.env.DEV) {
  (window as unknown as { __gabbyGame: Phaser.Game }).__gabbyGame = game;
}
