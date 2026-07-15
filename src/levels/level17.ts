// Level 17 — "Tulip Farming" (NORTH_STAR §5: hilly district; big jumps —
// tulip farming). Three BIG WIDE humps (90-95px tall, 650-680px wide —
// wide keeps the slope gentle/gas-only-safe per the jump-sizing rules,
// never narrow+tall), spaced with a full landing gap between each so a
// mediocre player recovers before the next takeoff. Hilliness nudged down
// from the suggested 0.35 to 0.3 (the max allowed ±0.05 nudge) to satisfy
// the jump-level "hilliness <= 0.30" rule — see DECISIONS.md.
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
      { x: 5100, width: 650, height: 90 },
      { x: 7200, width: 680, height: 95 },
      { x: 9300, width: 650, height: 90 },
    ],
    flatZones: [
      { start: 0, end: 700 },
      { start: 13600, end: 14500 },
    ],
  },
  introText: 'Big hills, big jumps. Perfect for tulip hunting!',
};
