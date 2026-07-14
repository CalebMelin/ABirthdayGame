// Shared scene init-data types.
import { TOTAL_LEVELS } from '../systems/constants';

/** Init data for scenes that operate on a specific level number
 * (GameScene, LevelCompleteScene). `level` is 1-indexed. */
export interface LevelSceneData {
  level?: number;
}

/** Normalizes a level number from scene init data: non-integer or
 * out-of-range values clamp into 1..TOTAL_LEVELS, default 1. */
export function normalizeLevel(level: number | undefined): number {
  if (level === undefined || !Number.isInteger(level)) return 1;
  return Math.min(Math.max(level, 1), TOTAL_LEVELS);
}
