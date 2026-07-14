import Phaser from 'phaser';
import {
  BIKE_TUNING,
  DESIGN_HEIGHT,
  DESIGN_WIDTH,
  PALETTE,
  SCENE_KEYS,
  TEXTURE_KEYS,
} from '../systems/constants';
import { loadPixelFont } from '../systems/fonts';

type TextureName = keyof typeof TEXTURE_KEYS;

/** Placeholder colored-rectangle sizes for each generated texture.
 * PLACEHOLDER ONLY — real pixel art replaces this table in PLAN-10; the
 * keys it draws from (TEXTURE_KEYS) live in constants.ts since later plans
 * depend on those names, but these size/color literals don't outlive this
 * scene's placeholder era, so they stay local. */
const TEXTURE_SPECS: Record<
  TextureName,
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
  policeCar: { width: 110, height: 40, color: PALETTE.bgPink },
  flag: { width: 24, height: 64, color: PALETTE.sunshine },
  tulip: { width: 16, height: 24, color: PALETTE.grass },
  balloon: { width: 24, height: 32, color: PALETTE.white },
};

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
  }

  create(): void {
    this.generatePlaceholderTextures();

    void loadPixelFont().then(() => {
      this.scene.start(SCENE_KEYS.title);
    });
  }

  /**
   * Chunky, sharp-cornered pixel loading bar wired to the real Phaser
   * loader. The load queue is currently EMPTY (the pixel font is fetched
   * separately via the CSS Font Loading API in create(), and art PNGs
   * don't exist yet), so Phaser fires progress=1 / 'complete' ~immediately
   * with nothing to show — that is expected; this wiring is the
   * deliverable, so later plans that add `this.load.image(...)` calls get
   * a working bar for free. No text is drawn here since the pixel font
   * isn't loaded yet at preload() time.
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
   * TEXTURE_KEYS entry (skipping any that already exist, so restarting
   * this scene doesn't warn about duplicate texture keys). Real art
   * replaces this in PLAN-10 without call sites changing, since they only
   * ever reference the TEXTURE_KEYS name. */
  private generatePlaceholderTextures(): void {
    (Object.keys(TEXTURE_SPECS) as TextureName[]).forEach((name) => {
      const key = TEXTURE_KEYS[name];
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
}
