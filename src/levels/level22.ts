// Level 22 — "The Party" (NORTH_STAR §5: final stretch, dusk — ends at the
// party venue -> transitions to PartyScene). The most festive decoration
// spread of the game; no jumps — this is the victory-lap finish, not a
// challenge level.
import type { LevelConfig } from './types';

export const level22: LevelConfig = {
  id: 22,
  name: 'The Party',
  theme: 'finalDusk',
  terrain: {
    seed: 220022,
    length: 16000,
    hilliness: 0.38,
    jumps: [],
    flatZones: [
      { start: 0, end: 700 },
      { start: 15100, end: 16000 },
    ],
  },
  decorations: [
    { kind: 'balloon', x: 8200 },
    { kind: 'streamer', x: 9300 },
    { kind: 'balloon', x: 10400 },
    { kind: 'streamer', x: 11500 },
    { kind: 'balloon', x: 12600 },
    { kind: 'streamer', x: 13700 },
    { kind: 'balloon', x: 14800 },
  ],
  introText: 'You can hear the music from here!!',
};
