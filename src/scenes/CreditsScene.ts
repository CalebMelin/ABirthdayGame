// The real CreditsScene (PLAN-09 task 3, ST-4) — NORTH_STAR §5's closing
// screen, and THE LAST THING THE RECIPIENT OF THIS GIFT EVER SEES.
//
// A dark dusk field with the party's confetti still falling, on which the three
// VERBATIM credit lines of src/data/finale.ts's CREDITS_LINES appear one at a
// time, then a tiny heart, a divider, the tulips she collected, and two ways on:
// "Play again?" (to the Title with EVERY gabby22.* key untouched) and a clearly
// secondary "Fresh start" (which wipes the save — behind an in-scene
// confirmation, never window.confirm).
//
// THIS FILE AUTHORS NO RENDERED COPY AT ALL. Every string on the screen is
// IMPORTED from src/data/finale.ts — the credit lines (CREDITS_LINES), the tulip
// tally (tulipTallyText) and the chrome (CREDITS_PLAY_AGAIN_LABEL and friends) —
// and none of them is re-typed here, not in code and not in a comment, because a
// hand-typed "documentation copy" is exactly what drifts. Read them there.
//   - The credit lines are LOCKED personal content (CLAUDE.md Rule 4 /
//     NORTH_STAR §7). tests/finale.test.ts guards them byte-exactly against an
//     independent code-point oracle, and scripts/playtest-credits.mjs re-checks
//     them against a second, separate oracle on what reached the screen.
//   - The chrome is ours to reword; it lives over there because this file has a
//     runtime Phaser import, so nothing in it can be reached from a plain-Node
//     test — which had left the panel/button GEOMETRY in constants.ts resting on
//     unasserted claims about string lengths. Those are now measured.
//
// LEGIBILITY IS A DESIGN CONSTRAINT HERE, NOT A DETAIL — AND IT CUTS BOTH WAYS.
// `createPixelText` defaults to TEXT_COLOR (plum #4a2c40), which is tuned for the
// pastel-pink menus and is effectively invisible on this background. So every
// string drawn straight ONTO THE DARK FIELD — the three credit lines and the
// tulip tally — goes through the `creditsText` helper below, which applies
// CREDITS.textColor (cream, ~10.3:1 contrast on duskIndigo).
//
// The strings that sit on a CREAM SURFACE deliberately keep the plum default and
// MUST NOT be "fixed" to cream — SIX of them, once the confirmation is open:
// the two bottom button labels and the confirmation's two button labels (all
// four inside ui.ts's cream faces), plus the confirmation's title and body (on
// its cream panel). Cream on cream would be the actual bug. The rule is:
//   dark field              -> this.creditsText(...)
//   cream panel/button face -> createPixelText(...) with its default.
//
// A plain (non-Matter) scene at camera zoom 1 like LevelCompleteScene /
// PartyScene — ZERO Matter bodies (it never touches `this.matter`), NO zoom
// compensation anywhere. All tunable numbers live in constants.ts's CREDITS
// block; the ambient rain reuses the PARTY.confettiFall* knobs both finale
// scenes deliberately share (see that block's doc).
//
// (The PLAN-04 forward-note this file used to carry is honoured by omission:
// the credits render no Gabby/rider sprite at all, so there is no character
// texture to build. If one is ever added it MUST go through the one-source-of-
// truth path `buildCharacterTextures(this, getSave().loadCharacter() ??
// defaultCharacter())`, exactly as GameScene, CharacterCreationScene's live
// preview and PartyScene do.)
//
// FORWARD-NOTES: PLAN-10 owns ALL audio (a closing theme belongs here). ST-5
// owns the scripted level-22 arrival; ST-6 adds the Title screen's "Party"
// revisit entry point, which becomes a SECOND way into this scene.
import Phaser from 'phaser';
import {
  CREDITS,
  DEPTHS,
  DESIGN_HEIGHT,
  DESIGN_WIDTH,
  PALETTE,
  PARTY,
  SCENE_KEYS,
  hexToCss,
} from '../systems/constants';
import { createPixelButton, createPixelPanel, createPixelText } from '../systems/ui';
import { createConfettiFall } from '../systems/confetti';
import type { ConfettiFallHandle } from '../systems/confetti';
import {
  CREDITS_CONFIRM_BODY_LINES,
  CREDITS_CONFIRM_CANCEL_LABEL,
  CREDITS_CONFIRM_ERASE_LABEL,
  CREDITS_CONFIRM_TITLE,
  CREDITS_FRESH_START_LABEL,
  CREDITS_LINES,
  CREDITS_PLAY_AGAIN_LABEL,
  tulipTallyText,
} from '../data/finale';
import { getSave } from '../systems/save';

