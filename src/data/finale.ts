// Party/Credits finale content (PLAN-09 ST-1 — NORTH_STAR §5's PartyScene and
// CreditsScene blocks). This file is THE ONE HOME for PLAN-09's verbatim
// personal content: the four named guests' NAMES, the party banner, the
// bouquet toast, and the three credits lines. Everything here is VERBATIM
// (CLAUDE.md Rule 4 / NORTH_STAR §7) — never paraphrase, never "improve", never
// fix grammar, never re-order. tests/finale.test.ts guards every string against
// an INDEPENDENT code-point oracle so a mangled source constant fails loudly
// instead of silently shipping.
//
// PURE data + pure helpers only: no Phaser import of any kind, no scene/canvas
// access, no storage — the same import-safety contract as data/notes.ts and
// data/characters.ts, so this stays importable from plain-Node Vitest. (It
// imports MARKERS + the ColorRemap TYPE from systems/palette.ts exactly as
// data/characters.ts does, plus data/characters.ts's own swatch resolvers for
// the crowd's colors; both of those modules are themselves runtime-Phaser-free.)
//
// ASCII discipline (house rule, mirroring data/notes.ts): every rendered string
// below is pure 7-bit ASCII except for TWO code points — U+1F337 TULIP (in the
// bouquet toast and the credits tally) and U+00D7 MULTIPLICATION SIGN (in the
// credits tally) — each written as an explicit `\u{...}` escape so an editor
// re-encoding this file can never mangle it into tofu, and each pinned by
// tests/finale.test.ts against its own code-point oracle.
//
// NOT EVERYTHING HERE IS EQUALLY UNTOUCHABLE. Three tiers, and the difference
// is worth stating so nobody treats a button label like a birthday message or
// vice versa:
//   1. LOCKED PERSONAL CONTENT (CLAUDE.md Rule 4 — never reworded, full stop):
//      the guest NAMES, PARTY_BANNER_TEXT, bouquetToastText, CREDITS_LINES.
//   2. PLAN-QUOTED RENDERED COPY: tulipTallyText, whose exact form PLAN-09
//      task 3 writes out. Not personal content, so a documented,
//      screenshot-driven fallback to an ASCII form would have been legitimate
//      had its glyphs not rendered.
//   3. UI CHROME: the CreditsScene button labels and the fresh-start
//      confirmation's wording (CREDITS_* below). Ours to reword.
// EVERY tier lives here for the same practical reason: this module has no
// runtime Phaser import, so a plain-Node Vitest suite can pin all of it — the
// byte-exactness of tiers 1-2 and the LENGTHS of tier 3, which the panel and
// button geometry in constants.ts silently depends on.
//
// WHO CONSUMES WHAT (the later PLAN-09 subtasks):
//   - src/systems/partyCast.ts (ST-1)  -> NAMED_GUESTS + the remap/variant-key
//                                         helpers + crowdGuestAppearance.
//   - src/scenes/PartyScene.ts (ST-3)  -> PARTY_BANNER_TEXT + bouquetToastText.
//   - src/scenes/CreditsScene.ts (ST-4)-> CREDITS_LINES, tulipTallyText, and the
//                                         CREDITS_* chrome strings.
import { MARKERS } from '../systems/palette';
import type { ColorRemap } from '../systems/palette';
import { resolveEyes, resolveHair } from './characters';

// ---------------------------------------------------------------------------
// Verbatim copy (CLAUDE.md Rule 4). Do not touch without Caleb.
// ---------------------------------------------------------------------------

/** The big party banner (NORTH_STAR §5 PartyScene). VERBATIM — lowercase "nd"
 * in "22nd", exactly TWO exclamation marks, pure ASCII. */
export const PARTY_BANNER_TEXT = 'HAPPY 22nd GABBY!!';

