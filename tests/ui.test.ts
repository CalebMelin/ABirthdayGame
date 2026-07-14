import { describe, expect, it } from 'vitest';
// snapFontSize lives in constants.ts (not ui.ts) precisely so tests can
// import it without pulling Phaser into the node test environment.
import { snapFontSize, FONT_PIXEL_GRID_PX } from '../src/systems/constants';

describe('snapFontSize', () => {
  it('keeps exact multiples of 8 unchanged (24)', () => {
    expect(snapFontSize(24)).toBe(24);
  });

  it('keeps exact multiples of 8 unchanged (32)', () => {
    expect(snapFontSize(32)).toBe(32);
  });

  it('rounds 20 up to 24 (nearest multiple of 8, half rounds up)', () => {
    expect(snapFontSize(20)).toBe(24);
  });

  it('rounds 19 down to 16 (nearest multiple of 8)', () => {
    expect(snapFontSize(19)).toBe(16);
  });

  it('clamps tiny sizes up to the 8px minimum', () => {
    expect(snapFontSize(4)).toBe(8);
  });

  it('keeps the minimum grid size as-is', () => {
    expect(snapFontSize(8)).toBe(8);
  });

  it('uses the documented 8px grid constant', () => {
    expect(FONT_PIXEL_GRID_PX).toBe(8);
  });
});
