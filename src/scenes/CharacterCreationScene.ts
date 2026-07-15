// Character creation (PLAN-04 task 3, folding in the task-4 "save on every
// change" bullet and the task-5 "Let's ride! -> Level Select" nav bullet so
// this scene is a coherent, fully-usable unit): a live preview of Gabby on
// her bike (idle bounce + blink) on the left, four labeled swatch rows
// (HAIR / EYES / BIKE / SUIT) on the right, and Randomize / Let's ride!
// buttons. Every swatch tap or Randomize immediately updates the preview
// AND persists via the save system — see applyConfigChange().
import Phaser from 'phaser';
import type { CharacterConfig } from '../systems/save';
import { getSave } from '../systems/save';
import {
  BIKE_TUNING,
  CHARACTER_CREATE,
  DEPTHS,
  DESIGN_WIDTH,
  PALETTE,
  PASTEL_BG_COLOR,
  SCENE_KEYS,
  TEXTURE_KEYS,
} from '../systems/constants';
import { createPixelButton, createPixelText } from '../systems/ui';
import {
  BIKE_OPTIONS,
  EYE_OPTIONS,
  HAIR_OPTIONS,
  OUTFIT_OPTIONS,
  defaultCharacter,
  normalizeCharacterConfig,
  randomCharacterConfig,
} from '../data/characters';
import { buildCharacterTextures } from '../systems/characterTextures';

/** One swatch row's refresh hook — re-syncs which swatch shows the
 * selection highlight against the (possibly just-changed) working config.
 * Returned by buildSwatchRow, collected so applyConfigChange can refresh
 * all four rows after ANY change (a swatch tap only needs its own row
 * re-synced, but Randomize touches all four at once, so one shared path
 * handles both). */
interface SwatchRowHandle {
  refreshHighlight(): void;
}

/**
 * Character creation: live preview + swatch customization + Randomize +
 * Let's ride! -> LevelSelect. See the module doc comment above.
 */
export class CharacterCreationScene extends Phaser.Scene {
  /** The working (in-progress) selection. Initialized from the save system
   * in create() — NOT here, so re-entering this scene (e.g. Title's "Edit
   * Character") always starts from the latest saved look, not whatever was
   * left over from a previous visit to this same Scene instance. */
  private config: CharacterConfig = defaultCharacter();

  /** Preview container (bike + wheels + rider + eyelid) — the bounce tween
   * targets this, so the whole rig bobs together. */
  private previewContainer: Phaser.GameObjects.Container | undefined;
  private riderPreviewSprite: Phaser.GameObjects.Image | undefined;
  private bikePreviewSprite: Phaser.GameObjects.Image | undefined;

  /** One entry per swatch row (HAIR/EYES/BIKE/SUIT), in that order —
   * refreshed together after every config change (see applyConfigChange). */
  private swatchRows: SwatchRowHandle[] = [];

  constructor() {
    super(SCENE_KEYS.characterCreation);
  }

