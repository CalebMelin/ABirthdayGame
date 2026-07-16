// Level 2 — "First Jump" (NORTH_STAR §5: suburbs, gentle hills, first jump —
// the tulip mechanic is taught here). Two flip-capable KICKERS (PLAN-07 task
// 4): a gas-only hold clears each upright (the bike.ts held-pedal assist),
// while a deliberate mid-air GAS tap backflips off it for a tulip. A tutorial
// sign BEFORE the first kicker teaches the trick. Kicker geometry (336px wide ×
// 106px tall, base/peak/end grid-aligned to the 168px collision grid so the
// coarse chain renders a clean launch triangle) is validated by
// src/levels/validate.ts's kicker bounds — see DECISIONS.md.
import type { LevelConfig } from './types';

export const level02: LevelConfig = {
  id: 2,
  name: 'First Jump',
  theme: 'suburbs',
  terrain: {
    seed: 220002,
    length: 10000,
    hilliness: 0.12,
    jumps: [
      { x: 4032, width: 336, height: 106, kind: 'kicker' },
      { x: 6048, width: 336, height: 106, kind: 'kicker' },
    ],
    flatZones: [
      { start: 0, end: 700 },
      { start: 9100, end: 10000 },
    ],
  },
  decorations: [
    // Placed BEFORE the first kicker (x=4032) so it teaches before it asks.
    // Byte-exact per PLAN-07 task 4: em dash U+2014, tulip U+1F337 — do NOT
    // paraphrase (guarded code-point-exact in tests/levels.test.ts).
    { kind: 'sign', x: 3200, text: 'Big jump ahead — try holding GAS in the air to flip! 🌷' },
  ],
  introText: 'Ooh, a little bump ahead. Hold on tight!',
};
