// Level 18 — "Billboard Row" (NORTH_STAR §5: EASTER EGG — background sign
// reading the locked billboard text, subtle among decoy billboards). The
// real billboard event sits tucked between two of the three decoy ad
// billboards (x 5500 / 6300 / 8200) so it doesn't stand out.
//
// LOCKED PERSONAL CONTENT (NORTH_STAR §5/§7, CLAUDE.md Rule 4): the
// events[0].text below is copied VERBATIM — capital S, lowercase "aren't"
// with a straight apostrophe, ends with two question marks. Never
// paraphrase/"fix" it. Guarded byte-exact by tests/levels.test.ts, which
// hardcodes its own independent copy of the literal.
import type { LevelConfig } from './types';

export const level18: LevelConfig = {
  id: 18,
  name: 'Billboard Row',
  theme: 'billboardRow',
  terrain: {
    seed: 220018,
    length: 14500,
    hilliness: 0.3,
    jumps: [],
    flatZones: [
      { start: 0, end: 700 },
      { start: 13600, end: 14500 },
    ],
  },
  decorations: [
    { kind: 'billboard', x: 5500, text: "EAT AT JOE'S" },
    { kind: 'billboard', x: 6300, text: 'FRESH MOTOR OIL' },
    { kind: 'billboard', x: 8200, text: 'SUNNYVALE 12 MI' },
  ],
  events: [{ type: 'billboard', x: 7000, text: "Sleepovers aren't breaking the rules right??" }],
  introText: 'Billboard row. So many signs to read...',
};
