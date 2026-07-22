// The real level-complete congratulations screen (PLAN-08 task 1 —
// NORTH_STAR §4/§6). Shown after finishing every level 1..21 (GameScene skips
// straight to PartyScene on level 22, and marks progress itself, so this scene
// no longer marks completion — it only DISPLAYS). It renders, top to bottom:
//   - a "Level N complete!! 🎉" header,
//   - a cheerful confetti burst (the SHARED systems/confetti.ts burst pool,
//     behind the content, self-cleaning),
//   - the tulips EARNED THIS LEVEL + the persistent bouquet TOTAL,
//   - a pixel-postcard NOTE CARD ("Did you know?" for facts / "Psst… 💡" for
//     hints) whose note text reveals with a skippable TYPEWRITER effect,
//   - buttons: "Next level →" (primary, big), "Replay", "Level select".
//
// It CONSUMES the notes engine (systems/notes.ts's selectNote) for the note
// and the save system (getSave().getTulips()) for the counts — never
// re-implementing either. "Earned this level" is `currentTotal - tulipsAtStart`
// where tulipsAtStart is GameScene's snapshot at the level's fresh start,
// passed in via LevelSceneData.tulipsAtStart; this correctly counts awards that
// persisted at any point up to the finish hand-off, including during a
// finish-finale hold (see tricks.ts's note that awards can land after the run's
// `ended` flag flips true, right up to scene shutdown).
//
// A plain (non-Matter) menu scene at camera zoom 1 like TitleScene/
// LevelSelectScene — ZERO Matter bodies, NO zoom compensation. All tunable
// numbers live in constants.ts's LEVEL_COMPLETE block.
import Phaser from 'phaser';
import {
  DESIGN_WIDTH,
  PASTEL_BG_COLOR,
  DEPTHS,
  SCENE_KEYS,
  TEXTURE_KEYS,
  TOTAL_LEVELS,
  LEVEL_COMPLETE,
} from '../systems/constants';
import { createPixelText, createPixelButton, createPixelPanel } from '../systems/ui';
import { createConfettiBurst } from '../systems/confetti';
import type { ConfettiBurstHandle } from '../systems/confetti';
import { getSave } from '../systems/save';
import { selectNote } from '../systems/notes';
import type { NoteStyle } from '../data/notes';
import { normalizeLevel } from './types';
import type { LevelSceneData } from './types';

/** Party-popper emoji (U+1F389) in the "Level N complete!! 🎉" header. */
const HEADER_EMOJI = '\u{1F389}';

/** Note-card title for a FACT-style note (the cheerful trivia card). */
const CARD_TITLE_FACT = 'Did you know?';

/** Note-card title for a HINT-style note (the whisper card). The ellipsis is
 * U+2026 and the light-bulb is U+1F4A1, both encoded so a re-save can't mangle
 * them (mirrors data/notes.ts's escaped-emoji discipline). Renders as
 * "Psst… 💡". */
const CARD_TITLE_HINT = 'Psst\u{2026} \u{1F4A1}';

/** DEV-only live snapshot the browser playtest harness
 * (scripts/playtest-levelcomplete.mjs) reads off the scene to assert the
 * header/note/tulips/typewriter/buttons (stripped from prod builds via
 * import.meta.env.DEV, same pattern as tricks.ts's __tricks). */
interface LevelCompleteDebug {
  level: number;
  headerText: string;
  cardTitle: string;
  /** The RAW note text selectNote returned (pristine — the card word-wraps it
   * for layout but never alters its content). */
  noteText: string;
  noteStyle: NoteStyle;
  earned: number;
  total: number;
  /** The word-wrapped note (with '\n's) the typewriter reveals toward. */
  fullWrappedText: string;
  /** The body Text object's CURRENT visible string (grows as it reveals). */
  revealedText: () => string;
  /** Visible length in CODE POINTS (so an emoji counts as one). */
  revealedLength: () => number;
  typewriterComplete: () => boolean;
  nextButtonPos: { x: number; y: number };
  replayButtonPos: { x: number; y: number };
  levelSelectButtonPos: { x: number; y: number };
}

