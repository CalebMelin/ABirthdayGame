// Ambient decoration renderer (PLAN-05 ST-4): draws a level's static scenery
// — tutorial signs, ad billboards, party balloons, streamers — as PLACEHOLDER
// pixel shapes sitting relative to the ground surface. Purely visual: NOTHING
// here creates a Matter body, so decorations never touch NORTH_STAR §8's
// <100-physics-bodies-per-level budget. Real pixel-art decorations arrive in
// PLAN-10; this file is placeholder plumbing (create-once / destroy-on-teardown
// handle), mirroring terrain.ts's / themes.ts's handle pattern.
//
// UNLIKE terrain.ts / themes.ts / bike.ts, this module is NOT written to be
// Node/Vitest import-safe: it pulls in createPixelText from ui.ts (which DOES
// `import Phaser from 'phaser'` at runtime), so it can only be imported from
// browser-side code (GameScene). That's fine — no test imports it, and the
// signs/billboards genuinely need the shared pixel-text helper. Its own Phaser
// import is still type-only (`import type Phaser`), and every drawing call goes
// through the `scene` handle it's given, same contract as createTerrain.
import type Phaser from 'phaser';
import { DEPTHS, TEXTURE_KEYS, PALETTE } from './constants';
import { createPixelText } from './ui';
import { THEMES } from './themes';
import type { LevelConfig, DecorationSpec } from '../levels/types';
import type { TerrainHandle } from './terrain';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** The handle GameScene (ST-4) holds for a level's decorations. Create-once
 * (via createDecorations) / destroy()-on-teardown, mirroring TerrainHandle /
 * BackdropHandle. No update() — decorations are static (they parallax with the
 * world via their world-space position, not per-frame code). */
export interface DecorationsHandle {
  /** Destroys every GameObject createDecorations created. Call on level
   * teardown/restart — same lifecycle as TerrainHandle.destroy. (scene.restart
   * would sweep these anyway; the explicit destroy is for parity/clarity with
   * terrain/backdrop teardown.) */
  destroy(): void;
}

// ---------------------------------------------------------------------------
// Presentation-only local constants. Following the themes.ts / terrain.ts /
// ui.ts precedent, placeholder-art DRAWING dimensions (with no gameplay
// effect) stay as documented local constants here rather than in constants.ts
// — they're the shape of throwaway placeholder art (PLAN-10 replaces the art
// wholesale), not tunable gameplay numbers. All lengths are px at the
// 1280x720 DESIGN scale.
// ---------------------------------------------------------------------------

// --- Sign: a small roadside post + board carrying a short tutorial callout.
const SIGN_POST_WIDTH_PX = 10;
/** How far the post rises above the ground surface (board sits on top). */
const SIGN_POST_HEIGHT_PX = 64;
const SIGN_BOARD_HEIGHT_PX = 44;
/** Board grows to fit its text (like ui.ts's buttons) but never narrower. */
const SIGN_BOARD_MIN_WIDTH_PX = 120;
/** Horizontal padding each side between the sign text and the board edge. */
const SIGN_TEXT_PAD_PX = 16;
/** Sign text size, px (snapped to the 8px pixel grid by createPixelText). */
const SIGN_TEXT_SIZE_PX = 12;
const SIGN_OUTLINE_PX = 4;
/** Height of the accent-colored strip along the top of the sign board. */
const SIGN_STRIP_HEIGHT_PX = 8;

// --- Billboard: a larger board on a tall pole, elevated well above the road.
const BILLBOARD_POST_WIDTH_PX = 16;
const BILLBOARD_POST_HEIGHT_PX = 190;
const BILLBOARD_BOARD_HEIGHT_PX = 110;
const BILLBOARD_BOARD_MIN_WIDTH_PX = 220;
const BILLBOARD_TEXT_PAD_PX = 24;
/** Billboard text size, px (bigger than a sign — snapped by createPixelText). */
const BILLBOARD_TEXT_SIZE_PX = 20;
/** Billboard frame stroke width, px (drawn in the theme accent color). */
const BILLBOARD_OUTLINE_PX = 6;