// ---------------------------------------------------------------------------
// Placeholder DRAWING dimensions (PLAN-10 replaces the art). The established
// exception to "no magic numbers outside constants.ts" — same as
// pickup.ts's/partyCast.ts's local sprite dimensions.
// ---------------------------------------------------------------------------

/** The tiny heart's three primitives, as fractions of CREDITS.heartSizePx: two
 * lobes and the point below them. Byte-identical to the heart pickup.ts draws
 * when Caleb hops on in level 12, so the game's two hearts are the same heart.
 * Kept as a local copy rather than extracted: that one is a tracked, tweened,
 * self-destroying particle living inside a level-event handle, and this one is a
 * static signature — they share only these six numbers. */
const HEART_LOBE_OFFSET_X = 0.28;
const HEART_LOBE_OFFSET_Y = -0.15;
const HEART_LOBE_RADIUS = 0.42;
const HEART_POINT_HALF_WIDTH = 0.62;
const HEART_POINT_TOP_Y = 0.02;
const HEART_POINT_BOTTOM_Y = 0.85;

/** DEV-only live snapshot the browser playtest harness
 * (scripts/playtest-credits.mjs) reads off the scene (stripped from prod builds
 * via import.meta.env.DEV, exactly like PartyScene's __party). */
interface CreditsDebug {
  /** The three rendered credit lines, in order — imported verbatim from
   * data/finale.ts, never re-typed. */
  lines: readonly string[];
  /** How many of them have started appearing RIGHT NOW (0..3) — a live getter,
   * so the harness can observe a genuinely partial reveal. */
  revealedLines: () => number;
  /** Whether the reveal has finished (naturally or via a skip). */
  revealComplete: () => boolean;
  /** Whether the two buttons EXIST yet. They are built a beat after the reveal
   * completes (see CREDITS.tailFadeMs), so this — not revealComplete — is what
   * a harness must wait on before pressing one. */
  buttonsShown: () => boolean;
  /** The tulip tally string this entry will render. */
  tulipTallyText: string;
  /** The tulip total read from the save on entry. */
  tulips: number;
  /** Whether the fresh-start confirmation is open. */
  confirmShowing: () => boolean;
  /** Whether the tiny heart has been drawn. */
  heartShown: () => boolean;
  /** Where each button sits (design px), for real clicks/taps. Static — derived
   * from the CREDITS constants, so they are readable BEFORE the buttons are
   * built (they only exist once the reveal finishes). */
  playAgainPos: { x: number; y: number };
  freshStartPos: { x: number; y: number };
  confirmCancelPos: { x: number; y: number };
  confirmErasePos: { x: number; y: number };
}

export class CreditsScene extends Phaser.Scene {
  private confetti: ConfettiFallHandle | undefined;

  // --- line-by-line reveal state ---
  /** The three credit-line Text objects, created at alpha 0 in create(). */
  private lineTexts: Phaser.GameObjects.Text[] = [];
  private revealElapsedMs = 0;
  /** How many lines have STARTED revealing (each fades in over
   * CREDITS.revealLineFadeMs). */
  private revealedLineCount = 0;
  private revealComplete = false;

  // --- below-the-divider content, built once the reveal finishes ---
  /** The tulip tally, resolved ONCE in create() from the save and rendered
   * verbatim by buildTail(). Read once rather than at draw time so the DEV
   * snapshot and the pixels can never disagree. Deliberately the SAME name as
   * data/finale.ts's builder — one string, one name, everywhere it appears (the
   * builder, this field and the DEV seam); `this.` is what distinguishes the
   * memoized value from the function that produced it. */
  private tulipTallyText = '';
  private heart: Phaser.GameObjects.Graphics | undefined;
  private tailObjects: Phaser.GameObjects.GameObject[] = [];
  private playAgainButton: Phaser.GameObjects.Container | undefined;
  private freshStartButton: Phaser.GameObjects.Container | undefined;

  /** Every object making up the open fresh-start confirmation, or undefined
   * when it is closed. Doubles as the "is it showing?" flag, so the two can
   * never disagree. */
  private confirmObjects: Phaser.GameObjects.GameObject[] | undefined;

