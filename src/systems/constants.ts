// Shared presentation constants and tunable gameplay numbers.
// See CLAUDE.md conventions: all gameplay tuning lives here or in level configs.

/** Design resolution — 16:9 landscape, scales cleanly for pixel art. */
export const DESIGN_WIDTH = 1280;
export const DESIGN_HEIGHT = 720;

/** Pastel background used both in the Phaser canvas and the page CSS
 * (see the inline <style> in index.html — kept in sync manually since
 * HTML can't import this constant), so the letterbox bars (from
 * Scale.FIT) match the game background. */
export const PASTEL_BG_COLOR = 0xffd6e8; // soft pink, a.k.a. #ffd6e8

/** Text color for placeholder/UI copy on the pastel background. */
export const TEXT_COLOR = '#4a2c40';

/** Matter.js world gravity-y. Placeholder; tuned in PLAN-02. */
export const GRAVITY_Y = 1;

/** Physics tuning placeholders for bike and world.
 * All values are placeholders to be tuned in PLAN-02. */
export const BIKE_TUNING = {
  /** Placeholder; tuned in PLAN-02. */
  chassisWidth: 96,
  /** Placeholder; tuned in PLAN-02. */
  chassisHeight: 28,
  /** Placeholder; tuned in PLAN-02. */
  wheelRadius: 18,
  /** Placeholder; tuned in PLAN-02. */
  wheelbase: 74,
  /** Placeholder; tuned in PLAN-02. */
  suspensionStiffness: 0.08,
  /** Placeholder; tuned in PLAN-02. */
  suspensionDamping: 0.12,
  /** Placeholder; tuned in PLAN-02. */
  gasTorque: 0.06,
  /** Placeholder; tuned in PLAN-02. */
  brakeTorque: 0.05,
  /** Placeholder; tuned in PLAN-02. */
  airSpinTorque: 0.04,
  /** Placeholder; tuned in PLAN-02. */
  maxWheelAngularVelocity: 0.9,
} as const;

/** Named pastel pixel-art colors as 0xRRGGBB values. */
export const PALETTE = {
  bgPink: 0xffd6e8,
  plum: 0x4a2c40,
  cream: 0xfef4e6,
  mint: 0xc8e6d7,
  sky: 0xd4e7f7,
  lavender: 0xe8d4f1,
  sunshine: 0xffeaa7,
  coral: 0xffb3a7,
  grass: 0xb8e6a0,
  white: 0xfbfbfb,
  outline: 0x2a1820,
} as const;

/** Convert 0xRRGGBB hex color to CSS '#rrggbb' string. */
export function hexToCss(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

/** Z-depth layers for rendering order. */
export const DEPTHS = {
  background: 0,
  terrain: 10,
  props: 20,
  pickups: 30,
  bike: 40,
  rider: 50,
  fx: 60,
  hud: 100,
  ui: 110,
  overlay: 120,
} as const;

/** Pixel font family (to be loaded in a later plan). */
export const FONT_FAMILY_PIXEL = 'Press Start 2P';

/** Full CSS font-family stack with fallbacks. */
export const FONT_STACK_PIXEL = "'Press Start 2P', 'Courier New', monospace";

/** Minimum touch-target size in pixels per project quality bar. */
export const UI_MIN_TOUCH_PX = 88;
