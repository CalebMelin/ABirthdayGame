// The real PartyScene (PLAN-09 task 2, ST-3) — NORTH_STAR §5's payoff, and the
// screen this whole gift is aimed at. Gabby and Caleb are at her party: a
// warm-lit backyard at dusk, streamers, a strand of lights, a big
// "HAPPY 22nd GABBY!!" banner, endless confetti, a flock of poppable balloons,
// the four NAMED guests under floating name tags with a crowd mingling behind
// them, the tulip bouquet she collected, and — after ~4 seconds — a "Credits ->"
// button in the bottom-right. THE SCENE NEVER ENDS ON ITS OWN: nothing here
// auto-advances, so she can sit in it and pop balloons for as long as she likes.
//
// THIS SCENE IS AN ASSEMBLER, not an engine. Every moving part is a handle built
// by an already-tested system module, created once in create(), driven once per
// update(), destroyed on SHUTDOWN:
//   - systems/partyCast.ts      -> the people (and THE TWIN JOKE, below)
//   - systems/partyBalloons.ts  -> the 32 tappable balloons + their pop puffs
//   - systems/confetti.ts       -> createConfettiFall, the continuous rain
// What this file owns is the SCENE: the venue backdrop, the streamers, the
// banner, the bouquet payoff and the "Credits ->" button.
//
// THE TWIN JOKE / ONE SOURCE OF TRUTH (the forward-note this file used to carry,
// honoured): the ONLY sanctioned way to render Gabby is
// `buildCharacterTextures(this, getSave().loadCharacter() ?? defaultCharacter())`
// — the same call GameScene and CharacterCreationScene's live preview use. This
// scene gets that for free by resolving the CharacterConfig here and handing it
// to createPartyCast, which builds the textures through that one path and gives
// Dallas the very same riderTextureKey as Gabby (NORTH_STAR §5: "sprite looks
// the same as the Gabby character"). The save is read IN create(), never at
// module scope, so editing the character and revisiting the party updates BOTH
// of them together — a literal PLAN-09 acceptance criterion, gated end-to-end by
// scripts/playtest-party.mjs.
//
// VERBATIM CONTENT (CLAUDE.md Rule 4): the banner string and the bouquet toast
// are IMPORTED from src/data/finale.ts and never re-typed here. The only copy
// authored in this file is the "Credits ->" button label, which is UI chrome
// rather than personal content (the LevelCompleteScene precedent for its own
// button labels).
//
// A plain (non-Matter) scene at camera zoom 1 like LevelCompleteScene /
// TitleScene — ZERO Matter bodies (it never touches `this.matter`), NO zoom
// compensation anywhere. All tunable numbers live in constants.ts's PARTY block.
//
// FORWARD-NOTES: PLAN-10 owns ALL audio (party music here, balloon-pop SFX at
// partyBalloons.ts's single pop() call site) and replaces this placeholder
// backdrop art with real pixel art. ST-5 owns the scripted level-22 arrival that
// runs BEFORE this scene; ST-4 builds the real CreditsScene this button routes
// to; ST-6 adds the Title screen's "Party" revisit entry point.
import Phaser from 'phaser';
import {
  DEPTHS,
  DESIGN_HEIGHT,
  DESIGN_WIDTH,
  PALETTE,
  PARTY,
  SCENE_KEYS,
  TEXTURE_KEYS,
  UI_MIN_TOUCH_PX,
} from '../systems/constants';
import { createPixelButton, createPixelPanel, createPixelText } from '../systems/ui';
import { castBounceOffsetPx, createPartyCast } from '../systems/partyCast';
import type { PartyCastHandle, PartyCastMemberInfo } from '../systems/partyCast';
import { createPartyBalloons } from '../systems/partyBalloons';
import type { PartyBalloonInfo, PartyBalloonsHandle } from '../systems/partyBalloons';
import { createConfettiFall } from '../systems/confetti';
import type { ConfettiFallHandle } from '../systems/confetti';
import { PARTY_BANNER_TEXT, bouquetToastText } from '../data/finale';
import { defaultCharacter } from '../data/characters';
import { getSave } from '../systems/save';

