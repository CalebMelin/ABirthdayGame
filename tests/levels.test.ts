import { describe, expect, it } from 'vitest';
import { validateLevels, THEME_IDS } from '../src/levels/types';
import type { LevelEvent } from '../src/levels/types';
import { LEVELS, getLevelConfig } from '../src/levels';
import { TOTAL_LEVELS } from '../src/systems/constants';

describe('LEVELS', () => {
  it(`has exactly TOTAL_LEVELS (${TOTAL_LEVELS}) entries`, () => {
    expect(LEVELS.length).toBe(TOTAL_LEVELS);
  });

  it('is authored in id order, 1..TOTAL_LEVELS', () => {
    expect(LEVELS.map((level) => level.id)).toEqual(
      Array.from({ length: TOTAL_LEVELS }, (_, i) => i + 1)
    );
  });

  it('validates with zero problems end-to-end (unique ids, in-bounds lengths, required events on 7/11/12/15/18)', () => {
    expect(validateLevels(LEVELS)).toEqual([]);
  });

  it('every level theme is a real THEME_IDS member', () => {
    for (const level of LEVELS) {
      expect(THEME_IDS).toContain(level.theme);
    }
  });

  it("level 18's billboard event text is the LOCKED personal content, byte-exact (NORTH_STAR §5/§7 — never paraphrase)", () => {
    const level18 = LEVELS.find((level) => level.id === 18);
    const billboardEvent = level18?.events?.find(
      (event): event is Extract<LevelEvent, { type: 'billboard' }> => event.type === 'billboard'
    );
    // Hardcoded literal (NOT imported from level18.ts or any shared
    // constant) so this guard can't silently pass if the source file's own
    // copy of the text ever drifts — it is its own independent oracle.
    expect(billboardEvent?.text).toBe("Sleepovers aren't breaking the rules right??");
  });
});

describe('level 18 — billboard row (PLAN-07 task 3: the egg among its decoys)', () => {
  const level18 = LEVELS.find((level) => level.id === 18);

  it('exists and has a terrain length to derive fractions against', () => {
    expect(level18).toBeDefined();
    expect(level18!.terrain.length).toBeGreaterThan(0);
  });

  it('has between 5 and 7 total billboards (decoy decorations + the egg event), inclusive — NORTH_STAR "subtle among decoy billboards"', () => {
    const decoyBillboards = (level18!.decorations ?? []).filter((d) => d.kind === 'billboard');
    const eggBillboards = (level18!.events ?? []).filter((e) => e.type === 'billboard');
    const total = decoyBillboards.length + eggBillboards.length;
    expect(total).toBeGreaterThanOrEqual(5);
    expect(total).toBeLessThanOrEqual(7);
  });

  it("the egg billboard's x sits mid-level (25%-75% of the level's length)", () => {
    const egg = level18!.events?.find(
      (event): event is Extract<LevelEvent, { type: 'billboard' }> => event.type === 'billboard'
    );
    expect(egg).toBeDefined();
    const frac = egg!.x / level18!.terrain.length;
    expect(frac).toBeGreaterThanOrEqual(0.25);
    expect(frac).toBeLessThanOrEqual(0.75);
  });

  it('every decoy billboard has at least one decoy (not just the egg alone)', () => {
    const decoyBillboards = (level18!.decorations ?? []).filter((d) => d.kind === 'billboard');
    expect(decoyBillboards.length).toBeGreaterThan(0);
  });

  it('every decoy billboard is ASCII-only rendered copy (PLAN-05 pixel-font-safety convention)', () => {
    const decoyBillboards = (level18!.decorations ?? []).filter((d) => d.kind === 'billboard');
    for (const decoy of decoyBillboards) {
      // eslint-disable-next-line no-control-regex -- deliberate ASCII range check
      expect(decoy.text ?? '').toMatch(/^[\x00-\x7F]*$/);
    }
  });

  it('no decoy billboard text accidentally matches the locked egg text (decoys are generic, never the joke itself)', () => {
    // Deliberately compared against the EVENT's own text (not another
    // hardcoded copy of the locked literal): the byte-exact guard above is
    // the ONE independent copy this file carries (CLAUDE.md Rule 4 — keep
    // copies of locked personal content to the minimum that guards it), and
    // this test only needs "decoys never duplicate whatever the egg says".
    const egg = level18!.events?.find(
      (event): event is Extract<LevelEvent, { type: 'billboard' }> => event.type === 'billboard'
    );
    expect(egg).toBeDefined();
    const decoyBillboards = (level18!.decorations ?? []).filter((d) => d.kind === 'billboard');
    for (const decoy of decoyBillboards) {
      expect(decoy.text).not.toBe(egg!.text);
    }
  });
});

describe('getLevelConfig', () => {
  it('returns the matching level for every real id, 1..TOTAL_LEVELS', () => {
    for (let id = 1; id <= TOTAL_LEVELS; id++) {
      expect(getLevelConfig(id).id).toBe(id);
    }
  });

  it('falls back to level 1 for id 0 (below range)', () => {
    expect(getLevelConfig(0).id).toBe(1);
  });

  it(`falls back to level ${TOTAL_LEVELS} for id 23 (above range, clamped)`, () => {
    expect(getLevelConfig(23).id).toBe(TOTAL_LEVELS);
  });

  it('falls back to level 1 for a non-integer id (2.5)', () => {
    expect(getLevelConfig(2.5).id).toBe(1);
  });
});
