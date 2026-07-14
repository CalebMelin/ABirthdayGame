import { describe, expect, it } from 'vitest';
import { generateHeightmap } from '../src/systems/terrain';
import type { TerrainSpec } from '../src/systems/terrain';
import { TERRAIN } from '../src/systems/constants';

/** A reasonably long, reasonably hilly base spec reused across tests. */
function baseSpec(overrides: Partial<TerrainSpec> = {}): TerrainSpec {
  return {
    seed: 12345,
    length: 4000,
    hilliness: 0.6,
    jumps: [],
    flatZones: [],
    ...overrides,
  };
}

describe('generateHeightmap — determinism', () => {
  it('same seed (+ same rest of spec) produces identical heights', () => {
    const a = generateHeightmap(baseSpec());
    const b = generateHeightmap(baseSpec());
    expect(a).toEqual(b);
  });

  it('different seeds produce different heights', () => {
    const a = generateHeightmap(baseSpec({ seed: 1 }));
    const b = generateHeightmap(baseSpec({ seed: 2 }));
    expect(a).not.toEqual(b);
  });
});

describe('generateHeightmap — length', () => {
  it('the last sample lands exactly at the requested length', () => {
    const points = generateHeightmap(baseSpec({ length: 3000 }));
    expect(points[points.length - 1].x).toBe(3000);
  });

  it('the first sample is always at x = 0', () => {
    const points = generateHeightmap(baseSpec());
    expect(points[0].x).toBe(0);
  });

  it('samples are monotonically increasing in x with no duplicates or gaps > spacing', () => {
    const points = generateHeightmap(baseSpec({ length: 2500 }));
    for (let i = 1; i < points.length; i++) {
      const dx = points[i].x - points[i - 1].x;
      expect(dx).toBeGreaterThan(0);
      expect(dx).toBeLessThanOrEqual(TERRAIN.sampleSpacingPx + 1e-9);
    }
  });
});

describe('generateHeightmap — hilliness', () => {
  it('hilliness 0 is exactly flat at baseGroundYPx regardless of seed', () => {
    const points = generateHeightmap(baseSpec({ hilliness: 0, seed: 999 }));
    for (const p of points) {
      expect(p.y).toBe(TERRAIN.baseGroundYPx);
    }
  });

  it('hilliness > 0 actually varies the height', () => {
    const points = generateHeightmap(baseSpec({ hilliness: 0.6 }));
    const ys = points.map((p) => p.y);
    const min = Math.min(...ys);
    const max = Math.max(...ys);
    expect(max - min).toBeGreaterThan(1);
  });
});

describe('generateHeightmap — sane bounds', () => {
  it('never produces NaN/Infinity, and stays within amplitude+jump bounds', () => {
    const jumpHeight = 100;
    const points = generateHeightmap(
      baseSpec({
        hilliness: 1,
        jumps: [{ x: 1000, width: 200, height: jumpHeight }],
      })
    );
    const maxAmplitude = TERRAIN.maxAmplitudePx * 1; // hilliness clamps to <= 1
    const cappedJumpHeight = Math.min(jumpHeight, TERRAIN.maxJumpHeightPx);
    const upperBoundY = TERRAIN.baseGroundYPx + maxAmplitude; // dips downward (larger y)
    const lowerBoundY = TERRAIN.baseGroundYPx - maxAmplitude - cappedJumpHeight; // rises upward (smaller y)
    for (const p of points) {
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
      expect(p.y).toBeLessThanOrEqual(upperBoundY + 1e-6);
      expect(p.y).toBeGreaterThanOrEqual(lowerBoundY - 1e-6);
    }
  });

  it('clamps hilliness above 1 down to the same result as hilliness 1', () => {
    const clamped = generateHeightmap(baseSpec({ hilliness: 5 }));
    const atOne = generateHeightmap(baseSpec({ hilliness: 1 }));
    expect(clamped).toEqual(atOne);
  });

  it('clamps negative hilliness up to 0 (flat)', () => {
    const points = generateHeightmap(baseSpec({ hilliness: -3 }));
    for (const p of points) {
      expect(p.y).toBe(TERRAIN.baseGroundYPx);
    }
  });
});

describe('generateHeightmap — flat zones', () => {
  it('is exactly flat inside a flat zone, well clear of the blend margins', () => {
    const zone = { start: 1500, end: 2500 };
    const points = generateHeightmap(
      baseSpec({ length: 4000, hilliness: 0.8, flatZones: [zone] })
    );
    const inside = points.filter((p) => p.x >= zone.start && p.x <= zone.end);
    expect(inside.length).toBeGreaterThan(5);
    const ys = new Set(inside.map((p) => p.y));
    expect(ys.size).toBe(1);
  });

  it('blends smoothly at the flat zone edges (no height discontinuity)', () => {
    const zone = { start: 1500, end: 2500 };
    const points = generateHeightmap(
      baseSpec({ length: 4000, hilliness: 0.8, flatZones: [zone] })
    );
    for (let i = 1; i < points.length; i++) {
      const dy = Math.abs(points[i].y - points[i - 1].y);
      // No single sample-to-sample step should ever exceed a small multiple
      // of the amplitude — rules out a hard jump at the zone boundary.
      expect(dy).toBeLessThan(TERRAIN.maxAmplitudePx);
    }
  });
});

