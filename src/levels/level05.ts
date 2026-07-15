// Level 5 — "Main Street" (NORTH_STAR §5: small-town main street, no
// special content).
import type { LevelConfig } from './types';

export const level05: LevelConfig = {
  id: 5,
  name: 'Main Street',
  theme: 'smallTown',
  terrain: {
    seed: 220005,
    length: 11000,
    hilliness: 0.2,
    jumps: [],
    flatZones: [
      { start: 0, end: 700 },
      { start: 10100, end: 11000 },
    ],
  },
  introText: 'Small town, big night ahead.',
};
