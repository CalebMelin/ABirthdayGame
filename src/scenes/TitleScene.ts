import Phaser from 'phaser';
import { DESIGN_WIDTH, PASTEL_BG_COLOR, PALETTE, SCENE_KEYS, hexToCss } from '../systems/constants';
import { createPixelText, createPixelButton } from '../systems/ui';
import { getSave } from '../systems/save';

/** Shared min-width for the stacked Play / Edit Character buttons so they align. */
const MENU_BUTTON_MIN_WIDTH = 320;

/** Title screen: logo, Play (routes to character creation or level select
 * depending on save state), Edit Character, and a muted-music toggle
 * placeholder. */
export class TitleScene extends Phaser.Scene {
  /** In-memory only — no persistence and no real audio yet; PLAN-10 wires
   * up actual music and will presumably persist this. */
  private soundOn = true;
  private soundButton: Phaser.GameObjects.Container | undefined;

  constructor() {
    super(SCENE_KEYS.title);
  }

  create(): void {
    this.cameras.main.setBackgroundColor(PASTEL_BG_COLOR);

    // Logo: exact title text from NORTH_STAR.md — byte-exact, two "!!".
    // Drop shadow drawn first (behind), offset +4/+4 down-right per the
    // ui.ts shadow convention; coral face copy on top at the nominal anchor.
    createPixelText(this, DESIGN_WIDTH / 2 + 4, 200 + 4, 'Gabby is 22!!', 64).setColor(
      hexToCss(PALETTE.outline)
    );
    createPixelText(this, DESIGN_WIDTH / 2, 200, 'Gabby is 22!!', 64).setColor(
      hexToCss(PALETTE.coral)
    );

    createPixelButton(this, {
      x: DESIGN_WIDTH / 2,
      y: 400,
      label: 'Play',
      minWidth: MENU_BUTTON_MIN_WIDTH,
      onClick: () => {
        // CharacterCreationScene doesn't persist a character until PLAN-04,
        // so today this routes to CharacterCreation on every run — expected.
        const destination =
          getSave().loadCharacter() === null ? SCENE_KEYS.characterCreation : SCENE_KEYS.levelSelect;
        this.scene.start(destination);
      },
    });

    createPixelButton(this, {
      x: DESIGN_WIDTH / 2,
      y: 520,
      label: 'Edit Character',
      minWidth: MENU_BUTTON_MIN_WIDTH,
      onClick: () => {
        this.scene.start(SCENE_KEYS.characterCreation);
      },
    });

    this.renderSoundButton();
  }

  /** Placeholder muted-music toggle: flips an in-memory flag and swaps the
   * label. No persistence, no actual audio — PLAN-10 wires up real music.
   * The UI kit button has no setLabel API (deliberately deferred), so the
   * label swap is done by destroying and recreating the button in place. */
  private renderSoundButton(): void {
    this.soundButton?.destroy();

    this.soundButton = createPixelButton(this, {
      x: DESIGN_WIDTH - 140,
      y: 64,
      label: this.soundOn ? 'sound: on' : 'sound: off',
      onClick: () => {
        this.soundOn = !this.soundOn;
        this.renderSoundButton();
      },
    });
  }
}
