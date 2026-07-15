// Level 14 — "River Bridge" (NORTH_STAR §5: river bridge). The "cops like
// to pull over motorcycles" hint shows on the LEVEL-COMPLETE screen after
// this level (PLAN-08's notes.ts) — nothing special belongs in this
// level's own config. Flatter/structural per the table: no jumps.
import type { LevelConfig } from './types';

export const level14: LevelConfig = {
  id: 14,
  name: 'River Bridge',
  theme: 'bridge',
  terrain: {
    seed: 220014,
    length: 13000,
    hilliness: 0.24,
    jumps: [],
    flatZones: [
      { start: 0, end: 700 },
      { start: 12100, end: 13000 },
    ],
  },
  introText: "Crossing the river — you're making great time.",
};