// --- Balloon: a tinted balloon sprite floating on a short string above the road.
/** Gap between the ground surface and the balloon's knot (its bottom). */
const BALLOON_FLOAT_HEIGHT_PX = 170;
const BALLOON_STRING_WIDTH_PX = 3;
const BALLOON_STRING_LENGTH_PX = 40;
/** The tex-balloon placeholder is 24x32; scale it up to read as a balloon. */
const BALLOON_SCALE = 2.4;

// --- Streamer: a short hanging zigzag ribbon in the theme accent color.
/** Gap between the ground surface and the top (anchor) of the streamer. */
const STREAMER_FLOAT_HEIGHT_PX = 150;
const STREAMER_LENGTH_PX = 120;
const STREAMER_SEGMENTS = 5;
const STREAMER_AMPLITUDE_PX = 18;
const STREAMER_THICKNESS_PX = 6;

// ---------------------------------------------------------------------------
// Per-kind drawers. Each pushes every GameObject it creates onto `objects` so
// the handle can destroy them all. Everything sits at DEPTHS.props (same layer
// as the finish flag) — behind the bike/rider, in front of terrain/backdrop.
// ---------------------------------------------------------------------------

type DecoObjects = Phaser.GameObjects.GameObject[];

/** A small roadside sign: dark post, cream board (grown to fit its text) with
 * an accent strip along the top, and the callout text. Stands on the surface. */
function drawSign(
  scene: Phaser.Scene,
  spec: DecorationSpec,
  surfaceY: number,
  accent: number,
  objects: DecoObjects
): void {
  const boardCenterY = surfaceY - SIGN_POST_HEIGHT_PX - SIGN_BOARD_HEIGHT_PX / 2;

  const post = scene.add
    .rectangle(spec.x, surfaceY, SIGN_POST_WIDTH_PX, SIGN_POST_HEIGHT_PX, PALETTE.outline)
    .setOrigin(0.5, 1)
    .setDepth(DEPTHS.props);

  // Text first so the board can be sized to fit it. Depth props+1 so it always
  // draws over the board regardless of add order (Phaser sorts by depth).
  const label = createPixelText(scene, spec.x, boardCenterY, spec.text ?? '', SIGN_TEXT_SIZE_PX).setDepth(
    DEPTHS.props + 1
  );
  const boardWidth = Math.max(SIGN_BOARD_MIN_WIDTH_PX, label.width + SIGN_TEXT_PAD_PX * 2);

  const board = scene.add
    .rectangle(spec.x, boardCenterY, boardWidth, SIGN_BOARD_HEIGHT_PX, PALETTE.cream)
    .setStrokeStyle(SIGN_OUTLINE_PX, PALETTE.outline)
    .setDepth(DEPTHS.props);
  const strip = scene.add
    .rectangle(
      spec.x,
      boardCenterY - SIGN_BOARD_HEIGHT_PX / 2 + SIGN_STRIP_HEIGHT_PX / 2,
      boardWidth,
      SIGN_STRIP_HEIGHT_PX,
      accent
    )
    .setDepth(DEPTHS.props);

  objects.push(post, board, strip, label);
}

/** A large elevated billboard: tall dark pole, cream board with an accent-
 * colored frame, and the ad text. Board floats above the surface on the pole. */
function drawBillboard(
  scene: Phaser.Scene,
  spec: DecorationSpec,
  surfaceY: number,
  accent: number,
  objects: DecoObjects
): void {
  const boardCenterY = surfaceY - BILLBOARD_POST_HEIGHT_PX - BILLBOARD_BOARD_HEIGHT_PX / 2;

  const post = scene.add
    .rectangle(spec.x, surfaceY, BILLBOARD_POST_WIDTH_PX, BILLBOARD_POST_HEIGHT_PX, PALETTE.outline)
    .setOrigin(0.5, 1)
    .setDepth(DEPTHS.props);

  const label = createPixelText(
    scene,
    spec.x,
    boardCenterY,
    spec.text ?? '',
    BILLBOARD_TEXT_SIZE_PX
  ).setDepth(DEPTHS.props + 1);
  const boardWidth = Math.max(BILLBOARD_BOARD_MIN_WIDTH_PX, label.width + BILLBOARD_TEXT_PAD_PX * 2);

  const board = scene.add
    .rectangle(spec.x, boardCenterY, boardWidth, BILLBOARD_BOARD_HEIGHT_PX, PALETTE.cream)
    .setStrokeStyle(BILLBOARD_OUTLINE_PX, accent)
    .setDepth(DEPTHS.props);

  objects.push(post, board, label);
}