export class LevelCompleteScene extends Phaser.Scene {
  private level = 1;
  /** GameScene's tulip-total snapshot at this level's fresh start (from
   * LevelSceneData); `earned = max(0, currentTotal - this)`. */
  private tulipsAtStart = 0;

  // --- typewriter state ---
  private bodyText: Phaser.GameObjects.Text | undefined;
  /** The wrapped note split into code points (emoji-safe reveal units). */
  private revealUnits: string[] = [];
  private revealElapsedMs = 0;
  private revealComplete = false;

  /** The shared confetti system's burst pool (systems/confetti.ts) — created
   * per entry, fired once, destroyed on shutdown. This scene used to carry its
   * own private ConfettiPiece/spawnConfetti/updateConfetti; PLAN-09 ST-2 needed
   * the very same integrator for the party balloons' pop puffs and both finale
   * scenes' continuous rain, so it was extracted rather than copied a fourth
   * time (see confetti.ts's module doc). The knobs are still this scene's own
   * LEVEL_COMPLETE.confetti* values, untouched. */
  private confetti: ConfettiBurstHandle | undefined;

  constructor() {
    super(SCENE_KEYS.levelComplete);
  }

  init(data: LevelSceneData): void {
    this.level = normalizeLevel(data.level);
    this.tulipsAtStart = data.tulipsAtStart ?? 0;
  }

