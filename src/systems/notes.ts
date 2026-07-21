// Level-complete note SELECTION engine (PLAN-08 task 2 — NORTH_STAR §6). Given
// a 1-indexed level number + the save system, returns the ONE note the
// level-complete screen should show, as `{ text, style }`. The screen itself
// (a later task) maps `style` -> card title/look; this module only decides
// WHICH note and marks pool consumption.
//
// Import-safe like save.ts / tricks.ts / police.ts: NO runtime Phaser import
// and NO ui.ts import — the only imports are the save-system TYPE and the pure
// notes data — so the whole selection rule is exercised in plain-Node Vitest
// (tests/notes.test.ts) with a fake KVStorage + an injected deterministic RNG.
//
// Selection rules (NORTH_STAR §6 + PLAN-08 task 2):
//   - Fixed notes (levels 6/9/13/14) OVERRIDE: they always return their
//     locked note and NEVER enter or consume the random pool (a fixed-note
//     level does not touch notesSeen at all).
//   - Every other level draws a pool fact WITHOUT repetition within a
//     playthrough, tracking seen pool indices via save.getNotesSeen /
//     markNoteSeen (persisted as `gabby22.notesSeen`).
//   - "Pool exhausted" is judged by whether every POOL index has been seen
//     (not by notesSeen.length) — so stale/out-of-range indices left by an
//     older, differently-sized pool can never wedge selection. On exhaustion
//     we reset the seen-set (save.resetNotesSeen) and pick fresh, then mark
//     the freshly-picked index so it can't repeat on the very next call.
//   - "Reset on a NEW playthrough" is NOT handled here — that is resetAll()'s
//     job when a future "Play again" flow starts. The only reset this engine
//     performs is the pool-exhaustion recycle above.
import type { SaveSystem } from './save';
import type { Note } from '../data/notes';
import { FIXED_NOTES, FACT_POOL } from '../data/notes';

/** Clamps a raw `Math.floor(rng() * length)` result into [0, length-1] so a
 * pathological injected `rng` that returns exactly 1 (or a negative) can't
 * index past the array and produce `undefined`. Mirrors the guard in
 * data/characters.ts's `randomOptionId`. PRECONDITION: `length >= 1`. */
function clampIndex(raw: number, length: number): number {
  return Math.min(Math.max(raw, 0), length - 1);
}

/**
 * Returns the single note to display on the completion screen for `level`
 * (1-indexed). `save` supplies + persists the seen-fact set; `rng` (default
 * `Math.random`, returning [0, 1)) is injectable so the no-repeat and
 * exhaustion-reset behavior is deterministically unit-testable.
 *
 * PRECONDITION: `FACT_POOL` is non-empty (it holds 20 facts; enforced by
 * tests/notes.test.ts). Only relevant for non-fixed levels — a fixed-note
 * level never reads the pool.
 */
export function selectNote(level: number, save: SaveSystem, rng: () => number = Math.random): Note {
  const fixed = FIXED_NOTES.find((note) => note.level === level);
  if (fixed) {
    // Fixed notes override and must NOT consume the pool — return before
    // touching notesSeen.
    return { text: fixed.text, style: fixed.style };
  }

  const seen = new Set(save.getNotesSeen());
  // Available = POOL indices not yet seen. Judging exhaustion off THIS set
  // (never notesSeen.length) is what makes stale/out-of-range seen indices
  // harmless.
  let available: number[] = [];
  for (let i = 0; i < FACT_POOL.length; i++) {
    if (!seen.has(i)) available.push(i);
  }

  if (available.length === 0) {
    // Every pool index has been shown this playthrough — recycle.
    save.resetNotesSeen();
    available = FACT_POOL.map((_, i) => i);
  }

  const pick = available[clampIndex(Math.floor(rng() * available.length), available.length)];
  // Mark the freshly-picked index seen (including immediately after a reset)
  // so it can't repeat on the very next call.
  save.markNoteSeen(pick);
  return { text: FACT_POOL[pick], style: 'fact' };
}
