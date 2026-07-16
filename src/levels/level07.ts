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
  // x 11500. Cars travel LEFT at 7 px/frame (slower than the bike's ~10.8, so
  // the player can always out-manoeuvre), each telegraphed for 3s in the far
  // lane before it drifts into the near lane. The first four DEFAULT encounters
  // intercept a constant full-gas player (so gas-only doesn't clear level 7 —
  // intended: you brake to hang back and let the car sweep past). The LAST two
  // (indices 4 and 5) are PUNCH-THROUGH (shorter TRAFFIC.punchTriggerLeadPx): a
  // confident player at speed can accelerate through the gap before the car
  // drops — the plan's second dodge mechanic. Placed last so no braking
  // encounter is ever entered at full punch-speed. Both mechanics thus exist and
  // confident play lands inside NORTH_STAR's 20-45s window; every encounter
  // stays avoidable by braking. See scripts/playtest-level07.mjs (both profiles).
  events: [
    {
      type: 'traffic',
      carCount: 6,
      carSpeedPxPerFrame: 7,
      firstSpawnX: 2800,
      spacingPx: 1500,
      laneDropTelegraphMs: 3000,
      punchThroughIndices: [4, 5],
    },
  ],
  introText: 'Rush hour downtown... stay sharp out there!',
};