  create(): void {
    // getSave().loadCharacter() returns null on first-ever open (NORTH_STAR
    // §4: defaults on first open are blonde hair + tasteful picks
    // elsewhere). defaultCharacter() returns a FRESH mutable copy —
    // DEFAULT_CHARACTER itself is a shared Readonly singleton that must
    // never be mutated (see its doc comment in data/characters.ts).
    // normalizeCharacterConfig guards a corrupted/legacy save (a saved id
    // that no longer matches a real option): every resolver already
    // renders it safely, but the swatch-row highlight below compares raw
    // ids directly, so an un-normalized bad id would show NO swatch
    // selected in its row. Normalizing here keeps the working config's ids
    // always real from the start.
    this.config = normalizeCharacterConfig(getSave().loadCharacter() ?? defaultCharacter());
    this.swatchRows = [];

    this.cameras.main.setBackgroundColor(PASTEL_BG_COLOR);

    createPixelText(this, DESIGN_WIDTH / 2, 56, 'Customize Gabby!', 40);

    this.buildPreview();
    this.buildSwatchRows();
    this.buildActionButtons();

    // Tear down the bounce tween + blink timer chain on shutdown so a
    // later re-entry into this same Scene instance (Phaser reuses scene
    // instances by key; re-navigating here calls create() again on the
    // SAME instance) can't stack a second bounce tween or a second
    // self-rescheduling blink chain on top of the first. `once`, not `on`
    // — create() re-registers every time this scene starts, and `on` would
    // stack duplicate SHUTDOWN handlers across visits (same reasoning as
    // GameScene's SHUTDOWN backstop).
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.tweens.killAll();
      this.time.removeAllEvents();
      this.previewContainer = undefined;
      this.riderPreviewSprite = undefined;
      this.bikePreviewSprite = undefined;
      this.swatchRows = [];
    });
  }

  // -------------------------------------------------------------- preview

  /** Builds the static "Gabby on her bike" preview: bike body, two wheels
   * (TEXTURE_KEYS.wheel — never recolored), and the rider, arranged with
   * the SAME relative geometry bike.ts's real rig uses (BIKE_TUNING
   * offsets), scaled up by CHARACTER_CREATE.previewScale so the small
   * placeholder sprites read as a large preview. No Matter/physics — plain
   * this.add.image sprites in a Container so the idle bounce tween can
   * move them all together. */
  private buildPreview(): void {
    const { riderTextureKey, bikeTextureKey } = buildCharacterTextures(this, this.config);
    const s = CHARACTER_CREATE.previewScale;
    const t = BIKE_TUNING;

    // Wheels first, then chassis, then rider on top — same paint order as
    // bike.ts's real rig ("Wheels are added before the chassis so that, at
    // equal depth, the chassis renders on top of the wheel discs").
    const rearWheel = this.add
      .image(-(t.wheelbase / 2) * s, t.wheelDropPx * s, TEXTURE_KEYS.wheel)
      .setScale(s);
    const frontWheel = this.add
      .image((t.wheelbase / 2) * s, t.wheelDropPx * s, TEXTURE_KEYS.wheel)
      .setScale(s);
    const bikeSprite = this.add.image(0, 0, bikeTextureKey).setScale(s);
    const riderSprite = this.add
      .image(t.riderOffsetX * s, t.riderOffsetY * s, riderTextureKey)
      .setScale(s);

    // Blink eyelid: a skin-colored rect over the rider's eye band,
    // hidden by default and toggled visible briefly by scheduleBlink().
    // Positioned via CHARACTER_CREATE.eyeBandOffset{X,Y} relative to the
    // rider sprite's own center, same scale as the rider itself so it
    // tracks perfectly as a "closed eyes" overlay.
    const eyelid = this.add
      .rectangle(
        t.riderOffsetX * s + CHARACTER_CREATE.eyeBandOffsetX * s,
        t.riderOffsetY * s + CHARACTER_CREATE.eyeBandOffsetY * s,
        CHARACTER_CREATE.eyeBandWidthPx * s,
        CHARACTER_CREATE.eyeBandHeightPx * s,
        PALETTE.skin
      )
      .setOrigin(0.5)
      .setVisible(false);

    this.previewContainer = this.add.container(CHARACTER_CREATE.previewCenterX, CHARACTER_CREATE.previewCenterY, [
      rearWheel,
      frontWheel,
      bikeSprite,
      riderSprite,
      eyelid,
    ]);
    this.previewContainer.setDepth(DEPTHS.rider);

    this.riderPreviewSprite = riderSprite;
    this.bikePreviewSprite = bikeSprite;

    this.startBounce(this.previewContainer);
    this.scheduleBlink(eyelid);
  }

  /** Idle tell (a): a slight vertical bounce — a subtle-amplitude, gentle-
   * period yoyo tween on the whole preview container. Runs forever
   * (repeat: -1) until shutdown kills it (see create()'s SHUTDOWN
   * handler). */
  private startBounce(container: Phaser.GameObjects.Container): void {
    this.tweens.add({
      targets: container,
      y: container.y - CHARACTER_CREATE.bounceAmplitudePx,
      duration: CHARACTER_CREATE.bouncePeriodMs,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1,
    });
  }

  /** Idle tell (b): a blink. Simplest cheap technique per the task spec —
   * a thin eyelid rect flashed visible for blinkDurationMs, on a randomized
   * interval in [blinkMinIntervalMs, blinkMaxIntervalMs). Self-reschedules
   * via this.time.delayedCall; the SHUTDOWN handler's removeAllEvents()
   * cancels whatever's pending so re-entering this scene can't stack a
   * second blink chain alongside a first. */
  private scheduleBlink(eyelid: Phaser.GameObjects.Rectangle): void {
    const delay = Phaser.Math.Between(CHARACTER_CREATE.blinkMinIntervalMs, CHARACTER_CREATE.blinkMaxIntervalMs);
    this.time.delayedCall(delay, () => {
      eyelid.setVisible(true);
      this.time.delayedCall(CHARACTER_CREATE.blinkDurationMs, () => {
        eyelid.setVisible(false);
        this.scheduleBlink(eyelid);
      });
    });
  }

  /** Rebuilds (or reuses — buildCharacterTextures/recolorTexture cache per
   * combination) the rider/bike textures for the current config and swaps
   * them onto the existing preview sprites. Cheap: only ever called after
   * a config change, and a repeat combination hits the cache. */
  private refreshPreviewTextures(): void {
    const { riderTextureKey, bikeTextureKey } = buildCharacterTextures(this, this.config);
    this.riderPreviewSprite?.setTexture(riderTextureKey);
    this.bikePreviewSprite?.setTexture(bikeTextureKey);
  }

  // ---------------------------------------------------------- swatch rows

  private buildSwatchRows(): void {
    this.swatchRows = [
      this.buildSwatchRow(
        CHARACTER_CREATE.hairRowY,
        'HAIR',
        HAIR_OPTIONS,
        (option) => option.color,
        () => this.config.hairColor,
        (id) => this.selectSwatch('hairColor', id)
      ),
      this.buildSwatchRow(
        CHARACTER_CREATE.eyesRowY,
        'EYES',
        EYE_OPTIONS,
        (option) => option.color,
        () => this.config.eyeColor,
        (id) => this.selectSwatch('eyeColor', id)
      ),
      this.buildSwatchRow(
        CHARACTER_CREATE.bikeRowY,
        'BIKE',
        BIKE_OPTIONS,
        (option) => option.color,
        () => this.config.bikeColor,
        (id) => this.selectSwatch('bikeColor', id)
      ),
      this.buildSwatchRow(
        CHARACTER_CREATE.suitRowY,
        'SUIT',
        OUTFIT_OPTIONS,
        (option) => option.suitColor,
        () => this.config.outfit,
        (id) => this.selectSwatch('outfit', id)
      ),
    ];
  }

  /**
   * Builds one labeled row: a pixel-text label at CHARACTER_CREATE.rowLabelX,
   * then one swatch per option starting at rowStartX, spaced
   * swatchCenterSpacingPx apart. Each swatch is a small Container (a
   * highlight halo behind a colored face) made interactive over a STATIC
   * hit-area Rectangle sized swatchHitSizePx (>= UI_MIN_TOUCH_PX) — per the
   * documented gotcha (see ui.ts/GameScene's pause button), the hit area is
   * a fixed Geom.Rectangle in the container's local space, NEVER
   * `container.setSize()` (which would shift the hit area by half its
   * size). Tapping a swatch updates the working config, refreshes every
   * row's highlight + the preview textures, and saves.
   */
  private buildSwatchRow<T extends { id: string }>(
    y: number,
    label: string,
    options: readonly T[],
    colorOf: (option: T) => number,
    getSelectedId: () => string,
    onSelect: (id: string) => void
  ): SwatchRowHandle {
    createPixelText(this, CHARACTER_CREATE.rowLabelX, y, label, CHARACTER_CREATE.rowLabelFontSizePx);

    const swatches: Array<{ id: string; highlight: Phaser.GameObjects.Rectangle }> = [];
    const haloSize = CHARACTER_CREATE.swatchVisibleSizePx + CHARACTER_CREATE.swatchHighlightPadPx * 2;
    const hitHalf = CHARACTER_CREATE.swatchHitSizePx / 2;

    options.forEach((option, index) => {
      const x = CHARACTER_CREATE.rowStartX + index * CHARACTER_CREATE.swatchCenterSpacingPx;

      // Highlight halo: hidden unless this swatch is the current selection.
      const highlight = this.add
        .rectangle(0, 0, haloSize, haloSize, PALETTE.sunshine)
        .setOrigin(0.5)
        .setVisible(option.id === getSelectedId());
      const face = this.add
        .rectangle(0, 0, CHARACTER_CREATE.swatchVisibleSizePx, CHARACTER_CREATE.swatchVisibleSizePx, colorOf(option))
        .setOrigin(0.5)
        .setStrokeStyle(CHARACTER_CREATE.swatchOutlineWidthPx, PALETTE.outline);

      const container = this.add.container(x, y, [highlight, face]);
      container.setDepth(DEPTHS.ui);

      // Static hit-area rectangle in container-local space (see this
      // method's doc comment) — do NOT call setSize() on this container.
      container.setInteractive({
        hitArea: new Phaser.Geom.Rectangle(-hitHalf, -hitHalf, CHARACTER_CREATE.swatchHitSizePx, CHARACTER_CREATE.swatchHitSizePx),
        hitAreaCallback: Phaser.Geom.Rectangle.Contains,
        useHandCursor: true,
      });
      container.on('pointerup', () => onSelect(option.id));

      swatches.push({ id: option.id, highlight });
    });

    return {
      refreshHighlight: (): void => {
        const selectedId = getSelectedId();
        for (const swatch of swatches) {
          swatch.highlight.setVisible(swatch.id === selectedId);
        }
      },
    };
  }

  /** A swatch tap: replaces the working config with a copy that has just
   * `field` changed, then runs the shared apply path (preview + highlights
   * + save). */
  private selectSwatch(field: keyof CharacterConfig, id: string): void {
    const next: CharacterConfig = { ...this.config };
    next[field] = id;
    this.config = next;
    this.applyConfigChange();
  }

  /** Shared "something about the config changed" path for BOTH a swatch
   * tap and Randomize: rebuild the preview textures, re-sync every row's
   * selection highlight against the new config, and persist (PLAN-04 task
   * 4's "selection saved via save system on every change" — never touches
   * level progress/tulips/notes, only the character key, so editing the
   * character mid-progress can never reset progress). */
  private applyConfigChange(): void {
    this.refreshPreviewTextures();
    for (const row of this.swatchRows) {
      row.refreshHighlight();
    }
    getSave().saveCharacter(this.config);
  }

  // ------------------------------------------------------- action buttons

  private buildActionButtons(): void {
    createPixelButton(this, {
      x: CHARACTER_CREATE.randomizeButtonX,
      y: CHARACTER_CREATE.actionButtonY,
      label: 'Randomize 🎲',
      onClick: () => {
        this.config = randomCharacterConfig();
        this.applyConfigChange();
      },
    });

    createPixelButton(this, {
      x: CHARACTER_CREATE.letsRideButtonX,
      y: CHARACTER_CREATE.actionButtonY,
      label: "Let's ride! →",
      onClick: () => {
        // Explicit save here too (belt-and-suspenders): every prior change
        // already persisted via applyConfigChange, so this is redundant in
        // practice, but it's the documented contract for this button and
        // keeps navigation correct even if that ever changes.
        getSave().saveCharacter(this.config);
        this.scene.start(SCENE_KEYS.levelSelect);
      },
    });
  }
}
