// Level 9 — "Construction Zone" (NORTH_STAR §5: ramps, jumps). The fixed note
// "Caleb is most definitely a tease" shows on the LEVEL-COMPLETE screen after
// this level (PLAN-08's notes.ts) — nothing special belongs in this level's own
// config. Two flip-capable KICKERS (PLAN-07 task 4) themed as construction
// ramps: a gas-only hold clears each upright, a deliberate mid-air GAS tap
// backflips off it. Kicker geometry (336×106, grid-aligned) validated by
// src/levels/validate.ts — see DECISIONS.md.
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
      { x: 5040, width: 336, height: 106, kind: 'kicker' },
      { x: 7560, width: 336, height: 106, kind: 'kicker' },
    ],
    flatZones: [
      { start: 0, end: 700 },
      { start: 11600, end: 12500 },
    ],
  },
  introText: 'Under construction. Watch for ramps!',
};
