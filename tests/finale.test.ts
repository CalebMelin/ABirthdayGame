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
} from '../src/data/finale';
import type { AuthoredGuestAppearance, NamedGuest } from '../src/data/finale';
import {
  buildPartyCastSlots,
  castBounceOffsetPx,
  castTextureSource,
  partyRowX,
} from '../src/systems/partyCast';
import { DEPTHS, DESIGN_HEIGHT, DESIGN_WIDTH, PALETTE, PARTY } from '../src/systems/constants';
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
    // partyCast.ts paints Caleb's hair band — so retuning Andrea (or any other
    // guest) can't silently take this guard with it.
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
