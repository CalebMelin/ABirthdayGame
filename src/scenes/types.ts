// Shared scene init-data types.
import { TOTAL_LEVELS } from '../systems/constants';

/** Init data for scenes that operate on a specific level number
 * (GameScene, LevelCompleteScene). `level` is 1-indexed. */
export interface LevelSceneData {
  level?: number;
  /** True when GameScene is (re)started by its own fail/restart flow
   * (failLevel passes it on scene.restart). GameScene reads it to SUPPRESS the
   * level-start intro banner on a crash-restart — re-reading the one-liner
   * after every fail is annoying. A fresh entry from LevelSelect/LevelComplete
   * omits it (so the banner shows). Ignored by LevelCompleteScene. */
  fromFail?: boolean;
  /** GameScene's snapshot of the persistent tulip total taken at the START of
   * a fresh visit to this level (see GameScene.tulipsAtLevelStart). Passed
   * FORWARD only on the GameScene -> LevelCompleteScene finish transition:
   * LevelCompleteScene subtracts it from the current total to show tulips
   * "earned this level". GameScene ignores it on entry (it snapshots its own),
   * and LevelCompleteScene never passes it onward from its buttons. */
  tulipsAtStart?: number;
}

/** Normalizes a level number from scene init data: non-integer or
 * out-of-range values clamp into 1..TOTAL_LEVELS, default 1. */
export function normalizeLevel(level: number | undefined): number {
  if (level === undefined || !Number.isInteger(level)) return 1;
  return Math.min(Math.max(level, 1), TOTAL_LEVELS);
}
