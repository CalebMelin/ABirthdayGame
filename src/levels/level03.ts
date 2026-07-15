// Level 3 — "Through the Park" (NORTH_STAR §5: suburbs/park, no special
// content). A breather after level 2's first jump — no jumps here, gentle
// hills only. The table offered "none or 1 hop" for this level; "none"
// keeps a hop / breather / more-hops pacing distinct from level 4's
// "extra jumps" (see DECISIONS.md).
import type { LevelConfig } from './types';

export const level03: LevelConfig = {
  id: 3,
  name: 'Through the Park',
  theme: 'park',
  terrain: {
    seed: 220003,
    length: 10500,
    hilliness: 0.16,
    jumps: [],
    flatZones: [
      { start: 0, end: 700 },
      { start: 9600, end: 10500 },
    ],
  },
  introText: 'Cutting through the park saves time.',
};
