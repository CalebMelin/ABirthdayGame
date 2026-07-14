// Shared presentation constants and tunable gameplay numbers.
// See CLAUDE.md conventions: all gameplay tuning lives here or in level configs.

/** Design resolution — 16:9 landscape, scales cleanly for pixel art. */
export const DESIGN_WIDTH = 1280;
export const DESIGN_HEIGHT = 720;

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

/** Convert 0xRRGGBB hex color to CSS '#rrggbb' string.
 * Input is clamped to the low 24 bits so negative/out-of-range/float
 * values can't produce garbage strings. */
export function hexToCss(color: number): string {
  return `#${((color >>> 0) & 0xffffff).toString(16).padStart(6, '0')}`;
}

/** Pastel background used both in the Phaser canvas and the page chrome.
 * Manually kept in sync with TWO spots in index.html (HTML can't import
 * this constant): the inline <style> body background and the
 * <meta name="theme-color"> tag, so the letterbox bars (from
 * Scale.FIT) and the mobile browser UI match the game background. */
export const PASTEL_BG_COLOR = PALETTE.bgPink; // soft pink, a.k.a. #ffd6e8

/** Text color for placeholder/UI copy on the pastel background. */
export const TEXT_COLOR = hexToCss(PALETTE.plum); // '#4a2c40'

/** Matter.js world gravity-y. Placeholder; tuned in PLAN-02. */
export const GRAVITY_Y = 1;

/** Physics tuning for the bike.
 * All values are placeholders to be tuned in PLAN-02. */
export const BIKE_TUNING = {
  /** Bike body width, px. */
  chassisWidth: 96,
  /** Bike body height, px. */
  chassisHeight: 28,
  /** Wheel radius, px. */
  wheelRadius: 18,
  /** Distance between wheel centers, px. */
  wheelbase: 74,
  /** Matter constraint stiffness for suspension (0–1). */
  suspensionStiffness: 0.08,
  /** Matter constraint damping for suspension (0–1). */
  suspensionDamping: 0.12,
  /** Torque applied to the rear wheel when holding gas. */
  gasTorque: 0.06,
  /** Torque opposing wheel spin when braking. */
  brakeTorque: 0.05,
  /** Torque for pitching the bike while airborne. */
  airSpinTorque: 0.04,
  /** Cap on wheel angular velocity, rad per physics step. */
  maxWheelAngularVelocity: 0.9,
} as const;

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

/** Press Start 2P is drawn on an 8px grid; sizes off that grid blur/shimmer
 * at non-integer sub-pixel scales. */
export const FONT_PIXEL_GRID_PX = 8;

/** Snaps a requested font size to the pixel font's 8px design grid:
 * rounds to the nearest multiple of FONT_PIXEL_GRID_PX, minimum one grid
 * step (8px). Pure function — unit-tested in tests/ui.test.ts. Lives here
 * (not ui.ts) so tests can import it without pulling Phaser into node. */
export function snapFontSize(sizePx: number): number {
  return Math.max(
    FONT_PIXEL_GRID_PX,
    Math.round(sizePx / FONT_PIXEL_GRID_PX) * FONT_PIXEL_GRID_PX
  );
}

/** Minimum touch-target size in pixels per project quality bar. */
export const UI_MIN_TOUCH_PX = 88;

/** Total number of levels in the game. A locked fact from NORTH_STAR.md —
 * never make this configurable or derive it from level data. */
export const TOTAL_LEVELS = 22;

/** Centralized scene keys — all scenes and transitions reference these
 * instead of string literals. See NORTH_STAR.md §4 for the scene flow. */
export const SCENE_KEYS = {
  boot: 'BootScene',
  title: 'TitleScene',
  characterCreation: 'CharacterCreationScene',
  levelSelect: 'LevelSelectScene',
  game: 'GameScene',
  levelComplete: 'LevelCompleteScene',
  party: 'PartyScene',
  credits: 'CreditsScene',
} as const;
