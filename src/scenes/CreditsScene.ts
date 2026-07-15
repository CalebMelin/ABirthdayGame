import Phaser from 'phaser';
import { DESIGN_WIDTH, DESIGN_HEIGHT, PASTEL_BG_COLOR, SCENE_KEYS } from '../systems/constants';
import { createPixelText, createPixelButton } from '../systems/ui';

/**
 * Skeleton credits scene — shows its name and a temp button back to title.
 *
 * FORWARD-NOTE (PLAN-04 task 4) for the later plan that builds this scene
 * out for real: if it ever renders a Gabby/rider sprite, it MUST be built
 * through the one-source-of-truth texture path —
 * `buildCharacterTextures(this, getSave().loadCharacter() ?? defaultCharacter())`
 * (`src/systems/characterTextures.ts`'s `buildCharacterTextures`,
 * `src/systems/save.ts`'s `getSave().loadCharacter()`, and
 * `src/data/characters.ts`'s `defaultCharacter()`) — the SAME call GameScene
 * (PLAN-04 task 4) and CharacterCreationScene's live preview (PLAN-04 task 3)
 * use, so any credits artwork matches the player's chosen look.
 */
export class CreditsScene extends Phaser.Scene {
  constructor() {
    super(SCENE_KEYS.credits);
  }

  create(): void {
    this.cameras.main.setBackgroundColor(PASTEL_BG_COLOR);

    createPixelText(this, DESIGN_WIDTH / 2, DESIGN_HEIGHT / 2 - 80, 'CreditsScene', 32);

    createPixelButton(this, {
      x: DESIGN_WIDTH / 2,
      y: DESIGN_HEIGHT / 2 + 40,
      label: 'back to title →',
      onClick: () => {
        this.scene.start(SCENE_KEYS.title);
      },
    });
  }
}
