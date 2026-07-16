// Ambient decoration renderer (PLAN-05 ST-4): draws a level's static scenery
// — tutorial signs, ad billboards, party balloons, streamers — as PLACEHOLDER
// pixel shapes sitting relative to the ground surface. Purely visual: NOTHING
// here creates a Matter body, so decorations never touch NORTH_STAR §8's
// <100-physics-bodies-per-level budget. Real pixel-art decorations arrive in
// PLAN-10; this file is placeholder plumbing (create-once / destroy-on-teardown
// handle), mirroring terrain.ts's / themes.ts's handle pattern.
//
// AS OF PLAN-07 task 3, this module IS Node/Vitest import-safe (like
// terrain.ts/bike.ts/themes.ts/traffic.ts/police.ts/wheelieRider.ts): it no
// longer imports createPixelText from ui.ts (which DOES `import Phaser from
// 'phaser'` at runtime — the thing that made this file test-unsafe pre-PLAN-07).
// It draws pixel text via the shared `pixelText` helper (./pixelText.ts — an
// import-safe extraction of ui.ts's createPixelText's actual implementation,
// pulled out by a PLAN-07 task 3 code-review fix once this module's own local
// copy became the FOURTH near-identical replica across the codebase; see that
// module's doc + DECISIONS.md) rather than a local copy of its own. This
// matters because src/systems/billboard.ts (level 18's easter-egg billboard,
// PLAN-07 task 3) imports this module's exported `drawBillboard` directly —
// the SAME function createDecorations calls for every decoy billboard — so
// the egg and its decoys can never visually drift apart (one shared drawer,
// one source of frame pixels), and importing it must not drag real Phaser
// into events.ts's import graph (which tests/events.test.ts imports under
// plain Node). The exported pure `wrapBillboardText` helper is exercised
// directly by tests/decorations.test.ts; `createDecorations`/`drawBillboard`/
// the other per-kind drawers only ever CALL METHODS on the `scene` handle
// they're given, same contract as createTerrain.
import type Phaser from 'phaser';
import { DEPTHS, TEXTURE_KEYS, PALETTE, BILLBOARD } from './constants';
import { pixelText } from './pixelText';
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
/** Sign text size, px (snapped to the 8px pixel grid by the shared pixelText). */
const SIGN_TEXT_SIZE_PX = 12;
const SIGN_OUTLINE_PX = 4;
/** Height of the accent-colored strip along the top of the sign board. */
const SIGN_STRIP_HEIGHT_PX = 8;

