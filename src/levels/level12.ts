// Level 12 — "Picking Up Caleb" (NORTH_STAR §5: CALEB PICKUP LEVEL —
// mid-level stop at Caleb's house; short pickup cutscene, then he rides
// pillion for the rest of the game). A dedicated flat zone brackets the
// pickup x (6250) so the bike has real ground to stop/stage the cutscene
// on, in addition to the standard spawn/finish zones — the flat-zone
// convention this task calls out specifically for this level. No jumps
// (the authoring table calls for none).
import type { LevelConfig } from './types';

export const level12: LevelConfig = {
  id: 12,
  name: 'Picking Up Caleb',
  theme: 'suburbs',
  terrain: {
    seed: 220012,
    length: 12500,
    hilliness: 0.2,
    jumps: [],
    flatZones: [
      { start: 0, end: 700 }, // spawn runway
      { start: 5750, end: 6750 }, // pickup stop, centered on events[0].x
      { start: 11600, end: 12500 }, // finish-flag zone
    ],
  },
  events: [{ type: 'calebPickup', x: 6250 }],
  introText: "Caleb's waiting outside...",
};
