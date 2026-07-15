// Level 10 — "The Overpass" (NORTH_STAR §5: overpass, no special content).
// One hop mid-level doubling as the literal "up and over" overpass beat.
import type { LevelConfig } from './types';

export const level10: LevelConfig = {
  id: 10,
  name: 'The Overpass',
  theme: 'highway',
  terrain: {
    seed: 220010,
    length: 13000,
    hilliness: 0.28,
    jumps: [{ x: 6300, width: 480, height: 55 }],
    flatZones: [
      { start: 0, end: 700 },
      { start: 12100, end: 13000 },
    ],
  },
  introText: 'Up and over the highway we go!',
};
