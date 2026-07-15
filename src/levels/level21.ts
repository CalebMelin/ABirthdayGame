// Level 21 — "Almost There" (NORTH_STAR §5's own theme/backdrop label for
// this row IS "Almost there" — reused verbatim as this level's name;
// special content: streamers, more balloons). Streamers and balloons
// alternate through the back half, denser than level 20.
import type { LevelConfig } from './types';

export const level21: LevelConfig = {
  id: 21,
  name: 'Almost There',
  theme: 'partyDistrict',
  terrain: {
    seed: 220021,
    length: 15500,
    hilliness: 0.36,
    jumps: [],
    flatZones: [
      { start: 0, end: 700 },
      { start: 14600, end: 15500 },
    ],
  },
  decorations: [
    { kind: 'streamer', x: 7800 },
    { kind: 'balloon', x: 9100 },
    { kind: 'streamer', x: 10400 },
    { kind: 'balloon', x: 11700 },
    { kind: 'streamer', x: 13000 },
    { kind: 'balloon', x: 14300 },
  ],
  introText: 'Streamers everywhere. Can you feel it?',
};