  /** Latched the instant the player commits to leaving, so a SECOND press
   * cannot start the destination scene again. Phaser's SceneManager.start on an
   * already-running scene shuts it down and re-creates it, so an unguarded
   * double-click or two-finger tap is a silent RESTART — and on the "Erase it
   * all" path it would run resetAll() twice. Reset only by the next create()
   * (the PartyScene.leaving discipline, ST-3). */
  private leaving = false;

  constructor() {
    super(SCENE_KEYS.credits);
  }

  create(): void {
    // Per-entry reset — Phaser reuses the scene instance across scene.start(),
    // so every field must be re-initialised here or a second visit would run on
    // the previous visit's destroyed objects (the PartyScene/LevelCompleteScene
    // discipline). Entering the credits twice must not stack listeners, replay
    // half a reveal, or leak.
    this.confetti = undefined;
    this.lineTexts = [];
    this.revealElapsedMs = 0;
    this.revealedLineCount = 0;
    this.revealComplete = false;
    this.tulipTallyText = '';
    this.heart = undefined;
    this.tailObjects = [];
    this.playAgainButton = undefined;
    this.freshStartButton = undefined;
    this.confirmObjects = undefined;
    this.leaving = false;

    this.cameras.main.setBackgroundColor(CREDITS.backgroundColor);

    // The party's rain, still falling (PLAN-09 task 3's "confetti still
    // falling") — the same shared pool and the same PARTY.confettiFall* feel, so
    // pressing "Credits ->" reads as walking out of the party rather than as
    // cutting to a different game. At DEPTHS.fx it sits BEHIND every string
    // here (all of which draw at DEPTHS.ui), so it can never obscure the words.
    this.confetti = createConfettiFall(this, {
      count: PARTY.confettiFallCount,
      spawnAbovePx: PARTY.confettiFallSpawnAbovePx,
      fallSpeedMinPxPerSec: PARTY.confettiFallSpeedMinPxPerSec,
      fallSpeedMaxPxPerSec: PARTY.confettiFallSpeedMaxPxPerSec,
      driftMaxPxPerSec: PARTY.confettiFallDriftMaxPxPerSec,
      spinMaxRadPerSec: PARTY.confettiFallSpinMaxRadPerSec,
      sizeMinPx: PARTY.confettiFallSizeMinPx,
      sizeMaxPx: PARTY.confettiFallSizeMaxPx,
      depth: PARTY.confettiFallDepth,
    });

    this.buildCreditLines();

    const tulips = getSave().getTulips();
    this.tulipTallyText = tulipTallyText(tulips);

    // Tap/click ANYWHERE skips the reveal (LevelCompleteScene's courtesy to
    // impatient players). Removed on SHUTDOWN so it can't stack across
    // re-entries.
    this.input.on(Phaser.Input.Events.POINTER_DOWN, this.skipReveal, this);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.off(Phaser.Input.Events.POINTER_DOWN, this.skipReveal, this);
      // Kill every fade this scene may still be running: the line fades, the
      // tail fade (whose onComplete builds the buttons) and any tween on the
      // confirmation. Phaser tears tweens down with the scene anyway, but the
      // tail tween's onComplete creates INTERACTIVE objects, so it is killed
      // explicitly rather than left to the general teardown.
      this.tweens.killTweensOf(this.lineTexts);
      this.tweens.killTweensOf(this.tailObjects);
      this.confetti?.destroy();
      this.confetti = undefined;
      this.lineTexts = [];
      this.heart = undefined;
      this.tailObjects = [];
      this.playAgainButton = undefined;
      this.freshStartButton = undefined;
      this.confirmObjects = undefined;
      // Drop the DEV snapshot with the scene: most of it is a frozen literal,
      // so leaving it behind would let a harness read a plausible-looking
      // credits screen off a scene that is not running (the __party precedent —
      // and it matters more here, since ST-6 adds a second way in).
      if (import.meta.env.DEV) {
        delete (this as unknown as { __credits?: CreditsDebug }).__credits;
      }
    });

    // DEV-only live snapshot for the browser harness (dead-code-eliminated from
    // prod builds via import.meta.env.DEV, same as __party/__levelComplete).
    if (import.meta.env.DEV) {
      (this as unknown as { __credits?: CreditsDebug }).__credits = {
        lines: CREDITS_LINES,
        revealedLines: () => this.revealedLineCount,
        revealComplete: () => this.revealComplete,
        buttonsShown: () => this.playAgainButton !== undefined,
        tulipTallyText: this.tulipTallyText,
        tulips,
        confirmShowing: () => this.confirmObjects !== undefined,
        heartShown: () => this.heart !== undefined,
        playAgainPos: { x: DESIGN_WIDTH / 2, y: CREDITS.playAgainButtonY },
        freshStartPos: { x: DESIGN_WIDTH / 2, y: CREDITS.freshStartButtonY },
        confirmCancelPos: {
          x: DESIGN_WIDTH / 2 + CREDITS.confirmCancelOffsetXPx,
          y: CREDITS.confirmButtonY,
        },
        confirmErasePos: {
          x: DESIGN_WIDTH / 2 + CREDITS.confirmConfirmOffsetXPx,
          y: CREDITS.confirmButtonY,
        },
      };
    }
  }

  update(_time: number, delta: number): void {
    this.confetti?.update(delta);
    this.updateReveal(delta);
  }

  // ------------------------------------------------------------------ text
  /** Centered pixel text in the DARK-FIELD colour. Everything drawn straight
   * onto the background goes through here, because createPixelText's default
   * plum is unreadable there — and a helper is how that stops being something a
   * call site can forget. Text on a CREAM surface (the button labels, the
   * confirmation's title and body) deliberately does NOT use this: see the
   * module doc's two-way legibility rule. */
  private creditsText(
    x: number,
    y: number,
    text: string,
    sizePx: number
  ): Phaser.GameObjects.Text {
    return createPixelText(this, x, y, text, sizePx)
      .setColor(hexToCss(CREDITS.textColor))
      .setDepth(DEPTHS.ui);
  }

  // ---------------------------------------------------------------- reveal
  /** Builds all three credit lines up front at alpha 0 — the reveal is a fade
   * per line, so the layout is fixed from frame one and nothing below ever
   * shifts as lines arrive. The strings come from CREDITS_LINES; the last one
   * gets its own bigger font (see CREDITS.finalLineFontSizePx). */
  private buildCreditLines(): void {
    const cx = DESIGN_WIDTH / 2;
    this.lineTexts = CREDITS_LINES.map((line, index) => {
      const isFinal = index === CREDITS_LINES.length - 1;
      const y = CREDITS.lineCenterYsPx[index];
      const size = isFinal ? CREDITS.finalLineFontSizePx : CREDITS.lineFontSizePx;
      return this.creditsText(cx, y, line, size).setAlpha(0);
    });
  }

  /** Advances the line-by-line reveal. Line `i` is due at
   * `revealFirstLineDelayMs + i * revealLineIntervalMs`; the whole screen
   * completes `revealTailDelayMs` after the last one. Mirrors
   * LevelCompleteScene's elapsed-accumulator typewriter, one LINE at a time
   * rather than one character. */
  private updateReveal(delta: number): void {
    if (this.revealComplete) return;
    this.revealElapsedMs += delta;

    const due =
      Math.floor(
        (this.revealElapsedMs - CREDITS.revealFirstLineDelayMs) / CREDITS.revealLineIntervalMs
      ) + 1;
    const target = Math.max(0, Math.min(this.lineTexts.length, due));
    while (this.revealedLineCount < target) {
      const text = this.lineTexts[this.revealedLineCount];
      this.tweens.add({ targets: text, alpha: 1, duration: CREDITS.revealLineFadeMs });
      this.revealedLineCount++;
    }

    if (this.revealedLineCount >= this.lineTexts.length) {
      const lastLineDueMs =
        CREDITS.revealFirstLineDelayMs +
        (this.lineTexts.length - 1) * CREDITS.revealLineIntervalMs;
      if (this.revealElapsedMs >= lastLineDueMs + CREDITS.revealTailDelayMs) {
        this.finishReveal();
      }
    }
  }

  /** Tap/click-anywhere handler: jump straight to the finished screen. */
  private skipReveal(): void {
    if (!this.revealComplete) this.finishReveal();
  }

  /** Snaps every line to full opacity (a skip can land mid-fade) and builds
   * everything below the divider. Idempotent. */
  private finishReveal(): void {
    if (this.revealComplete) return;
    this.revealComplete = true;
    this.tweens.killTweensOf(this.lineTexts);
    for (const text of this.lineTexts) text.setAlpha(1);
    this.revealedLineCount = this.lineTexts.length;
    this.buildTail();
  }

  // ------------------------------------------------------------------ tail
  /** The heart, the divider and the tulip tally, faded in together. The two
   * BUTTONS are built only when that fade completes — a composition choice now
   * that ui.ts's press latch closes the release-only-activation hole this used
   * to be the (partial) mitigation for; see CREDITS.tailFadeMs. */
  private buildTail(): void {
    const cx = DESIGN_WIDTH / 2;

    this.heart = this.drawHeart(cx, CREDITS.heartCenterY, CREDITS.heartSizePx);

    const divider = this.add
      .rectangle(
        cx,
        CREDITS.dividerY,
        CREDITS.dividerWidthPx,
        CREDITS.dividerThicknessPx,
        CREDITS.textColor
      )
      .setDepth(DEPTHS.ui);

    const tally = this.creditsText(
      cx,
      CREDITS.tulipLineCenterY,
      this.tulipTallyText,
      CREDITS.tulipLineFontSizePx
    );

    this.heart.setAlpha(0);
    divider.setAlpha(0);
    tally.setAlpha(0);
    this.tailObjects = [this.heart, divider, tally];

    // Two tweens, same duration, because the divider fades to its OWN dimmed
    // alpha rather than to full (a rule that competed with the words above it
    // would defeat the point of having one). The divider's tween owns the
    // onComplete that finally builds the buttons.
    this.tweens.add({ targets: [this.heart, tally], alpha: 1, duration: CREDITS.tailFadeMs });
    this.tweens.add({
      targets: divider,
      alpha: CREDITS.dividerAlpha,
      duration: CREDITS.tailFadeMs,
      onComplete: () => this.buildButtons(),
    });
  }

  /** PLAN-09 task 3's "A tiny heart somewhere. Tasteful." — two lobes and a
   * point, drawn on one Graphics in local space and positioned, exactly as
   * pickup.ts draws Caleb's. */
  private drawHeart(x: number, y: number, sizePx: number): Phaser.GameObjects.Graphics {
    const g = this.add.graphics().setDepth(DEPTHS.ui);
    g.fillStyle(PALETTE.coral, 1);
    g.fillCircle(
      -sizePx * HEART_LOBE_OFFSET_X,
      sizePx * HEART_LOBE_OFFSET_Y,
      sizePx * HEART_LOBE_RADIUS
    );
    g.fillCircle(
      sizePx * HEART_LOBE_OFFSET_X,
      sizePx * HEART_LOBE_OFFSET_Y,
      sizePx * HEART_LOBE_RADIUS
    );
    g.fillTriangle(
      -sizePx * HEART_POINT_HALF_WIDTH,
      sizePx * HEART_POINT_TOP_Y,
      sizePx * HEART_POINT_HALF_WIDTH,
      sizePx * HEART_POINT_TOP_Y,
      0,
      sizePx * HEART_POINT_BOTTOM_Y
    );
    g.setPosition(x, y);
    return g;
  }

  // --------------------------------------------------------------- buttons
  /** The two ways on. Built once, only after the tail fade. */
  private buildButtons(): void {
    if (this.playAgainButton) return;
    const cx = DESIGN_WIDTH / 2;

    this.playAgainButton = createPixelButton(this, {
      x: cx,
      y: CREDITS.playAgainButtonY,
      label: CREDITS_PLAY_AGAIN_LABEL,
      minWidth: CREDITS.playAgainButtonMinWidthPx,
      onClick: () => this.playAgain(),
    });

    // Dimmed as well as narrower and lower. Width alone did NOT carry the
    // hierarchy: at identical cream faces, outlines, plum labels and font size,
    // 480 vs 340 still read as two peers rather than as a primary and its
    // secondary (code-review finding). ui.ts exposes no styling hook short of a
    // whole variant, and alpha is the cheapest honest lever that does not touch
    // the shared kit — it dims face, outline, shadow and label together.
    this.freshStartButton = createPixelButton(this, {
      x: cx,
      y: CREDITS.freshStartButtonY,
      label: CREDITS_FRESH_START_LABEL,
      minWidth: CREDITS.freshStartButtonMinWidthPx,
      onClick: () => this.showResetConfirm(),
    }).setAlpha(CREDITS.freshStartButtonAlpha);
  }

  /**
   * "Play again?" — back to the Title with PROGRESS KEPT. This path touches no
   * storage at all: every gabby22.* key is byte-identical afterwards (asserted
   * on raw localStorage by scripts/playtest-credits.mjs).
   */
  private playAgain(): void {
    if (this.leaving) return;
    this.leaving = true;
    this.scene.start(SCENE_KEYS.title);
  }

  // ------------------------------------------------- fresh-start confirm
  /**
   * Opens the fresh-start confirmation: a full-screen dim, a pixel panel, the
   * warning, and two buttons — cancel (wide, left) and erase (narrow, right).
   *
   * The two buttons underneath are input-DISABLED for as long as this is open.
   * The dim alone is not enough: it is a plain Rectangle with no hit area, so
   * without this a press landing where "Play again?" sits would sail straight
   * through the panel and navigate away mid-confirmation. `disableInteractive()`
   * flips `input.enabled` and keeps the InteractiveObject, so the matching
   * `setInteractive()` in hideResetConfirm() restores them exactly.
   */
  private showResetConfirm(): void {
    if (this.confirmObjects !== undefined) return;
    const cx = DESIGN_WIDTH / 2;

    // HIDDEN as well as input-disabled. Disabling alone left the "Play again?"
    // face straddling the panel's bottom edge (the panel spans y 180..540, its
    // face 492..580), so the bottom row of its glyphs poked out beneath the
    // border as plum fragments — on the game's most consequential dialog that
    // reads as clipped text rather than as a dimmed button. Hiding also makes
    // the disable VISIBLE, which is the honest UX: nothing under a modal should
    // look pressable.
    this.playAgainButton?.disableInteractive().setVisible(false);
    this.freshStartButton?.disableInteractive().setVisible(false);

    const dim = this.add
      .rectangle(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT, PALETTE.outline, CREDITS.confirmDimAlpha)
      .setOrigin(0, 0)
      .setDepth(DEPTHS.overlay);

    const panel = createPixelPanel(
      this,
      cx,
      CREDITS.confirmPanelCenterY,
      CREDITS.confirmPanelWidthPx,
      CREDITS.confirmPanelHeightPx
    ).setDepth(DEPTHS.overlay + 1);

    // ON PURPOSE, NOT AN OVERSIGHT: the panel face is cream, so its title and
    // body use createPixelText's DEFAULT plum rather than the scene's cream —
    // the same cream-panel-behind-plum-text convention the party's name tags and
    // banner use, and the same reason the two button labels below keep the
    // default too (ui.ts faces are cream). Switching these to CREDITS.textColor
    // would render cream on cream. See the module doc's two-way rule.
    const title = createPixelText(
      this,
      cx,
      CREDITS.confirmTitleY,
      CREDITS_CONFIRM_TITLE,
      CREDITS.confirmTitleFontSizePx
    ).setDepth(DEPTHS.overlay + 2);

    const body = createPixelText(
      this,
      cx,
      CREDITS.confirmBodyY,
      CREDITS_CONFIRM_BODY_LINES.join('\n'),
      CREDITS.confirmBodyFontSizePx
    ).setDepth(DEPTHS.overlay + 2);
    body.setLineSpacing(CREDITS.confirmBodyLineSpacingPx);

    const cancel = createPixelButton(this, {
      x: cx + CREDITS.confirmCancelOffsetXPx,
      y: CREDITS.confirmButtonY,
      label: CREDITS_CONFIRM_CANCEL_LABEL,
      minWidth: CREDITS.confirmCancelMinWidthPx,
      onClick: () => this.hideResetConfirm(),
    }).setDepth(DEPTHS.overlay + 2);

    const erase = createPixelButton(this, {
      x: cx + CREDITS.confirmConfirmOffsetXPx,
      y: CREDITS.confirmButtonY,
      label: CREDITS_CONFIRM_ERASE_LABEL,
      minWidth: CREDITS.confirmConfirmMinWidthPx,
      onClick: () => this.freshStart(),
    }).setDepth(DEPTHS.overlay + 2);

    this.confirmObjects = [dim, panel, title, body, cancel, erase];
  }

  /** CANCEL: tears the confirmation down and changes NOTHING — no storage call
   * of any kind happens on this path. */
  private hideResetConfirm(): void {
    if (this.confirmObjects === undefined) return;
    for (const object of this.confirmObjects) object.destroy();
    this.confirmObjects = undefined;
    this.playAgainButton?.setVisible(true).setInteractive();
    this.freshStartButton?.setVisible(true).setInteractive();
  }

  /** CONFIRM: wipes every gabby22.* key, then back to the Title — which, with
   * no saved character, restarts the first-run flow. Guarded by `leaving` so a
   * double-press cannot run resetAll() twice or restart TitleScene. */
  private freshStart(): void {
    if (this.leaving) return;
    this.leaving = true;
    getSave().resetAll();
    this.scene.start(SCENE_KEYS.title);
  }
}