/**
 * The bouquet payoff toast (PLAN-09 task 2): `You brought N tulips to the
 * party!! \u{1F337}` with the player's tulip count substituted. VERBATIM.
 *
 * DELIBERATE GRAMMATICAL WART: at `count === 1` this renders "You brought 1
 * tulips to the party!!" — that is CORRECT and INTENTIONAL. The sentence is
 * locked personal content, so it is NEVER pluralized, re-worded, or branched
 * ("1 tulip" / "no tulips"); pluralizing it would be exactly the kind of
 * "improvement" CLAUDE.md Rule 4 forbids. tests/finale.test.ts pins the N=1
 * rendering so a future well-meaning fix fails the suite.
 *
 * The tulip is the U+1F337 code point written as an escape (data/notes.ts's
 * escaped-emoji discipline) — never a literal emoji character in source.
 */
export function bouquetToastText(count: number): string {
  return `You brought ${count} tulips to the party!! \u{1F337}`;
}

/** The credits text (NORTH_STAR §5 CreditsScene), one entry per rendered line
 * in this exact order — ST-4 reveals them line by line. VERBATIM: "Happy
 * 22nd!!!" has THREE exclamation marks (the banner has two — they are NOT the
 * same string). Pure ASCII. */
export const CREDITS_LINES: readonly string[] = [
  'Created by Caleb Melin',
  'Created for Gabriella Novelli',
  'Happy 22nd!!!',
];

/**
 * The tulip tally CreditsScene renders under its divider (PLAN-09 task 3's
 * "<tulip> <times> N collected"), with the player's persisted total
 * substituted. Shown at EVERY count including zero — unlike the party's
 * bouquet toast above, which congratulates and is therefore gated on
 * `tulips > 0`, this is a factual tally.
 *
 * TWO NON-ASCII CODE POINTS, both written as escapes and both verified to
 * render as REAL GLYPHS rather than tofu before being kept (the level-2
 * tutorial-sign precedent, DECISIONS.md 2026-07-16 / 2026-07-22):
 *   - `\u{1F337}` TULIP — the system colour emoji, already proven on screen by
 *     `bouquetToastText` above.
 *   - `\u{00D7}` MULTIPLICATION SIGN — Press Start 2P's own glyph. NOTE that a
 *     width measurement can NOT establish this: the font is fixed-width and its
 *     .notdef box advances exactly as far as a real glyph, so an advance probe
 *     only rules out a fallback font. What proves it is the drawn INK (compared
 *     against unassigned/private-use control code points in
 *     scripts/playtest-credits.mjs) plus a tight screenshot read by eye.
 *
 * Lives HERE rather than in the scene so it gets the same treatment as every
 * other rendered string in this plan: tests/finale.test.ts pins it against an
 * INDEPENDENT code-point oracle, so quietly swapping the multiplication sign
 * for an ASCII 'x' — or changing the spacing — fails the suite instead of only
 * the browser harness.
 */
export function tulipTallyText(count: number): string {
  return `\u{1F337} \u{00D7} ${count} collected`;
}

// ---------------------------------------------------------------------------
// CreditsScene UI CHROME (tier 3 — see the module doc). Button labels and the
// fresh-start confirmation's wording. NOT personal content and NOT plan-quoted:
// these are ours to reword, warmly, whenever the screen needs it.
//
// They live here rather than beside the scene that draws them for ONE reason:
// src/scenes/CreditsScene.ts has a runtime `import Phaser`, so nothing in it can
// be imported by a plain-Node Vitest suite — which left the whole panel/button
// GEOMETRY in constants.ts resting on unasserted premises about string lengths
// ("the longest body line is 36 chars", "the label's natural width is under
// minWidth"). tests/finale.test.ts now measures the REAL strings against the
// REAL constants, so rewording a line until it overflows the panel, or until a
// button label outgrows its face, fails the suite. (Same structural fix as
// tulipTallyText above; found by the ST-4 code-quality review.)
// ---------------------------------------------------------------------------

/** The credits' PRIMARY action: back to the Title with progress KEPT. */
export const CREDITS_PLAY_AGAIN_LABEL = 'Play again?';

/** The credits' SECONDARY action: wipes the save, behind the confirmation
 * below. PLAN-09 task 3 names this option, so the label is its wording. */
