// Level 6 — "Edge of Downtown" (NORTH_STAR §5: edge of downtown). The
// "cars can't see motorcycles" hint shows on the LEVEL-COMPLETE screen
// after this level (PLAN-08's notes.ts) — nothing special belongs in this
// level's own config.
import type { LevelConfig } from './types';

export const level06: LevelConfig = {
  id: 6,
  name: 'Edge of Downtown',
  theme: 'downtown',
  terrain: {
    seed: 220006,
    length: 11500,
    hilliness: 0.22,
    jumps: [],
    flatZones: [
      { start: 0, end: 700 },
      { start: 10600, end: 11500 },
    ],
  },
  introText: "Downtown's just up ahead — you can see the skyline.",
};
