import Phaser from 'phaser';
import {
  BIKE_TUNING,
  DESIGN_HEIGHT,
  DESIGN_WIDTH,
  GABBY_BASE_LAYOUT,
  PALETTE,
  SCENE_KEYS,
  TEXTURE_KEYS,
} from '../systems/constants';
import { loadPixelFont } from '../systems/fonts';
import { MARKERS } from '../systems/palette';
import { ART_MANIFEST } from '../systems/artManifest';

type TextureName = keyof typeof TEXTURE_KEYS;

/** Names this scene draws as a single solid-color placeholder rect (see
 * TEXTURE_SPECS below). Excludes the PLAN-04 marker-composite base
 * textures (gabbyBase / bikeBase), which need SEVERAL differently-colored
 * regions rather than one solid fill — see generateMarkerBaseTextures. Also
 * excludes PLAN-07's `wheelieRider` texture: level 11's easter egg is the one
 * entity confined to a single level, so src/systems/wheelieRider.ts generates
 * it lazily (guarded, like a recolorTexture variant) the first time that
 * level actually needs it, rather than pre-generating it here for every boot. */
type SolidTextureName = Exclude<TextureName, 'gabbyBase' | 'bikeBase' | 'wheelieRider'>;

/** Placeholder colored-rectangle sizes for each generated texture.
 * PLACEHOLDER ONLY — real pixel art replaces this table in PLAN-10; the
 * keys it draws from (TEXTURE_KEYS) live in constants.ts since later plans
 * depend on those names, but these size/color literals don't outlive this
 * scene's placeholder era, so they stay local. */
const TEXTURE_SPECS: Record<
  SolidTextureName,
  { width: number; height: number; color: number }
> = {
  bike: {
    width: BIKE_TUNING.chassisWidth,
    height: BIKE_TUNING.chassisHeight,
    color: PALETTE.coral,
  },
  wheel: {
    width: BIKE_TUNING.wheelRadius * 2,
    height: BIKE_TUNING.wheelRadius * 2,
    color: PALETTE.plum,
  },
  gabby: { width: 24, height: 48, color: PALETTE.lavender },
  caleb: { width: 24, height: 48, color: PALETTE.sky },
  car: { width: 110, height: 40, color: PALETTE.mint },
  // outline (near-black), not bgPink: bgPink matches the canvas clear color,
  // which would make the police car invisible during placeholder-era playtests.
  policeCar: { width: 110, height: 40, color: PALETTE.outline },
  flag: { width: 24, height: 64, color: PALETTE.sunshine },
  tulip: { width: 16, height: 24, color: PALETTE.grass },
  balloon: { width: 24, height: 32, color: PALETTE.white },
};

/** Region layout for the PLAN-04 marker-composite bike base texture (see
 * generateBikeBaseTexture). PLACEHOLDER ONLY. Sized against
 * TEXTURE_SPECS.bike (96x28, i.e. BIKE_TUNING.chassisWidth/chassisHeight):
 * a thin dark outline band at outlineBandY so the mostly-MARKERS.bikeBody
 * fill reads as a bike, not a pure green slab. */
const BIKE_BASE_LAYOUT = {
  outlineBandY: 20,
  outlineBandHeight: 4,
} as const;

