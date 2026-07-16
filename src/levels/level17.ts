// Level 17 — "Tulip Farming" (NORTH_STAR §5: hilly district; big jumps — tulip
// farming). THREE flip-capable KICKERS (PLAN-07 task 4 — the most of any level,
// the tulip-farming field), each a grid-aligned 336×106 launch ramp spaced with
// a full landing gap so a mediocre player recovers before the next takeoff. A
// gas-only hold clears every one upright; a deliberate mid-air GAS tap backflips
// off it for a tulip. Hilliness held at 0.30 (the jump-level ceiling) so the
// kickers launch off predictable ground rather than stacking on steep hills —
// see DECISIONS.md; kicker geometry validated by src/levels/validate.ts.
import type { LevelConfig } from './types';

export const level17: LevelConfig = {
  id: 17,
  name: 'Tulip Farming',
  theme: 'hilly',
  terrain: {
    seed: 220017,
    length: 14500,
    hilliness: 0.3,
    jumps: [
      { x: 5040, width: 336, height: 106, kind: 'kicker' },
      { x: 7560, width: 336, height: 106, kind: 'kicker' },
      { x: 10080, width: 336, height: 106, kind: 'kicker' },
    ],
    flatZones: [
      { start: 0, end: 700 },
      { start: 13600, end: 14500 },
    ],
  },
  introText: 'Big hills, big jumps. Perfect for tulip hunting!',
};
