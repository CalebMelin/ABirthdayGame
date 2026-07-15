// Level 19 — "Sunset Streets" (NORTH_STAR §5: sunset streets, no special
// content). Hilliness nudged down from the suggested 0.32 to 0.27 (within
// the task's allowed ±0.05) to satisfy the jump-level "hilliness <= 0.30"
// rule — see DECISIONS.md.
import type { LevelConfig } from './types';

export const level19: LevelConfig = {
  id: 19,
  name: 'Sunset Streets',
  theme: 'sunset',
  terrain: {
    seed: 220019,
    length: 15000,
    hilliness: 0.27,
    jumps: [{ x: 7300, width: 500, height: 55 }],
    flatZones: [
      { start: 0, end: 700 },
      { start: 14100, end: 15000 },
    ],
  },
  introText: "The sky's turning pink. Almost golden hour.",
};
