// Pure-logic tests for the level-complete note engine (PLAN-08 task 2).
// notes.ts is import-safe (no runtime Phaser, no ui.ts — same discipline as
// save.ts / tricks.ts / police.ts), so selectNote is exercised directly with a
// fake KVStorage-backed SaveSystem + an injected deterministic RNG. Covers:
// byte-exact fixed notes (CLAUDE.md Rule 4), the fixed-note style mapping,
// fixed notes never consuming the pool, no-repeat drawing, pool-exhaustion
// reset, resetNotesSeen, and the pool's shape invariants.
import { describe, expect, it } from 'vitest';
import { createSaveSystem } from '../src/systems/save';
import type { KVStorage } from '../src/systems/save';
import { selectNote } from '../src/systems/notes';
import { FIXED_NOTES, FACT_POOL } from '../src/data/notes';

/** Map-backed KVStorage fake (same idiom as tests/save.test.ts) — no jsdom. */
function createFakeStorage(): KVStorage {
  const map = new Map<string, string>();
  return {
    getItem(key: string): string | null {
      return map.has(key) ? map.get(key)! : null;
    },
    setItem(key: string, value: string): void {
      map.set(key, value);
    },
    removeItem(key: string): void {
      map.delete(key);
    },
  };
}

/** Deterministic mulberry32 PRNG in [0, 1) so no-repeat/reset behavior is
 * flake-free. (No-repeat is actually structural — selectNote only ever draws
 * from unseen indices — so the exact sequence doesn't change the invariant;
 * the seed just pins the run.) */
function seededRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The fixed personal notes, re-authored HERE as an INDEPENDENT oracle — a
 * byte-for-byte second copy so an editor mangling the source (curly quote /
 * ellipsis re-encode) makes `.toBe` fail rather than silently shipping. */
const FIXED_ORACLE: ReadonlyArray<{ level: number; text: string }> = [
  { level: 6, text: "Believe it or not, cars can't actually see motorcycles on the road" },
  { level: 9, text: 'Caleb is most definitely a tease' },
  {
    level: 13,
    text: 'When a guy is riding with a girl behind him, feeling down his chest and stomach might make him go crazy',
  },
  { level: 14, text: "Cops really like to pull over motorcycles... but we don't have time for that" },
];

/** Every code point below 128 — true iff `text` is pure 7-bit ASCII. */
function isPureAscii(text: string): boolean {
  return [...text].every((c) => c.codePointAt(0)! < 128);
}

describe('fixed notes are byte-exact ASCII (CLAUDE.md Rule 4)', () => {
  for (const { level, text } of FIXED_ORACLE) {
    it(`level ${level} returns its locked note verbatim, pure ASCII, no curly-quote/ellipsis`, () => {
      const returned = selectNote(level, createSaveSystem(createFakeStorage())).text;

      // Exact match against the independent oracle literal.
      expect(returned).toBe(text);

      // Independent oracle: every char is 7-bit ASCII...
      expect(isPureAscii(returned)).toBe(true);

      // ...and specifically NOT a smuggled curly apostrophe (U+2019) or
      // unicode ellipsis (U+2026) — the two most likely mangles.
      expect(returned).not.toContain('\u{2019}');
      expect(returned).not.toContain('\u{2026}');
    });
  }
});

describe('fixed-note style + level mapping', () => {
  it('levels 6/9/13/14 return their fixed note with style "hint"', () => {
    for (const fixed of FIXED_NOTES) {
      const note = selectNote(fixed.level, createSaveSystem(createFakeStorage()));
      expect(note.text).toBe(fixed.text);
      expect(note.style).toBe('hint');
    }
  });

  it('a non-fixed level returns a pool fact with style "fact"', () => {
    const note = selectNote(1, createSaveSystem(createFakeStorage()), seededRng(1));
    expect(note.style).toBe('fact');
    expect(FACT_POOL).toContain(note.text);
  });
});

describe('fixed-note levels do not consume the pool', () => {
  it('asking for a fixed-note level leaves notesSeen untouched', () => {
    const save = createSaveSystem(createFakeStorage());

    // Pre-seed a couple of seen indices; fixed-note draws must not change them.
    save.markNoteSeen(2);
    save.markNoteSeen(5);
    const before = save.getNotesSeen();

    for (const fixed of FIXED_NOTES) {
      selectNote(fixed.level, save, seededRng(99));
    }

    expect(save.getNotesSeen()).toEqual(before);
  });

  it('a fixed-note level does not consume the pool even from an empty seen-set', () => {
    const save = createSaveSystem(createFakeStorage());
    selectNote(6, save);
    selectNote(13, save);
    expect(save.getNotesSeen()).toEqual([]);
  });
});

