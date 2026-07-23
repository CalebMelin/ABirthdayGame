// Party/Credits finale tests (PLAN-09 ST-1). Two halves:
//
//  1. VERBATIM CONTENT GUARDS for src/data/finale.ts — the four guest names,
//     the party banner, the bouquet toast and the three credits lines. Built the
//     way tests/notes.test.ts guards the four fixed notes: every expected string
//     is reconstructed HERE from explicit code points / String.fromCodePoint, so
//     the test compares the source constant against an INDEPENDENT oracle rather
//     than against itself. A mangled source constant (an editor re-encode, a
//     well-meaning "fix" to the 1-tulip grammar, a dropped "!") therefore FAILS
//     instead of silently shipping. CLAUDE.md Rule 4 / NORTH_STAR §5+§7.
//
//  2. BEHAVIORAL tests for the pure layout/bounce helpers in
//     src/systems/partyCast.ts (import-safe: type-only Phaser, so it loads in
//     plain Node) — determinism, the roster invariants, the crowd-count range,
//     phase spread, no two members stacked at the same x, and the bounce's
//     amplitude/2-frame contract.
import { describe, expect, it } from 'vitest';
import {
  CREDITS_LINES,
  CROWD_EYE_COLORS,
  CROWD_HAIR_COLORS,
  CROWD_SUIT_COLORS,
  GUEST_ALLISON,
  GUEST_ANDREA,
  GUEST_DALLAS,
  GUEST_DOM,
  NAMED_GUESTS,
  PARTY_BANNER_TEXT,
  bouquetToastText,
  crowdGuestAppearance,
  partyGuestRemap,
  partyGuestVariantKey,
  tulipTallyText,
  CREDITS_CONFIRM_BODY_LINES,
  CREDITS_CONFIRM_CANCEL_LABEL,
  CREDITS_CONFIRM_ERASE_LABEL,
  CREDITS_CONFIRM_TITLE,
  CREDITS_FRESH_START_LABEL,
  CREDITS_PLAY_AGAIN_LABEL,
} from '../src/data/finale';
import type { AuthoredGuestAppearance, NamedGuest } from '../src/data/finale';
import {
  buildPartyCastSlots,
  castBounceOffsetPx,
  castTextureSource,
  partyRowX,
} from '../src/systems/partyCast';
import {
  CREDITS,
  DEPTHS,
  DESIGN_HEIGHT,
  DESIGN_WIDTH,
  GABBY_BASE_LAYOUT,
  PALETTE,
  PARTY,
  UI_MIN_TOUCH_PX,
} from '../src/systems/constants';
import { MARKERS } from '../src/systems/palette';
import { resolveEyes, resolveHair } from '../src/data/characters';

// ---------------------------------------------------------------------------
// Independent oracles. Each string is assembled from explicit code points so it
// shares NO bytes with src/data/finale.ts.
// ---------------------------------------------------------------------------

/** Build a string from a list of code points — the "second copy" that makes the
 * byte-exact assertions meaningful. */
function fromCodePoints(...codePoints: number[]): string {
  return String.fromCodePoint(...codePoints);
}

/** 'Andrea' */
const ORACLE_ANDREA = fromCodePoints(0x41, 0x6e, 0x64, 0x72, 0x65, 0x61);
/** 'Allison' */
const ORACLE_ALLISON = fromCodePoints(0x41, 0x6c, 0x6c, 0x69, 0x73, 0x6f, 0x6e);
/** 'Dallas' */
const ORACLE_DALLAS = fromCodePoints(0x44, 0x61, 0x6c, 0x6c, 0x61, 0x73);
/** 'Dom' */
const ORACLE_DOM = fromCodePoints(0x44, 0x6f, 0x6d);

/** 'HAPPY 22nd GABBY!!' — note the LOWERCASE "nd" and exactly TWO '!'. */
const ORACLE_BANNER = fromCodePoints(
  0x48, 0x41, 0x50, 0x50, 0x59, // HAPPY
  0x20,
  0x32, 0x32, 0x6e, 0x64, // 22nd  (0x6e 0x64 = lowercase n, d)
  0x20,
  0x47, 0x41, 0x42, 0x42, 0x59, // GABBY
  0x21, 0x21 // !!
);

/** U+1F337 TULIP — the ONE non-ASCII code point allowed in this module. */
const ORACLE_TULIP = String.fromCodePoint(0x1f337);

/** 'You brought ' + N + ' tulips to the party!! ' + tulip */
function oracleToast(count: number): string {
  const head = fromCodePoints(
    0x59, 0x6f, 0x75, // You
    0x20,
    0x62, 0x72, 0x6f, 0x75, 0x67, 0x68, 0x74, // brought
    0x20
  );
  const tail = fromCodePoints(
    0x20,
    0x74, 0x75, 0x6c, 0x69, 0x70, 0x73, // tulips
    0x20,
    0x74, 0x6f, // to
    0x20,
    0x74, 0x68, 0x65, // the
    0x20,
    0x70, 0x61, 0x72, 0x74, 0x79, // party
    0x21, 0x21, // !!
    0x20
  );
  return head + String(count) + tail + ORACLE_TULIP;
}

/** 'Created by Caleb Melin' */
const ORACLE_CREDIT_1 = fromCodePoints(
  0x43, 0x72, 0x65, 0x61, 0x74, 0x65, 0x64, // Created
  0x20,
  0x62, 0x79, // by
  0x20,
  0x43, 0x61, 0x6c, 0x65, 0x62, // Caleb
  0x20,
  0x4d, 0x65, 0x6c, 0x69, 0x6e // Melin
);
/** 'Created for Gabriella Novelli' */
const ORACLE_CREDIT_2 = fromCodePoints(
  0x43, 0x72, 0x65, 0x61, 0x74, 0x65, 0x64, // Created
  0x20,
  0x66, 0x6f, 0x72, // for
  0x20,
  0x47, 0x61, 0x62, 0x72, 0x69, 0x65, 0x6c, 0x6c, 0x61, // Gabriella
  0x20,
  0x4e, 0x6f, 0x76, 0x65, 0x6c, 0x6c, 0x69 // Novelli
);
/** 'Happy 22nd!!!' — THREE exclamation marks (the banner has two). */
const ORACLE_CREDIT_3 = fromCodePoints(
  0x48, 0x61, 0x70, 0x70, 0x79, // Happy
  0x20,
  0x32, 0x32, 0x6e, 0x64, // 22nd
  0x21, 0x21, 0x21 // !!!
);

/** U+00D7 MULTIPLICATION SIGN — the second, riskier non-ASCII code point in the
 * credits tally (the tulip above is the first). */
const ORACLE_TIMES = String.fromCodePoint(0x00d7);

/** tulip + ' ' + times + ' ' + N + ' collected' */
function oracleTulipTally(count: number): string {
  const tail = fromCodePoints(
    0x20,
    0x63, 0x6f, 0x6c, 0x6c, 0x65, 0x63, 0x74, 0x65, 0x64 // collected
  );
  return `${ORACLE_TULIP} ${ORACLE_TIMES} ${count}${tail}`;
}

/** True iff every code point is 7-bit ASCII. */
function isPureAscii(text: string): boolean {
  return [...text].every((c) => c.codePointAt(0)! < 128);
}

// ---------------------------------------------------------------------------
// 1. Verbatim content.
// ---------------------------------------------------------------------------

describe('named guests are byte-exact (CLAUDE.md Rule 4 / NORTH_STAR §5)', () => {
  const cases: ReadonlyArray<{ guest: NamedGuest; oracle: string }> = [
    { guest: GUEST_ANDREA, oracle: ORACLE_ANDREA },
    { guest: GUEST_ALLISON, oracle: ORACLE_ALLISON },
    { guest: GUEST_DALLAS, oracle: ORACLE_DALLAS },
    { guest: GUEST_DOM, oracle: ORACLE_DOM },
  ];

  for (const { guest, oracle } of cases) {
    it(`${oracle} is spelled exactly, pure ASCII`, () => {
      expect(guest.name).toBe(oracle);
      expect(isPureAscii(guest.name)).toBe(true);
      // No stray whitespace smuggled in either end (a tag would render it).
      expect(guest.name).toBe(guest.name.trim());
    });
  }

  it('the roster holds exactly these four, in NORTH_STAR order', () => {
    expect(NAMED_GUESTS).toHaveLength(4);
    expect(NAMED_GUESTS.map((g) => g.name)).toEqual([
      ORACLE_ANDREA,
      ORACLE_ALLISON,
      ORACLE_DALLAS,
      ORACLE_DOM,
    ]);
  });

  it('the four names are unique (two tags must never read the same)', () => {
    expect(new Set(NAMED_GUESTS.map((g) => g.name)).size).toBe(NAMED_GUESTS.length);
  });
});

describe('PARTY_BANNER_TEXT is byte-exact', () => {
  it('reads exactly "HAPPY 22nd GABBY!!"', () => {
    expect(PARTY_BANNER_TEXT).toBe(ORACLE_BANNER);
  });

  it('is pure ASCII', () => {
    expect(isPureAscii(PARTY_BANNER_TEXT)).toBe(true);
  });

  it('keeps the lowercase "nd" and exactly two exclamation marks', () => {
    // Guards the two most likely "improvements": upper-casing 22ND, or
    // normalizing !! to a single ! / a third !.
    expect(PARTY_BANNER_TEXT).toContain(fromCodePoints(0x32, 0x32, 0x6e, 0x64));
    expect(PARTY_BANNER_TEXT.split('!').length - 1).toBe(2);
    expect(PARTY_BANNER_TEXT.endsWith(fromCodePoints(0x21, 0x21))).toBe(true);
    expect(PARTY_BANNER_TEXT).not.toContain(fromCodePoints(0x32, 0x32, 0x4e, 0x44)); // "22ND"
  });
});

