// Level 11 — "Highway On-Ramp" (NORTH_STAR §5: EASTER EGG, guaranteed +
// non-interactive — an all-black rider in a black helmet wheelies past on
// a yellow motorcycle). No jumps (the authoring table calls for none);
// the wheelie-rider event fires around mid-level. The real system (PLAN-07
// task 2) lives in src/systems/wheelieRider.ts — this file just authors the
// event's placement.
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
  introText: 'Merging onto the highway. Hang on tight!',
};
