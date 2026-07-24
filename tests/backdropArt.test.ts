import { describe, expect, it } from 'vitest';
import {
  lerpColor,
  shade,
  tint,
  hash01,
  steppedBands,
  buildBuildingRects,
  wrapX,
} from '../src/systems/backdropArt';
import { PALETTE } from '../src/systems/constants';

// ---------------------------------------------------------------------------
// The pure geometry/color helpers behind the ST-5 backdrop motifs. Everything
// here is Phaser-free and deterministic — no RNG — which is exactly what keeps
// the motif drawers testable in plain Node + their screenshots stable.
// ---------------------------------------------------------------------------

describe('lerpColor', () => {
  it('t=0 returns a, t=1 returns b', () => {
    expect(lerpColor(0x000000, 0xffffff, 0)).toBe(0x000000);
    expect(lerpColor(0x000000, 0xffffff, 1)).toBe(0xffffff);
    expect(lerpColor(0x123456, 0xabcdef, 0)).toBe(0x123456);
    expect(lerpColor(0x123456, 0xabcdef, 1)).toBe(0xabcdef);
  });

  it('interpolates each RGB channel independently at the midpoint', () => {
    // r: 255->0, g: 0->0, b: 0->255, at t=0.5 -> (128, 0, 128)
    expect(lerpColor(0xff0000, 0x0000ff, 0.5)).toBe(0x800080);
    expect(lerpColor(0x000000, 0xffffff, 0.5)).toBe(0x808080);
  });

  it('clamps t outside [0,1]', () => {
    expect(lerpColor(0x111111, 0x222222, -5)).toBe(0x111111);
    expect(lerpColor(0x111111, 0x222222, 5)).toBe(0x222222);
  });

  it('always yields a valid 0xRRGGBB integer', () => {
    for (let i = 0; i <= 10; i++) {
      const c = lerpColor(0x2a1820, 0xfef4e6, i / 10);
      expect(Number.isInteger(c)).toBe(true);
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThanOrEqual(0xffffff);
    }
  });
});

describe('shade / tint', () => {
  it('shade(color, 0) is the color; shade(color, 1) is the outline', () => {
    expect(shade(0xb8e6a0, 0)).toBe(0xb8e6a0);
    expect(shade(0xb8e6a0, 1)).toBe(PALETTE.outline);
  });
  it('tint(color, 0) is the color; tint(color, 1) is white', () => {
    expect(tint(0xb8e6a0, 0)).toBe(0xb8e6a0);
    expect(tint(0xb8e6a0, 1)).toBe(PALETTE.white);
  });
});

describe('hash01', () => {
  it('is deterministic: same key -> same value', () => {
    expect(hash01(42)).toBe(hash01(42));
    expect(hash01(0)).toBe(hash01(0));
    expect(hash01(-7)).toBe(hash01(-7));
  });

  it('always returns a value in [0, 1)', () => {
    for (let n = -50; n < 500; n++) {
      const h = hash01(n);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(1);
    }
  });

  it('is well-spread: consecutive keys are not all equal', () => {
    const values = new Set<number>();
    for (let n = 0; n < 64; n++) values.add(hash01(n));
    // A decent hash produces mostly-distinct values over 64 keys.
    expect(values.size).toBeGreaterThan(60);
  });
});

describe('steppedBands', () => {
  it('returns exactly `count` contiguous bands covering [y, y+height]', () => {
    const bands = steppedBands(0x000000, 0xffffff, 8, 100, 400);
    expect(bands.length).toBe(8);
    // Contiguous: each band starts where the previous ended.
    for (let i = 1; i < bands.length; i++) {
      expect(bands[i].y).toBeCloseTo(bands[i - 1].y + bands[i - 1].height, 6);
    }
    // First band top is y; total covered height is `height`.
    expect(bands[0].y).toBe(100);
    const total = bands.reduce((s, b) => s + b.height, 0);
    expect(total).toBeCloseTo(400, 6);
    expect(bands[bands.length - 1].y + bands[bands.length - 1].height).toBeCloseTo(500, 6);
  });

  it('steps color from top (first band) to bottom (last band)', () => {
    const bands = steppedBands(0x000000, 0xffffff, 5, 0, 100);
    expect(bands[0].color).toBe(0x000000);
    expect(bands[bands.length - 1].color).toBe(0xffffff);
  });

  it('a flat sky (top === bottom) yields all-identical band colors', () => {
    const bands = steppedBands(0x336699, 0x336699, 6, 0, 120);
    for (const b of bands) expect(b.color).toBe(0x336699);
  });

  it('count < 1 is floored to a single band using the top color', () => {
    const bands = steppedBands(0xaabbcc, 0xffffff, 0, 0, 100);
    expect(bands.length).toBe(1);
    expect(bands[0].color).toBe(0xaabbcc);
    expect(bands[0].height).toBe(100);
  });
});