/**
 * Boot scene: draws a pixel-styled progress bar while assets load, then
 * registers placeholder textures and hands off to TitleScene once the pixel
 * font has loaded (or timed out).
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super(SCENE_KEYS.boot);
  }

  preload(): void {
    this.createProgressBar();
    this.loadManifestArt();
  }

  create(): void {
    this.generatePlaceholderTextures();
    this.generateMarkerBaseTextures();

    void loadPixelFont().then(() => {
      this.scene.start(SCENE_KEYS.title);
    });
  }

  /** PLAN-10: queue the real committed PNGs (src/art -> public/assets) named in
   * ART_MANIFEST. This also finally gives the progress bar something to show.
   * Guarded by textures.exists so a BootScene restart doesn't re-queue an
   * already-registered key. Every other TEXTURE_KEYS entry is generated as a
   * placeholder in create() until a later subtask adds its art + manifest row. */
  private loadManifestArt(): void {
    (Object.entries(ART_MANIFEST) as [TextureName, string][]).forEach(
      ([name, path]) => {
        const key = TEXTURE_KEYS[name];
        if (this.textures.exists(key)) {
          return;
        }
        this.load.image(key, path);
      }
    );
  }

  /**
   * Chunky, sharp-cornered pixel loading bar wired to the real Phaser
   * loader. As of PLAN-10 the queue carries the real committed art PNGs
   * (loadManifestArt), so the bar finally shows genuine load progress; the
   * pixel font is still fetched separately via the CSS Font Loading API in
   * create(). Keys without real art yet are generated as placeholders in
   * create(), so the queue grows as more art is committed. No text is drawn
   * here since the pixel font isn't loaded yet at preload() time.
   */
  private createProgressBar(): void {
    const barWidth = 400;
    const barHeight = 32;
    const borderThickness = 4;
    const x = Math.round(DESIGN_WIDTH / 2 - barWidth / 2);
    const y = Math.round(DESIGN_HEIGHT / 2 - barHeight / 2);

    const track = this.add.graphics();
    track.fillStyle(PALETTE.cream, 1);
    track.fillRect(x, y, barWidth, barHeight);
    track.lineStyle(borderThickness, PALETTE.outline, 1);
    track.strokeRect(x, y, barWidth, barHeight);

    const inset = borderThickness + 2;
    const fillMaxWidth = barWidth - inset * 2;
    const fillX = x + inset;
    const fillY = y + inset;
    const fillHeight = barHeight - inset * 2;

    const fill = this.add.graphics();

    const onProgress = (value: number): void => {
      const width = Math.round(
        fillMaxWidth * Phaser.Math.Clamp(value, 0, 1)
      );
      fill.clear();
      if (width > 0) {
        fill.fillStyle(PALETTE.coral, 1);
        fill.fillRect(fillX, fillY, width, fillHeight);
      }
    };

    const onComplete = (): void => {
      this.load.off('progress', onProgress);
      track.destroy();
      fill.destroy();
    };

    onProgress(0);
    this.load.on('progress', onProgress);
    this.load.once('complete', onComplete);
  }

  /** Generates a placeholder colored-rectangle texture for each
   * TEXTURE_SPECS entry (skipping any that already exist, so restarting
   * this scene doesn't warn about duplicate texture keys). Real art
   * replaces this in PLAN-10 without call sites changing, since they only
   * ever reference the TEXTURE_KEYS name. */
  private generatePlaceholderTextures(): void {
    (Object.keys(TEXTURE_SPECS) as SolidTextureName[]).forEach((name) => {
      const key = TEXTURE_KEYS[name];
      // PLAN-10: generate a placeholder ONLY when the texture doesn't already
      // exist. A manifested key's real committed art was loaded in preload()
      // (Phaser finishes preload() loads before create() runs), so it already
      // exists and is skipped automatically; a key with no art — or one whose
      // PNG FAILED to load — doesn't exist, so its placeholder generates as a
      // genuine fallback. (This also keeps a scene restart from re-registering
      // an existing key.)
      if (this.textures.exists(key)) {
        return;
      }

      const { width, height, color } = TEXTURE_SPECS[name];
      const gfx = this.add.graphics();
      gfx.fillStyle(color, 1);
      gfx.fillRect(0, 0, width, height);
      gfx.generateTexture(key, width, height);
      gfx.destroy();
    });
  }

  /** PLAN-04 task 1: marker-composite placeholder base textures for the
   * palette-swap engine (src/systems/palette.ts). Unlike TEXTURE_SPECS'
   * single-solid-fill placeholders above, each of these carries SEVERAL
   * differently-colored regions drawn with real MARKERS.* colors — pixels
   * `recolorTexture` can later exact-RGB-swap into a player's chosen
   * colors. The pre-existing solid tex-gabby/tex-bike/tex-wheel
   * placeholders above are UNCHANGED and still generated — and deliberately
   * KEPT, not retired: tex-gabby/tex-bike are createBike's DEFAULT texture
   * fallback (bike.ts BikeOptions.textures) so a non-character-aware caller
   * stays behavior-identical, GameScene (PLAN-04 task 4) overrides them
   * per-instance with the character variants recolored from these *-base
   * textures, and tex-wheel is always used as-is (wheels are never
   * recolored). All coexist by design. */
  private generateMarkerBaseTextures(): void {
    // PLAN-10: each generator is gated SOLELY by its own this.textures.exists
    // check. A base whose real committed art loaded in preload() (from
    // ART_MANIFEST) already exists, so its marker-composite placeholder is
    // skipped; a base with no art — or one whose PNG FAILED to load — doesn't
    // exist, so the marker-composite base generates as a genuine fallback (it
    // still carries the recolorable MARKERS regions the palette swap needs).
    this.generateGabbyBaseTexture();
    this.generateBikeBaseTexture();
  }

  /** 24x48 — MUST match the existing tex-gabby placeholder size (read
   * structurally off TEXTURE_SPECS.gabby, never re-hardcoded): bike.ts's
   * rider offset math (BIKE_TUNING.riderOffsetY etc.) assumes a 48px-tall
   * rider. Crude but clearly-separated marker regions, top to bottom: a
   * MARKERS.hair band, a skin-toned face with two MARKERS.eyes squares, and
   * a MARKERS.suit torso/legs region. Exactly ONE suit region — every
   * PLAN-04 outfit is a colorway of this SAME base art, recolored via this
   * one red region (real per-design art is PLAN-10). Skips generation if
   * the key already exists (restart-safety, matching
   * generatePlaceholderTextures). */
  private generateGabbyBaseTexture(): void {
    const key = TEXTURE_KEYS.gabbyBase;
    if (this.textures.exists(key)) {
      return;
    }

    const { width, height } = TEXTURE_SPECS.gabby;
    const { hairHeight, faceHeight, eyeSize, leftEyeX, rightEyeX, eyeInsetY } =
      GABBY_BASE_LAYOUT;

    // Loud guard against silent layout drift: GABBY_BASE_LAYOUT's absolute
    // offsets are hand-fitted to the 24x48 size. If a later edit shrank the
    // texture below the hair+face bands, the suit region's computed height
    // (height - hairHeight - faceHeight) would go <= 0 and the whole
    // recolorable suit region would vanish silently — assert so it's loud.
    console.assert(
      hairHeight + faceHeight < height,
      'gabby base layout (hair+face) exceeds texture height'
    );

    const gfx = this.add.graphics();

    // Hair band across the top.
    gfx.fillStyle(MARKERS.hair, 1);
    gfx.fillRect(0, 0, width, hairHeight);

    // Face: a fixed warm skin tone — NOT a marker color, so it's never
    // touched by a palette swap.
    gfx.fillStyle(PALETTE.skin, 1);
    gfx.fillRect(0, hairHeight, width, faceHeight);

    // Eyes: two small marker squares within the face band.
    gfx.fillStyle(MARKERS.eyes, 1);
    gfx.fillRect(leftEyeX, hairHeight + eyeInsetY, eyeSize, eyeSize);
    gfx.fillRect(rightEyeX, hairHeight + eyeInsetY, eyeSize, eyeSize);

    // Torso/legs: the ONE suit region every outfit colorway recolors.
    gfx.fillStyle(MARKERS.suit, 1);
    gfx.fillRect(0, hairHeight + faceHeight, width, height - hairHeight - faceHeight);

    gfx.generateTexture(key, width, height);
    gfx.destroy();
  }

  /** 96x28 — MUST match the existing tex-bike placeholder size (read
   * structurally off TEXTURE_SPECS.bike, in turn
   * BIKE_TUNING.chassisWidth/chassisHeight). Mostly MARKERS.bikeBody with a
   * thin dark outline band so it silhouettes as a bike, not a green slab.
   * Wheels are NOT part of this texture/marker scheme — they stay
   * TEXTURE_KEYS.wheel, never recolored. Skips generation if the key
   * already exists (restart-safety, matching generatePlaceholderTextures). */
  private generateBikeBaseTexture(): void {
    const key = TEXTURE_KEYS.bikeBase;
    if (this.textures.exists(key)) {
      return;
    }

    const { width, height } = TEXTURE_SPECS.bike;
    const { outlineBandY, outlineBandHeight } = BIKE_BASE_LAYOUT;

    const gfx = this.add.graphics();

    // Body: mostly MARKERS.bikeBody so a swap is unmistakable.
    gfx.fillStyle(MARKERS.bikeBody, 1);
    gfx.fillRect(0, 0, width, height);

    // A thin dark band (never recolored — not a marker) so it silhouettes
    // as a bike rather than a pure green slab.
    gfx.fillStyle(PALETTE.outline, 1);
    gfx.fillRect(0, outlineBandY, width, outlineBandHeight);

    gfx.generateTexture(key, width, height);
    gfx.destroy();
  }
}