export const CREDITS_FRESH_START_LABEL = 'Fresh start';

/** The fresh-start confirmation's heading. */
export const CREDITS_CONFIRM_TITLE = 'Start over?';

/**
 * The confirmation's body, PRE-BROKEN into lines rather than word-wrapped, so
 * CREDITS' panel geometry is exact arithmetic instead of a measured guess.
 *
 * Deliberately warm and completely unambiguous about what is lost: this one
 * button deletes her levels, her tulips AND the Gabby she built, and a gift
 * should say so kindly rather than bark a system-dialog "Are you sure?".
 * Pure ASCII — no dashes or ellipses a re-encode could mangle.
 */
export const CREDITS_CONFIRM_BODY_LINES: readonly string[] = [
  'This clears your levels, your tulips',
  'and the Gabby you made, so the whole',
  'ride begins again at level 1.',
];

/** CANCEL. Named for what it PRESERVES, not "No" — and it is the wide button on
 * the left, so the easy out is also the obvious one. */
export const CREDITS_CONFIRM_CANCEL_LABEL = 'Keep my progress';

/** CONFIRM. Named for what it DOES. */
export const CREDITS_CONFIRM_ERASE_LABEL = 'Erase it all';

// ---------------------------------------------------------------------------
// Guest appearance model.
//
// PLACEHOLDER-ERA ART (PLAN-10 replaces it): every party guest is a palette
// swap of the ONE marker-composite rider base texture (TEXTURE_KEYS.gabbyBase),
// so an "appearance" is just the three colors its MARKERS regions recolor to,
// plus a hair-silhouette hint the renderer draws as a cheap overlay rectangle.
// Colors live HERE (alongside the names) the way data/characters.ts holds every
// swatch color; the NUMBERS that lay the cast out live in constants.ts's PARTY
// block.
// ---------------------------------------------------------------------------

/** Placeholder hair-silhouette treatment, used by systems/partyCast.ts to tell
 * two brown-haired girls apart at a glance without real art yet. `'band'` is
 * the plain base-texture hair band; `'ponytail'` adds a small hair-colored rect
 * off the side of the head. An `as const` union — this project forbids TS
 * enums (tsconfig `erasableSyntaxOnly`). */
export type GuestHairStyle = 'band' | 'ponytail';

/** A hand-authored placeholder look: what the base rider texture's
 * MARKERS.hair / MARKERS.eyes / MARKERS.suit regions recolor to, plus the hair
 * silhouette hint. `kind: 'authored'` distinguishes it from Dallas's
 * mirrors-the-player variant below. All colors are 0xRRGGBB and are
 * deliberately never equal to a MARKERS.* value (enforced by
 * tests/finale.test.ts) — same rule data/characters.ts's swatches follow, so an
 * exact-RGB recolor pass can never mistake a chosen color for a marker. */
export interface AuthoredGuestAppearance {
  readonly kind: 'authored';
  readonly hairColor: number;
  readonly eyeColor: number;
  readonly suitColor: number;
  readonly hairStyle: GuestHairStyle;
}

/** Dallas's appearance: NOT authored here on purpose. She is a LIVE COPY of the
 * player's current Gabby (NORTH_STAR §5: "sprite looks the same as the Gabby
 * character" — the intentional twin joke), so her look is whatever
 * `buildCharacterTextures` produced for the saved CharacterConfig this session.
 * Modeling it as its own variant means nobody can quietly break the joke by
 * hand-authoring colors for her: there is no field here to put them in. */
export interface MirrorsPlayerGuestAppearance {
  readonly kind: 'mirrorsPlayer';
}

/** A guest's look: either hand-authored placeholder colors, or "same as the
 * player's Gabby" (Dallas only). */
export type GuestAppearance = AuthoredGuestAppearance | MirrorsPlayerGuestAppearance;

/** One named party guest: the VERBATIM name shown on their floating name tag,
 * plus how they look. */
