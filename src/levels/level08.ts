// Level 8 — "City Lights" (NORTH_STAR §5: downtown, no special content).
import type { LevelConfig } from './types';

export const level08: LevelConfig = {
  id: 8,
  name: 'City Lights',
  theme: 'downtown',
  terrain: {
    seed: 220008,
    length: 12000,
    hilliness: 0.24,
    jumps: [{ x: 5800, width: 480, height: 55 }],
    flatZones: [
      { start: 0, end: 700 },
      { start: 11100, end: 12000 },
    ],
  },
  introText: 'The city lights are gorgeous tonight.',
};
