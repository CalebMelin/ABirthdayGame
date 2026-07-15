// Level 7 — "Downtown Traffic" (NORTH_STAR §5: INVISIBLE-CARS LEVEL —
// oncoming cars drift into Gabby's lane and must be dodged). Terrain stays
// calm/jump-free ON PURPOSE (per the authoring table: "calm terrain so
// future traffic is the challenge") — the `traffic` event itself is only a
// dispatch stub here; PLAN-06 implements actual car spawning/collision.
import type { LevelConfig } from './types';

export const level07: LevelConfig = {
  id: 7,
  name: 'Downtown Traffic',
  theme: 'downtown',
  terrain: {
    seed: 220007,
    length: 12000,
    hilliness: 0.18,
    jumps: [],
    flatZones: [
      { start: 0, end: 700 },
      { start: 11100, end: 12000 },
    ],
  },
  events: [{ type: 'traffic' }],
  introText: 'Rush hour downtown... stay sharp out there!',
};
