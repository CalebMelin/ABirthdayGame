// Level 11 — "Highway On-Ramp" (NORTH_STAR §5: EASTER EGG, guaranteed +
// non-interactive — an all-black rider on a black helmet wheelies past on
// a yellow motorcycle). No jumps (the authoring table calls for none);
// the wheelie-rider event fires around mid-level. Rendering/timing lands
// in PLAN-06/07 — this is only the dispatch stub.
import type { LevelConfig } from './types';

export const level11: LevelConfig = {
  id: 11,
  name: 'Highway On-Ramp',
  theme: 'highway',
  terrain: {
    seed: 220011,
    length: 13000,
    hilliness: 0.28,
    jumps: [],
    flatZones: [
      { start: 0, end: 700 },
      { start: 12100, end: 13000 },
    ],
  },
  events: [{ type: 'wheelieRider', x: 6500 }],
  introText: 'Merging onto the highway — hang on tight!',
};
