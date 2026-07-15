// Level 16 — "Old Town" (NORTH_STAR §5: old town, no special content).
// Hilliness nudged down from the suggested 0.32 to 0.28 (within the
// task's allowed ±0.05) to satisfy the jump-level rule "hilliness <= 0.30
// on any level with jumps" — see DECISIONS.md.
import type { LevelConfig } from './types';

export const level16: LevelConfig = {
  id: 16,
  name: 'Old Town',
  theme: 'oldTown',
  terrain: {
    seed: 220016,
    length: 14000,
    hilliness: 0.28,
    jumps: [{ x: 6800, width: 480, height: 55 }],
    flatZones: [
      { start: 0, end: 700 },
      { start: 13100, end: 14000 },
    ],
  },
  introText: 'Cobblestones and old streetlamps. Nearly there.',
};
