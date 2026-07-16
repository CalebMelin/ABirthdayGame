// Pure-logic tests for the shared billboard word-wrap helper (PLAN-07 task 3,
// src/systems/decorations.ts). decorations.ts is Node/Vitest import-safe as of
// this task (it dropped its ui.ts/runtime-Phaser dependency — see its module
// doc), so wrapBillboardText is exercised directly here. drawBillboard/
// createDecorations themselves (Phaser-touching) stay covered by the browser
// harness (scripts/playtest-level18.mjs) + the existing playtest-levels.mjs
// sweep, same test-scope boundary as every other createXxx factory in this
// codebase (createTerrain, createBike, createBackdrop, ...).
import { describe, expect, it } from 'vitest';
import { wrapBillboardText } from '../src/systems/decorations';
import { BILLBOARD } from '../src/systems/constants';
import { level18 } from '../src/levels/level18';
import type { LevelEvent } from '../src/levels/types';

// The REAL shipped egg text, read from its single source of truth (level18.ts's
// event entry) rather than retyped here: tests/levels.test.ts's byte-exact guard
// carries the ONE independent copy of the locked literal (CLAUDE.md Rule 4 —
// never multiply copies of locked personal content); these tests only pin how
// that text WRAPS, so they derive it instead of duplicating it.
const eggEvent = level18.events?.find(
  (event): event is Extract<LevelEvent, { type: 'billboard' }> => event.type === 'billboard'
);
if (!eggEvent) throw new Error('level 18 must author its billboard event (see tests/levels.test.ts)');
const EGG_TEXT = eggEvent.text;

describe('wrapBillboardText', () => {
  it('returns short text unchanged (no newline) when it already fits on one line', () => {
    expect(wrapBillboardText('FRESH MOTOR OIL', 18)).toBe('FRESH MOTOR OIL');
  });

  it('fits exactly at the boundary (line length === maxCharsPerLine) on one line', () => {
    // 'ABCDEFGHIJ KLMNO' is exactly 16 characters.
    expect(wrapBillboardText('ABCDEFGHIJ KLMNO', 16)).toBe('ABCDEFGHIJ KLMNO');
  });

  it('wraps to a new line the instant the next word would push it one char past the boundary', () => {
    // 'ABCDEFGHIJ KLMNOP' is 17 chars, one over a 16-char budget.
    expect(wrapBillboardText('ABCDEFGHIJ KLMNOP', 16)).toBe('ABCDEFGHIJ\nKLMNOP');
  });

  it('keeps a single word LONGER than the budget whole, unsplit, on its own line', () => {
    expect(wrapBillboardText('SUPERCALIFRAGILISTIC OK', 10)).toBe('SUPERCALIFRAGILISTIC\nOK');
  });

  it('wraps a long line across several breaks, never splitting a word', () => {
    expect(wrapBillboardText('one two three four five six', 7)).toBe('one two\nthree\nfour\nfive\nsix');
  });

  it('returns an empty string for empty input (never crashes)', () => {
    expect(wrapBillboardText('', 18)).toBe('');
  });

  it('collapses repeated/leading/trailing spaces and never emits a blank line', () => {
    expect(wrapBillboardText('  hello   world  ', 20)).toBe('hello world');
  });

  it('a single word exactly at the boundary stays on one line', () => {
    expect(wrapBillboardText('ABCDEFGHIJ', 10)).toBe('ABCDEFGHIJ');
  });

  describe('round-trip property (relied on by scripts/playtest-level18.mjs)', () => {
    // For any single-spaced text with no leading/trailing whitespace,
    // replacing every '\n' the wrap introduced back with a space must
    // reconstruct the original text exactly — wrapping only ever swaps a
    // SPACE for a NEWLINE at a chosen break point, never adds/drops/reorders
    // a character. This is what lets the browser harness verify the egg's
    // rendered (now word-wrapped) Text object still carries the verbatim
    // NORTH_STAR copy, byte-for-byte, once newlines are undone.
    const samples = [
      'FRESH MOTOR OIL',
      "EAT AT JOE'S",
      EGG_TEXT, // the real shipped egg text, derived — see the module-top note
      'PARKER AND PARKER LAW OFFICES - CALL NOW',
      '22 FM RADIO - YOUR HITS ALL DAY',
      'a single overlong word likethisonewhichislong stays whole',
    ];

    it.each(samples)('holds for %j at the shipped BILLBOARD.wrapMaxChars', (text) => {
      expect(wrapBillboardText(text, BILLBOARD.wrapMaxChars).replace(/\n/g, ' ')).toBe(text);
    });

    it.each([4, 8, 12, 18, 30, 60])('holds for every sample at wrap width %i', (width) => {
      for (const text of samples) {
        expect(wrapBillboardText(text, width).replace(/\n/g, ' ')).toBe(text);
      }
    });
  });

  it("pins the REAL shipped egg text's wrap shape at the shipped BILLBOARD.wrapMaxChars — exact break points via per-line LENGTHS, so no copy of the locked literal appears here", () => {
    const lines = wrapBillboardText(EGG_TEXT, BILLBOARD.wrapMaxChars).split('\n');
    // Given the round-trip property above (newlines only ever replace spaces),
    // the source text plus these per-line character counts uniquely determine
    // the wrapped output — this pins the exact break points as strongly as an
    // expected-string literal would, without duplicating locked content.
    expect(lines.map((line) => line.length)).toEqual([17, 18, 7]);
  });

  it('pins the shipped size-matched decoy (x=11000) to wrap into the SAME line count as the egg (family-resemblance-by-design)', () => {
    const decoy = level18.decorations?.find((d) => d.kind === 'billboard' && d.x === 11000);
    expect(decoy?.text).toBeTruthy();
    const decoyLines = wrapBillboardText(decoy!.text!, BILLBOARD.wrapMaxChars).split('\n');
    const eggLines = wrapBillboardText(EGG_TEXT, BILLBOARD.wrapMaxChars).split('\n');
    expect(decoyLines.length).toBe(eggLines.length);
  });
});