describe('bouquetToastText is byte-exact (including its deliberate wart)', () => {
  for (const count of [0, 1, 2, 7, 22]) {
    it(`renders N=${count} exactly`, () => {
      expect(bouquetToastText(count)).toBe(oracleToast(count));
    });
  }

  it('renders "1 tulips" at N=1 — the grammatical wart is INTENTIONAL', () => {
    // Locked personal content: never pluralize, never branch to "1 tulip" or
    // "no tulips". If someone "fixes" this, this test is why it fails.
    const toast = bouquetToastText(1);
    expect(toast).toContain(fromCodePoints(0x31, 0x20, 0x74, 0x75, 0x6c, 0x69, 0x70, 0x73)); // "1 tulips"
    expect(toast).not.toContain(fromCodePoints(0x31, 0x20, 0x74, 0x75, 0x6c, 0x69, 0x70, 0x20)); // "1 tulip "
  });

  it('is pure ASCII apart from the single U+1F337 tulip', () => {
    const toast = bouquetToastText(3);
    const nonAscii = [...toast].filter((c) => c.codePointAt(0)! >= 128);
    expect(nonAscii).toEqual([ORACLE_TULIP]);
    expect(nonAscii[0].codePointAt(0)).toBe(0x1f337);
  });

  it('ends with the tulip and carries exactly two exclamation marks', () => {
    const toast = bouquetToastText(5);
    expect(toast.endsWith(ORACLE_TULIP)).toBe(true);
    expect(toast.split('!').length - 1).toBe(2);
  });
});

describe('CREDITS_LINES are byte-exact, in order (NORTH_STAR §5)', () => {
  it('is exactly the three lines, in this order', () => {
    expect(CREDITS_LINES).toEqual([ORACLE_CREDIT_1, ORACLE_CREDIT_2, ORACLE_CREDIT_3]);
  });

  it('every line is pure ASCII with no leading/trailing whitespace', () => {
    for (const line of CREDITS_LINES) {
      expect(isPureAscii(line)).toBe(true);
      expect(line).toBe(line.trim());
      expect(line.length).toBeGreaterThan(0);
    }
  });

  it('the last line has THREE exclamation marks (not the banner\'s two)', () => {
    expect(CREDITS_LINES[2].split('!').length - 1).toBe(3);
    expect(CREDITS_LINES[2]).not.toBe(PARTY_BANNER_TEXT);
  });

  it('contains no mangling-prone punctuation (dashes, ellipsis, curly quotes)', () => {
    const banned = ['\u{2013}', '\u{2014}', '\u{2026}', '\u{2018}', '\u{2019}', '\u{201C}', '\u{201D}'];
    for (const line of CREDITS_LINES) {
      for (const ch of banned) expect(line).not.toContain(ch);
    }
  });
});

