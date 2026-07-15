import { describe, expect, it } from 'vitest';
import {
  THEMES,
  cameraFixedOversizePx,
  backdropContentRangePx,
  buildSilhouettePoints,
  evenlySpacedX,
} from '../src/systems/themes';
import { THEME_IDS } from '../src/levels/types';
import { CAMERA, DESIGN_WIDTH, DESIGN_HEIGHT, LEVEL } from '../src/systems/constants';

/** A 0xRRGGBB color value: an integer in [0, 0xffffff]. */
function isColor(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= 0xffffff;
}

// ---------------------------------------------------------------------------
// THEMES — the data table itself. "Coverage" (every THEME_IDS entry present)
// and "well-formedness" are the mandatory tests per the task spec, since the
// backdrop layer math delegates real per-frame work to Phaser's own
// scrollFactor (see backdropContentRangePx's coverage-guarantee test below
// for the one place genuinely novel pure math lives).
// ---------------------------------------------------------------------------

describe('THEMES — coverage', () => {
  // NOTE: this runtime check is DELIBERATELY REDUNDANT with the compile-time
  // `Record<ThemeId, ThemeDef>` type on THEMES — `npm run build` (tsc)
  // already fails the build if any ThemeId is missing or an extra key is
  // present, so this can never actually catch a regression the build wouldn't.
  // Kept anyway as cheap belt-and-suspenders + living documentation of the
  // "all 15, no extras" contract for anyone skimming only the tests. The real
  // value lives in the well-formedness + distinctness tests below.
  it('has exactly one entry per THEME_IDS id, and no extras', () => {
    const keys = Object.keys(THEMES).sort();
    const expected = [...THEME_IDS].sort();
    expect(keys).toEqual(expected);
  });
});

describe('THEMES — well-formedness', () => {
  it.each([...THEME_IDS])('%s: ground/sky/layers/props are well-formed', (id) => {
    const theme = THEMES[id];
    expect(theme).toBeDefined();

    // ground — must be shaped so it can be passed straight to
    // createTerrain(scene, spec, colors): TerrainColors is {fill?, edge?}.
    expect(isColor(theme.ground.fill)).toBe(true);
    expect(isColor(theme.ground.edge)).toBe(true);

    // sky — top/bottom, both valid colors (may be equal — "single color used
    // for both" is explicitly allowed).
    expect(isColor(theme.sky.top)).toBe(true);
    expect(isColor(theme.sky.bottom)).toBe(true);

    // layers — 2 to 3, far -> near, each genuinely parallaxing slower than
    // the world (scrollFactor in [0, 1)), non-decreasing scrollFactor order,
    // positive band height, band placement on-screen (design space).
    expect(theme.layers.length).toBeGreaterThanOrEqual(2);
    expect(theme.layers.length).toBeLessThanOrEqual(3);
    for (const layer of theme.layers) {
      expect(isColor(layer.color)).toBe(true);
      expect(layer.scrollFactor).toBeGreaterThanOrEqual(0);
      expect(layer.scrollFactor).toBeLessThan(1);
      expect(layer.height).toBeGreaterThan(0);
      expect(layer.y).toBeGreaterThanOrEqual(0);
      expect(layer.y + layer.height).toBeLessThanOrEqual(DESIGN_HEIGHT);
    }
    for (let i = 1; i < theme.layers.length; i++) {
      expect(theme.layers[i].scrollFactor).toBeGreaterThanOrEqual(theme.layers[i - 1].scrollFactor);
    }

    // props — a minimal accent color.
    expect(isColor(theme.props.accent)).toBe(true);
  });
});

describe('THEMES — visibly distinct across the city arc', () => {
  it('no two themes share the exact same sky+ground signature', () => {
    // The dominant visual signal (sky fills ~2/3 of the screen, ground is the
    // other clearly-visible band) — pinning this as a regression guard
    // directly encodes the PLAN-05 acceptance criterion "Visual theme
    // visibly changes across the city arc".
    const signatures = THEME_IDS.map((id) => {
      const t = THEMES[id];
      return `${t.sky.top}-${t.sky.bottom}-${t.ground.fill}`;
    });
    expect(new Set(signatures).size).toBe(THEME_IDS.length);
  });
});

// ---------------------------------------------------------------------------
// cameraFixedOversizePx — the same "oversize by 1/zoomMin" technique
// GameScene.failLevel already uses for its scrollFactor(0) dim rect, pulled
// out here as a named, tested formula (see module doc comment for the full
// derivation from Phaser's camera matrix).
// ---------------------------------------------------------------------------