export interface NamedGuest {
  /** VERBATIM personal content (NORTH_STAR §5 / CLAUDE.md Rule 4) — the exact
   * name rendered on this guest's name tag. Never localize/abbreviate. */
  readonly name: string;
  readonly appearance: GuestAppearance;
}

// ---------------------------------------------------------------------------
// The four named guests. Exported individually AND as the roster: the front-row
// layout in systems/partyCast.ts references GUEST_DALLAS etc. BY VALUE, so
// "Dallas stands next to Gabby" is compiler-checked rather than depending on a
// stringly-typed lookup or a roster array index that a later reorder could
// silently invalidate.
// ---------------------------------------------------------------------------

/** Andrea — girl, BROWN hair (NORTH_STAR §5). Warm mid brown, matching the
 * 'brown' hair swatch in data/characters.ts. */
export const GUEST_ANDREA: NamedGuest = {
  name: 'Andrea',
  appearance: {
    kind: 'authored',
    hairColor: 0x6b4423,
    eyeColor: 0x6b4a2b,
    suitColor: 0x3fb8a8,
    hairStyle: 'band',
  },
};

/** Allison — girl, BROWN hair too, but she must never read as "Andrea again"
 * (NORTH_STAR §5: "visually distinct from Andrea: different outfit/hairstyle").
 * Three independent differences at placeholder fidelity: a LIGHTER/redder brown,
 * a completely different suit color, and a ponytail silhouette. */
export const GUEST_ALLISON: NamedGuest = {
  name: 'Allison',
  appearance: {
    kind: 'authored',
    hairColor: 0x9c6b3f,
    eyeColor: 0x5fa463,
    suitColor: 0xff8fc4,
    hairStyle: 'ponytail',
  },
};

/** Dallas — girl, blonde, and the twin joke: her sprite IS the player's current
 * Gabby. Her look is never authored here (see MirrorsPlayerGuestAppearance);
 * "blonde" comes for free because Gabby's default hair is blonde, and if the
 * player picks another color Dallas follows her — which is the whole point. */
export const GUEST_DALLAS: NamedGuest = {
  name: 'Dallas',
  appearance: { kind: 'mirrorsPlayer' },
};

/** Dom — boy, BLONDE hair (NORTH_STAR §5). Blonde is load-bearing: it is
 * exactly why Caleb is brown-haired by convention (DECISIONS.md 2026-07-15,
 * src/systems/pickup.ts) — the two must never be confusable. */
export const GUEST_DOM: NamedGuest = {
  name: 'Dom',
  appearance: {
    kind: 'authored',
    hairColor: 0xf2d16b,
    eyeColor: 0x5b8fd6,
    suitColor: 0x4f7fd9,
    hairStyle: 'band',
  },
};

/** The four named guests, in NORTH_STAR §5's listed order. EXACTLY four — no
 * more, no fewer (tests/finale.test.ts pins the count and the names). */
export const NAMED_GUESTS: readonly NamedGuest[] = [
  GUEST_ANDREA,
  GUEST_ALLISON,
  GUEST_DALLAS,
  GUEST_DOM,
];

// ---------------------------------------------------------------------------
// The unnamed background crowd (NORTH_STAR §5: "8-15 unnamed background
// partygoers ... varied palette-swapped sprites", no name tags). Their looks are
// derived DETERMINISTICALLY from the member index — never Math.random — so the
// party looks identical every visit and the layout/browser harnesses can assert
// against it. The three cycle lengths (5 / 6 / 4) are chosen so hair, suit and
// eye colors advance at different rates: the first lcm(5,6,4) = 60 crowd
// members would all be distinct combinations, far more than the 8-15 the scene
// ever builds.
// ---------------------------------------------------------------------------

/** Crowd hair tones (5) — four of the game's OWN hair swatches (HAIR_OPTIONS in
 * data/characters.ts, read through its total by-id resolver so this can never
 * drift from the swatches a player actually sees, and never needs re-editing if
 * a swatch is retuned) plus one crowd-only shade for extra variety. */
