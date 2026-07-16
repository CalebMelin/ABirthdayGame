// Shared centered pixel-font text helper (PLAN-07 task 3 code-review fix).
//
// WHY THIS FILE EXISTS: ui.ts's `createPixelText` is the canonical
// implementation, but ui.ts has a RUNTIME `import Phaser from 'phaser'`
// (needed ONLY by createPixelButton's `Phaser.Geom.Rectangle` hit-area
// construction, ~ui.ts's createPixelButton) — so any module that must stay
// Node/Vitest-import-safe (no runtime Phaser in its import graph) cannot
// import ui.ts at all, even just for createPixelText. Four files independently
// worked around this by replicating the same ~15-line helper locally from the
// shared font constants: pickup.ts, police.ts, tricks.ts, and (added by
// PLAN-07 task 3, which also grew a `lineSpacingPx` param the other three
// never needed) decorations.ts — four copies of one function, and already
// diverged. This module is the one shared, import-safe home: `import type
// Phaser from 'phaser'` only (a type-only import is erased at compile time —
// see tsconfig's `verbatimModuleSyntax`) plus plain runtime imports from
// constants.ts, so any pure-logic module can import `pixelText` from here
// without dragging real Phaser into its (or a test's) import graph.
//
// decorations.ts now imports from here instead of carrying its own copy, and
// ui.ts's exported `createPixelText` delegates here too (its own exported
// signature/behavior unchanged — ui.ts already pays for a runtime Phaser
// import for createPixelButton, so importing this module costs it nothing).
// pickup.ts/police.ts/tricks.ts still hold their own local copies for now
// (deliberately left untouched by this fix, to keep it minimal) — each
// migrates to import from here the next time its file is touched (see
// DECISIONS.md's PLAN-07 task 3 review-follow-up entry).
import type Phaser from 'phaser';
import { FONT_STACK_PIXEL, TEXT_COLOR, snapFontSize } from './constants';

/**
 * Centered pixel-font text using the project's pixel font stack.
 *
 * Press Start 2P is designed on an 8px grid, so `sizePx` is clamped/rounded
 * to the nearest multiple of 8 (minimum 8) via snapFontSize — this keeps
 * glyphs crisp instead of blurry at odd sizes. `lineSpacingPx` (default 0)
 * sets Phaser's Text style `lineSpacing` — used by multi-line (word-wrapped)
 * labels (e.g. decorations.ts's drawBillboard); single-line callers simply
 * don't need it.
 */
export function pixelText(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  sizePx: number,
  lineSpacingPx = 0
): Phaser.GameObjects.Text {
  return scene.add
    .text(Math.round(x), Math.round(y), text, {
      fontFamily: FONT_STACK_PIXEL,
      fontSize: `${snapFontSize(sizePx)}px`,
      color: TEXT_COLOR,
      align: 'center',
      lineSpacing: lineSpacingPx,
    })
    .setOrigin(0.5);
}
