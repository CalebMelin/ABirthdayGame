// Level 20 — "Party District" (NORTH_STAR §5: party district outskirts —
// balloons start appearing in backgrounds). Five balloon decorations
// sprinkled through the back half, building festivity toward the party.
import type { LevelConfig } from './types';

export const level20: LevelConfig = {
  id: 20,
  name: 'Party District',
  theme: 'partyDistrict',
  terrain: {
    seed: 220020,
    length: 15000,
    hilliness: 0.34,
    jumps: [],
    flatZones: [
      { start: 0, end: 700 },
      { start: 14100, end: 15000 },
    ],
  },
  decorations: [
    { kind: 'balloon', x: 8500 },
    { kind: 'balloon', x: 9800 },
    { kind: 'balloon', x: 11100 },
    { kind: 'balloon', x: 12400 },
    { kind: 'balloon', x: 13700 },
  ],
  introText: 'Balloons up ahead — the party district!',
};
