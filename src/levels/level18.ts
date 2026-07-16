// Level 18 — "Billboard Row" (NORTH_STAR §5: EASTER EGG — background sign
// reading the locked billboard text, subtle among decoy billboards). The real
// billboard event sits tucked between two of the decoy ad billboards (x
// 5500 / 6300 / 8200) so it doesn't stand out. PLAN-07 task 3 added three more
// decoys (x 3200 / 4000 / 11000) so the level reads as a genuine billboard ROW
// (7 billboards total, incl. the egg) spread across the whole level rather
// than 3 signs clustered around one odd one out. Every billboard here — decoy
// or egg — renders through the SAME shared drawer
// (src/systems/decorations.ts's exported drawBillboard, word-wrap included),
// so the frame pixels can never silently drift apart between "decoy" and
// "egg" (see DECISIONS.md's parallax-vs-same-layer judgment call). The two
// LONGER decoys below ("22 FM RADIO..." / "PARKER AND PARKER...") are
// deliberately sized to wrap to 2-3 lines too — the egg is not the only
// multi-line board in the row, so its size alone gives nothing away.
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
    { kind: 'billboard', x: 3200, text: '22 FM RADIO - YOUR HITS ALL DAY' },
    { kind: 'billboard', x: 4000, text: 'COLD SODA HERE' },
    { kind: 'billboard', x: 5500, text: "EAT AT JOE'S" },
    { kind: 'billboard', x: 6300, text: 'FRESH MOTOR OIL' },
    { kind: 'billboard', x: 8200, text: 'SUNNYVALE 12 MI' },
    { kind: 'billboard', x: 11000, text: 'PARKER AND PARKER LAW OFFICES - CALL NOW' },
  ],
  events: [{ type: 'billboard', x: 7000, text: "Sleepovers aren't breaking the rules right??" }],
  introText: 'Billboard row. So many signs to read...',
};
