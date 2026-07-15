// Level 13 — "Riding Two-Up" (NORTH_STAR §5: riverside road, the first
// level riding two-up with Caleb aboard). A fixed note shows on the
// LEVEL-COMPLETE screen after this level (PLAN-08's notes.ts) — nothing
// special belongs in this level's own config. Hilliness sits exactly at
// the jump-level cap (0.3, matching the suggested table value) with one
// standard hop.
import type { LevelConfig } from './types';

export const level13: LevelConfig = {
  id: 13,
  name: 'Riding Two-Up',
  theme: 'riverside',
  terrain: {
    seed: 220013,
    length: 13500,
    hilliness: 0.3,
    jumps: [{ x: 6500, width: 500, height: 55 }],
    flatZones: [
      { start: 0, end: 700 },
      { start: 12600, end: 13500 },
    ],
  },
  introText: "Riverside road, and now there's two of us!",
};