/** The bottom-right way out (PLAN-09 task 2's "Credits →"). The arrow is
 * U+2192, written as an explicit escape so an editor re-encoding this file can
 * never mangle it into tofu — the same discipline data/notes.ts and
 * data/finale.ts apply to their emoji. NOT personal content, so it lives here
 * beside the button rather than in data/finale.ts. */
const CREDITS_BUTTON_LABEL = 'Credits \u{2192}';

/** Streamer ribbon colors, cycled across PARTY.streamerXsPx. A color SET is
 * presentation content rather than a tunable number (the confetti.ts /
 * partyBalloons.ts precedent), which is why it lives beside the code that draws
 * it instead of in constants.ts. */
const STREAMER_COLORS: readonly number[] = [PALETTE.coral, PALETTE.sunshine, PALETTE.bgPink];

/** DEV-only live snapshot the browser playtest harness
 * (scripts/playtest-party.mjs) reads off the scene to assert the banner/toast/
 * bouquet/cast/balloons/Credits button (stripped from prod builds via
 * import.meta.env.DEV, exactly like LevelCompleteScene's __levelComplete). */
interface PartyDebug {
  /** The rendered banner string (imported verbatim from data/finale.ts). */
  bannerText: string;
  /** The rendered bouquet toast, or null when tulips === 0 (no toast at all —
   * never a zero-count one). */
  toastText: string | null;
  /** The tulip total read from the save on entry. */
  tulips: number;
  /** Whether Gabby is actually holding the bouquet sprite. */
  bouquetShown: boolean;
  /** The rider texture key Gabby AND Dallas both render with — the twin joke,
   * exposed so the harness can prove the two really are identical (and that
   * they change TOGETHER when the saved character changes). */
  riderTextureKey: string;
  /** Every built cast member (id, role, nameTag, textureKey, layout). */
  cast: readonly PartyCastMemberInfo[];
  /** Balloon POOL size (constant for the scene's life). */
  balloonCount: number;
  /** Live per-balloon snapshot. `alive` is equivalent to "on screen": the
   * flight geometry gives an unpopped balloon a zero-length invisible band, so
   * the harness counts alive to count visible (see partyBalloons.ts). */
  balloons: () => readonly PartyBalloonInfo[];
  /** Whether the "Credits ->" button has been revealed yet. */
  creditsButtonShown: () => boolean;
  /** Its current alpha — evidences the FADE-in, not just the appearance. */
  creditsButtonAlpha: () => number;
  /** Where the button sits (design px), for a real click/tap. */
  creditsButtonPos: { x: number; y: number };
}

export class PartyScene extends Phaser.Scene {
  private cast: PartyCastHandle | undefined;
  private balloons: PartyBalloonsHandle | undefined;
  private confetti: ConfettiFallHandle | undefined;

  /** Gabby's built cast member, kept so the bouquet can follow her idle bounce
   * every frame (her `phase01` is exposed by partyCast.ts for exactly this). */
  private gabby: PartyCastMemberInfo | undefined;
  private bouquet: Phaser.GameObjects.Container | undefined;

  private creditsButton: Phaser.GameObjects.Container | undefined;

  constructor() {
    super(SCENE_KEYS.party);
  }

