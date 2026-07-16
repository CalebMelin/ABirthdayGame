// Level 15 — "City Boulevard" (NORTH_STAR §5: POLICE CHASE LEVEL — a
// police car pursues from behind). Stays easy/drivable per the authoring
// table's "keep drivable" note: no jumps, moderate hilliness. The `police`
// event drives src/systems/police.ts (PLAN-06 task 3): a single non-Matter
// cop rubber-bands from behind — HOLDING GAS always pulls away (copMaxSpeedFrac
// < 1 of the bike's 10.8 px/step full-gas top speed), only stopping/crashing
// lets it close; caught → friendly soft-fail + instant restart; crossing the
// finish plays the cop spin-out + "WOOHOO!" finale. See the POLICE feel block +
// police.ts's DEFAULTS for what any omitted field would fall back to.
import type { LevelConfig } from './types';

export const level15: LevelConfig = {
  id: 15,
  name: 'City Boulevard',
  theme: 'boulevard',
  terrain: {
    seed: 220015,
    length: 14000,
    hilliness: 0.26,
    jumps: [],
    flatZones: [
      { start: 0, end: 700 },
      { start: 13100, end: 14000 },
    ],
  },
  events: [
    {
      type: 'police',
      // The cop starts ~600px behind — visible (flashing lights) at spawn to sell
      // the introText, then FALLS BACK as you gun it: you shake the cops and
      // escape. copMaxSpeedFrac 0.45 → hard cap 4.86 px/step. That is the crux of
      // the EASY guarantee: it must sit below the bike's *sustained gas-only cruise
      // on THIS rolling terrain* (browser-measured ~7.9 px/step, dipping to ~5.9 on
      // the steepest climbs — NOT the theoretical flat top speed 10.8), so a
      // gas-holding player out-runs the cop even mid-climb and can never be caught
      // (proven by playtest-level15.mjs). Caught = within 200px continuously for
      // 1.5s; the catch-up bonus (3 px/step) only bites once you actually stop/slow.
      // All below police.ts's DEFAULTS, authored here so the chase tunes without
      // touching the system.
      startBehindPx: 600,
      catchDistancePx: 200,
      catchTimeMs: 1500,
      copMaxSpeedFrac: 0.45,
      catchupBonusPxPerFrame: 3,
    },
  ],
  introText: 'Wait... is that a police car behind you?',
};
