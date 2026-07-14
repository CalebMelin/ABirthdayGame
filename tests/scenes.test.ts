import { describe, expect, it } from 'vitest';
import { normalizeLevel } from '../src/scenes/types';
import { TOTAL_LEVELS } from '../src/systems/constants';

describe('normalizeLevel', () => {
  it('defaults undefined to level 1', () => {
    expect(normalizeLevel(undefined)).toBe(1);
  });

  it('clamps values below range up to 1', () => {
    expect(normalizeLevel(0)).toBe(1);
  });

  it('clamps values above range down to TOTAL_LEVELS', () => {
    expect(normalizeLevel(23)).toBe(TOTAL_LEVELS);
  });

  it('rejects non-integer values, falling back to 1', () => {
    expect(normalizeLevel(2.5)).toBe(1);
  });

  it('passes valid in-range levels through unchanged', () => {
    expect(normalizeLevel(5)).toBe(5);
  });

  it('rejects NaN, falling back to 1', () => {
    expect(normalizeLevel(Number.NaN)).toBe(1);
  });
});
