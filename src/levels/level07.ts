// Level 7 — "Downtown Traffic" (NORTH_STAR §5: INVISIBLE-CARS LEVEL —
// oncoming cars drift into Gabby's lane and must be dodged). Terrain stays
// calm/jump-free ON PURPOSE (per the authoring table: "calm terrain so the
// traffic is the challenge"). The `traffic` event is now REAL — see
// src/systems/traffic.ts + the TRAFFIC constants block for the model/geometry;
// the fields below author the per-encounter LAYOUT.
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
  // 6 spaced encounters (NORTH_STAR asks 6-8), first at x=2800 (a calm run-up
  // out of the spawn flat zone) then every 1500px: 2800, 4300, 5800, 7300,
  // 8800, 10300 — all comfortably before the finish flat zone at 11100/finish
  // x 11500. Cars travel LEFT at 6 px/frame (slower than the bike's ~10.8, so
  // the player can always out-manoeuvre), each telegraphed for 3s in the far
  // lane before it drifts into the near lane. With TRAFFIC.triggerLeadPx these
  // intercept a constant full-gas player (so gas-only doesn't clear level 7 —
  // that's intended), while the fixed danger zones (1500px apart, ~530px wide)
  // always leave room to brake/hang back and let a car sweep past — every
  // encounter is avoidable. See scripts/playtest-level07.mjs for the proof.
  events: [
    {
      type: 'traffic',
      carCount: 6,
      carSpeedPxPerFrame: 6,
      firstSpawnX: 2800,
      spacingPx: 1500,
      laneDropTelegraphMs: 3000,
    },
  ],
  introText: 'Rush hour downtown... stay sharp out there!',
};
