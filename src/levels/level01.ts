// Level 1 — "Leaving Home" (NORTH_STAR §5: Gabby's street, sunrise; tutorial
// signs teach gas/brake/flips; very flat). Nearly flat (hilliness 0.05) with
// zero jumps — the three tutorial signs teach the controls BEFORE the game
// ever asks the player to use them for real (the first actual jump is
// level 2).
import type { LevelConfig } from './types';

export const level01: LevelConfig = {
  id: 1,
  name: 'Leaving Home',
  theme: 'suburbs',
  terrain: {
    seed: 220001,
    length: 9000,
    hilliness: 0.05,
    jumps: [],
    flatZones: [
      { start: 0, end: 700 }, // spawn runway
      { start: 8100, end: 9000 }, // finish-flag zone
    ],
  },
  decorations: [
    { kind: 'sign', x: 1200, text: 'Hold GAS to go! ->' },
    { kind: 'sign', x: 3200, text: 'Hold BRAKE to slow down' },
    { kind: 'sign', x: 5200, text: 'Catch air? GAS leans you back!' },
  ],
  introText: "8:00 PM. The party's across the city. Let's go!!",
};
