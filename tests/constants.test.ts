import { describe, expect, it } from 'vitest';
import {
  hexToCss,
  PALETTE,
  PASTEL_BG_COLOR,
  TEXT_COLOR,
} from '../src/systems/constants';

describe('hexToCss', () => {
  it('pads small values to 6 hex digits', () => {
    expect(hexToCss(0x0000ff)).toBe('#0000ff');
  });

  it('converts a full RGB value', () => {
    expect(hexToCss(0xffd6e8)).toBe('#ffd6e8');
  });

  it('clamps out-of-range inputs to the low 24 bits', () => {
    expect(hexToCss(-1)).toBe('#ffffff');
    expect(hexToCss(0x1ffffff)).toBe('#ffffff');
  });
});

describe('derived colors', () => {
  it('keeps PASTEL_BG_COLOR identical to PALETTE.bgPink', () => {
    expect(PASTEL_BG_COLOR).toBe(PALETTE.bgPink);
    expect(PASTEL_BG_COLOR).toBe(0xffd6e8);
  });

  it('keeps TEXT_COLOR as the plum CSS string', () => {
    expect(TEXT_COLOR).toBe('#4a2c40');
  });
});
