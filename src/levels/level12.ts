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
  // The pickup cutscene (src/systems/pickup.ts): as the bike reaches x=6250 the
  // stop window (380px) begins the auto-brake at x=5870 — inside the {5750,6750}
  // pickup flat zone — so the bike comes to rest in front of Caleb's house on
  // real flat ground, Caleb hops on, then control returns and he rides pillion.
  // See the PICKUP constants block for the cutscene/heart/toast timing.
  events: [{ type: 'calebPickup', x: 6250, stopWindowPx: 380 }],
  introText: "Caleb's waiting outside...",
};
