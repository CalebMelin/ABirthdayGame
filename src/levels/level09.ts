// Level 9 — "Construction Zone" (NORTH_STAR §5: ramps, jumps). The fixed
// note "Caleb is most definitely a tease" shows on the LEVEL-COMPLETE
// screen after this level (PLAN-08's notes.ts) — nothing special belongs
// in this level's own config. Two standard hops themed as construction
// ramps.
import type { LevelConfig } from './types';

export const level09: LevelConfig = {
  id: 9,
  name: 'Construction Zone',
  theme: 'construction',
  terrain: {
    seed: 220009,
    length: 12500,
    hilliness: 0.26,
    jumps: [
      { x: 4900, width: 480, height: 58 },
      { x: 7300, width: 500, height: 58 },
    ],
    flatZones: [
      { start: 0, end: 700 },
      { start: 11600, end: 12500 },
    ],
  },
  introText: 'Under construction — watch for ramps!',
};