describe('tulipTallyText is byte-exact (CreditsScene, PLAN-09 task 3)', () => {
  it('renders "<tulip> <times> N collected" for any count', () => {
    for (const count of [0, 1, 7, 13, 999]) {
      expect(tulipTallyText(count)).toBe(oracleTulipTally(count));
    }
  });

  it('is NOT gated on a positive count (unlike the bouquet toast)', () => {
    // The party toast congratulates and is hidden at 0; this is a tally, so it
    // must render a real string at 0 rather than an empty one.
    expect(tulipTallyText(0)).toContain('0');
    expect(tulipTallyText(0).length).toBeGreaterThan(0);
  });

  it('carries EXACTLY two non-ASCII code points: U+1F337 then U+00D7', () => {
    // The whole reason this lives in data/finale.ts rather than in the scene:
    // swapping the multiplication sign for an ASCII 'x' (or a literal glyph a
    // re-encode could mangle) must fail here, not only in the browser harness.
    const nonAscii = [...tulipTallyText(13)].filter((c) => c.codePointAt(0)! >= 128);
    expect(nonAscii).toEqual([ORACLE_TULIP, ORACLE_TIMES]);
    expect(nonAscii[0].codePointAt(0)).toBe(0x1f337);
    expect(nonAscii[1].codePointAt(0)).toBe(0x00d7);
  });

  it('keeps the count between the multiplication sign and the word', () => {
    const units = Array.from(tulipTallyText(42));
    expect(units[0]).toBe(ORACLE_TULIP);
    expect(units[2]).toBe(ORACLE_TIMES);
    expect(tulipTallyText(42).endsWith('42 collected')).toBe(true);
  });

  it('is pure ASCII apart from those two code points', () => {
    const stripped = [...tulipTallyText(5)]
      .filter((c) => c !== ORACLE_TULIP && c !== ORACLE_TIMES)
      .join('');
    expect(isPureAscii(stripped)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2. Roster / appearance invariants.
// ---------------------------------------------------------------------------

describe('guest appearance invariants', () => {
  it('Dallas MIRRORS THE PLAYER and carries no hand-authored colors', () => {
    // The twin joke (NORTH_STAR §5) can only be broken by someone giving her
    // her own colors — the data model has nowhere to put them, and this pins it.
    expect(GUEST_DALLAS.appearance.kind).toBe('mirrorsPlayer');
    expect(Object.keys(GUEST_DALLAS.appearance)).toEqual(['kind']);
  });

  it('Dallas is the ONLY mirrors-the-player guest', () => {
    const mirroring = NAMED_GUESTS.filter((g) => g.appearance.kind === 'mirrorsPlayer');
    expect(mirroring.map((g) => g.name)).toEqual([ORACLE_DALLAS]);
  });

  it('Andrea and Allison differ in BOTH hair color and suit color', () => {
    const andrea = GUEST_ANDREA.appearance as AuthoredGuestAppearance;
    const allison = GUEST_ALLISON.appearance as AuthoredGuestAppearance;
    expect(andrea.kind).toBe('authored');
    expect(allison.kind).toBe('authored');
    expect(andrea.hairColor).not.toBe(allison.hairColor);
    expect(andrea.suitColor).not.toBe(allison.suitColor);
    // ...and in hair silhouette, so they never read as the same person.
    expect(andrea.hairStyle).not.toBe(allison.hairStyle);
  });

  it('Dom is blonde and NOT Caleb-brown (they must stay distinguishable)', () => {
    const dom = GUEST_DOM.appearance as AuthoredGuestAppearance;
    // The REAL invariant (NORTH_STAR §5 / DECISIONS.md 2026-07-15): Dom must
    // never share Caleb's hair, since blonde-Dom is exactly why Caleb is
    // brown-haired. Asserted against PALETTE.brown — the literal colour
    // src/art/sprites.mjs drawCaleb bakes into tex-caleb's hair — so retuning
    // Andrea (or any other guest) can't silently take this guard with it.
    expect(dom.hairColor).not.toBe(PALETTE.brown);
    expect(dom.hairColor).toBe(resolveHair('blonde').color);
    // ...and no OTHER named guest is blonde either, so the tag-less crowd aside,
    // Dom is unambiguous in the front row.
    const otherBlondes = NAMED_GUESTS.filter(
      (g) => g.appearance.kind === 'authored' && g.appearance.hairColor === dom.hairColor
    );
    expect(otherBlondes.map((g) => g.name)).toEqual([ORACLE_DOM]);
  });

  it('no authored color equals a MARKERS value (recolor safety)', () => {
    const markerValues = Object.values(MARKERS);
    const authored: AuthoredGuestAppearance[] = [
      ...NAMED_GUESTS.map((g) => g.appearance).filter(
        (a): a is AuthoredGuestAppearance => a.kind === 'authored'
      ),
      ...Array.from({ length: PARTY.crowdCount }, (_, i) => crowdGuestAppearance(i)),
    ];
    for (const a of authored) {
      for (const color of [a.hairColor, a.eyeColor, a.suitColor]) {
        expect(markerValues).not.toContain(color);
      }
    }
  });
});

describe('crowd appearance is deterministic and varied', () => {
  it('is a pure function of the index (same index -> identical look)', () => {
    for (let i = 0; i < 20; i++) {
      expect(crowdGuestAppearance(i)).toEqual(crowdGuestAppearance(i));
    }
  });

  it('pins concrete looks, so a silent reorder of the colour lists fails', () => {
    // Without this, the "distinct combos"/"adjacent differ" properties below all
    // still hold after someone shuffles CROWD_*_COLORS — and every crowd member
    // silently changes appearance. Pinned against the game's own swatch data
    // (resolveHair/resolveEyes), not re-hardcoded hex.
    expect(crowdGuestAppearance(0)).toEqual({
      kind: 'authored',
      hairColor: resolveHair('brown').color,
      suitColor: CROWD_SUIT_COLORS[0],
      eyeColor: resolveEyes('blue').color,
      hairStyle: 'band',
    });
    expect(crowdGuestAppearance(1)).toEqual({
      kind: 'authored',
      hairColor: resolveHair('blonde').color,
      suitColor: CROWD_SUIT_COLORS[1],
      eyeColor: resolveEyes('green').color,
      hairStyle: 'band',
    });
    // Each channel advances on its OWN cycle (5 / 6 / 4), so index 5 wraps hair
    // back to the head of the list while suit and eye do not.
    expect(crowdGuestAppearance(5).hairColor).toBe(resolveHair('brown').color);
    expect(crowdGuestAppearance(5).suitColor).toBe(CROWD_SUIT_COLORS[5]);
    expect(crowdGuestAppearance(5).eyeColor).toBe(resolveEyes('green').color);
  });

  it('draws its hair/eye tones from the game\'s OWN swatch data', () => {
    // The comment in data/finale.ts claims these are the real swatches; this
    // makes that true rather than aspirational.
    for (const id of ['brown', 'blonde', 'black', 'ginger']) {
      expect(CROWD_HAIR_COLORS).toContain(resolveHair(id).color);
    }
    for (const id of ['blue', 'green', 'brown', 'grey']) {
      expect(CROWD_EYE_COLORS).toContain(resolveEyes(id).color);
    }
  });

  it('has no duplicate tones within any colour list', () => {
    // resolveHair/resolveEyes fall back to the default swatch for an unknown
    // id, so a renamed/retired swatch would silently collapse two entries into
    // one and quietly halve the crowd's variety.
    for (const list of [CROWD_HAIR_COLORS, CROWD_SUIT_COLORS, CROWD_EYE_COLORS]) {
      expect(new Set(list).size).toBe(list.length);
    }
  });

  it('never gives a crowd member the ponytail (Allison-only tell)', () => {
    for (let i = 0; i < PARTY.crowdCount; i++) {
      expect(crowdGuestAppearance(i).hairStyle).toBe('band');
    }
  });

  it('gives every built crowd member a distinct hair+suit+eye combination', () => {
    const combos = new Set<string>();
    for (let i = 0; i < PARTY.crowdCount; i++) {
      const a = crowdGuestAppearance(i);
      combos.add(`${a.hairColor}|${a.suitColor}|${a.eyeColor}`);
    }
    expect(combos.size).toBe(PARTY.crowdCount);
  });

  it('never gives two ADJACENT crowd members the same hair color', () => {
    for (let i = 1; i < PARTY.crowdCount; i++) {
      expect(crowdGuestAppearance(i).hairColor).not.toBe(crowdGuestAppearance(i - 1).hairColor);
    }
  });

  it('is total for negative / fractional indices (never throws or yields undefined)', () => {
    for (const i of [-1, -7, 2.7, 0.5]) {
      const a = crowdGuestAppearance(i);
      expect(CROWD_HAIR_COLORS).toContain(a.hairColor);
      expect(CROWD_SUIT_COLORS).toContain(a.suitColor);
      expect(CROWD_EYE_COLORS).toContain(a.eyeColor);
    }
  });
});

describe('partyGuestRemap / partyGuestVariantKey', () => {
  const look: AuthoredGuestAppearance = {
    kind: 'authored',
    hairColor: 0x123456,
    eyeColor: 0xabcdef,
    suitColor: 0x0f0f0f,
    hairStyle: 'band',
  };

  it('maps hair/eyes/suit markers to the chosen colors and nothing else', () => {
    expect(partyGuestRemap(look)).toEqual([
      { from: MARKERS.hair, to: 0x123456 },
      { from: MARKERS.eyes, to: 0xabcdef },
      { from: MARKERS.suit, to: 0x0f0f0f },
    ]);
    // Party guests are on foot — the bike marker must never be remapped.
    expect(partyGuestRemap(look).some((e) => e.from === MARKERS.bikeBody)).toBe(false);
  });

  it('keys into its own tex-party| namespace (never collides with tex-gabby|)', () => {
    const key = partyGuestVariantKey(look);
    expect(key.startsWith('tex-party|')).toBe(true);
    expect(key).toBe('tex-party|123456|abcdef|0f0f0f');
  });

  it('is stable and collision-free across the whole shipped cast', () => {
    const authored = [
      ...NAMED_GUESTS.map((g) => g.appearance).filter(
        (a): a is AuthoredGuestAppearance => a.kind === 'authored'
      ),
      ...Array.from({ length: PARTY.crowdCount }, (_, i) => crowdGuestAppearance(i)),
    ];
    const keys = authored.map(partyGuestVariantKey);
    // Same look -> same key (cache hits), different look -> different key.
    expect(new Set(keys).size).toBe(new Set(authored.map((a) => `${a.hairColor}|${a.eyeColor}|${a.suitColor}`)).size);
    expect(partyGuestVariantKey(authored[0])).toBe(partyGuestVariantKey(authored[0]));
  });

  it('ignores hairStyle (the ponytail is an overlay, not baked into pixels)', () => {
    const ponytailed: AuthoredGuestAppearance = { ...look, hairStyle: 'ponytail' };
    expect(partyGuestVariantKey(ponytailed)).toBe(partyGuestVariantKey(look));
  });
});

// ---------------------------------------------------------------------------
// 3. Cast layout + bounce helpers (systems/partyCast.ts).
// ---------------------------------------------------------------------------

/** BootScene's placeholder rider/Caleb sprite size. Re-stated here as an
 * independent oracle (partyCast.ts keeps its own copy as a local placeholder
 * drawing const) so a change to the art size has to be acknowledged in both
 * places rather than silently sliding the geometry assertions below. */
const SPRITE_WIDTH_PX = 24;
const SPRITE_HEIGHT_PX = 48;

describe('PARTY constants stay inside the mandated ranges', () => {
  it('the unnamed crowd count sits within NORTH_STAR §5\'s 8..15', () => {
    expect(PARTY.crowdCount).toBeGreaterThanOrEqual(8);
    expect(PARTY.crowdCount).toBeLessThanOrEqual(15);
  });

  it('lays the crowd over an ODD grid with exactly one slot left empty', () => {
    // ODD is what makes the half-step interleave exact (see crowdSpacingPx);
    // the one empty slot is the centre one, and crowdCount must agree with that
    // or the constant would describe a crowd the layout does not build.
    expect(PARTY.crowdSlotCount % 2).toBe(1);
    expect(PARTY.crowdCount).toBe(PARTY.crowdSlotCount - 1);
    expect(buildPartyCastSlots().filter((s) => s.role === 'crowd')).toHaveLength(PARTY.crowdCount);
  });

  it('the crowd is drawn BEHIND the front row and reads as further away', () => {
    expect(PARTY.crowdDepth).toBeLessThan(PARTY.frontRowDepth);
    expect(PARTY.crowdGroundY).toBeLessThan(PARTY.frontRowGroundY); // higher on screen
    expect(PARTY.crowdScale).toBeLessThan(PARTY.frontRowScale); // smaller
  });

  it('name tags draw above every cast sprite', () => {
    expect(PARTY.nameTagDepth).toBeGreaterThan(PARTY.frontRowDepth);
  });

  it('leaves the DEPTHS.fx layer free for ST-2 balloons / ST-3 confetti', () => {
    // The PARTY block doc states this; ST-2's balloons depend on being able to
    // draw above the cast without fighting the tags for a layer.
    expect(PARTY.nameTagDepth).toBeLessThan(DEPTHS.fx);
    expect(PARTY.crowdDepth).toBeLessThan(DEPTHS.fx);
  });

  it('the tag gap clears the panel half-height (a tag never overlaps a head)', () => {
    // partyCast.ts sizes the panel from the label's MEASURED height, so model it
    // as `lineHeight * fontSize + 2 * padY`. Browser-measured, Press Start 2P
    // single line at 8/16/24/32/40px: Phaser reports height EXACTLY 1.0x the
    // font size. MAX_LINE_HEIGHT_FACTOR is the conservative bound that still
    // holds if the pixel font fails to load and FONT_STACK_PIXEL falls back to
    // Courier New.
    const MAX_LINE_HEIGHT_FACTOR = 1.5;
    const panelHalfHeight =
      (MAX_LINE_HEIGHT_FACTOR * PARTY.nameTagFontSizePx + PARTY.nameTagPadYPx * 2) / 2;
    expect(PARTY.nameTagGapPx).toBeGreaterThan(panelHalfHeight);
  });

  it('keeps adjacent name-tag panels from colliding', () => {
    // Press Start 2P is fixed-width with an advance of exactly one font size per
    // character (browser-measured: "Allison" renders 7 x 16 = 112px wide), so a
    // panel is `name.length * fontSize + 2 * padX` wide. The four tags sit on
    // front-row members, so two adjacent tags are frontRowSpacingPx apart.
    // Without this, bumping nameTagFontSizePx to 24 would overlap
    // "Andrea"/"Dallas" with nothing failing.
    const panelWidth = (name: string): number =>
      name.length * PARTY.nameTagFontSizePx + PARTY.nameTagPadXPx * 2;
    for (const a of NAMED_GUESTS) {
      for (const b of NAMED_GUESTS) {
        expect(panelWidth(a.name) / 2 + panelWidth(b.name) / 2).toBeLessThan(
          PARTY.frontRowSpacingPx
        );
      }
    }
  });
});

describe('partyRowX', () => {
  it('centers an odd-count row on centerX', () => {
    expect(partyRowX(1, 3, 640, 100)).toBe(640);
    expect(partyRowX(0, 3, 640, 100)).toBe(540);
    expect(partyRowX(2, 3, 640, 100)).toBe(740);
  });

  it('straddles centerX for an even-count row', () => {
    expect(partyRowX(2, 6, 640, 150)).toBe(565);
    expect(partyRowX(3, 6, 640, 150)).toBe(715);
  });
});

describe('buildPartyCastSlots layout', () => {
  const slots = buildPartyCastSlots();

  it('is fully deterministic (two calls produce identical layouts)', () => {
    expect(buildPartyCastSlots()).toEqual(buildPartyCastSlots());
  });

  it('builds 6 front-row members + the whole crowd', () => {
    expect(slots).toHaveLength(6 + PARTY.crowdCount);
    expect(slots.filter((s) => s.role === 'crowd')).toHaveLength(PARTY.crowdCount);
  });

  it('has Gabby, Caleb and all four named guests exactly once', () => {
    expect(slots.filter((s) => s.role === 'gabby')).toHaveLength(1);
    expect(slots.filter((s) => s.role === 'caleb')).toHaveLength(1);
    expect(slots.filter((s) => s.role === 'guest').map((s) => s.id).sort()).toEqual(
      [ORACLE_ALLISON, ORACLE_ANDREA, ORACLE_DALLAS, ORACLE_DOM].sort()
    );
  });

  it('tags EXACTLY the four named guests — never Gabby, Caleb or the crowd', () => {
    const tagged = slots.filter((s) => s.nameTag !== null);
    expect(tagged.map((s) => s.nameTag).sort()).toEqual(
      [ORACLE_ALLISON, ORACLE_ANDREA, ORACLE_DALLAS, ORACLE_DOM].sort()
    );
    for (const s of slots) {
      if (s.role !== 'guest') expect(s.nameTag).toBeNull();
    }
  });

  it('leaves the screen\'s dead centre to the COUPLE, not to a stranger', () => {
    // NORTH_STAR §5: "Gabby (player's customized look) + Caleb stand center".
    // The crowd grid's middle slot lands exactly on centre — i.e. exactly
    // between them — so it is left empty. Without this, the geometric centre of
    // the whole payoff screen is an unnamed partygoer's head.
    const gabby = slots.find((s) => s.role === 'gabby')!;
    const caleb = slots.find((s) => s.role === 'caleb')!;
    for (const c of slots.filter((s) => s.role === 'crowd')) {
      expect(c.x).not.toBe(PARTY.crowdCenterX);
      // ...and nobody stands in the gap between the two of them at all.
      expect(c.x > gabby.x && c.x < caleb.x).toBe(false);
    }
  });

  it('stands Gabby and Caleb centre, straddling screen centre', () => {
    const gabby = slots.find((s) => s.role === 'gabby')!;
    const caleb = slots.find((s) => s.role === 'caleb')!;
    expect(gabby.x).toBeLessThan(PARTY.frontRowCenterX);
    expect(caleb.x).toBeGreaterThan(PARTY.frontRowCenterX);
    // Symmetric about centre, and adjacent (one spacing apart).
    expect(caleb.x - gabby.x).toBe(PARTY.frontRowSpacingPx);
    expect((gabby.x + caleb.x) / 2).toBe(PARTY.frontRowCenterX);
  });

  it('stands Dallas IMMEDIATELY next to Gabby (the twin joke needs adjacency)', () => {
    const gabby = slots.find((s) => s.role === 'gabby')!;
    const dallas = slots.find((s) => s.id === ORACLE_DALLAS)!;
    expect(Math.abs(dallas.x - gabby.x)).toBe(PARTY.frontRowSpacingPx);
    expect(dallas.groundY).toBe(gabby.groundY);
    expect(dallas.scale).toBe(gabby.scale);
  });

  it('flanks the pair with the other three named guests', () => {
    const gabby = slots.find((s) => s.role === 'gabby')!;
    const caleb = slots.find((s) => s.role === 'caleb')!;
    for (const name of [ORACLE_ANDREA, ORACLE_ALLISON, ORACLE_DOM]) {
      const guest = slots.find((s) => s.id === name)!;
      expect(guest.x < gabby.x || guest.x > caleb.x).toBe(true);
    }
  });

  it('gives Dallas NO authored appearance (she uses the player rider texture)', () => {
    const dallas = slots.find((s) => s.id === ORACLE_DALLAS)!;
    expect(dallas.appearance).toBeNull();
    // Gabby and Caleb are texture-authored elsewhere too.
    expect(slots.find((s) => s.role === 'gabby')!.appearance).toBeNull();
    expect(slots.find((s) => s.role === 'caleb')!.appearance).toBeNull();
    // ...while the other three named guests DO carry authored colors.
    for (const name of [ORACLE_ANDREA, ORACLE_ALLISON, ORACLE_DOM]) {
      expect(slots.find((s) => s.id === name)!.appearance).not.toBeNull();
    }
  });

  it('never stacks two members at the same x', () => {
    const xs = slots.map((s) => s.x);
    expect(new Set(xs).size).toBe(xs.length);
  });

  it('never hides a crowd member behind a front-row member', () => {
    // Stronger than "distinct x": the back row must clear the FRONT row's
    // sprites horizontally, or a crowd head peeks out of a front-row head and
    // reads as a hat rather than as another partygoer (screenshot-caught).
    const halfWidth = (s: { scale: number }): number => (SPRITE_WIDTH_PX * s.scale) / 2;
    const front = slots.filter((s) => s.role !== 'crowd');
    const crowd = slots.filter((s) => s.role === 'crowd');
    for (const c of crowd) {
      for (const f of front) {
        expect(Math.abs(c.x - f.x)).toBeGreaterThanOrEqual(halfWidth(c) + halfWidth(f));
      }
    }
  });

  it('keeps every member fully on screen (the design viewport)', () => {
    for (const s of slots) {
      const halfWidth = (SPRITE_WIDTH_PX * s.scale) / 2;
      expect(s.x - halfWidth).toBeGreaterThanOrEqual(0);
      expect(s.x + halfWidth).toBeLessThanOrEqual(DESIGN_WIDTH);
      expect(s.groundY).toBeGreaterThan(0);
      expect(s.groundY).toBeLessThanOrEqual(DESIGN_HEIGHT);
      // Heads (and their name tags) stay above the top edge of the screen.
      expect(s.groundY - SPRITE_HEIGHT_PX * s.scale - PARTY.nameTagGapPx).toBeGreaterThan(0);
    }
  });

  it('draws every crowd member behind, above and smaller than the front row', () => {
    const front = slots.filter((s) => s.role !== 'crowd');
    const crowd = slots.filter((s) => s.role === 'crowd');
    for (const c of crowd) {
      for (const f of front) {
        expect(c.depth).toBeLessThan(f.depth);
        expect(c.groundY).toBeLessThan(f.groundY);
        expect(c.scale).toBeLessThan(f.scale);
      }
    }
  });

  it('varies crowd scale and standing depth by index (not clones in a line)', () => {
    const crowd = slots.filter((s) => s.role === 'crowd');
    expect(new Set(crowd.map((s) => s.scale)).size).toBeGreaterThan(1);
    expect(new Set(crowd.map((s) => s.groundY)).size).toBeGreaterThan(1);
  });

  it('gives every member a DISTINCT bounce phase in [0, 1)', () => {
    const phases = slots.map((s) => s.phase01);
    for (const p of phases) {
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThan(1);
    }
    // Rounded to 1e-6 so float noise can't fake distinctness.
    expect(new Set(phases.map((p) => p.toFixed(6))).size).toBe(phases.length);
  });

  it('spreads phases across the whole cycle (both halves represented)', () => {
    const phases = slots.map((s) => s.phase01);
    expect(phases.some((p) => p < 0.5)).toBe(true);
    expect(phases.some((p) => p >= 0.5)).toBe(true);
  });
});

describe('castTextureSource — THE TWIN JOKE (NORTH_STAR §5)', () => {
  const slots = buildPartyCastSlots();
  const bySource = (id: string) => castTextureSource(slots.find((s) => s.id === id)!);

  it('routes Dallas and Gabby to the SAME source: the player character', () => {
    // This is the load-bearing assertion. createPartyCast's textureKeyFor is a
    // plain switch over this function, and the 'player' branch returns the one
    // riderTextureKey buildCharacterTextures produced — so both resolving to
    // 'player' IS "Dallas's sprite is a copy of the player's current Gabby",
    // and it stays true for every character the player can pick.
    expect(bySource(ORACLE_DALLAS)).toBe('player');
    expect(bySource('gabby')).toBe('player');
    expect(bySource(ORACLE_DALLAS)).toBe(bySource('gabby'));
  });

  it('routes NOBODY else to the player texture', () => {
    const playerSourced = slots.filter((s) => castTextureSource(s) === 'player').map((s) => s.id);
    expect(playerSourced.sort()).toEqual([ORACLE_DALLAS, 'gabby'].sort());
  });

  it('routes Caleb to his own placeholder, never to the player texture', () => {
    // Caleb must never inherit Gabby's look just because he has no authored
    // colors — the role check has to come FIRST in castTextureSource.
    expect(bySource('caleb')).toBe('caleb');
  });

  it('routes the other three named guests and the whole crowd to authored swaps', () => {
    for (const name of [ORACLE_ANDREA, ORACLE_ALLISON, ORACLE_DOM]) {
      expect(bySource(name)).toBe('authored');
    }
    for (const s of slots.filter((s) => s.role === 'crowd')) {
      expect(castTextureSource(s)).toBe('authored');
    }
  });

  it('is total — every slot resolves to one of the three known sources', () => {
    for (const s of slots) {
      expect(['caleb', 'player', 'authored']).toContain(castTextureSource(s));
    }
  });
});

// ---------------------------------------------------------------------------
// 4. PartyScene's own layout constants (ST-3). The scene itself needs a real
// browser (scripts/playtest-party.mjs gates it end to end), but the geometry
// that decides whether the banner, the toast, the streamers, the lights, the
// bouquet and the "Credits ->" button collide with each other or with the cast
// is pure arithmetic over the PARTY block — so it is pinned here, where a
// retune fails loudly instead of only showing up in a screenshot.
//
// PANEL MODEL: the scene sizes every cream panel from the label's MEASURED
// height (`label.height + 2 * padY`), exactly as partyCast.ts sizes a name tag.
// Press Start 2P reports a single-line Text height of EXACTLY 1.0x the font
// size (browser-measured, 8-40px); MAX_LINE_HEIGHT_FACTOR is the conservative
// bound that still holds if the pixel font fails to load and FONT_STACK_PIXEL
// falls back to Courier New — the same bound the name-tag gap test uses.
// ---------------------------------------------------------------------------

describe('PartyScene layout constants (banner / toast / venue / button)', () => {
  const MAX_LINE_HEIGHT_FACTOR = 1.5;
  /** Press Start 2P is fixed-width with an advance of exactly one font size per
   * character (browser-measured: "Allison" renders 7 x 16 = 112px). */
  const panelWidth = (text: string, fontSizePx: number, padXPx: number): number =>
    text.length * fontSizePx + padXPx * 2;
  const panelHalfHeight = (fontSizePx: number, padYPx: number): number =>
    (MAX_LINE_HEIGHT_FACTOR * fontSizePx + padYPx * 2) / 2;

  const bannerHalfWidth =
    panelWidth(PARTY_BANNER_TEXT, PARTY.bannerFontSizePx, PARTY.bannerPadXPx) / 2;
  const bannerBottom =
    PARTY.bannerCenterY + panelHalfHeight(PARTY.bannerFontSizePx, PARTY.bannerPadYPx);
  const toastTop =
    PARTY.toastCenterY - panelHalfHeight(PARTY.toastFontSizePx, PARTY.toastPadYPx);
  const toastBottom =
    PARTY.toastCenterY + panelHalfHeight(PARTY.toastFontSizePx, PARTY.toastPadYPx);

  const slots = buildPartyCastSlots();
  const crowd = slots.filter((s) => s.role === 'crowd');
  const headTopY = (s: { groundY: number; scale: number }): number =>
    s.groundY - SPRITE_HEIGHT_PX * s.scale;
  const highestHeadY = Math.min(...crowd.map(headTopY));

  it('lays the dusk bands out top-down, ending at the ground line', () => {
    expect(PARTY.venueSkyMidY).toBeLessThan(PARTY.venueGroundY);
    expect(PARTY.venueGroundY).toBeLessThan(DESIGN_HEIGHT);
  });

  it('centres the sunset glow ON the horizon, nested brightest-in-the-middle', () => {
    // It must sit at the fence line, not up in the sky and not down on the
    // patio, or it stops reading as a sunset behind the yard.
    expect(PARTY.venueHorizonGlowCenterY).toBeGreaterThan(PARTY.venueSkyMidY);
    expect(PARTY.venueHorizonGlowCenterY).toBeLessThanOrEqual(PARTY.venueGroundY);
    expect(PARTY.venueHorizonGlowCoreWidthPx).toBeLessThan(PARTY.venueHorizonGlowWidthPx);
    expect(PARTY.venueHorizonGlowCoreHeightPx).toBeLessThan(PARTY.venueHorizonGlowHeightPx);
    // Wider than the screen, so the glow never shows a vertical edge.
    expect(PARTY.venueHorizonGlowWidthPx).toBeGreaterThan(DESIGN_WIDTH);
    // The two layers COMPOSE, so each alone must stay well short of opaque —
    // a saturated warm band across the whole width reads as a painted ledge.
    expect(PARTY.venueHorizonGlowAlpha).toBeGreaterThan(0);
    expect(PARTY.venueHorizonGlowAlpha * 2).toBeLessThan(1);
  });

  it('stands EVERY cast member on the patio (the ground line is above all feet)', () => {
    // If the ground line ever slid below a row's feet, that row would visibly
    // stand on the sky.
    for (const s of slots) expect(PARTY.venueGroundY).toBeLessThan(s.groundY);
  });

  it('puts the fence between the sky and the ground line', () => {
    expect(PARTY.venueFenceTopY).toBeGreaterThan(PARTY.venueSkyMidY);
    expect(PARTY.venueFenceTopY).toBeLessThan(PARTY.venueGroundY);
    // (That no fence pixel is drawn below a crowd member's feet follows from
    // "stands EVERY cast member on the patio" above, which is the stronger
    // statement — this used to repeat its loop verbatim.)
  });

  it('nests the warm light rings widest-first, centred on the people, on screen', () => {
    expect(PARTY.venueGlowPoolWidthPx).toBeLessThan(PARTY.venueGlowHaloWidthPx);
    expect(PARTY.venueGlowPoolHeightPx).toBeLessThan(PARTY.venueGlowHaloHeightPx);
    expect(PARTY.venueGlowCoreWidthPx).toBeLessThan(PARTY.venueGlowPoolWidthPx);
    expect(PARTY.venueGlowCoreHeightPx).toBeLessThan(PARTY.venueGlowPoolHeightPx);
    // The faint outer halo exists to SOFTEN the pool's edge, so it has to be
    // the dimmest ring — a halo as bright as the pool would just move the hard
    // curve outward instead of hiding it.
    expect(PARTY.venueGlowHaloAlpha).toBeLessThan(PARTY.venueGlowPoolAlpha);

    // The pool is LIGHT: its CENTRE must sit on the floor — below the ground
    // line, never up in the sky — and between the two rows of feet. Only the
    // centre is pinned, NOT the extent: the rings deliberately reach above
    // venueGroundY and wash up the fence, which is what light falling on a yard
    // actually does and what keeps the fence from reading as a flat cut-out
    // band (see the constant's doc).
    expect(PARTY.venueGlowPoolCenterY).toBeGreaterThan(PARTY.venueGroundY);
    expect(PARTY.venueGlowPoolCenterY).toBeGreaterThan(PARTY.crowdGroundY);
    expect(PARTY.venueGlowPoolCenterY).toBeLessThan(PARTY.frontRowGroundY);
    for (const alpha of [
      PARTY.venueGlowHaloAlpha,
      PARTY.venueGlowPoolAlpha,
      PARTY.venueGlowCoreAlpha,
    ]) {
      expect(alpha).toBeGreaterThan(0);
      expect(alpha).toBeLessThan(1);
    }
  });

  it('stacks banner -> toast -> string lights -> crowd heads with no overlap', () => {
    // The banner HANGS from the top edge on two drawn strings, so its panel top
    // must be strictly below y=0 or those strings have nowhere to run.
    const bannerTop =
      PARTY.bannerCenterY - panelHalfHeight(PARTY.bannerFontSizePx, PARTY.bannerPadYPx);
    expect(bannerTop).toBeGreaterThan(0);
    expect(bannerBottom).toBeLessThan(toastTop);
    expect(toastBottom).toBeLessThan(PARTY.lightStringAnchorY);
    const lightsBottom =
      PARTY.lightStringAnchorY + PARTY.lightStringSagPx + PARTY.lightStringBulbSizePx;
    expect(lightsBottom).toBeLessThan(highestHeadY);
  });

  it('keeps the banner and the widest plausible toast panel on screen', () => {
    expect(bannerHalfWidth * 2).toBeLessThanOrEqual(DESIGN_WIDTH);
    // 999 tulips is far past anything reachable, so this is a real upper bound.
    const widestToast = panelWidth(
      bouquetToastText(999),
      PARTY.toastFontSizePx,
      PARTY.toastPadXPx
    );
    expect(widestToast).toBeLessThanOrEqual(DESIGN_WIDTH);
  });

  it('hangs every streamer CLEAR of the banner panel, left or right of it', () => {
    // The ribbons are meant to frame the banner; a streamer drawn across
    // "HAPPY 22nd GABBY!!" would be the one decoration that hurts the scene.
    const bannerLeft = DESIGN_WIDTH / 2 - bannerHalfWidth;
    const bannerRight = DESIGN_WIDTH / 2 + bannerHalfWidth;
    for (const x of PARTY.streamerXsPx) {
      const clearsLeft = x + PARTY.streamerAmplitudePx < bannerLeft;
      const clearsRight = x - PARTY.streamerAmplitudePx > bannerRight;
      expect(clearsLeft || clearsRight).toBe(true);
      // ...and stays fully on screen.
      expect(x - PARTY.streamerAmplitudePx).toBeGreaterThanOrEqual(0);
      expect(x + PARTY.streamerAmplitudePx).toBeLessThanOrEqual(DESIGN_WIDTH);
    }
  });

  it('stops every streamer above the toast panel', () => {
    expect(PARTY.streamerLengthPx).toBeLessThan(toastTop);
  });

  it('parks the "Credits ->" button fully on screen, bottom-RIGHT, clear of the cast', () => {
    // The scene derives the centre from exactly this arithmetic.
    const x = DESIGN_WIDTH - PARTY.creditsButtonMarginXPx - PARTY.creditsButtonMinWidthPx / 2;
    const y = DESIGN_HEIGHT - PARTY.creditsButtonMarginYPx - UI_MIN_TOUCH_PX / 2;
    expect(x - PARTY.creditsButtonMinWidthPx / 2).toBeGreaterThan(DESIGN_WIDTH / 2); // right half
    expect(x + PARTY.creditsButtonMinWidthPx / 2).toBeLessThanOrEqual(DESIGN_WIDTH);
    expect(y - UI_MIN_TOUCH_PX / 2).toBeGreaterThan(PARTY.frontRowGroundY); // below their feet
    expect(y + UI_MIN_TOUCH_PX / 2).toBeLessThanOrEqual(DESIGN_HEIGHT);
    // A real touch target (NORTH_STAR §8).
    expect(PARTY.creditsButtonMinWidthPx).toBeGreaterThanOrEqual(UI_MIN_TOUCH_PX);
  });

  it('reveals the button at ~4s with a real fade, and never on a shorter fuse', () => {
    // PLAN-09 task 2: "After ~4 seconds ... The scene stays alive — no forced
    // exit." Nothing in the scene auto-advances; this only bounds the reveal.
    expect(PARTY.creditsButtonDelayMs).toBeGreaterThanOrEqual(3000);
    expect(PARTY.creditsButtonDelayMs).toBeLessThanOrEqual(6000);
    expect(PARTY.creditsButtonFadeMs).toBeGreaterThan(0);
    expect(PARTY.creditsButtonFadeMs).toBeLessThan(PARTY.creditsButtonDelayMs);
  });

  it('draws the bouquet in FRONT of Gabby but behind the name tags', () => {
    expect(PARTY.bouquetDepth).toBeGreaterThan(PARTY.frontRowDepth);
    expect(PARTY.bouquetDepth).toBeLessThan(PARTY.nameTagDepth);
  });

  it('holds the bouquet AT GABBY\'S SIDE — clear of her face, clear of the floor', () => {
    // She is the one character this gift is about, so the bunch is CARRIED, not
    // painted across her. The first pass put its centre inside her sprite with
    // its blossoms at her chin (screenshot-caught); these three properties are
    // what that failure looked like, stated as geometry.
    const gabby = slots.find((s) => s.role === 'gabby')!;
    const gabbyLeft = gabby.x - (SPRITE_WIDTH_PX * gabby.scale) / 2;
    const gabbyRight = gabby.x + (SPRITE_WIDTH_PX * gabby.scale) / 2;
    const bouquetCenterX = gabby.x + PARTY.bouquetOffsetXPx;
    const bouquetHalfWidth =
      ((PARTY.bouquetStemCount - 1) / 2) * PARTY.bouquetSpreadXPx + (16 * PARTY.bouquetScale) / 2;

    // (1) HELD, not floating: the bunch must overlap her silhouette...
    expect(bouquetCenterX - bouquetHalfWidth).toBeLessThan(gabbyRight);
    expect(bouquetCenterX + bouquetHalfWidth).toBeGreaterThan(gabbyLeft);
    // ...but (2) its CENTRE sits outside her sprite, on the far side from
    // Caleb, so it reads as carried beside her rather than pasted over her.
    expect(bouquetCenterX).toBeLessThan(gabbyLeft);

    // (3) It must clear her FACE. The rider base texture's head is its top
    // (hairHeight + faceHeight) of the 48px sprite — read from
    // GABBY_BASE_LAYOUT, the same layout BootScene actually draws, rather than
    // from a guessed fraction — so her chin is here:
    const chinY =
      gabby.groundY -
      (SPRITE_HEIGHT_PX - GABBY_BASE_LAYOUT.hairHeight - GABBY_BASE_LAYOUT.faceHeight) *
        gabby.scale;
    const blossomTopY =
      gabby.groundY + PARTY.bouquetOffsetYPx - 24 * PARTY.bouquetScale - PARTY.bouquetLiftYPx;
    expect(blossomTopY).toBeGreaterThan(chinY);

    // ...and the grip stays off the floor even on the DOWN frame of her bounce.
    expect(PARTY.bouquetOffsetYPx).toBeLessThan(0);
    expect(-PARTY.bouquetOffsetYPx).toBeGreaterThan(
      PARTY.bouquetGripHeightPx + PARTY.bounceAmplitudePx
    );
  });

  it('fans the bouquet stems wide enough to read as three flowers', () => {
    // Packed closer than half a blossom they merge into one flat slab that
    // reads as a pale-green BALLOON (PALETTE.grass is in BALLOON_TINTS) —
    // screenshot-caught. tex-tulip is 16x24.
    expect(PARTY.bouquetSpreadXPx).toBeGreaterThan((16 * PARTY.bouquetScale) / 2);
    expect(PARTY.bouquetStemCount).toBeGreaterThan(1);
    expect(PARTY.bouquetLiftYPx).toBeGreaterThan(0);
  });

  it('never lets the bouquet reach a FRONT-ROW neighbour', () => {
    // Dallas stands immediately to Gabby's left, which is the side the bouquet
    // is held on — so this is the assertion that keeps the twin gag readable.
    // The bunch is bouquetStemCount tulips fanned bouquetSpreadXPx apart, so its
    // footprint is the outermost stem's, not one tulip's (tex-tulip is 16x24).
    //
    // Scoped to the FRONT ROW on purpose: the crowd stands 100px further back at
    // a lower depth, so a foreground bouquet passing in front of a distant
    // partygoer is correct perspective, not a collision — it is only a
    // front-row neighbour that the bouquet could be mistaken for part of.
    const gabby = slots.find((s) => s.role === 'gabby')!;
    const bouquetHalfWidth =
      ((PARTY.bouquetStemCount - 1) / 2) * PARTY.bouquetSpreadXPx + (16 * PARTY.bouquetScale) / 2;
    const left = gabby.x + PARTY.bouquetOffsetXPx - bouquetHalfWidth;
    const right = gabby.x + PARTY.bouquetOffsetXPx + bouquetHalfWidth;
    for (const s of slots) {
      if (s.role === 'crowd' || s.id === gabby.id) continue;
      const halfWidth = (SPRITE_WIDTH_PX * s.scale) / 2;
      expect(right < s.x - halfWidth || left > s.x + halfWidth).toBe(true);
    }
  });
});

describe('castBounceOffsetPx', () => {
  const AMP = 6;
  const PERIOD = 900;

  it('is a 2-frame bounce: only ever 0 (down) or -amplitude (up)', () => {
    for (let t = 0; t < 4000; t += 17) {
      expect([0, -AMP]).toContain(castBounceOffsetPx(t, 0, AMP, PERIOD));
    }
  });

  it('never exceeds the amplitude, and never moves DOWN', () => {
    for (let t = 0; t < 4000; t += 13) {
      for (const phase of [0, 0.25, 0.5, 0.83]) {
        const offset = castBounceOffsetPx(t, phase, AMP, PERIOD);
        expect(Math.abs(offset)).toBeLessThanOrEqual(AMP);
        expect(offset).toBeLessThanOrEqual(0);
      }
    }
  });

  it('flips exactly once per half-period', () => {
    expect(castBounceOffsetPx(0, 0, AMP, PERIOD)).toBe(0);
    expect(castBounceOffsetPx(PERIOD / 2 - 1, 0, AMP, PERIOD)).toBe(0);
    expect(castBounceOffsetPx(PERIOD / 2, 0, AMP, PERIOD)).toBe(-AMP);
    expect(castBounceOffsetPx(PERIOD - 1, 0, AMP, PERIOD)).toBe(-AMP);
    expect(castBounceOffsetPx(PERIOD, 0, AMP, PERIOD)).toBe(0);
  });

  it('is periodic', () => {
    for (let t = 0; t < PERIOD; t += 37) {
      expect(castBounceOffsetPx(t + PERIOD * 5, 0.3, AMP, PERIOD)).toBe(
        castBounceOffsetPx(t, 0.3, AMP, PERIOD)
      );
    }
  });

  it('phase actually offsets the flip (two phases disagree at some time)', () => {
    const a = castBounceOffsetPx(0, 0, AMP, PERIOD);
    const b = castBounceOffsetPx(0, 0.5, AMP, PERIOD);
    expect(a).not.toBe(b);
  });

  it('does not move the whole cast in lockstep at a given instant', () => {
    const slots = buildPartyCastSlots();
    const offsets = slots.map((s) =>
      castBounceOffsetPx(1234, s.phase01, PARTY.bounceAmplitudePx, PARTY.bouncePeriodMs)
    );
    expect(new Set(offsets).size).toBe(2); // some up, some down
  });

  it('is total for a zero/negative period and for negative time', () => {
    expect(castBounceOffsetPx(500, 0.2, AMP, 0)).toBe(0);
    expect(castBounceOffsetPx(500, 0.2, AMP, -10)).toBe(0);
    expect([0, -AMP]).toContain(castBounceOffsetPx(-500, 0.2, AMP, PERIOD));
  });
});

// ---------------------------------------------------------------------------
// 5. CreditsScene's own layout + pacing constants (ST-4). The scene needs a real
// browser (scripts/playtest-credits.mjs gates it end to end), but the geometry
// that decides whether the three lines, the heart, the divider, the tulip tally,
// the two buttons and the fresh-start confirmation collide, fit on screen, or
// stay pressable is pure arithmetic over the CREDITS block — so it is pinned
// here, where a retune fails loudly instead of only in a screenshot.
//
// TEXT MODEL (shared with the PartyScene block above, browser-measured): Press
// Start 2P is fixed-width and advances EXACTLY one font size per character, and
// Phaser reports a single-line Text height of exactly 1.0x the font size.
// MAX_LINE_HEIGHT_FACTOR is the conservative bound that still holds if the pixel
// font fails to load and FONT_STACK_PIXEL falls back to Courier New.
//
// BUTTON MODEL: ui.ts gives every button face a height of UI_MIN_TOUCH_PX and a
// width of max(label + 2 x BUTTON_PADDING_X_PX, minWidth, UI_MIN_TOUCH_PX). The
// arithmetic below treats each CREDITS.*MinWidthPx AS the face width, which is
// only true while every label's natural width stays under its minWidth — so that
// premise is now ASSERTED against the REAL labels ("every button face really is
// its minWidth" below) rather than assumed. Same for the confirmation's body
// lines, which the panel geometry sizes around. Both used to be unfalsifiable
// prose; the ST-4 code review caught it (the same structural gap tulipTallyText
// had), which is why data/finale.ts now owns those strings.
// ---------------------------------------------------------------------------

/** WCAG relative luminance of a 0xRRGGBB colour. Used to assert LEGIBILITY as a
 * measured property rather than as "cream sounds light" — the credits are the
 * one screen whose text sits on a dark field, and createPixelText's default plum
 * would be invisible there. */
function luminance(color: number): number {
  const channel = (value: number): number => {
    const s = value / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return (
    0.2126 * channel((color >>> 16) & 0xff) +
    0.7152 * channel((color >>> 8) & 0xff) +
    0.0722 * channel(color & 0xff)
  );
}

/** WCAG contrast ratio between two 0xRRGGBB colours (1:1 .. 21:1). */
function contrastRatio(a: number, b: number): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

describe('CreditsScene layout + pacing constants (ST-4)', () => {
  const MAX_LINE_HEIGHT_FACTOR = 1.5;
  /** ui.ts's BUTTON_PADDING_X_PX / createPixelPanel padding, and
   * createPixelText's default label size — private to that module, so restated
   * here (with their source named) exactly as the PartyScene block above
   * restates its own panel padding. */
  const BUTTON_PADDING_X_PX = 32;
  const PANEL_PADDING_X_PX = 32;
  const BUTTON_LABEL_FONT_PX = 24;
  const textWidth = (text: string, fontSizePx: number): number => text.length * fontSizePx;
  const halfTextHeight = (fontSizePx: number): number => (MAX_LINE_HEIGHT_FACTOR * fontSizePx) / 2;

  const cx = DESIGN_WIDTH / 2;
  /** Font size of credit line `index` — the last line gets its own bigger one. */
  const lineFontSize = (index: number): number =>
    index === CREDITS_LINES.length - 1 ? CREDITS.finalLineFontSizePx : CREDITS.lineFontSizePx;
  const lineTop = (index: number): number =>
    CREDITS.lineCenterYsPx[index] - halfTextHeight(lineFontSize(index));
  const lineBottom = (index: number): number =>
    CREDITS.lineCenterYsPx[index] + halfTextHeight(lineFontSize(index));

  const buttonTop = (centerY: number): number => centerY - UI_MIN_TOUCH_PX / 2;
  const buttonBottom = (centerY: number): number => centerY + UI_MIN_TOUCH_PX / 2;

  const panelTop = CREDITS.confirmPanelCenterY - CREDITS.confirmPanelHeightPx / 2;
  const panelBottom = CREDITS.confirmPanelCenterY + CREDITS.confirmPanelHeightPx / 2;
  const panelLeft = cx - CREDITS.confirmPanelWidthPx / 2;
  const panelRight = cx + CREDITS.confirmPanelWidthPx / 2;

  it('gives EVERY credit line its own y, in CREDITS_LINES order, top-down', () => {
    // One y per line is what makes "revealed line by line" possible at all; a
    // short array would leave the last line at an undefined y.
    expect(CREDITS.lineCenterYsPx.length).toBe(CREDITS_LINES.length);
    for (let i = 1; i < CREDITS.lineCenterYsPx.length; i++) {
      expect(CREDITS.lineCenterYsPx[i]).toBeGreaterThan(CREDITS.lineCenterYsPx[i - 1]);
    }
  });

  it('never lets two credit lines overlap', () => {
    for (let i = 1; i < CREDITS_LINES.length; i++) {
      expect(lineBottom(i - 1)).toBeLessThan(lineTop(i));
    }
  });

  it('keeps every credit line fully on screen at its own font size', () => {
    CREDITS_LINES.forEach((line, index) => {
      const width = textWidth(line, lineFontSize(index));
      expect(width).toBeLessThanOrEqual(DESIGN_WIDTH);
      expect(cx - width / 2).toBeGreaterThan(0);
      expect(lineTop(index)).toBeGreaterThan(0);
      expect(lineBottom(index)).toBeLessThan(DESIGN_HEIGHT);
    });
  });

  it('gives the final line the biggest font (it is the punchline, not a list item)', () => {
    expect(CREDITS.finalLineFontSizePx).toBeGreaterThan(CREDITS.lineFontSizePx);
    // ...and more air above it than the first two lines get between them.
    const firstGap = CREDITS.lineCenterYsPx[1] - CREDITS.lineCenterYsPx[0];
    const finalGap = CREDITS.lineCenterYsPx[2] - CREDITS.lineCenterYsPx[1];
    expect(finalGap).toBeGreaterThan(firstGap);
  });

  it('stacks last line -> heart -> divider -> tulip line with no overlap', () => {
    const lastLineBottom = lineBottom(CREDITS_LINES.length - 1);
    const heartTop = CREDITS.heartCenterY - CREDITS.heartSizePx / 2;
    const heartBottom = CREDITS.heartCenterY + CREDITS.heartSizePx / 2;
    const dividerTop = CREDITS.dividerY - CREDITS.dividerThicknessPx / 2;
    const tulipTop = CREDITS.tulipLineCenterY - halfTextHeight(CREDITS.tulipLineFontSizePx);

    expect(lastLineBottom).toBeLessThan(heartTop);
    expect(heartBottom).toBeLessThan(dividerTop);
    expect(CREDITS.dividerY).toBeLessThan(tulipTop);
  });

  it('keeps the heart TINY — smaller than the smallest text on the screen', () => {
    expect(CREDITS.heartSizePx).toBeGreaterThan(0);
    expect(CREDITS.heartSizePx).toBeLessThan(CREDITS.tulipLineFontSizePx);
  });

  it('draws the divider as a rule under the message, not a box around it', () => {
    // Wider than the final line it underlines, narrower than the longest line.
    const finalLineWidth = textWidth(CREDITS_LINES[2], CREDITS.finalLineFontSizePx);
    const longestLineWidth = Math.max(
      ...CREDITS_LINES.map((line, index) => textWidth(line, lineFontSize(index)))
    );
    expect(CREDITS.dividerWidthPx).toBeGreaterThan(finalLineWidth);
    expect(CREDITS.dividerWidthPx).toBeLessThan(longestLineWidth);
    // Dimmed, but visible.
    expect(CREDITS.dividerAlpha).toBeGreaterThan(0);
    expect(CREDITS.dividerAlpha).toBeLessThan(1);
    expect(CREDITS.dividerThicknessPx).toBeGreaterThan(0);
  });

  it('keeps the widest plausible tulip tally on screen', () => {
    // Measured on the REAL builder at 999 tulips — far past anything reachable,
    // so this is a genuine upper bound, and a longer tally would fail here.
    // Counted in CODE POINTS (the tulip is one).
    const widest = Array.from(tulipTallyText(999)).length;
    expect(widest * CREDITS.tulipLineFontSizePx).toBeLessThanOrEqual(DESIGN_WIDTH);
  });

  it('stacks the two buttons a full face-height apart, clear of the tally and the bottom edge', () => {
    const tulipBottom = CREDITS.tulipLineCenterY + halfTextHeight(CREDITS.tulipLineFontSizePx);
    expect(tulipBottom).toBeLessThan(buttonTop(CREDITS.playAgainButtonY));
    // ui.ts faces are UI_MIN_TOUCH_PX tall, so the row centres must clear that.
    expect(CREDITS.freshStartButtonY - CREDITS.playAgainButtonY).toBeGreaterThanOrEqual(
      UI_MIN_TOUCH_PX
    );
    expect(buttonBottom(CREDITS.playAgainButtonY)).toBeLessThan(
      buttonTop(CREDITS.freshStartButtonY)
    );
    expect(buttonBottom(CREDITS.freshStartButtonY)).toBeLessThanOrEqual(DESIGN_HEIGHT);
  });

  it('makes "Play again?" the visibly PRIMARY action, three separate ways', () => {
    // "Fresh start" wipes the save, so it must never be the button the eye lands
    // on first. Width alone did not carry it (the two faces are otherwise
    // identical), so the hierarchy is width AND position AND alpha.
    expect(CREDITS.playAgainButtonMinWidthPx).toBeGreaterThan(CREDITS.freshStartButtonMinWidthPx);
    expect(CREDITS.playAgainButtonY).toBeLessThan(CREDITS.freshStartButtonY);
    expect(CREDITS.freshStartButtonAlpha).toBeLessThan(1);
    // ...but still a live, legible option, not a disabled-looking one.
    expect(CREDITS.freshStartButtonAlpha).toBeGreaterThan(0.7);
  });

  it('keeps both buttons real touch targets, fully on screen', () => {
    for (const width of [CREDITS.playAgainButtonMinWidthPx, CREDITS.freshStartButtonMinWidthPx]) {
      expect(width).toBeGreaterThanOrEqual(UI_MIN_TOUCH_PX); // NORTH_STAR §8
      expect(cx - width / 2).toBeGreaterThan(0);
      expect(cx + width / 2).toBeLessThan(DESIGN_WIDTH);
    }
  });

  it('centres the confirm panel on screen with room for its own contents', () => {
    expect(panelLeft).toBeGreaterThan(0);
    expect(panelRight).toBeLessThan(DESIGN_WIDTH);
    expect(panelTop).toBeGreaterThan(0);
    expect(panelBottom).toBeLessThan(DESIGN_HEIGHT);

    // title -> body -> buttons, top-down and non-overlapping inside the panel.
    const titleTop = CREDITS.confirmTitleY - halfTextHeight(CREDITS.confirmTitleFontSizePx);
    const titleBottom = CREDITS.confirmTitleY + halfTextHeight(CREDITS.confirmTitleFontSizePx);
    // Three pre-broken body lines: 3 x fontSize + 2 x lineSpacing tall.
    const bodyHeight =
      3 * MAX_LINE_HEIGHT_FACTOR * CREDITS.confirmBodyFontSizePx +
      2 * CREDITS.confirmBodyLineSpacingPx;
    const bodyTop = CREDITS.confirmBodyY - bodyHeight / 2;
    const bodyBottom = CREDITS.confirmBodyY + bodyHeight / 2;

    expect(panelTop).toBeLessThan(titleTop);
    expect(titleBottom).toBeLessThan(bodyTop);
    expect(bodyBottom).toBeLessThan(buttonTop(CREDITS.confirmButtonY));
    expect(buttonBottom(CREDITS.confirmButtonY)).toBeLessThan(panelBottom);
  });

  it('lays the confirm buttons side by side inside the panel, cancel on the LEFT and wider', () => {
    const cancelLeft = cx + CREDITS.confirmCancelOffsetXPx - CREDITS.confirmCancelMinWidthPx / 2;
    const cancelRight = cx + CREDITS.confirmCancelOffsetXPx + CREDITS.confirmCancelMinWidthPx / 2;
    const eraseLeft = cx + CREDITS.confirmConfirmOffsetXPx - CREDITS.confirmConfirmMinWidthPx / 2;
    const eraseRight = cx + CREDITS.confirmConfirmOffsetXPx + CREDITS.confirmConfirmMinWidthPx / 2;

    // CANCEL IS THE EASY OUT: first in reading order and the bigger target.
    expect(cancelRight).toBeLessThan(eraseLeft);
    expect(CREDITS.confirmCancelMinWidthPx).toBeGreaterThan(CREDITS.confirmConfirmMinWidthPx);
    expect(CREDITS.confirmCancelMinWidthPx).toBeGreaterThanOrEqual(UI_MIN_TOUCH_PX);
    expect(CREDITS.confirmConfirmMinWidthPx).toBeGreaterThanOrEqual(UI_MIN_TOUCH_PX);

    // Both inside the panel, and the PAIR centred as a group despite the two
    // faces (and therefore the two offsets) being deliberately different sizes.
    expect(cancelLeft).toBeGreaterThan(panelLeft);
    expect(eraseRight).toBeLessThan(panelRight);
    expect((cancelLeft + eraseRight) / 2).toBe(cx);
  });

  it('fits the REAL confirm body inside the panel, at its real line count', () => {
    // Measured on the actual strings: reword a line until it overflows, or add
    // a fourth line the panel height was never sized for, and this fails.
    const usable = CREDITS.confirmPanelWidthPx - 2 * PANEL_PADDING_X_PX;
    const widest = Math.max(...CREDITS_CONFIRM_BODY_LINES.map((line) => line.length));
    expect(widest * CREDITS.confirmBodyFontSizePx).toBeLessThanOrEqual(usable);
    // confirmPanelCenterY's arithmetic assumes exactly three body lines.
    expect(CREDITS_CONFIRM_BODY_LINES.length).toBe(3);
    // The title shares the panel and is drawn at a bigger size.
    expect(CREDITS_CONFIRM_TITLE.length * CREDITS.confirmTitleFontSizePx).toBeLessThanOrEqual(
      usable
    );
  });

  it('keeps every button face at its minWidth (the BUTTON MODEL premise)', () => {
    // ui.ts sizes a face to max(label + 2 x padding, minWidth, UI_MIN_TOUCH_PX).
    // Every geometry test in this block treats minWidth AS the face width, which
    // silently stops being true the moment a label outgrows it — so measure the
    // REAL labels. A longer label would also start pushing the confirm's two
    // faces toward each other.
    const cases: ReadonlyArray<readonly [string, number]> = [
      [CREDITS_PLAY_AGAIN_LABEL, CREDITS.playAgainButtonMinWidthPx],
      [CREDITS_FRESH_START_LABEL, CREDITS.freshStartButtonMinWidthPx],
      [CREDITS_CONFIRM_CANCEL_LABEL, CREDITS.confirmCancelMinWidthPx],
      [CREDITS_CONFIRM_ERASE_LABEL, CREDITS.confirmConfirmMinWidthPx],
    ];
    for (const [label, minWidth] of cases) {
      const natural = label.length * BUTTON_LABEL_FONT_PX + 2 * BUTTON_PADDING_X_PX;
      expect(natural).toBeLessThanOrEqual(minWidth);
    }
  });

  it('keeps every credits string pure ASCII except the tally (house rule)', () => {
    for (const text of [
      CREDITS_PLAY_AGAIN_LABEL,
      CREDITS_FRESH_START_LABEL,
      CREDITS_CONFIRM_TITLE,
      CREDITS_CONFIRM_CANCEL_LABEL,
      CREDITS_CONFIRM_ERASE_LABEL,
      ...CREDITS_CONFIRM_BODY_LINES,
    ]) {
      expect(isPureAscii(text)).toBe(true);
      expect(text).toBe(text.trim());
      expect(text.length).toBeGreaterThan(0);
    }
  });

  it('names the destructive confirm button for what it DOES, and cancel for what it KEEPS', () => {
    // Not a style rule: an "OK / Cancel" pair on the one button that deletes her
    // whole save is exactly the dialog a tired thumb gets wrong. Cancel must
    // never be a bare negation, and the destructive label must not be one either.
    const vague = ['ok', 'yes', 'no', 'cancel', 'confirm'];
    expect(vague).not.toContain(CREDITS_CONFIRM_CANCEL_LABEL.toLowerCase());
    expect(vague).not.toContain(CREDITS_CONFIRM_ERASE_LABEL.toLowerCase());
    // ...and the two must not read alike at a glance.
    expect(CREDITS_CONFIRM_CANCEL_LABEL).not.toBe(CREDITS_CONFIRM_ERASE_LABEL);
  });

  it('dims the screen behind the confirmation without hiding it completely', () => {
    expect(CREDITS.confirmDimAlpha).toBeGreaterThan(0.5);
    expect(CREDITS.confirmDimAlpha).toBeLessThan(1);
  });

  it('paces the reveal: a beat, then one line at a time, then a beat, then the tail', () => {
    for (const ms of [
      CREDITS.revealFirstLineDelayMs,
      CREDITS.revealLineIntervalMs,
      CREDITS.revealLineFadeMs,
      CREDITS.revealTailDelayMs,
      CREDITS.tailFadeMs,
    ]) {
      expect(ms).toBeGreaterThan(0);
    }
    // A line must SETTLE before the next one starts, or "line by line" turns
    // into three lines cross-fading at once.
    expect(CREDITS.revealLineFadeMs).toBeLessThan(CREDITS.revealLineIntervalMs);
  });

  it('gets the whole reveal done in a few seconds (nobody is made to wait)', () => {
    // The moment the buttons exist = last line + tail beat + tail fade. An
    // impatient player can still skip it with a tap, but the patient one must
    // not be stuck watching either.
    const untilButtonsMs =
      CREDITS.revealFirstLineDelayMs +
      (CREDITS_LINES.length - 1) * CREDITS.revealLineIntervalMs +
      CREDITS.revealTailDelayMs +
      CREDITS.tailFadeMs;
    expect(untilButtonsMs).toBeLessThanOrEqual(5000);
  });

  it('reads cream on dark, never pixelText\'s default plum', () => {
    // The scene overrides createPixelText's colour precisely because the default
    // is unreadable here; if someone "simplified" that away this fails.
    expect(CREDITS.textColor).not.toBe(PALETTE.plum);
    expect(CREDITS.backgroundColor).not.toBe(CREDITS.textColor);
    // A genuinely DARK field (PLAN-09 task 3) and genuinely light text — compared
    // by perceived luminance, not by name.
    expect(luminance(CREDITS.backgroundColor)).toBeLessThan(0.25);
    expect(luminance(CREDITS.textColor)).toBeGreaterThan(0.75);
    // WCAG AAA for large text is 4.5:1; this clears AAA body text (7:1) too.
    expect(contrastRatio(CREDITS.textColor, CREDITS.backgroundColor)).toBeGreaterThan(7);
  });

  it('keeps the party -> credits palette continuity (same night sky)', () => {
    // Walking out of the party into the credits must not change palette; the
    // party's top sky band is the same colour.
    expect(CREDITS.backgroundColor).toBe(PALETTE.duskIndigo);
  });
});