describe('buildBuildingRects', () => {
  const base = {
    minX: 0,
    maxX: 2000,
    minW: 60,
    maxW: 140,
    gap: 12,
    minTopY: 200,
    maxTopY: 320,
    seed: 7,
  };

  it('is deterministic: identical inputs produce identical output', () => {
    expect(buildBuildingRects(base)).toEqual(buildBuildingRects(base));
  });

  it('starts exactly at minX and spans past maxX (no right-edge gap)', () => {
    const rects = buildBuildingRects(base);
    expect(rects.length).toBeGreaterThan(0);
    expect(rects[0].x).toBe(0);
    const last = rects[rects.length - 1];
    // The march stops once the NEXT slab would begin at/after maxX, so the
    // last slab's own right edge + gap always reaches maxX (full coverage).
    expect(last.x + last.w + base.gap).toBeGreaterThanOrEqual(base.maxX);
  });

  it('every slab stays within the width and top-y bounds; x strictly increases', () => {
    const rects = buildBuildingRects(base);
    for (let i = 0; i < rects.length; i++) {
      expect(rects[i].w).toBeGreaterThanOrEqual(base.minW);
      expect(rects[i].w).toBeLessThanOrEqual(base.maxW);
      expect(rects[i].topY).toBeGreaterThanOrEqual(base.minTopY);
      expect(rects[i].topY).toBeLessThanOrEqual(base.maxTopY);
      expect(rects[i].index).toBe(i);
      if (i > 0) expect(rects[i].x).toBeGreaterThan(rects[i - 1].x);
    }
  });

  it('returns [] for a degenerate (minX >= maxX) range', () => {
    expect(buildBuildingRects({ ...base, minX: 500, maxX: 500 })).toEqual([]);
    expect(buildBuildingRects({ ...base, minX: 900, maxX: 100 })).toEqual([]);
  });

  it('never infinite-loops on a degenerate zero-width/zero-gap request', () => {
    const rects = buildBuildingRects({
      ...base,
      minX: 0,
      maxX: 300,
      minW: 0,
      maxW: 0,
      gap: 0,
    });
    // Step floors to 1px, so a 300px range yields a bounded, finite run.
    expect(rects.length).toBeGreaterThan(0);
    expect(rects.length).toBeLessThan(100000);
  });
});

describe('wrapX', () => {
  it('leaves a value already inside [min, min+width) unchanged', () => {
    expect(wrapX(5, 0, 10)).toBe(5);
    expect(wrapX(0, 0, 10)).toBe(0);
  });

  it('wraps values at/above the right edge back to the left', () => {
    expect(wrapX(10, 0, 10)).toBe(0);
    expect(wrapX(23, 0, 10)).toBe(3);
    // One full window past a right-shifted min lands back at min.
    expect(wrapX(-263, -200, 400)).toBeCloseTo(137, 6);
  });

  it('wraps negative values forward into range', () => {
    expect(wrapX(-3, 0, 10)).toBe(7);
    expect(wrapX(-13, 0, 10)).toBe(7);
  });

  it('returns min (never NaN / never loops) on a degenerate width', () => {
    expect(wrapX(5, 0, 0)).toBe(0);
    expect(wrapX(5, 0, -4)).toBe(0);
    expect(wrapX(5, 3, Number.NaN)).toBe(3);
  });
});