describe('no-repeat drawing within a playthrough', () => {
  it('draws every fact exactly once across a full pool before any repeat', () => {
    const save = createSaveSystem(createFakeStorage());
    const rng = seededRng(1234);

    const drawn: string[] = [];
    for (let i = 0; i < FACT_POOL.length; i++) {
      // Level 1 is not a fixed-note level, so every call draws from the pool.
      drawn.push(selectNote(1, save, rng).text);
    }

    // No fact repeated across the full cycle.
    expect(new Set(drawn).size).toBe(FACT_POOL.length);
    // Every pool fact appeared.
    expect(new Set(drawn)).toEqual(new Set(FACT_POOL));
    // The seen-set now holds every pool index exactly once.
    const seen = save.getNotesSeen().slice().sort((a, b) => a - b);
    expect(seen).toEqual(FACT_POOL.map((_, i) => i));
  });
});

describe('pool exhaustion reset', () => {
  it('resets the seen-set and returns a valid fact once the pool is exhausted', () => {
    const save = createSaveSystem(createFakeStorage());
    const rng = seededRng(77);

    // Exhaust the pool.
    for (let i = 0; i < FACT_POOL.length; i++) {
      selectNote(1, save, rng);
    }
    expect(save.getNotesSeen()).toHaveLength(FACT_POOL.length);

    // The next draw must recycle: valid fact, and the seen-set is now JUST
    // the freshly-picked index (proving the reset happened, then the pick was
    // re-marked so it can't repeat next call).
    const note = selectNote(1, save, rng);
    expect(FACT_POOL).toContain(note.text);
    expect(note.style).toBe('fact');

    const seen = save.getNotesSeen();
    expect(seen).toHaveLength(1);
    expect(FACT_POOL[seen[0]]).toBe(note.text);
  });

  it('treats exhaustion by POOL coverage, not notesSeen.length (stale indices cannot wedge it)', () => {
    const save = createSaveSystem(createFakeStorage());

    // Mark EVERY real pool index seen, PLUS a stale out-of-range index from a
    // hypothetical older/larger pool. notesSeen.length now exceeds the pool
    // size, but coverage-based exhaustion must still reset cleanly.
    for (let i = 0; i < FACT_POOL.length; i++) save.markNoteSeen(i);
    save.markNoteSeen(9999);

    const note = selectNote(1, save, seededRng(3));
    expect(FACT_POOL).toContain(note.text);
    // After reset + one pick, only the fresh index remains (the stale 9999 is
    // gone because resetNotesSeen cleared the whole set).
    const seen = save.getNotesSeen();
    expect(seen).toHaveLength(1);
    expect(FACT_POOL[seen[0]]).toBe(note.text);
  });
});

describe('resetNotesSeen (engine dependency)', () => {
  it('clears the seen-set', () => {
    const save = createSaveSystem(createFakeStorage());
    save.markNoteSeen(1);
    save.markNoteSeen(4);
    save.resetNotesSeen();
    expect(save.getNotesSeen()).toEqual([]);
  });
});

describe('fact pool shape invariants', () => {
  it('has at least 18 facts (>= the 18 fact-levels, so no forced repeat in one playthrough)', () => {
    expect(FACT_POOL.length).toBeGreaterThanOrEqual(18);
  });

  it('every fact is a non-empty string', () => {
    for (const fact of FACT_POOL) {
      expect(typeof fact).toBe('string');
      expect(fact.length).toBeGreaterThan(0);
    }
  });

  it('has no duplicate facts (so no-repeat-by-index means no-repeat-by-text too)', () => {
    expect(new Set(FACT_POOL).size).toBe(FACT_POOL.length);
  });

  it('contains no mangling-prone punctuation (en/em dash, ellipsis, curly quotes)', () => {
    const banned = ['\u{2013}', '\u{2014}', '\u{2026}', '\u{2018}', '\u{2019}', '\u{201C}', '\u{201D}'];
    for (const fact of FACT_POOL) {
      for (const ch of banned) {
        expect(fact).not.toContain(ch);
      }
    }
  });
});