describe('generateHeightmap — jump ramps', () => {
  it('the ramp region is measurably raised above its surrounding baseline', () => {
    const jump = { x: 1000, width: 200, height: 80 };
    const points = generateHeightmap(
      baseSpec({ length: 4000, hilliness: 0, jumps: [jump] })
    );
    const inRamp = points.filter((p) => p.x >= jump.x && p.x <= jump.x + jump.width);
    expect(inRamp.length).toBeGreaterThan(3);
    // hilliness 0 means baseline is exactly baseGroundYPx everywhere else,
    // so the highest sample in the ramp region should be raised by close to
    // the full authored jump height (allowing a little slack for the
    // nearest sample not landing exactly on the true peak).
    const maxRise = Math.max(...inRamp.map((p) => TERRAIN.baseGroundYPx - p.y));
    expect(maxRise).toBeGreaterThan(jump.height * 0.9);
  });

  it('caps ramp height at TERRAIN.maxJumpHeightPx', () => {
    const jump = { x: 1000, width: 200, height: TERRAIN.maxJumpHeightPx + 500 };
    const points = generateHeightmap(
      baseSpec({ length: 4000, hilliness: 0, jumps: [jump] })
    );
    const maxRise = Math.max(...points.map((p) => TERRAIN.baseGroundYPx - p.y));
    expect(maxRise).toBeLessThanOrEqual(TERRAIN.maxJumpHeightPx + 1e-6);
  });

  it('blends smoothly at the ramp edges (no height discontinuity)', () => {
    const jump = { x: 1000, width: 200, height: 80 };
    const points = generateHeightmap(
      baseSpec({ length: 4000, hilliness: 0.5, jumps: [jump] })
    );
    for (let i = 1; i < points.length; i++) {
      const dy = Math.abs(points[i].y - points[i - 1].y);
      expect(dy).toBeLessThan(TERRAIN.maxAmplitudePx);
    }
  });

  /** Max climbable slope (dy/dx) as a design bound — see NORTH_STAR "grandma
   * difficulty": a bike holding full gas must always be able to climb every
   * slope the generator ever produces. TERRAIN.maxJumpSlope (45 degrees) is
   * the documented cap; this asserts the generator actually enforces it. */
  const MAX_CLIMBABLE_SLOPE = TERRAIN.maxJumpSlope;

  it('widens (never steepens) a tall-but-narrow jump past the requested width, keeping every slope climbable', () => {
    // height = TERRAIN.maxJumpHeightPx (140) paired with the *minimum*
    // width (60) would, unwidened, have a steepest point of
    // 140*pi/60 =~ 7.3 (dy/dx, ~82 degrees) — effectively a wall.
    const jump = { x: 1000, width: TERRAIN.minJumpWidthPx, height: TERRAIN.maxJumpHeightPx };
    const points = generateHeightmap(baseSpec({ length: 4000, hilliness: 0, jumps: [jump] }));
    for (let i = 1; i < points.length; i++) {
      const dx = points[i].x - points[i - 1].x;
      const slope = Math.abs(points[i].y - points[i - 1].y) / dx;
      expect(slope).toBeLessThanOrEqual(MAX_CLIMBABLE_SLOPE + 0.05); // small slack for sampling discretization
    }
  });

  it('does not compress/spike a ramp placed right at the end of the level', () => {
    // Regression test: an earlier implementation clamped the ramp's END to
    // `length`, which for a jump starting near the world edge compressed
    // the same 0..1 raised-cosine shape into a much shorter on-screen span
    // — silently multiplying its slope far past any climbable bound.
    const length = 4000;
    const jump = { x: length - 30, width: 200, height: 80 };
    const points = generateHeightmap(baseSpec({ length, hilliness: 0, jumps: [jump] }));
    for (let i = 1; i < points.length; i++) {
      const dx = points[i].x - points[i - 1].x;
      const slope = Math.abs(points[i].y - points[i - 1].y) / dx;
      expect(slope).toBeLessThanOrEqual(MAX_CLIMBABLE_SLOPE + 0.05);
    }
  });
});

describe('generateHeightmap — degenerate/malformed input safety', () => {
  it('never throws on a zero or negative length', () => {
    expect(() => generateHeightmap(baseSpec({ length: 0 }))).not.toThrow();
    expect(() => generateHeightmap(baseSpec({ length: -500 }))).not.toThrow();
  });

  it('ignores a degenerate jump (zero width, off the end of the level)', () => {
    expect(() =>
      generateHeightmap(baseSpec({ jumps: [{ x: 999999, width: 0, height: 50 }] }))
    ).not.toThrow();
  });

  it('ignores a degenerate flat zone (end before start)', () => {
    expect(() =>
      generateHeightmap(baseSpec({ flatZones: [{ start: 500, end: 100 }] }))
    ).not.toThrow();
  });

  it('omitting jumps/flatZones entirely defaults to none', () => {
    const spec: TerrainSpec = { seed: 1, length: 2000, hilliness: 0.4 };
    expect(() => generateHeightmap(spec)).not.toThrow();
  });
});