/** A party balloon: the tex-balloon sprite tinted the theme accent, floating
 * above the surface with a short string trailing down from its knot. */
function drawBalloon(
  scene: Phaser.Scene,
  spec: DecorationSpec,
  surfaceY: number,
  accent: number,
  objects: DecoObjects
): void {
  const knotY = surfaceY - BALLOON_FLOAT_HEIGHT_PX;

  // String hangs DOWN from the knot (origin at its top).
  const string = scene.add
    .rectangle(spec.x, knotY, BALLOON_STRING_WIDTH_PX, BALLOON_STRING_LENGTH_PX, PALETTE.outline)
    .setOrigin(0.5, 0)
    .setDepth(DEPTHS.props);
  // Balloon floats ABOVE the knot (origin at its bottom).
  const balloon = scene.add
    .image(spec.x, knotY, TEXTURE_KEYS.balloon)
    .setOrigin(0.5, 1)
    .setScale(BALLOON_SCALE)
    .setTint(accent)
    .setDepth(DEPTHS.props);

  objects.push(string, balloon);
}

/** A hanging streamer: a short zigzag ribbon in the theme accent color,
 * dangling from a point above the surface. Cheap placeholder festivity. */
function drawStreamer(
  scene: Phaser.Scene,
  spec: DecorationSpec,
  surfaceY: number,
  accent: number,
  objects: DecoObjects
): void {
  const topY = surfaceY - STREAMER_FLOAT_HEIGHT_PX;

  const ribbon = scene.add.graphics();
  ribbon.lineStyle(STREAMER_THICKNESS_PX, accent, 1);
  ribbon.beginPath();
  ribbon.moveTo(spec.x, topY);
  for (let i = 1; i <= STREAMER_SEGMENTS; i++) {
    const y = topY + (i / STREAMER_SEGMENTS) * STREAMER_LENGTH_PX;
    const x = spec.x + (i % 2 === 0 ? STREAMER_AMPLITUDE_PX : -STREAMER_AMPLITUDE_PX);
    ribbon.lineTo(x, y);
  }
  ribbon.strokePath();
  ribbon.setDepth(DEPTHS.props);

  objects.push(ribbon);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Renders every entry in `config.decorations` as placeholder scenery sitting
 * relative to the ground surface (`terrain.heightAt(spec.x)`), tinted with the
 * level theme's prop accent. Returns a handle whose destroy() removes them all.
 *
 * `scene` is used purely as a runtime handle to Phaser's GameObject factories
 * (same contract as createTerrain/createBackdrop). NO Matter bodies are created
 * — decorations are inert visuals only.
 */
export function createDecorations(
  scene: Phaser.Scene,
  config: LevelConfig,
  terrain: TerrainHandle
): DecorationsHandle {
  const objects: DecoObjects = [];
  const accent = THEMES[config.theme].props.accent;

  for (const spec of config.decorations ?? []) {
    const surfaceY = terrain.heightAt(spec.x);
    switch (spec.kind) {
      case 'sign':
        drawSign(scene, spec, surfaceY, accent, objects);
        break;
      case 'billboard':
        drawBillboard(scene, spec, surfaceY, accent, objects);
        break;
      case 'balloon':
        drawBalloon(scene, spec, surfaceY, accent, objects);
        break;
      case 'streamer':
        drawStreamer(scene, spec, surfaceY, accent, objects);
        break;
      default: {
        // Exhaustiveness guard: a new DecorationKind with no case above makes
        // `spec.kind` no longer `never` here -> compile error. Runtime no-op.
        const _exhaustive: never = spec.kind;
        void _exhaustive;
        break;
      }
    }
  }

  return {
    destroy(): void {
      for (const obj of objects) obj.destroy();
      objects.length = 0;
    },
  };
}
