// Level 2 — "First Jump" (NORTH_STAR §5: suburbs, gentle hills, first jump —
// the tulip mechanic is taught here). One gentle "hop" hump near the
// level's midpoint (jump-sizing rules: standard hop 45-60px tall /
// 420-520px wide, placed 30-70% of length, well clear of spawn/finish).
import type { LevelConfig } from './types';

export const level02: LevelConfig = {
  id: 2,
  name: 'First Jump',
  theme: 'suburbs',
  terrain: {
    seed: 220002,
    length: 10000,
    hilliness: 0.12,
    jumps: [{ x: 4800, width: 480, height: 50 }],
    flatZones: [
      { start: 0, end: 700 },
      { start: 9100, end: 10000 },
    ],
  },
  introText: 'Ooh, a little bump ahead. Hold on tight!',
};