  create(): void {
    // Per-entry reset — Phaser reuses the scene instance across scene.start(),
    // so every field must be re-initialised here or a second visit would run on
    // the previous visit's destroyed handles (the LevelCompleteScene.create()
    // discipline). Entering the party twice must not stack listeners, double-
    // spawn balloons, or leak.
    this.cast = undefined;
    this.balloons = undefined;
    this.confetti = undefined;
    this.gabby = undefined;
    this.bouquet = undefined;
    this.creditsButton = undefined;

    // Matches the venue's top sky band, so nothing flashes pastel-pink for a
    // frame on entry.
    this.cameras.main.setBackgroundColor(PALETTE.duskIndigo);

    this.drawVenue();
    this.drawStringLights();
    this.drawStreamers();

    // Ambient rain (DEPTHS.fx): the ONE layer that falls in front of everybody,
    // cast and balloons alike. Small tumbling squares read as depth there; the
    // balloons, which are large, deliberately do not (see PARTY.balloonDepth).
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

    // THE one-source-of-truth character read (see the class doc). Read HERE, in
    // create(), never at module scope — that is what makes "change your
    // character, revisit the party, Dallas updates" true.
    // (Held in locals as well as fields so the DEV snapshot below reads them
    // without leaning on TypeScript narrowing a mutable field across calls.)
    const character = getSave().loadCharacter() ?? defaultCharacter();
    const cast = createPartyCast(this, { character });
    this.cast = cast;
    this.gabby = cast.members.find((member) => member.role === 'gabby');

    const balloons = createPartyBalloons(this);
    this.balloons = balloons;

    this.drawBanner();

    // Bouquet payoff — BOTH halves gated on tulips > 0 (PLAN-09 task 2). At
    // zero there is no toast and no bouquet, not a "0 tulips" toast.
    const tulips = getSave().getTulips();
    const toastText = tulips > 0 ? bouquetToastText(tulips) : null;
    if (toastText !== null) {
      this.drawToast(toastText);
      this.addBouquet();
    }

    // The way out, revealed (not forced) after ~4s. Phaser's Clock destroys any
    // pending event on scene shutdown, so leaving early can't fire this late.
    this.time.delayedCall(PARTY.creditsButtonDelayMs, this.revealCreditsButton, undefined, this);

    // Explicit teardown of everything that owns pooled GameObjects. (The static
    // backdrop/banner objects are plain display-list members and go with the
    // scene, exactly as LevelCompleteScene's panels do.)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      if (this.creditsButton) this.tweens.killTweensOf(this.creditsButton);
      this.cast?.destroy();
      this.balloons?.destroy();
      this.confetti?.destroy();
      this.cast = undefined;
      this.balloons = undefined;
      this.confetti = undefined;
      this.gabby = undefined;
      this.bouquet = undefined;
      this.creditsButton = undefined;
    });

    // DEV-only live snapshot for the browser harness (dead-code-eliminated from
    // prod builds via import.meta.env.DEV, same as __levelComplete/__tricks).
    if (import.meta.env.DEV) {
      (this as unknown as { __party?: PartyDebug }).__party = {
        bannerText: PARTY_BANNER_TEXT,
        toastText,
        tulips,
        bouquetShown: this.bouquet !== undefined,
        riderTextureKey: cast.riderTextureKey,
        cast: cast.members,
        balloonCount: balloons.count,
        balloons: () => this.balloons?.balloons() ?? [],
        creditsButtonShown: () => this.creditsButton !== undefined,
        creditsButtonAlpha: () => this.creditsButton?.alpha ?? 0,
        creditsButtonPos: this.creditsButtonPos(),
      };
    }
  }

  update(_time: number, delta: number): void {
    this.cast?.update();
    this.balloons?.update(delta);
    this.confetti?.update(delta);
    this.syncBouquet();
  }

  // ----------------------------------------------------------------- venue
  /**
   * The warm-lit backyard at dusk, back to front: two dusk sky bands, the
   * sunset glowing behind the fence, the plank fence itself, the dark patio,
   * and the warm pool of light the party stands in.
   *
   * FLAT BANDS ARE RECTANGLES; LIGHT IS ELLIPSES. Both glows were bands in the
   * first draft and both had to change, because a full-width translucent
   * rectangle of a warm color does not read as light — it reads as a painted
   * ledge (the horizon) or simply as a different floor color (the pool). Every
   * object here is created once at DEPTHS.background and never touched again:
   * this is a BACKDROP, not an animated system, and it allocates nothing after
   * create().
   */
  private drawVenue(): void {
    // Top-down. `band` spans the full width between two screen ys.
    const band = (topY: number, bottomY: number, color: number): void => {
      this.add
        .rectangle(0, topY, DESIGN_WIDTH, bottomY - topY, color)
        .setOrigin(0, 0)
        .setDepth(DEPTHS.background);
    };

    band(0, PARTY.venueSkyMidY, PALETTE.duskIndigo);
    band(PARTY.venueSkyMidY, PARTY.venueGroundY, PALETTE.plum);

    // The sunset behind the yard: two nested translucent ellipses centred on
    // the fence top, so the warmth is strongest at the horizon and falls off to
    // the corners. Drawn BEFORE the fence, which then hides its lower half.
    const horizon = this.add.graphics().setDepth(DEPTHS.background);
    horizon.fillStyle(PALETTE.sunsetGlow, PARTY.venueHorizonGlowAlpha);
    horizon.fillEllipse(
      DESIGN_WIDTH / 2,
      PARTY.venueHorizonGlowCenterY,
      PARTY.venueHorizonGlowWidthPx,
      PARTY.venueHorizonGlowHeightPx
    );
    horizon.fillEllipse(
      DESIGN_WIDTH / 2,
      PARTY.venueHorizonGlowCenterY,
      PARTY.venueHorizonGlowCoreWidthPx,
      PARTY.venueHorizonGlowCoreHeightPx
    );

    // Fence: a brown board wall with a darker rail across its top and evenly
    // spaced plank seams.
    band(PARTY.venueFenceTopY, PARTY.venueGroundY, PALETTE.brown);
    band(
      PARTY.venueFenceTopY,
      PARTY.venueFenceTopY + PARTY.venueFenceRailHeightPx,
      PALETTE.outline
    );
    const fenceHeight = PARTY.venueGroundY - PARTY.venueFenceTopY;
    for (
      let x = PARTY.venueFenceSeamPitchPx / 2;
      x < DESIGN_WIDTH;
      x += PARTY.venueFenceSeamPitchPx
    ) {
      this.add
        .rectangle(x, PARTY.venueFenceTopY, PARTY.venueFenceSeamWidthPx, fenceHeight, PALETTE.outline)
        .setOrigin(0.5, 0)
        .setDepth(DEPTHS.background);
    }

    // Patio: dark, so the warm pools below actually read as LIGHT.
    band(PARTY.venueGroundY, DESIGN_HEIGHT, PALETTE.plum);

    // The warm light pool: two nested translucent ELLIPSES (widest/dimmest
    // first) rather than bands. A full-width translucent rectangle just
    // lightens the whole floor and reads as a different floor color; an ellipse
    // reads as light falling on it. Both layers go on ONE Graphics (rather than
    // two scene.add.ellipse GameObjects) because they are a single static
    // backdrop element that is drawn once and never moved, tinted or faded
    // independently — same reason the streamers and the light wire are Graphics.
    const glow = this.add.graphics().setDepth(DEPTHS.background);
    const pool = (widthPx: number, heightPx: number, alpha: number): void => {
      glow.fillStyle(PALETTE.sunsetGlow, alpha);
      glow.fillEllipse(DESIGN_WIDTH / 2, PARTY.venueGlowPoolCenterY, widthPx, heightPx);
    };
    pool(PARTY.venueGlowPoolWidthPx, PARTY.venueGlowPoolHeightPx, PARTY.venueGlowPoolAlpha);
    pool(PARTY.venueGlowCoreWidthPx, PARTY.venueGlowCoreHeightPx, PARTY.venueGlowCoreAlpha);
  }

  /** A sagging strand of warm bulbs across the yard — the second of the two
   * "warm-lit" cues (the floor pool is the other), and the one that most says
   * "party" at a glance. The sag is a plain parabola (0 at both edges,
   * PARTY.lightStringSagPx at centre); the wire is one Graphics polyline and
   * each bulb a small square hanging just under it. */
  private drawStringLights(): void {
    const bulbs = PARTY.lightStringBulbCount;
    const spans = Math.max(1, bulbs - 1);
    const bulbY = (t: number): number =>
      PARTY.lightStringAnchorY + PARTY.lightStringSagPx * 4 * t * (1 - t);

    const wire = this.add.graphics().setDepth(DEPTHS.background);
    wire.lineStyle(PARTY.lightStringWireWidthPx, PALETTE.outline, 1);
    wire.beginPath();
    for (let i = 0; i < bulbs; i++) {
      const t = i / spans;
      const x = t * DESIGN_WIDTH;
      if (i === 0) wire.moveTo(x, bulbY(t));
      else wire.lineTo(x, bulbY(t));
    }
    wire.strokePath();

    for (let i = 0; i < bulbs; i++) {
      const t = i / spans;
      this.add
        .rectangle(
          t * DESIGN_WIDTH,
          bulbY(t),
          PARTY.lightStringBulbSizePx,
          PARTY.lightStringBulbSizePx,
          PALETTE.sunshine
        )
        .setOrigin(0.5, 0)
        .setDepth(DEPTHS.background);
    }
  }

  /**
   * Hanging zigzag ribbons down both edges of the screen (PLAN-09 task 2's
   * "streamers"), framing the banner rather than crossing it.
   *
   * WHY NOT decorations.ts's drawStreamer: that one is a PRIVATE function keyed
   * to world-anchored level geometry — it takes a `DecorationSpec` plus the
   * terrain `surfaceY` under it and hangs the ribbon a fixed height ABOVE THE
   * GROUND at `DEPTHS.props`, in the level THEME's accent color. None of that
   * exists in a screen-space menu scene at zoom 1: there is no terrain, no
   * DecorationSpec and no theme here, and these ribbons hang from the TOP EDGE,
   * not from a ground surface. Exporting/parameterising it for one caller would
   * have meant threading four unrelated arguments through the level decoration
   * path. The zigzag SHAPE is deliberately identical (same segment/amplitude/
   * thickness model), so a party streamer still reads as the same prop the
   * level-21 backdrops use.
   */
  private drawStreamers(): void {
    PARTY.streamerXsPx.forEach((x, index) => {
      const ribbon = this.add.graphics().setDepth(DEPTHS.background);
      ribbon.lineStyle(
        PARTY.streamerThicknessPx,
        STREAMER_COLORS[index % STREAMER_COLORS.length],
        1
      );
      ribbon.beginPath();
      ribbon.moveTo(x, 0);
      for (let segment = 1; segment <= PARTY.streamerSegments; segment++) {
        const y = (segment / PARTY.streamerSegments) * PARTY.streamerLengthPx;
        const offsetX = segment % 2 === 0 ? PARTY.streamerAmplitudePx : -PARTY.streamerAmplitudePx;
        ribbon.lineTo(x + offsetX, y);
      }
      ribbon.strokePath();
    });
  }

  // ---------------------------------------------------------------- banner
  /** The big banner. Text FIRST so the cream panel can be sized to the MEASURED
   * label rather than a guessed font metric (the LevelCompleteScene note-card /
   * partyCast name-tag convention), then two "strings" up to the top edge so it
   * reads as hung rather than floating. */
  private drawBanner(): void {
    const cx = DESIGN_WIDTH / 2;
    const label = createPixelText(this, cx, PARTY.bannerCenterY, PARTY_BANNER_TEXT, PARTY.bannerFontSizePx);
    const panelWidth = label.width + PARTY.bannerPadXPx * 2;
    const panelHeight = label.height + PARTY.bannerPadYPx * 2;
    const panelTop = PARTY.bannerCenterY - panelHeight / 2;

    // Hangers behind the panel (createPixelPanel sits at DEPTHS.ui).
    const hangers = this.add.graphics().setDepth(DEPTHS.ui - 1);
    hangers.fillStyle(PALETTE.outline, 1);
    for (const x of [cx - panelWidth / 2, cx + panelWidth / 2]) {
      hangers.fillRect(x - PARTY.bannerHangerWidthPx / 2, 0, PARTY.bannerHangerWidthPx, panelTop);
    }

    createPixelPanel(this, cx, PARTY.bannerCenterY, panelWidth, panelHeight);
    label.setDepth(DEPTHS.ui + 1);
  }

  // --------------------------------------------------------- bouquet payoff
  /** The `You brought N tulips to the party!! \u{1F337}` toast, on its own cream
   * panel under the banner. Only ever called with tulips > 0, and the string is
   * always bouquetToastText's — never re-typed here (CLAUDE.md Rule 4). */
  private drawToast(text: string): void {
    const cx = DESIGN_WIDTH / 2;
    const label = createPixelText(this, cx, PARTY.toastCenterY, text, PARTY.toastFontSizePx);
    createPixelPanel(
      this,
      cx,
      PARTY.toastCenterY,
      label.width + PARTY.toastPadXPx * 2,
      label.height + PARTY.toastPadYPx * 2
    );
    label.setDepth(DEPTHS.ui + 1);
  }

  /** Puts the bouquet in Gabby's hands: a dark stem bundle she grips, with
   * PARTY.bouquetStemCount tulips fanned above it and the middle one standing
   * tallest. All of it lives in ONE Container whose origin IS the grip, so
   * syncBouquet only ever has to move a single y. */
  private addBouquet(): void {
    if (!this.gabby) return;

    // The stem bundle first, so the blossoms always draw over it. It hangs
    // BELOW the container origin; the blossoms sit above it.
    const parts: Phaser.GameObjects.GameObject[] = [
      this.add
        .rectangle(0, 0, PARTY.bouquetWrapWidthPx, PARTY.bouquetWrapHeightPx, PALETTE.outline)
        .setOrigin(0.5, 0),
    ];

    const count = PARTY.bouquetStemCount;
    const maxOffset = (count - 1) / 2;
    for (let i = 0; i < count; i++) {
      const offset = i - maxOffset; // -1, 0, +1 at the default count of 3
      // Outer stems taper down to no lift at all; the centre one gets it all.
      const lift = maxOffset > 0 ? (1 - Math.abs(offset) / maxOffset) * PARTY.bouquetLiftYPx : 0;
      parts.push(
        this.add
          .image(offset * PARTY.bouquetSpreadXPx, -lift, TEXTURE_KEYS.tulip)
          .setOrigin(0.5, 1)
          .setScale(PARTY.bouquetScale)
      );
    }

    this.bouquet = this.add
      .container(
        this.gabby.x + PARTY.bouquetOffsetXPx,
        this.gabby.groundY + PARTY.bouquetOffsetYPx,
        parts
      )
      .setDepth(PARTY.bouquetDepth);
  }

  /** Keeps the bouquet welded to Gabby through her 2-frame idle bounce, using
   * the SAME pure helper and the SAME phase the cast itself bounces by — so it
   * moves on exactly her frames, never a frame late and never detached. Runs
   * every frame; allocates nothing. */
  private syncBouquet(): void {
    if (!this.bouquet || !this.gabby) return;
    const bounce = castBounceOffsetPx(
      this.time.now,
      this.gabby.phase01,
      PARTY.bounceAmplitudePx,
      PARTY.bouncePeriodMs
    );
    this.bouquet.setY(this.gabby.groundY + PARTY.bouquetOffsetYPx + bounce);
  }

  // -------------------------------------------------------- credits button
  /** Bottom-right anchor, DERIVED from the margins + the button's own
   * footprint (ui.ts gives every button a UI_MIN_TOUCH_PX-tall face), so
   * retuning any of those constants moves the button correctly. */
  private creditsButtonPos(): { x: number; y: number } {
    return {
      x: DESIGN_WIDTH - PARTY.creditsButtonMarginXPx - PARTY.creditsButtonMinWidthPx / 2,
      y: DESIGN_HEIGHT - PARTY.creditsButtonMarginYPx - UI_MIN_TOUCH_PX / 2,
    };
  }

  /**
   * Reveals the "Credits ->" button (PLAN-09 task 2). Built HERE rather than
   * created hidden at scene start on purpose: an alpha-0 Container is still
   * fully interactive, so a pre-built button would silently route a stray
   * bottom-right tap to the credits during the first four seconds. Before this
   * runs the button genuinely does not exist.
   *
   * It fades in via a tween (the pickup.ts / tricks.ts / police.ts precedent);
   * SHUTDOWN kills it. Works by mouse click AND touch tap — ui.ts's button
   * listens to Phaser pointer events, which cover both.
   */
  private revealCreditsButton(): void {
    const pos = this.creditsButtonPos();
    const button = createPixelButton(this, {
      x: pos.x,
      y: pos.y,
      label: CREDITS_BUTTON_LABEL,
      minWidth: PARTY.creditsButtonMinWidthPx,
      onClick: () => this.scene.start(SCENE_KEYS.credits),
    });
    button.setAlpha(0);
    this.tweens.add({ targets: button, alpha: 1, duration: PARTY.creditsButtonFadeMs });
    this.creditsButton = button;
  }
}
