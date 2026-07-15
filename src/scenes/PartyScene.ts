import Phaser from 'phaser';
import { DESIGN_WIDTH, DESIGN_HEIGHT, PASTEL_BG_COLOR, SCENE_KEYS } from '../systems/constants';
import { createPixelText, createPixelButton } from '../systems/ui';

/**
 * Skeleton party scene — shows its name and a temp button to advance.
 *
 * FORWARD-NOTE (PLAN-04 task 4) for the later plan that builds this scene
 * out for real (NORTH_STAR §5: Gabby & Caleb arrive, named partygoers,
 * confetti): any Gabby/rider sprite this scene renders MUST be built through
 * the one-source-of-truth texture path —
 * `buildCharacterTextures(this, getSave().loadCharacter() ?? defaultCharacter())`
 * (`src/systems/characterTextures.ts`'s `buildCharacterTextures`,
 * `src/systems/save.ts`'s `getSave().loadCharacter()`, and
 * `src/data/characters.ts`'s `defaultCharacter()`) — the SAME call GameScene
 * (PLAN-04 task 4) and CharacterCreationScene's live preview (PLAN-04 task 3)
 * use, so the party's Gabby always matches the player's chosen look.
 *
 * Specifically for **Dallas** (NORTH_STAR §5: "sprite looks the same as the
 * Gabby character" — the intentional-twin joke): build Dallas's sprite from
 * that SAME resolved `CharacterConfig` (i.e. another
 * `buildCharacterTextures(this, config)` call, or reuse the already-built
 * `riderTextureKey`) — never a separately-authored or independently-colored
 * character.
 */
export class PartyScene extends Phaser.Scene {
  constructor() {
    super(SCENE_KEYS.party);
  }

  create(): void {
    this.cameras.main.setBackgroundColor(PASTEL_BG_COLOR);

    createPixelText(this, DESIGN_WIDTH / 2, DESIGN_HEIGHT / 2 - 80, 'PartyScene', 32);

    createPixelButton(this, {
      x: DESIGN_WIDTH / 2,
      y: DESIGN_HEIGHT / 2 + 40,
      label: 'next →',
      onClick: () => {
        this.scene.start(SCENE_KEYS.credits);
      },
    });
  }
}