// --- Billboard: a larger board on a tall pole, elevated well above the road.
// Board WIDTH/HEIGHT/padding + word-wrap tunables live in constants.ts's
// BILLBOARD block (PLAN-07 task 3) instead of here — unlike this pole/outline/
// text-size placeholder-art shape, board sizing now serves a real gameplay
// requirement (the level-18 easter egg's "subtle, same family as the decoys"
// mandate), not just decorative fluff — see that block's doc comment.
const BILLBOARD_POST_WIDTH_PX = 16;
const BILLBOARD_POST_HEIGHT_PX = 190;
/** Billboard text size, px (bigger than a sign — snapped by the shared pixelText). */
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
  const label = pixelText(scene, spec.x, boardCenterY, spec.text ?? '', SIGN_TEXT_SIZE_PX).setDepth(
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

/**
 * Greedy word-wrap: re-joins `text`'s words with spaces, breaking to a new
 * line (joined by '\n') only once a line would exceed `maxCharsPerLine`
 * characters — never mid-word. A single word LONGER than `maxCharsPerLine` is
 * kept whole, unsplit, on its own line. Press Start 2P is a fixed-width pixel
 * font, so a CHARACTER budget is a simple, Node-testable stand-in for a real
 * (browser-only) pixel-width measurement — see BILLBOARD.wrapMaxChars's doc.
 *
 * ROUND-TRIP PROPERTY (relied on by scripts/playtest-level18.mjs's verbatim
 * egg-text check): for any single-spaced `text` with no leading/trailing/
 * repeated whitespace (true of every billboard's authored copy),
 * `wrapBillboardText(text, n).replace(/\n/g, ' ') === text` — wrapping only
 * ever REPLACES a space with a newline, it never adds, drops, reorders, or
 * duplicates a character.
 *
 * Pure — no Phaser/DOM. Always returns a defined string: an empty/blank
 * `text` yields `''` (matching drawBillboard's `text` contract — callers
 * already guard `spec.text ?? ''`), never throws.
 */
export function wrapBillboardText(text: string, maxCharsPerLine: number): string {
  const words = text.split(' ').filter((word) => word.length > 0);
  if (words.length === 0) return '';

  const lines: string[] = [];
  let current = words[0];
  for (let i = 1; i < words.length; i++) {
    const candidate = `${current} ${words[i]}`;
    if (candidate.length <= maxCharsPerLine) {
      current = candidate;
    } else {
      lines.push(current);
      current = words[i];
    }
  }
  lines.push(current);
  return lines.join('\n');
}

/**
 * Draws one billboard's full frame — tall dark pole, cream board with an
 * accent-colored outline, and the (possibly word-wrapped) ad/egg text — and
 * returns every GameObject it created. Board floats above the surface on the
 * pole; sized to fit its (wrapped) text on BOTH axes, floored at
 * BILLBOARD.boardMinWidthPx / boardBaseHeightPx (the exact pre-wrap fixed
 * dimensions), so an existing short single-line decoy renders unchanged.
 *
 * SHARED: this is the ONE function that draws a billboard's frame pixels —
 * `createDecorations` below calls it for every decoy `{kind:'billboard'}`
 * entry, and src/systems/billboard.ts calls it directly for level 18's
 * easter-egg billboard event, so the two can never visually drift apart
 * (NORTH_STAR: the egg must read as "just another billboard," subtle among
 * its decoys). Takes primitives (not a DecorationSpec) so a caller with no
 * DecorationSpec to hand (billboard.ts's BillboardEvent) doesn't need to
 * fabricate one just to call this.
 */
export function drawBillboard(
  scene: Phaser.Scene,
  x: number,
  surfaceY: number,
  text: string,
  accent: number
): Phaser.GameObjects.GameObject[] {
  const wrapped = wrapBillboardText(text, BILLBOARD.wrapMaxChars);

  const post = scene.add
    .rectangle(x, surfaceY, BILLBOARD_POST_WIDTH_PX, BILLBOARD_POST_HEIGHT_PX, PALETTE.outline)
    .setOrigin(0.5, 1)
    .setDepth(DEPTHS.props);

  // Label created at a THROWAWAY y first so its real (possibly multi-line)
  // width/height can be measured (mirrors ui.ts's createPixelButton, which
  // measures its label before sizing the button around it) — repositioned
  // below once boardCenterY is known. ONE Text object carrying embedded '\n's
  // (not several stacked Text objects): Phaser's own multi-line layout +
  // `align:'center'` centers every line within the block for free, and the
  // egg's verbatim text survives intact (modulo space<->newline at wrap
  // points — see wrapBillboardText's round-trip property) as ONE object's
  // `.text`, which is what scripts/playtest-level18.mjs's "exactly one text
  // object" check depends on.
  const label = pixelText(scene, x, 0, wrapped, BILLBOARD_TEXT_SIZE_PX, BILLBOARD.lineSpacingPx).setDepth(
    DEPTHS.props + 1
  );

  const boardWidth = Math.max(BILLBOARD.boardMinWidthPx, label.width + BILLBOARD.textPadPx * 2);
  const boardHeight = Math.max(BILLBOARD.boardBaseHeightPx, label.height + BILLBOARD.textPadPx * 2);
  const boardCenterY = surfaceY - BILLBOARD_POST_HEIGHT_PX - boardHeight / 2;
  label.setPosition(x, boardCenterY);

  const board = scene.add
    .rectangle(x, boardCenterY, boardWidth, boardHeight, PALETTE.cream)
    .setStrokeStyle(BILLBOARD_OUTLINE_PX, accent)
    .setDepth(DEPTHS.props);

  return [post, board, label];
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
        objects.push(...drawBillboard(scene, spec.x, surfaceY, spec.text ?? '', accent));
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
