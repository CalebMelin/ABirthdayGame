import Phaser from 'phaser';
import { DESIGN_WIDTH, PASTEL_BG_COLOR, PALETTE, SCENE_KEYS, hexToCss } from '../systems/constants';
import { createPixelText, createPixelButton } from '../systems/ui';
import { getSave, hasBeatenGame } from '../systems/save';
import { getAudio } from '../systems/audio';

/** Shared min-width for the stacked Play / Edit Character / Party buttons so
 * they align. */
const MENU_BUTTON_MIN_WIDTH = 320;

/** Title screen: logo, Play (routes to character creation or level select
 * depending on save state), Edit Character, a post-game "Party" revisit button
 * shown ONLY once the game is beaten, and a muted-music toggle placeholder. */
export class TitleScene extends Phaser.Scene {
  private soundButton: Phaser.GameObjects.Container | undefined;

  constructor() {
    super(SCENE_KEYS.title);
  }

  create(): void {
    this.cameras.main.setBackgroundColor(PASTEL_BG_COLOR);

    // Gentle title-music loop (PLAN-10 ST-7a proof). It is scheduled now but
    // stays silent until the first user gesture unlocks the AudioContext (mobile
    // autoplay policy) — and stays silent if the game is muted. Stopped on
    // shutdown so it never bleeds into the next scene or stacks on a re-entry.
    getAudio().playMusic('title');
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      getAudio().stopMusic();
    });

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
        // First run (no gabby22.character saved yet) routes to Character
        // Creation so the player picks a look before playing. Once a
        // character has been saved — CharacterCreationScene persists on
        // every swatch tap / Randomize / "Let's ride!" (PLAN-04 tasks 3-4)
        // — later runs of "Play" skip straight to Level Select. "Edit
        // Character" below always returns to Character Creation regardless
        // of save state.
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

    // Post-game revisit: once the game is beaten (level 22 completed, which
    // GameScene marks at the arrival hand-off — see save.ts's hasBeatenGame), a
    // "Party" button joins the stack directly below Edit Character so the whole
    // party -> credits finale can be replayed from the Title anytime. Absent
    // before then, so the menu simply reads Play / Edit Character with no gap.
    if (hasBeatenGame(getSave().loadProgress())) {
      createPixelButton(this, {
        x: DESIGN_WIDTH / 2,
        y: 640,
        // Balloon emoji U+1F388 via escape (ASCII-only source rule); it renders
        // through the system emoji font behind the pixel-font stack, the same
        // way the party toast's tulip and the credits tally's glyphs do.
        label: 'Party \u{1F388}',
        minWidth: MENU_BUTTON_MIN_WIDTH,
        onClick: () => {
          this.scene.start(SCENE_KEYS.party);
        },
      });
    }

    this.renderSoundButton();
  }

  /** Muted-music toggle, wired to the real audio engine (PLAN-10 ST-7a). The
   * label reflects the PERSISTED muted state (getAudio().isMuted(), initialized
   * from getSave().getMuted()); tapping calls getAudio().setMuted(...) which
   * flips master gain to 0/target AND persists via gabby22.muted. The UI kit
   * button has no setLabel API (deliberately deferred), so the label swap is
   * done by destroying and recreating the button in place. */
  private renderSoundButton(): void {
    this.soundButton?.destroy();

    const muted = getAudio().isMuted();
    this.soundButton = createPixelButton(this, {
      x: DESIGN_WIDTH - 140,
      y: 64,
      label: muted ? 'sound: off' : 'sound: on',
      onClick: () => {
        getAudio().setMuted(!getAudio().isMuted());
        this.renderSoundButton();
      },
    });
  }
}
