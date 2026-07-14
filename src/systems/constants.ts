// Shared presentation constants. Keep gameplay tuning numbers out of this file
// until later plans introduce them (see PLAN-00 Task B / CLAUDE.md conventions).

/** Design resolution — 16:9 landscape, scales cleanly for pixel art. */
export const DESIGN_WIDTH = 960;
export const DESIGN_HEIGHT = 540;

/** Pastel background used both in the Phaser canvas and the page CSS
 * (see the inline <style> in index.html — kept in sync manually since
 * HTML can't import this constant), so the letterbox bars (from
 * Scale.FIT) match the game background. */
export const PASTEL_BG_COLOR = 0xffd6e8; // soft pink, a.k.a. #ffd6e8

/** Text color for placeholder/UI copy on the pastel background. */
export const TEXT_COLOR = '#4a2c40';