export const CROWD_HAIR_COLORS: readonly number[] = [
  resolveHair('brown').color,
  resolveHair('blonde').color,
  resolveHair('black').color,
  resolveHair('ginger').color,
  0x8a6f9c, // plum-ish — crowd-only, deliberately not a player hair swatch
];

/** Crowd outfit tones (6) — pulled from the game's pastel PALETTE family so the
 * crowd sits behind the named cast without shouting over it. */
export const CROWD_SUIT_COLORS: readonly number[] = [
  0xffb3a7, // coral
  0xd4e7f7, // sky
  0xffeaa7, // sunshine
  0xe8d4f1, // lavender
  0xc8e6d7, // mint
  0xcf8a70, // brick
];

/** Crowd eye tones (4) — the game's OWN eye swatches (EYE_OPTIONS in
 * data/characters.ts, via the same total by-id resolver as the hair list
 * above). Barely visible at crowd scale, but varied for free. */
export const CROWD_EYE_COLORS: readonly number[] = [
  resolveEyes('blue').color,
  resolveEyes('green').color,
  resolveEyes('brown').color,
  resolveEyes('grey').color,
];

/**
 * The look of unnamed crowd member `index` (0-based) — a pure, deterministic
 * function of the index: each color channel cycles its own list at its own
 * rate, so neighbours never match and no RNG is involved. Negative or
 * fractional indices are floored/wrapped rather than throwing (total function,
 * same spirit as data/characters.ts's resolvers). Crowd members always use the
 * plain `'band'` hair silhouette — the ponytail overlay is Allison's
 * distinguishing tell and stays exclusive to her.
 */
export function crowdGuestAppearance(index: number): AuthoredGuestAppearance {
  const i = Math.floor(index);
  const wrap = (n: number, len: number): number => ((n % len) + len) % len;
  return {
    kind: 'authored',
    hairColor: CROWD_HAIR_COLORS[wrap(i, CROWD_HAIR_COLORS.length)],
    suitColor: CROWD_SUIT_COLORS[wrap(i, CROWD_SUIT_COLORS.length)],
    eyeColor: CROWD_EYE_COLORS[wrap(i, CROWD_EYE_COLORS.length)],
    hairStyle: 'band',
  };
}

// ---------------------------------------------------------------------------
// Pure remap builder + variant key. Deliberately mirrors data/characters.ts's
// riderRemap / riderVariantKey pair, and is consumed the same way: only
// systems/partyCast.ts calls them, handing the result to palette.ts's
// recolorTexture.
// ---------------------------------------------------------------------------

/** Builds a party guest's ColorRemap: the rider base texture's hair/eyes/suit
 * markers to this guest's chosen colors. Never touches MARKERS.bikeBody — party
 * guests are on foot. */
export function partyGuestRemap(appearance: AuthoredGuestAppearance): ColorRemap {
  return [
    { from: MARKERS.hair, to: appearance.hairColor },
    { from: MARKERS.eyes, to: appearance.eyeColor },
    { from: MARKERS.suit, to: appearance.suitColor },
  ];
}

/** Stable cache key for a party guest's recolored texture variant, keyed on the
 * three colors that actually change pixels (NOT hairStyle — the ponytail is a
 * separate overlay rectangle, not part of the texture, so two guests differing
 * only in silhouette correctly SHARE one cached texture).
 *
 * The `tex-party|` prefix keeps this key space disjoint from
 * data/characters.ts's `tex-gabby|` (rider) and `tex-bike|` (bike) spaces and
 * from the raw TEXTURE_KEYS.* base keys, so a party guest can never collide
 * with — or accidentally reuse — a player-character variant. Colors are
 * lowercase 6-digit hex, so the same appearance always produces the same key
 * and recolorTexture's per-variantKey cache actually hits. */
export function partyGuestVariantKey(appearance: AuthoredGuestAppearance): string {
  const hex = (color: number): string => ((color >>> 0) & 0xffffff).toString(16).padStart(6, '0');
  return `tex-party|${hex(appearance.hairColor)}|${hex(appearance.eyeColor)}|${hex(appearance.suitColor)}`;
}
