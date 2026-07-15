import { describe, expect, it } from 'vitest';
import {
  BIKE_OPTIONS,
  DEFAULT_CHARACTER,
  EYE_OPTIONS,
  HAIR_OPTIONS,
  OUTFIT_OPTIONS,
  bikeRemap,
  bikeVariantKey,
  defaultCharacter,
  resolveBike,
  resolveEyes,
  resolveHair,
  resolveOption,
  resolveOutfit,
  riderRemap,
  riderVariantKey,
} from '../src/data/characters';
import { MARKERS } from '../src/systems/palette';
import type { CharacterConfig } from '../src/systems/save';

// ---------------------------------------------------------------------------
// Option arrays: counts + required members + internal-id uniqueness.
// ---------------------------------------------------------------------------

describe('HAIR_OPTIONS', () => {
  it('has exactly 6 options', () => {
    expect(HAIR_OPTIONS.length).toBe(6);
  });

  it('includes blonde (Gabby is blonde — NORTH_STAR §4)', () => {
    expect(HAIR_OPTIONS.some((option) => option.id === 'blonde')).toBe(true);
  });

  it('has ids unique within the array', () => {
    const ids = HAIR_OPTIONS.map((option) => option.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('EYE_OPTIONS', () => {
  it('has exactly 5 options', () => {
    expect(EYE_OPTIONS.length).toBe(5);
  });

  it('has ids unique within the array', () => {
    const ids = EYE_OPTIONS.map((option) => option.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('BIKE_OPTIONS', () => {
  it('has exactly 8 options', () => {
    expect(BIKE_OPTIONS.length).toBe(8);
  });

  it('includes yellow (feeds the level-11 easter egg — NORTH_STAR §5)', () => {
    expect(BIKE_OPTIONS.some((option) => option.id === 'yellow')).toBe(true);
  });

  it('has ids unique within the array', () => {
    const ids = BIKE_OPTIONS.map((option) => option.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('OUTFIT_OPTIONS', () => {
  it('has exactly 5 options', () => {
    expect(OUTFIT_OPTIONS.length).toBe(5);
  });

  it('includes all 5 named designs: classic, twoTone, stealth, cafe, party', () => {
    const ids = OUTFIT_OPTIONS.map((option) => option.id);
    expect(ids).toEqual(
      expect.arrayContaining(['classic', 'twoTone', 'stealth', 'cafe', 'party'])
    );
  });

  it('has ids unique within the array', () => {
    const ids = OUTFIT_OPTIONS.map((option) => option.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('option colors vs MARKERS (a swatch/target must never equal a raw marker)', () => {
  it('every hair/eye/bike swatch color is distinct from every MARKERS value', () => {
    const markerValues = Object.values(MARKERS);
    for (const option of [...HAIR_OPTIONS, ...EYE_OPTIONS, ...BIKE_OPTIONS]) {
      expect(markerValues).not.toContain(option.color);
    }
  });

  it('every outfit suitColor is distinct from every MARKERS value', () => {
    const markerValues = Object.values(MARKERS);
    for (const option of OUTFIT_OPTIONS) {
      expect(markerValues).not.toContain(option.suitColor);
    }
  });
});

// ---------------------------------------------------------------------------
// DEFAULT_CHARACTER.
// ---------------------------------------------------------------------------

describe('DEFAULT_CHARACTER', () => {
  it('defaults hair to blonde (mandated — Gabby is blonde)', () => {
    expect(DEFAULT_CHARACTER.hairColor).toBe('blonde');
  });

  it('every default id resolves to a REAL option, not a dangling fallback', () => {
    expect(resolveHair(DEFAULT_CHARACTER.hairColor).id).toBe(DEFAULT_CHARACTER.hairColor);
    expect(resolveEyes(DEFAULT_CHARACTER.eyeColor).id).toBe(DEFAULT_CHARACTER.eyeColor);
    expect(resolveBike(DEFAULT_CHARACTER.bikeColor).id).toBe(DEFAULT_CHARACTER.bikeColor);
    expect(resolveOutfit(DEFAULT_CHARACTER.outfit).id).toBe(DEFAULT_CHARACTER.outfit);
  });
});

describe('defaultCharacter', () => {
  it('returns a value deep-equal to DEFAULT_CHARACTER', () => {
    expect(defaultCharacter()).toEqual(DEFAULT_CHARACTER);
  });

  it('returns a DISTINCT object each call (fresh copy, never the shared singleton)', () => {
    // The whole point of the factory: Task 3 mutates its working copy per
    // swatch tap; handing back the shared DEFAULT_CHARACTER would corrupt
    // the default for the page's lifetime. Same guarantee save.ts's
    // defaultProgress() gives for level progress.
    expect(defaultCharacter()).not.toBe(DEFAULT_CHARACTER);
    expect(defaultCharacter()).not.toBe(defaultCharacter());
  });

  it('produces an independently-mutable copy (mutating it does not touch the singleton)', () => {
    const working = defaultCharacter();
    working.hairColor = 'black';
    expect(working.hairColor).toBe('black');
    expect(DEFAULT_CHARACTER.hairColor).toBe('blonde');
  });
});

// ---------------------------------------------------------------------------
// resolveOption / per-dimension resolvers — total, never throw.
// ---------------------------------------------------------------------------

describe('resolveOption', () => {
  const options = [
    { id: 'a', label: 'A' },
    { id: 'b', label: 'B' },
  ];

  it('returns the exact match when id is present', () => {
    expect(resolveOption(options, 'b', 'a')).toBe(options[1]);
  });

  it('falls back to the fallbackId option when id is unknown', () => {
    expect(resolveOption(options, 'nonexistent', 'a')).toBe(options[0]);
  });

  it('never throws on an unknown id', () => {
    expect(() => resolveOption(options, 'nonexistent', 'a')).not.toThrow();
  });

  it('falls back to the first option if fallbackId itself is unknown (defensive total-ness)', () => {
    expect(resolveOption(options, 'nonexistent', 'also-nonexistent')).toBe(options[0]);
  });
});

describe('resolveHair / resolveEyes / resolveBike / resolveOutfit — total resolvers', () => {
  it('resolveHair falls back to the default hair on an unknown id', () => {
    expect(resolveHair('not-a-real-id').id).toBe(DEFAULT_CHARACTER.hairColor);
  });

  it('resolveEyes falls back to the default eyes on an unknown id', () => {
    expect(resolveEyes('not-a-real-id').id).toBe(DEFAULT_CHARACTER.eyeColor);
  });

  it('resolveBike falls back to the default bike color on an unknown id', () => {
    expect(resolveBike('not-a-real-id').id).toBe(DEFAULT_CHARACTER.bikeColor);
  });

  it('resolveOutfit falls back to the default outfit on an unknown id', () => {
    expect(resolveOutfit('not-a-real-id').id).toBe(DEFAULT_CHARACTER.outfit);
  });

  it('none of the resolvers throw on garbage input', () => {
    expect(() => resolveHair('')).not.toThrow();
    expect(() => resolveEyes('👻')).not.toThrow();
    expect(() => resolveBike('undefined')).not.toThrow();
    expect(() => resolveOutfit('__proto__')).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// riderRemap / bikeRemap.
// ---------------------------------------------------------------------------

describe('riderRemap', () => {
  it('maps hair/eyes/suit markers to the resolved colors for a known config', () => {
    const config: CharacterConfig = {
      hairColor: 'brown',
      eyeColor: 'green',
      bikeColor: 'red',
      outfit: 'stealth',
    };
    const remap = riderRemap(config);
    expect(remap).toEqual(
      expect.arrayContaining([
        { from: MARKERS.hair, to: resolveHair('brown').color },
        { from: MARKERS.eyes, to: resolveEyes('green').color },
        { from: MARKERS.suit, to: resolveOutfit('stealth').suitColor },
      ])
    );
  });

  it('never includes a bikeBody mapping (rider remap is bike-color-independent)', () => {
    const config: CharacterConfig = {
      hairColor: 'blonde',
      eyeColor: 'blue',
      bikeColor: 'teal',
      outfit: 'classic',
    };
    const remap = riderRemap(config);
    expect(remap.some((entry) => entry.from === MARKERS.bikeBody)).toBe(false);
  });

  it('resolves to literal hex values for the default config (pins real color data, not just wiring)', () => {
    // Unlike the tests above (which compute "expected" via the same
    // resolver the code under test calls, so they only pin the WIRING),
    // this pins actual hardcoded hex values — it would catch a bug in
    // resolveHair/resolveEyes/resolveOutfit itself or a typo'd swatch
    // color that the wiring-only tests structurally can't.
    const remap = riderRemap(DEFAULT_CHARACTER);
    expect(remap).toEqual(
      expect.arrayContaining([
        { from: MARKERS.hair, to: 0xf2d16b }, // blonde
        { from: MARKERS.eyes, to: 0x5b8fd6 }, // blue
        { from: MARKERS.suit, to: 0xf0efe8 }, // classic
      ])
    );
  });

  it('falls back to default colors for an unknown-id config', () => {
    const config: CharacterConfig = {
      hairColor: 'nope',
      eyeColor: 'nope',
      bikeColor: 'nope',
      outfit: 'nope',
    };
    const remap = riderRemap(config);
    expect(remap).toEqual(
      expect.arrayContaining([
        { from: MARKERS.hair, to: resolveHair(DEFAULT_CHARACTER.hairColor).color },
        { from: MARKERS.eyes, to: resolveEyes(DEFAULT_CHARACTER.eyeColor).color },
        { from: MARKERS.suit, to: resolveOutfit(DEFAULT_CHARACTER.outfit).suitColor },
      ])
    );
  });
});

describe('bikeRemap', () => {
  it('maps the bikeBody marker to the resolved bike color', () => {
    const config: CharacterConfig = {
      hairColor: 'blonde',
      eyeColor: 'blue',
      bikeColor: 'yellow',
      outfit: 'classic',
    };
    const remap = bikeRemap(config);
    expect(remap).toEqual([{ from: MARKERS.bikeBody, to: resolveBike('yellow').color }]);
  });

  it('resolves to a literal hex value for yellow (pins real color data, not just wiring)', () => {
    // See riderRemap's equivalent comment above: this pins yellow's actual
    // hex value rather than computing "expected" via the same resolver
    // under test — yellow matters most here since it's the one bike color
    // the plan requires present for the level-11 easter egg.
    const config: CharacterConfig = {
      hairColor: 'blonde',
      eyeColor: 'blue',
      bikeColor: 'yellow',
      outfit: 'classic',
    };
    expect(bikeRemap(config)).toEqual([{ from: MARKERS.bikeBody, to: 0xf5d23a }]);
  });

  it('falls back to the default bike color for an unknown id', () => {
    const config: CharacterConfig = {
      hairColor: 'blonde',
      eyeColor: 'blue',
      bikeColor: 'not-real',
      outfit: 'classic',
    };
    const remap = bikeRemap(config);
    expect(remap).toEqual([
      { from: MARKERS.bikeBody, to: resolveBike(DEFAULT_CHARACTER.bikeColor).color },
    ]);
  });
});

// ---------------------------------------------------------------------------
// Variant keys: stability/independence (the point of scoping them separately).
// ---------------------------------------------------------------------------

describe('riderVariantKey', () => {
  it('is unchanged when only bikeColor differs', () => {
    const a: CharacterConfig = { hairColor: 'brown', eyeColor: 'green', bikeColor: 'red', outfit: 'cafe' };
    const b: CharacterConfig = { ...a, bikeColor: 'purple' };
    expect(riderVariantKey(a)).toBe(riderVariantKey(b));
  });

  it('changes when hair differs', () => {
    const a: CharacterConfig = { hairColor: 'brown', eyeColor: 'green', bikeColor: 'red', outfit: 'cafe' };
    const b: CharacterConfig = { ...a, hairColor: 'black' };
    expect(riderVariantKey(a)).not.toBe(riderVariantKey(b));
  });

  it('changes when eyeColor differs', () => {
    const a: CharacterConfig = { hairColor: 'brown', eyeColor: 'green', bikeColor: 'red', outfit: 'cafe' };
    const b: CharacterConfig = { ...a, eyeColor: 'grey' };
    expect(riderVariantKey(a)).not.toBe(riderVariantKey(b));
  });

  it('changes when outfit differs', () => {
    const a: CharacterConfig = { hairColor: 'brown', eyeColor: 'green', bikeColor: 'red', outfit: 'cafe' };
    const b: CharacterConfig = { ...a, outfit: 'party' };
    expect(riderVariantKey(a)).not.toBe(riderVariantKey(b));
  });

  it('uses the RESOLVED id, so an unknown id and its fallback share one cache key', () => {
    const unknown: CharacterConfig = { hairColor: 'not-real', eyeColor: 'blue', bikeColor: 'red', outfit: 'classic' };
    const fallback: CharacterConfig = { ...unknown, hairColor: DEFAULT_CHARACTER.hairColor };
    expect(riderVariantKey(unknown)).toBe(riderVariantKey(fallback));
  });

  it('has the documented tex-gabby|<hair>|<eye>|<outfit> literal shape', () => {
    const config: CharacterConfig = { hairColor: 'brown', eyeColor: 'green', bikeColor: 'red', outfit: 'stealth' };
    expect(riderVariantKey(config)).toBe('tex-gabby|brown|green|stealth');
  });
});

describe('bikeVariantKey', () => {
  it('is unchanged when hair/eye/outfit differ', () => {
    const a: CharacterConfig = { hairColor: 'brown', eyeColor: 'green', bikeColor: 'teal', outfit: 'cafe' };
    const b: CharacterConfig = { hairColor: 'black', eyeColor: 'grey', bikeColor: 'teal', outfit: 'party' };
    expect(bikeVariantKey(a)).toBe(bikeVariantKey(b));
  });

  it('changes when bikeColor differs', () => {
    const a: CharacterConfig = { hairColor: 'brown', eyeColor: 'green', bikeColor: 'teal', outfit: 'cafe' };
    const b: CharacterConfig = { ...a, bikeColor: 'yellow' };
    expect(bikeVariantKey(a)).not.toBe(bikeVariantKey(b));
  });

  it('uses the RESOLVED id, so an unknown id and its fallback share one cache key', () => {
    const unknown: CharacterConfig = { hairColor: 'blonde', eyeColor: 'blue', bikeColor: 'not-real', outfit: 'classic' };
    const fallback: CharacterConfig = { ...unknown, bikeColor: DEFAULT_CHARACTER.bikeColor };
    expect(bikeVariantKey(unknown)).toBe(bikeVariantKey(fallback));
  });

  it('has the documented tex-bike|<bike> literal shape', () => {
    const config: CharacterConfig = { hairColor: 'brown', eyeColor: 'green', bikeColor: 'red', outfit: 'stealth' };
    expect(bikeVariantKey(config)).toBe('tex-bike|red');
  });
});

describe('rider and bike variant keys never collide', () => {
  it('produces disjoint keys for the same config', () => {
    const config: CharacterConfig = { hairColor: 'blonde', eyeColor: 'blue', bikeColor: 'pink', outfit: 'classic' };
    expect(riderVariantKey(config)).not.toBe(bikeVariantKey(config));
  });
});