describe('cameraFixedOversizePx', () => {
  it('scales DESIGN_WIDTH/DESIGN_HEIGHT by 1/zoomMin', () => {
    const size = cameraFixedOversizePx(0.85);
    expect(size.width).toBeCloseTo(DESIGN_WIDTH / 0.85, 6);
    expect(size.height).toBeCloseTo(DESIGN_HEIGHT / 0.85, 6);
  });

  it('at zoom 1 (no zoom-out), the size is exactly DESIGN_WIDTH x DESIGN_HEIGHT', () => {
    const size = cameraFixedOversizePx(1);
    expect(size.width).toBe(DESIGN_WIDTH);
    expect(size.height).toBe(DESIGN_HEIGHT);
  });

  it('never throws / never divides by zero on a degenerate zoomMin', () => {
    expect(() => cameraFixedOversizePx(0)).not.toThrow();
    expect(() => cameraFixedOversizePx(-1)).not.toThrow();
    const size = cameraFixedOversizePx(0);
    expect(Number.isFinite(size.width)).toBe(true);
    expect(Number.isFinite(size.height)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// backdropContentRangePx — the CRITICAL zoom-gotcha helper: the world-space
// x-range a horizontally-parallaxing (scrollFactor < 1), vertically
// camera-pinned (scrollFactor-y 0) layer must draw its content across so it
// can NEVER run out and reveal an unpainted gap, for any camera scroll
// position across the whole level and any zoom down to CAMERA.zoomMin.
// ---------------------------------------------------------------------------

describe('backdropContentRangePx', () => {
  it('pads worldLength by DESIGN_WIDTH/zoomMin on both sides', () => {
    const pad = DESIGN_WIDTH / 0.85;
    const range = backdropContentRangePx(8000, 0.85);
    expect(range.minX).toBeCloseTo(-pad, 6);
    expect(range.maxX).toBeCloseTo(8000 + pad, 6);
  });

  it('never throws on a degenerate (negative/NaN) worldLength, and stays finite', () => {
    expect(() => backdropContentRangePx(-500, 0.85)).not.toThrow();
    expect(() => backdropContentRangePx(NaN, 0.85)).not.toThrow();
    const range = backdropContentRangePx(NaN, 0.85);
    expect(Number.isFinite(range.minX)).toBe(true);
    expect(Number.isFinite(range.maxX)).toBe(true);
    expect(range.maxX).toBeGreaterThanOrEqual(range.minX);
  });

  describe('geometric coverage guarantee', () => {
    /**
     * Re-derives Phaser's REAL screen-space transform for a game object with
     * horizontal scrollFactor `fx` and vertical scrollFactor 0, positioned at
     * local (world) x `localX`, under the actual camera implementation this
     * project uses (single default camera: x=0, originX=0.5, rotation=0).
     *
     * Formula independently verified against Phaser 3.90 source
     * (node_modules/phaser/src/gameobjects/GetCalcMatrix.js +
     * node_modules/phaser/src/cameras/2d/Camera.js's preRender): the camera
     * matrix reduces to screen = pivot + zoom*(local - scroll*scrollFactor -
     * pivot), where pivot is the design-space screen center — the exact
     * relationship pedals.ts's zoomCompensatedPosition doc comment describes
     * for scrollFactor-0 objects, generalized here to any scrollFactor.
     *
     * This is NOT a copy of the production implementation (which never
     * computes a screen position at all — it just hands Phaser a padded
     * world-space range and lets Phaser's own engine do this projection at
     * render time). It's an independent model used to PROVE the padded range
     * is wide enough, which is the actual thing that matters for "no gap".
     */
    function screenX(localX: number, scrollX: number, fx: number, zoom: number): number {
      const pivotX = DESIGN_WIDTH / 2;
      return pivotX + zoom * (localX - scrollX * fx - pivotX);
    }

    it('covers the full screen width at every level length, scroll extreme, and layer scrollFactor', () => {
      const zoomMin = CAMERA.zoomMin;
      // The realistic envelope: shortest/longest allowed level, every
      // scrollFactor a backdrop layer might plausibly use (0 = the sky,
      // up to just under 1 = as fast as the world itself).
      for (const worldLength of [LEVEL.lengthMinPx, LEVEL.lengthMaxPx]) {
        const { minX, maxX } = backdropContentRangePx(worldLength, zoomMin);
        for (const fx of [0, 0.2, 0.45, 0.99]) {
          // The binding (tightest) scroll positions are the two ends of the
          // level — see the module doc's derivation for why scrollX=0 is
          // always the tightest case for the left edge and scrollX=worldLength
          // for the right edge, regardless of fx.
          for (const scrollX of [0, worldLength]) {
            const leftEdge = screenX(minX, scrollX, fx, zoomMin);
            const rightEdge = screenX(maxX, scrollX, fx, zoomMin);
            expect(leftEdge).toBeLessThanOrEqual(0);
            expect(rightEdge).toBeGreaterThanOrEqual(DESIGN_WIDTH);
          }
        }
      }
    });
  });
});

// ---------------------------------------------------------------------------
// buildSilhouettePoints — the deterministic wavy top-edge polyline used to
// draw each parallax layer's silhouette band (Graphics polygon), analogous
// to terrain.ts's heightmap sampling.
// ---------------------------------------------------------------------------

describe('buildSilhouettePoints', () => {
  function baseOpts(overrides: Partial<Parameters<typeof buildSilhouettePoints>[0]> = {}) {
    return {
      minX: 0,
      maxX: 1000,
      stepPx: 50,
      baselineY: 500,
      baseHeightPx: 100,
      variancePx: 40,
      wavelengthPx: 300,
      ...overrides,
    };
  }

  it('is deterministic: identical inputs produce identical output', () => {
    const a = buildSilhouettePoints(baseOpts());
    const b = buildSilhouettePoints(baseOpts());
    expect(a).toEqual(b);
  });

  it('the first point is exactly at minX and the last is exactly at maxX', () => {
    const points = buildSilhouettePoints(baseOpts());
    expect(points[0].x).toBe(0);
    expect(points[points.length - 1].x).toBe(1000);
  });

  it('x is strictly increasing with no gap larger than stepPx', () => {
    const points = buildSilhouettePoints(baseOpts());
    for (let i = 1; i < points.length; i++) {
      const dx = points[i].x - points[i - 1].x;
      expect(dx).toBeGreaterThan(0);
      expect(dx).toBeLessThanOrEqual(50 + 1e-9);
    }
  });

  it('every y stays within [baselineY - baseHeightPx - variancePx, baselineY - baseHeightPx + variancePx]', () => {
    const points = buildSilhouettePoints(baseOpts());
    for (const p of points) {
      expect(p.y).toBeGreaterThanOrEqual(500 - 100 - 40 - 1e-9);
      expect(p.y).toBeLessThanOrEqual(500 - 100 + 40 + 1e-9);
    }
  });

  it('variancePx 0 produces a perfectly flat silhouette', () => {
    const points = buildSilhouettePoints(baseOpts({ variancePx: 0 }));
    for (const p of points) {
      expect(p.y).toBeCloseTo(500 - 100, 9);
    }
  });

  it('never throws / never divides by zero on a degenerate wavelengthPx or stepPx', () => {
    expect(() => buildSilhouettePoints(baseOpts({ wavelengthPx: 0 }))).not.toThrow();
    expect(() => buildSilhouettePoints(baseOpts({ stepPx: 0 }))).not.toThrow();
    const points = buildSilhouettePoints(baseOpts({ wavelengthPx: 0 }));
    for (const p of points) expect(Number.isFinite(p.y)).toBe(true);
  });

  it('handles minX === maxX (a single point, not a crash or infinite loop)', () => {
    const points = buildSilhouettePoints(baseOpts({ minX: 500, maxX: 500 }));
    expect(points.length).toBe(1);
    expect(points[0].x).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// evenlySpacedX — placement for the sparse "props" accent blocks along a
// layer's baseline.
// ---------------------------------------------------------------------------

describe('evenlySpacedX', () => {
  it('produces evenly-spaced values covering [minX, maxX]', () => {
    const xs = evenlySpacedX(0, 1000, 200);
    expect(xs[0]).toBe(0);
    expect(xs[xs.length - 1]).toBeLessThanOrEqual(1000);
    for (let i = 1; i < xs.length; i++) {
      expect(xs[i] - xs[i - 1]).toBeCloseTo(200, 9);
    }
    // The last gap before the range end is never more than one spacing.
    expect(1000 - xs[xs.length - 1]).toBeLessThan(200);
  });

  it('returns an empty array for a degenerate (minX > maxX) range', () => {
    expect(evenlySpacedX(1000, 0, 200)).toEqual([]);
  });

  it('never throws / never infinite-loops on a degenerate (zero/negative) spacing', () => {
    expect(() => evenlySpacedX(0, 1000, 0)).not.toThrow();
    expect(() => evenlySpacedX(0, 1000, -50)).not.toThrow();
    const xs = evenlySpacedX(0, 1000, 0);
    expect(xs.length).toBeGreaterThan(0);
    expect(xs.length).toBeLessThan(100000); // sane upper bound, not a runaway loop
  });
});
