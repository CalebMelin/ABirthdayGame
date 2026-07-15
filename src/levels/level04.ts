// Level 4 — "Tulip Field" (NORTH_STAR §5: park, tulip-field backdrop;
// extra jumps). Two standard hops spread across the middle third with a
// full landing gap between them so each can be taken (and recovered from)
// independently.
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
      { x: 4300, width: 480, height: 55 },
      { x: 6500, width: 480, height: 55 },
    ],
    flatZones: [
      { start: 0, end: 700 },
      { start: 10100, end: 11000 },
    ],
  },
  introText: 'Tulip fields mean more jumps — go get some air!',
};