  create(): void {
    // Per-entry reset — Phaser reuses the scene instance across scene.start(),
    // so fields must be reset here (same discipline as GameScene.create()).
    this.confetti = undefined;
    this.revealUnits = [];
    this.revealElapsedMs = 0;
    this.revealComplete = false;
    this.bodyText = undefined;

    this.cameras.main.setBackgroundColor(PASTEL_BG_COLOR);
    const cx = DESIGN_WIDTH / 2;

    // Tulips: read once. `earned` counts every award persisted up to now
    // (including during a finish-finale hold) — see the class doc.
    const total = getSave().getTulips();
    const earned = Math.max(0, total - this.tulipsAtStart);

    // Confetti first, at DEPTHS.fx (behind the header/tally/card/buttons at
    // DEPTHS.ui) so it never obscures the text it celebrates. One upward fan
    // burst from just under the header — the pool is sized to exactly one burst
    // (concurrentBursts defaults to 1) because that is all this scene ever
    // fires.
    this.confetti = createConfettiBurst(this, {
      count: LEVEL_COMPLETE.confettiCount,
      originSpreadXPx: LEVEL_COMPLETE.confettiOriginSpreadXPx,
      speedMinPxPerSec: LEVEL_COMPLETE.confettiSpeedMinPxPerSec,
      speedMaxPxPerSec: LEVEL_COMPLETE.confettiSpeedMaxPxPerSec,
      launchSpreadRad: LEVEL_COMPLETE.confettiLaunchSpreadRad,
      gravityPxPerSec2: LEVEL_COMPLETE.confettiGravityPxPerSec2,
      spinMaxRadPerSec: LEVEL_COMPLETE.confettiSpinMaxRadPerSec,
      lifetimeMinMs: LEVEL_COMPLETE.confettiLifetimeMinMs,
      lifetimeMaxMs: LEVEL_COMPLETE.confettiLifetimeMaxMs,
      sizeMinPx: LEVEL_COMPLETE.confettiSizeMinPx,
      sizeMaxPx: LEVEL_COMPLETE.confettiSizeMaxPx,
      fadeStartFrac: LEVEL_COMPLETE.confettiFadeStartFrac,
      depth: DEPTHS.fx,
    });
    this.confetti.burst(cx, LEVEL_COMPLETE.confettiOriginY);

    // Header.
    const headerText = `Level ${this.level} complete!! ${HEADER_EMOJI}`;
    createPixelText(this, cx, LEVEL_COMPLETE.headerY, headerText, LEVEL_COMPLETE.headerFontSizePx).setDepth(
      DEPTHS.ui
    );

    // Tulip tally: earned this level, then the bouquet total.
    this.renderTulipRow(
      cx,
      LEVEL_COMPLETE.tulipEarnedY,
      earned > 0 ? `x${earned} this level!` : 'No tulips this level',
      earned === 0
    );
    this.renderTulipRow(cx, LEVEL_COMPLETE.tulipTotalY, `Bouquet: ${total}`, false);

    // Note card (consumes the notes engine) + typewriter.
    const note = selectNote(this.level, getSave());
    const cardTitle = note.style === 'hint' ? CARD_TITLE_HINT : CARD_TITLE_FACT;
    const wrapped = this.buildNoteCard(cx, cardTitle, note.text);

    // Buttons. "Next level →" is the big primary action, alone on its row;
    // Replay + Level select share the row below it.
    const nextButtonPos = { x: cx, y: LEVEL_COMPLETE.primaryButtonY };
    createPixelButton(this, {
      x: nextButtonPos.x,
      y: nextButtonPos.y,
      label: 'Next level →',
      minWidth: LEVEL_COMPLETE.primaryButtonMinWidthPx,
      onClick: () => this.goNext(),
    });

    const replayButtonPos = {
      x: cx - LEVEL_COMPLETE.secondaryButtonOffsetXPx,
      y: LEVEL_COMPLETE.secondaryButtonY,
    };
    createPixelButton(this, {
      x: replayButtonPos.x,
      y: replayButtonPos.y,
      label: 'Replay',
      minWidth: LEVEL_COMPLETE.secondaryButtonMinWidthPx,
      onClick: () => this.scene.start(SCENE_KEYS.game, { level: this.level }),
    });

    const levelSelectButtonPos = {
      x: cx + LEVEL_COMPLETE.secondaryButtonOffsetXPx,
      y: LEVEL_COMPLETE.secondaryButtonY,
    };
    createPixelButton(this, {
      x: levelSelectButtonPos.x,
      y: levelSelectButtonPos.y,
      label: 'Level select',
      minWidth: LEVEL_COMPLETE.secondaryButtonMinWidthPx,
      onClick: () => this.scene.start(SCENE_KEYS.levelSelect),
    });

    // Tap/click ANYWHERE instantly reveals the full note (impatient players
    // shouldn't be forced to wait). Fires alongside a button's own handler when
    // a button is tapped — harmless, the scene is transitioning away anyway.
    this.input.on(Phaser.Input.Events.POINTER_DOWN, this.skipTypewriter, this);

    // Explicit teardown: remove the scene-input listener re-added every create()
    // (so it can't stack across re-entries) and destroy any confetti still
    // flying if the player leaves early.
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.off(Phaser.Input.Events.POINTER_DOWN, this.skipTypewriter, this);
      this.confetti?.destroy();
      this.confetti = undefined;
      this.bodyText = undefined;
    });

    // DEV-only live snapshot for the browser harness (dead-code-eliminated from
    // prod builds via import.meta.env.DEV, same as tricks.ts's __tricks).
    if (import.meta.env.DEV) {
      (this as unknown as { __levelComplete?: LevelCompleteDebug }).__levelComplete = {
        level: this.level,
        headerText,
        cardTitle,
        noteText: note.text,
        noteStyle: note.style,
        earned,
        total,
        fullWrappedText: wrapped,
        revealedText: () => this.bodyText?.text ?? '',
        revealedLength: () => Array.from(this.bodyText?.text ?? '').length,
        typewriterComplete: () => this.revealComplete,
        nextButtonPos,
        replayButtonPos,
        levelSelectButtonPos,
      };
    }
  }

  update(_time: number, delta: number): void {
    this.confetti?.update(delta);
    this.updateTypewriter(delta);
  }

  // --------------------------------------------------------------- next
  /** "Next level →": to the next level's GameScene. Defensive guard — GameScene
   * skips this scene on level 22, so LC's own level is always <= 21 in practice,
   * but a level-22 LC reached directly still routes sensibly (to the party).
   * Deliberately does NOT pass tulipsAtStart — that's a GameScene->LC value. */
  private goNext(): void {
    if (this.level >= TOTAL_LEVELS) {
      this.scene.start(SCENE_KEYS.party);
    } else {
      this.scene.start(SCENE_KEYS.game, { level: this.level + 1 });
    }
  }

  // -------------------------------------------------------- tulip tally
  /** One centered tally row: a tulip icon sprite + a label, as a group centered
   * on `cx`. `dim` fades the icon (used for the kind "No tulips this level"
   * case). */
  private renderTulipRow(cx: number, y: number, label: string, dim: boolean): void {
    const text = createPixelText(this, cx, y, label, LEVEL_COMPLETE.tulipFontSizePx).setDepth(DEPTHS.ui);
    const icon = this.add
      .image(0, y, TEXTURE_KEYS.tulip)
      .setScale(LEVEL_COMPLETE.tulipIconScale)
      .setDepth(DEPTHS.ui);
    if (dim) icon.setAlpha(0.4);

    // Center the [icon][gap][text] group on cx (text is created centered, so
    // read its width, then reposition both around the shared center).
    const iconW = icon.displayWidth;
    const groupW = iconW + LEVEL_COMPLETE.tulipIconGapPx + text.width;
    const leftEdge = cx - groupW / 2;
    icon.setX(leftEdge + iconW / 2);
    text.setX(leftEdge + iconW + LEVEL_COMPLETE.tulipIconGapPx + text.width / 2);
  }

  // ---------------------------------------------------------- note card
  /** Builds the pixel-postcard note card (panel + centered title + left-aligned
   * word-wrapped body) sized to fit `noteText`, positions everything around
   * LEVEL_COMPLETE.noteCardCenterY, then arms the typewriter (starting from an
   * empty body). Returns the pre-wrapped note (with '\n's) the reveal targets.
   *
   * The body is revealed from its PRE-WRAPPED form (fixed line breaks) so the
   * layout never reflows/jumps as words complete — the classic word-wrap +
   * typewriter pitfall. */
  private buildNoteCard(cx: number, cardTitle: string, noteText: string): string {
    const c = LEVEL_COMPLETE;

    const title = createPixelText(this, cx, 0, cardTitle, c.noteTitleFontSizePx).setOrigin(0.5, 0);
    const titleH = title.height;

    // Body: measure the FULL wrapped text to size the card, then clear it for
    // the typewriter. Left-aligned, top-left origin so it grows down-and-right
    // from a fixed anchor (no recentering as it reveals).
    const body = createPixelText(this, 0, 0, '', c.noteBodyFontSizePx).setOrigin(0, 0).setAlign('left');
    body.setLineSpacing(c.noteLineSpacingPx);
    body.setWordWrapWidth(c.noteWrapWidthPx);
    const wrapped = body.getWrappedText(noteText).join('\n');
    body.setText(wrapped);
    const bodyH = body.height;

    const contentH = titleH + c.noteTitleGapPx + bodyH;
    const cardH = contentH + c.notePaddingYPx * 2;
    const cardW = c.noteWrapWidthPx + c.notePaddingXPx * 2;
    const cardTop = c.noteCardCenterY - cardH / 2;

    // Panel behind (createPixelPanel sits at DEPTHS.ui); title/body one above.
    createPixelPanel(this, cx, c.noteCardCenterY, cardW, cardH);

    const contentTop = cardTop + c.notePaddingYPx;
    title.setPosition(cx, contentTop).setDepth(DEPTHS.ui + 1);
    body
      .setPosition(cx - c.noteWrapWidthPx / 2, contentTop + titleH + c.noteTitleGapPx)
      .setDepth(DEPTHS.ui + 1);

    // Arm the typewriter from empty.
    body.setText('');
    this.bodyText = body;
    this.revealUnits = Array.from(wrapped);
    this.revealElapsedMs = 0;
    this.revealComplete = this.revealUnits.length === 0;
    return wrapped;
  }

  private updateTypewriter(delta: number): void {
    if (this.revealComplete || !this.bodyText) return;
    this.revealElapsedMs += delta;
    const target = Math.floor(this.revealElapsedMs / LEVEL_COMPLETE.typewriterMsPerChar);
    if (target >= this.revealUnits.length) {
      this.completeReveal();
    } else {
      this.bodyText.setText(this.revealUnits.slice(0, target).join(''));
    }
  }

  private completeReveal(): void {
    if (this.bodyText) this.bodyText.setText(this.revealUnits.join(''));
    this.revealComplete = true;
  }

  /** Tap/click-anywhere handler: skip the typewriter to the full text. */
  private skipTypewriter(): void {
    if (!this.revealComplete) this.completeReveal();
  }
}
