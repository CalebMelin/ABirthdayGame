// Aggregates all 22 authored level configs (PLAN-05 task 3 / ST-3) into one
// ordered, importable list, plus a TOTAL lookup helper. Consumed by
// LevelSelectScene/GameScene (ST-4, the next task) and validated end-to-end
// by tests/levels.test.ts (ids, lengths, required events, theme membership,
// the locked level-18 billboard text).
import type { LevelConfig } from './types';
import { TOTAL_LEVELS } from '../systems/constants';
import { level01 } from './level01';
import { level02 } from './level02';
import { level03 } from './level03';
import { level04 } from './level04';
import { level05 } from './level05';
import { level06 } from './level06';
import { level07 } from './level07';
import { level08 } from './level08';
import { level09 } from './level09';
import { level10 } from './level10';
import { level11 } from './level11';
import { level12 } from './level12';
import { level13 } from './level13';
import { level14 } from './level14';
import { level15 } from './level15';
import { level16 } from './level16';
import { level17 } from './level17';
import { level18 } from './level18';
import { level19 } from './level19';
import { level20 } from './level20';
import { level21 } from './level21';
import { level22 } from './level22';

/** All 22 levels (NORTH_STAR §5 — the map is locked), in id order 1..22. */
export const LEVELS: readonly LevelConfig[] = [
  level01,
  level02,
  level03,
  level04,
  level05,
  level06,
  level07,
  level08,
  level09,
  level10,
  level11,
  level12,
  level13,
  level14,
  level15,
  level16,
  level17,
  level18,
  level19,
  level20,
  level21,
  level22,
];

/** Clamps/defaults a level id into a valid [1, TOTAL_LEVELS] integer,
 * mirroring src/scenes/types.ts's normalizeLevel (same "non-integer or
 * out-of-range -> safe default, never throw" contract). Reimplemented
 * locally rather than imported so src/levels/ (data) doesn't depend on
 * src/scenes/ (presentation) — keeps the dependency direction one-way. */
function normalizeLevelId(id: number): number {
  if (!Number.isInteger(id)) return 1;
  return Math.min(Math.max(id, 1), TOTAL_LEVELS);
}

/**
 * Returns the LevelConfig for `id`. TOTAL function, same spirit as
 * normalizeLevel: a non-integer or out-of-range id clamps into
 * [1, TOTAL_LEVELS] (default level 1) before lookup, so this can never
 * throw or return undefined — even if LEVELS were ever malformed, the
 * `?? LEVELS[0]` fallback still holds.
 */
export function getLevelConfig(id: number): LevelConfig {
  const normalized = normalizeLevelId(id);
  return LEVELS.find((level) => level.id === normalized) ?? LEVELS[0];
}
