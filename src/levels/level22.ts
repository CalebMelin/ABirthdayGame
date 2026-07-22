// Level 22 — "The Party" (NORTH_STAR §5: final stretch, dusk — ends at the
// party venue -> transitions to PartyScene). The most festive decoration
// spread of the game; no jumps — this is the victory-lap finish, not a
// challenge level.
//
// THE LONGEST LEVEL IN THE GAME, at LEVEL.lengthMaxPx: 16000px works out to 96
// ground collision bodies + 3 bike bodies = 99, the hard maximum under
// NORTH_STAR §8's <100 budget (see the LEVEL block's derivation and
// PROGRESS.md). The `partyArrival` finale below therefore adds ZERO Matter
// bodies, by construction — as does every system since PLAN-06.
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
  events: [
    {
      // THE ARRIVAL (src/systems/arrival.ts). Everything is placed relative to
      // the finish flag, which sits at length - LEVEL.finishMarginPx = 15500:
      // the scripted ride-in takes the pedals at 14600 (900px out, ~2s at
      // gas-only cruise) and the venue's doorway stands at 15800. Both are the
      // ARRIVAL block's own defaults, authored here so the finale can be
      // re-composed without touching the system. The ride-in itself starts on
      // ordinary rolling terrain (gas is what a player holds there anyway), but
      // everything that MATTERS geometrically happens inside the {15100, 16000}
      // finish flat zone below: the slow-down to a walking pace begins at
      // ARRIVAL.crawlLeadPx out (15140), and the venue stands on level ground
      // with runway to spare past its doors.
      type: 'partyArrival',
      rideInLeadPx: 900,
      doorAheadOfFinishPx: 300,
    },
  ],
  introText: 'You can hear the music from here!!',
};
