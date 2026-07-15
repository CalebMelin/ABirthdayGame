// Level 15 — "City Boulevard" (NORTH_STAR §5: POLICE CHASE LEVEL — a
// police car pursues from behind). Stays easy/drivable per the authoring
// table's "keep drivable" note: no jumps, moderate hilliness. The
// `police` event is a dispatch stub here; PLAN-06 implements the actual
// chase/soft-fail logic (cop speed tuned below player top speed).
import type { LevelConfig } from './types';

export const level15: LevelConfig = {
  id: 15,
  name: 'City Boulevard',
  theme: 'boulevard',
  terrain: {
    seed: 220015,
    length: 14000,
    hilliness: 0.26,
    jumps: [],
    flatZones: [
      { start: 0, end: 700 },
      { start: 13100, end: 14000 },
    ],
  },
  events: [{ type: 'police' }],
  introText: 'Wait... is that a police car behind you?',
};
