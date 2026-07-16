// Level 4 — "Tulip Field" (NORTH_STAR §5: park, tulip-field backdrop; extra
// jumps). Two flip-capable KICKERS (PLAN-07 task 4) spread across the middle
// third with a full landing gap between them, so each backflip (deliberate
// mid-air GAS tap) can be taken and recovered from independently, while a
// gas-only hold clears both upright. Kicker geometry (336×106, grid-aligned)
// validated by src/levels/validate.ts — see DECISIONS.md.
import type { LevelConfig } from './types';

export const level04: LevelConfig = {
  id: 4,
  name: 'Tulip Field',
  theme: 'park',
  terrain: {
    seed: 220004,
    length: 11000,
    hilliness: 0.18,
    jumps: [
      { x: 4032, width: 336, height: 106, kind: 'kicker' },
      { x: 6552, width: 336, height: 106, kind: 'kicker' },
    ],
    flatZones: [
      { start: 0, end: 700 },
      { start: 10100, end: 11000 },
    ],
  },
  introText: 'Tulip fields mean more jumps. Go get some air!',
};
