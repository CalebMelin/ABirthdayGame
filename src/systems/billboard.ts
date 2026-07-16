// Level 18 "Billboard Row" easter-egg billboard (PLAN-07 task 3). NORTH_STAR
// §5 row 18: a background sign reading the locked billboard text — "subtle,
// among decoy billboards." The whole point is that it must be discoverable
// ONLY by reading it, never by looking different from its decoy siblings.
//
// CONTROLLER DECISION (DECISIONS.md): the plan text asks for both "style it
// like the decoys (same billboard frame)" AND "parallax background layer" —
// these conflict, since the existing decoy billboards are WORLD-ANCHORED
// props at DEPTHS.props (scrollFactor 1), not on themes.ts's true fractional-
// scrollFactor parallax layers. Resolved toward the dominant requirement: the
// egg renders through the EXACT SAME drawer (decorations.ts's exported
// drawBillboard), on the SAME DEPTHS.props layer, with the SAME scrollFactor-1
// world-anchored scroll behavior as every decoy — "background" is satisfied by
// sitting behind the bike/rider and being purely non-interactive, not by a
// fractional parallax rate. One shared drawer is what makes "same frame, same
// scroll behavior" provably true rather than merely intended.
//
// Static: ZERO Matter bodies (nothing here has ever created one — decorations
// never do, per NORTH_STAR §8's budget), and NO fixed-step listener — unlike
// traffic.ts/police.ts/wheelieRider.ts, nothing here moves, reacts to the
// player, or can ever fail/award anything. update() is a permanent no-op;
// destroy() tears down every GameObject drawBillboard created (idempotent —
// a second call sees an already-emptied array and no-ops).
//
// Like traffic.ts/pickup.ts/police.ts/wheelieRider.ts (and UNLIKE decorations.ts
// BEFORE this task), this file has NO runtime Phaser import (`import type
// Phaser` only, erased at compile time) — its only non-type imports are
// decorations.ts's exported drawBillboard (itself Node-safe as of this task —
// see its module doc) and themes.ts's THEMES table (also Node-safe, per its
// own module doc) — so it stays import-safe in Node, exercised by
// tests/events.test.ts's dispatch seam tests. There is no pure logic of its
// own beyond a straight pass-through into drawBillboard/THEMES, both already
// tested at their own definition site, so this file has no dedicated test
// file — the browser harness (scripts/playtest-level18.mjs) covers the
// rendered result end-to-end.
import type Phaser from 'phaser';
import { drawBillboard } from './decorations';
import { THEMES } from './themes';
import type { LevelEventHandle, EventContext } from '../levels/events';
import type { BillboardEvent, ThemeId } from '../levels/types';

/**
 * Builds level 18's easter-egg billboard and returns a {@link LevelEventHandle}
 * GameScene drives. `scene`/`ctx` are runtime handles only (same contract as
 * createBike/createPolice/createPickup/createWheelieRider). `theme` is the
 * level's ThemeId — `dispatchLevelEvents` passes `config.theme` straight
 * through (it already has `config` in scope at the dispatch switch) — the ONE
 * thing this event system needs that no other one does, so its board's
 * accent-colored outline matches the level's decoy billboards EXACTLY
 * (drawBillboard resolves `THEMES[theme].props.accent` the identical way
 * `createDecorations` does for every decoy). NO Matter body is created;
 * nothing here moves, listens for input, or reacts to the player — the
 * billboard just sits in the world like any other decoration.
 */
export function createBillboard(
  scene: Phaser.Scene,
  event: BillboardEvent,
  ctx: EventContext,
  theme: ThemeId
): LevelEventHandle {
  const surfaceY = ctx.terrain.heightAt(event.x);
  const accent = THEMES[theme].props.accent;
  const objects = drawBillboard(scene, event.x, surfaceY, event.text, accent);

  return {
    update(): void {
      // No-op: the billboard is a static decoration — it never moves, never
      // reacts to the player, never fails/awards anything. The seam still
      // calls this every render frame.
    },
    destroy(): void {
      // Idempotent: a second call sees an already-emptied array and no-ops
      // (Phaser's own GameObject.destroy() also tolerates repeated calls).
      for (const obj of objects) obj.destroy();
      objects.length = 0;
    },
  };
}
