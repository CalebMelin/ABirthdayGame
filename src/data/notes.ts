// Level-complete "notes" content (PLAN-08 task 2 — NORTH_STAR §6 "facts &
// notes system"). PURE data + types only: no Phaser import, no scene/canvas
// access, no storage — same import-safety contract as data/characters.ts and
// systems/save.ts, so the selection engine (systems/notes.ts) that consumes
// this stays unit-testable in plain Node.
//
// Two kinds of note feed the level-complete screen:
//   - FIXED_NOTES: four LOCKED, level-bound personal notes (levels 6/9/13/14)
//     that must appear EXACTLY at those points, byte-for-byte — CLAUDE.md
//     Rule 4 / NORTH_STAR §6/§7 forbid paraphrasing, restyling, or "fixing"
//     them. They are authored here as PURE ASCII (straight apostrophes
//     U+0027, and level 14's "..." is three literal ASCII periods, NOT the
//     U+2026 ellipsis). tests/notes.test.ts guards this with an independent
//     ASCII/no-curly-quote/no-ellipsis oracle so an editor re-encoding the
//     file can never silently ship a mangled personal note.
//   - FACT_POOL: ~20 light, TRUE motorcycle facts drawn WITHOUT repetition
//     for every non-fixed level. ASCII-only except deliberate emoji (encoded
//     as explicit \u{...} escapes so an editor can't mangle them — the pixel
//     font renders both ASCII and emoji fine, per data/tricks.ts's toasts).

/** How the level-complete screen frames a note. `'fact'` -> the cheerful
 * "Did you know?" card; `'hint'` -> the whisper card ("Psst... 💡"). An
 * `as const` union (this project forbids TS enums). */
export type NoteStyle = 'fact' | 'hint';

/** One note as handed to the level-complete screen: the display text plus
 * the card style it should be framed with. */
export interface Note {
  readonly text: string;
  readonly style: NoteStyle;
}

/** A LOCKED, level-bound note. `level` is 1-indexed and matches the level
 * whose completion screen must show `text`. Each carries its OWN explicit
 * `style` (data-driven) so re-framing any single note later is a one-line
 * change — but all four are `'hint'` today: the two literal hints (L6/L14)
 * obviously whisper a tip, and framing the two personal notes (L9/L13) as a
 * chirpy "Did you know?" fact would land wrong, so they share the same
 * whisper card (decision logged for PLAN-08 task 2). */
export interface FixedNote {
  readonly level: number;
  readonly text: string;
  readonly style: NoteStyle;
}

/** The four fixed, level-bound notes (NORTH_STAR §6). VERBATIM — never
 * paraphrase/restyle/"fix grammar" (CLAUDE.md Rule 4). All pure ASCII. */
export const FIXED_NOTES: readonly FixedNote[] = [
  {
    level: 6,
    text: "Believe it or not, cars can't actually see motorcycles on the road",
    style: 'hint',
  },
  {
    level: 9,
    text: 'Caleb is most definitely a tease',
    style: 'hint',
  },
  {
    level: 13,
    text: 'When a guy is riding with a girl behind him, feeling down his chest and stomach might make him go crazy',
    style: 'hint',
  },
  {
    level: 14,
    text: "Cops really like to pull over motorcycles... but we don't have time for that",
    style: 'hint',
  },
];

/** The rotating fact pool (20 entries) for every non-fixed level. Each fact
 * is light, warm, and TRUE (verified for PLAN-08 task 2); ASCII-only except
 * fact 20's tulip emoji (U+1F337, escaped). At least 18 facts is the minimum
 * that guarantees no forced repeat across the 18 fact-levels in one linear
 * playthrough (tests/notes.test.ts pins the >= 18 floor). Facts 19-20 are
 * intentional in-jokes: "Two-up" calls back to level 13, and the tulip line
 * ties to the game's tulips. */
export const FACT_POOL: readonly string[] = [
  "The first motorcycle (1885, Daimler's Reitwagen) had a wooden frame - basically a bicycle with anger issues.",
  'The word "motorcycle" first appeared in the 1890s.',
  'Modern MotoGP bikes can hit over 220 mph.',
  'Most motorcycles sip gas - plenty get well over 50 mpg, far better than the average car.',
  'The longest motorcycle ramp jump ever recorded is over 350 feet.',
  'Counter-steering is real: to go right at speed, you briefly steer left first.',
  'Harley-Davidson started in a tiny wooden shed in 1903.',
  'The motorcycle wave: riders greet each other with a low two-finger wave.',
  'A motorcycle engine can rev more than twice as fast as most car engines.',
  'Some race bikes have a backwards-spinning crankshaft - it makes them change direction more easily.',
  'The best-selling motor vehicle in history is a motorcycle: the Honda Super Cub (100M+).',
  'Riding works your core and balance far more than sitting in a car does.',
  'The record for the longest motorcycle wheelie is over 200 miles - on the back wheel the whole way.',
  "The fastest production motorcycles are electronically limited to 186 mph (299 km/h) by a gentleman's agreement.",
  'Motorcycle helmets are designed to crush a little on impact - that squished foam is what absorbs the hit.',
  'In some places, lane filtering by motorcycles is legal and eases traffic for everyone.',
  'The Isle of Man TT is one of the oldest motorcycle races, first run in 1907.',
  'Fancy vintage sidecars came with their own windshields - and sometimes even little doors.',
  '"Two-up" is the official term for riding with a passenger. (Sound familiar?)',
  'Tulips are not a standard motorcycle accessory. Gabby is changing that. \u{1F337}',
];
