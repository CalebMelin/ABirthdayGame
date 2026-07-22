// Tests for the ONE shared confetti system (PLAN-09 ST-2 —
// src/systems/confetti.ts). That module is import-safe (type-only Phaser), so
// its pure integration/fade/recycle/spawn helpers load and run in plain Node.
//
// BEHAVIORAL, never a constant against itself (the tests/notes.test.ts /
// tests/finale.test.ts discipline): each expectation is derived INDEPENDENTLY
// here — closed-form projectile motion computed from scratch, the fade ramp
// re-derived from its two endpoints, wrap-around checked against a hand-worked
// modulus — so a sign flip, a dropped dt, or a "simplified" fade curve fails
// loudly instead of agreeing with itself.
//
// The headline guard is FRAME-RATE INDEPENDENCE: the same wall-clock time split
// into 1 / 2 / 8 / 60 steps must land on bit-identical position AND velocity, so
// a 120Hz phone and a 60Hz laptop rain the same confetti.
import { describe, expect, it } from 'vitest';
import {
  CONFETTI_COLORS,
  createConfettiBurst,
  createConfettiFall,
  confettiColorAt,
  confettiFadeAlpha,
  confettiLaunchAngleRad,
  confettiPieceSizePx,
  confettiRangeAt,
  confettiWrapX,
  shouldRecycleFallingConfetti,
  stepConfettiKinematics,
} from '../src/systems/confetti';
import type { ConfettiKinematics } from '../src/systems/confetti';
import { DESIGN_HEIGHT, DESIGN_WIDTH, PALETTE } from '../src/systems/constants';
import { createFakeScene, cyclingRng } from './fakeScene';

/** A fresh kinematic state, so no test can leak mutation into another. */
function piece(over: Partial<ConfettiKinematics> = {}): ConfettiKinematics {
  return { x: 0, y: 0, vx: 0, vy: 0, rotation: 0, spin: 0, ...over };
}

/** Runs `totalMs` of simulation split into `steps` equal slices. */
function simulate(
  start: ConfettiKinematics,
  totalMs: number,
  steps: number,
  gravity: number
): ConfettiKinematics {
  const k = piece(start);
  for (let i = 0; i < steps; i++) stepConfettiKinematics(k, totalMs / steps, gravity);
  return k;
}

describe('stepConfettiKinematics', () => {
  it('matches closed-form projectile motion after one step', () => {
    const g = 900;
    const dtMs = 250;
    const dt = dtMs / 1000;
    const k = piece({ x: 10, y: 20, vx: 40, vy: -300, spin: 2 });
    stepConfettiKinematics(k, dtMs, g);

    // Independently derived here, not read back from the module.
    expect(k.x).toBeCloseTo(10 + 40 * dt, 10);
    expect(k.y).toBeCloseTo(20 + -300 * dt + 0.5 * g * dt * dt, 10);
    expect(k.vy).toBeCloseTo(-300 + g * dt, 10);
    expect(k.vx).toBe(40); // gravity is vertical only
    expect(k.rotation).toBeCloseTo(2 * dt, 10);
  });

  it('is EXACTLY frame-rate independent (1 vs 2 vs 8 vs 60 sub-steps)', () => {
    const start = piece({ x: 5, y: 7, vx: 120, vy: -400, spin: -3 });
    const one = simulate(start, 1000, 1, 900);
    for (const steps of [2, 8, 60, 240]) {
      const many = simulate(start, 1000, steps, 900);
      // Positions/velocities must agree to floating-point noise only — the
      // closed form makes the split exact, unlike semi-implicit Euler.
      expect(many.x).toBeCloseTo(one.x, 9);
      expect(many.y).toBeCloseTo(one.y, 9);
      expect(many.vy).toBeCloseTo(one.vy, 9);
      expect(many.rotation).toBeCloseTo(one.rotation, 9);
    }
  });

  it('reproduces a hand-computed 1s fall from rest', () => {
    // From rest under g = 1000 px/s^2, after 1s: y = 500, vy = 1000.
    const k = piece();
    stepConfettiKinematics(k, 1000, 1000);
    expect(k.y).toBeCloseTo(500, 10);
    expect(k.vy).toBeCloseTo(1000, 10);
  });

  it('carries constant velocity when gravity is zero (the rain case)', () => {
    const k = piece({ vx: -50, vy: 120 });
    for (let i = 0; i < 10; i++) stepConfettiKinematics(k, 100, 0);
    expect(k.x).toBeCloseTo(-50, 10); // -50 px/s for 1s
    expect(k.y).toBeCloseTo(120, 10);
    expect(k.vy).toBe(120); // never accelerates
  });

  it('is a no-op for a zero delta', () => {
    const k = piece({ x: 3, y: 4, vx: 9, vy: -9, spin: 1 });
    stepConfettiKinematics(k, 0, 900);
    expect(k).toEqual(piece({ x: 3, y: 4, vx: 9, vy: -9, spin: 1 }));
  });
});

describe('confettiFadeAlpha', () => {
  const FADE_START = 0.6;

  it('holds full opacity until the fade point, then ramps to 0', () => {
    const life = 2000;
    expect(confettiFadeAlpha(0, life, FADE_START)).toBe(1);
    expect(confettiFadeAlpha(life * FADE_START, life, FADE_START)).toBe(1);
    // Half way through the remaining 40% of life -> half faded.
    expect(confettiFadeAlpha(life * 0.8, life, FADE_START)).toBeCloseTo(0.5, 10);
    expect(confettiFadeAlpha(life, life, FADE_START)).toBeCloseTo(0, 10);
  });

  it('is monotonically non-increasing across a whole lifetime', () => {
    let previous = 1;
    for (let age = 0; age <= 2000; age += 25) {
      const alpha = confettiFadeAlpha(age, 2000, FADE_START);
      expect(alpha).toBeLessThanOrEqual(previous + 1e-12);
      expect(alpha).toBeGreaterThanOrEqual(0);
      expect(alpha).toBeLessThanOrEqual(1);
      previous = alpha;
    }
  });

  it('never goes negative past end-of-life', () => {
    expect(confettiFadeAlpha(5000, 1000, FADE_START)).toBe(0);
  });

  it('is total for degenerate inputs', () => {
    expect(confettiFadeAlpha(0, 0, FADE_START)).toBe(0); // no life at all
    expect(confettiFadeAlpha(10, -5, FADE_START)).toBe(0);
    expect(confettiFadeAlpha(999, 1000, 1)).toBe(1); // fadeStart 1 -> never fades
    expect(confettiFadeAlpha(999, 1000, 2)).toBe(1);
  });

  it('fades over the WHOLE life when fadeStart is 0', () => {
    expect(confettiFadeAlpha(250, 1000, 0)).toBeCloseTo(0.75, 10);
    expect(confettiFadeAlpha(750, 1000, 0)).toBeCloseTo(0.25, 10);
  });
});

describe('confettiWrapX', () => {
  it('leaves an in-range x alone', () => {
    expect(confettiWrapX(0, 1280)).toBe(0);
    expect(confettiWrapX(640, 1280)).toBe(640);
    expect(confettiWrapX(1279.5, 1280)).toBe(1279.5);
  });

  it('wraps off BOTH edges into [0, width)', () => {
    expect(confettiWrapX(1280, 1280)).toBe(0);
    expect(confettiWrapX(1300, 1280)).toBe(20);
    expect(confettiWrapX(-1, 1280)).toBe(1279);
    expect(confettiWrapX(-1281, 1280)).toBe(1279);
  });

  it('always lands inside the band for arbitrary inputs', () => {
    for (let x = -5000; x <= 5000; x += 137) {
      const wrapped = confettiWrapX(x, 1280);
      expect(wrapped).toBeGreaterThanOrEqual(0);
      expect(wrapped).toBeLessThan(1280);
    }
  });

  it('is total for a non-positive width', () => {
    expect(confettiWrapX(42, 0)).toBe(42);
    expect(confettiWrapX(42, -10)).toBe(42);
  });
});

describe('shouldRecycleFallingConfetti', () => {
  it('recycles only once a piece is past the bottom edge', () => {
    expect(shouldRecycleFallingConfetti(0, 720)).toBe(false);
    expect(shouldRecycleFallingConfetti(719.9, 720)).toBe(false);
    expect(shouldRecycleFallingConfetti(720, 720)).toBe(false);
    expect(shouldRecycleFallingConfetti(720.1, 720)).toBe(true);
  });

  it('never recycles a piece still above the screen', () => {
    expect(shouldRecycleFallingConfetti(-200, 720)).toBe(false);
  });
});

describe('confettiRangeAt', () => {
  it('maps 0 / 0.5 / 1 onto min / midpoint / max', () => {
    expect(confettiRangeAt(0, 320, 640)).toBe(320);
    expect(confettiRangeAt(0.5, 320, 640)).toBe(480);
    expect(confettiRangeAt(1, 320, 640)).toBe(640);
  });

  it('stays inside the range for every draw in [0, 1)', () => {
    for (let u = 0; u < 1; u += 0.01) {
      const value = confettiRangeAt(u, -6, 6);
      expect(value).toBeGreaterThanOrEqual(-6);
      expect(value).toBeLessThanOrEqual(6);
    }
  });

  it('handles a symmetric range (the +/- spin and drift case)', () => {
    expect(confettiRangeAt(0.5, -8, 8)).toBe(0);
    expect(confettiRangeAt(0.25, -8, 8)).toBe(-4);
  });
});

describe('confettiPieceSizePx', () => {
  it('always returns a WHOLE pixel (matching the Phaser.Math.Between it replaced)', () => {
    for (let u = 0; u < 1; u += 0.007) {
      const size = confettiPieceSizePx(u, 8, 16);
      expect(Number.isInteger(size)).toBe(true);
    }
  });

  it('stays inside the configured range', () => {
    for (let u = 0; u <= 1; u += 0.01) {
      const size = confettiPieceSizePx(u, 8, 16);
      expect(size).toBeGreaterThanOrEqual(8);
      expect(size).toBeLessThanOrEqual(16);
    }
  });

  it('spans the whole range, not just one size', () => {
    const seen = new Set<number>();
    for (let i = 0; i <= 100; i++) seen.add(confettiPieceSizePx(i / 100, 8, 16));
    expect(seen.has(8)).toBe(true);
    expect(seen.has(16)).toBe(true);
    expect(seen.size).toBe(9); // every integer 8..16
  });

  it('collapses to the single size when min === max', () => {
    expect(confettiPieceSizePx(0.37, 10, 10)).toBe(10);
  });
});

describe('confettiLaunchAngleRad', () => {
  const UP = -Math.PI / 2;

  it('launches straight UP at the middle of the fan', () => {
    expect(confettiLaunchAngleRad(0.5, 1.15)).toBeCloseTo(UP, 12);
  });

  it('spans exactly +/- spread across the draw range', () => {
    expect(confettiLaunchAngleRad(0, 1.15)).toBeCloseTo(UP - 1.15, 12);
    expect(confettiLaunchAngleRad(1, 1.15)).toBeCloseTo(UP + 1.15, 12);
  });

  it('always points upward (negative sin) for LevelComplete-sized fans', () => {
    // A 1.15 rad half-fan is under 90 degrees, so every piece leaves with
    // vy < 0 (screen y grows downward) — it really is a POP, not a dribble.
    for (let u = 0; u <= 1; u += 0.05) {
      expect(Math.sin(confettiLaunchAngleRad(u, 1.15))).toBeLessThan(0);
    }
  });

  it('sweeps the FULL circle at spread = PI (the balloon-pop case)', () => {
    // Integer stepping so the sweep really does include u = 0 AND u = 1
    // (a `u += 0.05` float loop stops at 0.95 and would understate the span).
    const angles: number[] = [];
    for (let i = 0; i <= 20; i++) angles.push(confettiLaunchAngleRad(i / 20, Math.PI));
    // Endpoints are one full turn apart, so every direction is reachable...
    expect(Math.max(...angles) - Math.min(...angles)).toBeCloseTo(2 * Math.PI, 12);
    // ...including genuinely DOWNWARD ones, which a fan can never produce.
    expect(angles.some((a) => Math.sin(a) > 0.5)).toBe(true);
    expect(angles.some((a) => Math.sin(a) < -0.5)).toBe(true);
    expect(angles.some((a) => Math.cos(a) > 0.5)).toBe(true);
    expect(angles.some((a) => Math.cos(a) < -0.5)).toBe(true);
  });
});

describe('confettiColorAt', () => {
  const COLORS = [0x111111, 0x222222, 0x333333, 0x444444];

  it('spreads draws evenly across the list', () => {
    expect(confettiColorAt(COLORS, 0)).toBe(0x111111);
    expect(confettiColorAt(COLORS, 0.26)).toBe(0x222222);
    expect(confettiColorAt(COLORS, 0.51)).toBe(0x333333);
    expect(confettiColorAt(COLORS, 0.99)).toBe(0x444444);
  });

  it('clamps a degenerate draw instead of returning undefined', () => {
    // Math.random() never returns 1, but an injected rng might.
    expect(confettiColorAt(COLORS, 1)).toBe(0x444444);
    expect(confettiColorAt(COLORS, 5)).toBe(0x444444);
    expect(confettiColorAt(COLORS, -1)).toBe(0x111111);
  });

  it('reaches EVERY color in the list over a uniform sweep', () => {
    const seen = new Set<number>();
    for (let u = 0; u < 1; u += 0.01) seen.add(confettiColorAt(COLORS, u));
    expect(seen.size).toBe(COLORS.length);
  });

  it('falls back to a real color on an empty list', () => {
    expect(confettiColorAt([], 0.5)).toBe(PALETTE.white);
  });
});

describe('CONFETTI_COLORS', () => {
  it('offers a varied set drawn from the game palette', () => {
    expect(CONFETTI_COLORS.length).toBeGreaterThanOrEqual(4);
    expect(new Set(CONFETTI_COLORS).size).toBe(CONFETTI_COLORS.length);
    const palette = new Set<number>(Object.values(PALETTE));
    for (const color of CONFETTI_COLORS) expect(palette.has(color)).toBe(true);
  });

  it('carries the exact set LevelCompleteScene used before the extraction', () => {
    // Pinned independently so the migration provably preserved that screen's
    // look (CLAUDE.md Rule 2: behavior-preserving means the same pixels).
    expect([...CONFETTI_COLORS]).toEqual([
      PALETTE.coral,
      PALETTE.sunshine,
      PALETTE.mint,
      PALETTE.sky,
      PALETTE.lavender,
      PALETTE.grass,
    ]);
  });

  it('never includes a color that would vanish on the pastel menu background', () => {
    expect(CONFETTI_COLORS).not.toContain(PALETTE.bgPink);
  });
});

// ---------------------------------------------------------------------------
// Factory / POOL INVARIANTS. The pure helpers above cover the maths; these
// cover what actually leaks or degrades in a long-running party — the pooling,
// recycling and teardown inside the factories. Driven through the shared
// duck-typed fake scene (tests/fakeScene.ts, the tests/palette.test.ts
// pattern): no DOM, no runtime Phaser, no browser needed.
// ---------------------------------------------------------------------------

/** LevelComplete-shaped burst options, small enough to reason about by hand. */
function burstOptions(over: Partial<Parameters<typeof createConfettiBurst>[1]> = {}) {
  return {
    count: 6,
    speedMinPxPerSec: 300,
    speedMaxPxPerSec: 300,
    launchSpreadRad: 1.15,
    gravityPxPerSec2: 900,
    spinMaxRadPerSec: 6,
    lifetimeMinMs: 1000,
    lifetimeMaxMs: 1000,
    sizeMinPx: 8,
    sizeMaxPx: 16,
    fadeStartFrac: 0.6,
    depth: 60,
    rng: cyclingRng([0.1, 0.3, 0.5, 0.7, 0.9]),
    ...over,
  };
}

describe('createConfettiBurst — pool invariants', () => {
  it('allocates the whole pool up front, hidden, and NEVER grows it', () => {
    const fake = createFakeScene();
    const handle = createConfettiBurst(fake.scene, burstOptions({ concurrentBursts: 3 }));

    // count x concurrentBursts, allocated once in create.
    expect(fake.created).toHaveLength(18);
    expect(fake.created.every((o) => o.kind === 'rectangle')).toBe(true);
    expect(fake.created.every((o) => !o.visible)).toBe(true);
    expect(handle.liveCount()).toBe(0);

    // Ten bursts, each fully aged out — not one new GameObject.
    for (let i = 0; i < 10; i++) {
      handle.burst(100, 100);
      handle.update(2000);
    }
    expect(fake.created).toHaveLength(18);
  });

  it('activates exactly `count` pieces per burst and shows them at the origin', () => {
    const fake = createFakeScene();
    const handle = createConfettiBurst(fake.scene, burstOptions({ originSpreadXPx: 0 }));

    handle.burst(640, 96);
    expect(handle.liveCount()).toBe(6);
    const visible = fake.created.filter((o) => o.visible);
    expect(visible).toHaveLength(6);
    // originSpreadXPx 0 -> every piece starts at the exact burst point (the
    // balloon-pop case; LevelComplete passes a real spread).
    for (const piece of visible) {
      expect(piece.x).toBe(640);
      expect(piece.y).toBe(96);
      expect(piece.alpha).toBe(1);
    }
  });

  it('RETURNS pieces to the pool at end of life instead of destroying them', () => {
    const fake = createFakeScene();
    const handle = createConfettiBurst(fake.scene, burstOptions());

    handle.burst(0, 0);
    expect(handle.liveCount()).toBe(6);
    handle.update(999); // just under the 1000ms lifetime
    expect(handle.liveCount()).toBe(6);
    handle.update(2); // now past it
    expect(handle.liveCount()).toBe(0);

    // Hidden, but still ALIVE objects ready for the next pop — the whole point.
    expect(fake.created.every((o) => !o.visible)).toBe(true);
    expect(fake.created.every((o) => !o.destroyed)).toBe(true);
    expect(fake.displayList()).toHaveLength(6);
  });

  it('reuses the very same Rectangle instances on the next burst', () => {
    const fake = createFakeScene();
    const handle = createConfettiBurst(fake.scene, burstOptions());

    handle.burst(0, 0);
    const firstWave = fake.created.filter((o) => o.visible).slice();
    handle.update(2000);
    handle.burst(500, 500);
    const secondWave = fake.created.filter((o) => o.visible);

    expect(secondWave).toHaveLength(6);
    for (const piece of secondWave) expect(firstWave).toContain(piece);
  });

  it('draws a THINNER burst when the pool is exhausted rather than allocating', () => {
    const fake = createFakeScene();
    const handle = createConfettiBurst(fake.scene, burstOptions({ concurrentBursts: 1 }));

    handle.burst(0, 0); // fills the pool
    expect(handle.liveCount()).toBe(6);
    handle.burst(0, 0); // nothing left to give
    expect(handle.liveCount()).toBe(6);
    expect(fake.created).toHaveLength(6); // no growth, no crash
  });

  it('moves and fades live pieces as time passes', () => {
    const fake = createFakeScene();
    const handle = createConfettiBurst(fake.scene, burstOptions());

    handle.burst(300, 300);
    const piece = fake.created.find((o) => o.visible)!;
    const startX = piece.x;
    const startY = piece.y;

    handle.update(100);
    expect(piece.x !== startX || piece.y !== startY).toBe(true);
    expect(piece.alpha).toBe(1); // still before fadeStartFrac (0.6 of 1000ms)

    handle.update(600); // now 700ms in, past the fade point
    expect(piece.alpha).toBeLessThan(1);
    expect(piece.alpha).toBeGreaterThan(0);
  });

  it('destroy() frees every Rectangle, and a SECOND destroy() is a no-op', () => {
    const fake = createFakeScene();
    const handle = createConfettiBurst(fake.scene, burstOptions());
    handle.burst(0, 0);

    handle.destroy();
    expect(fake.live()).toHaveLength(0);
    expect(fake.displayList()).toHaveLength(0);
    expect(handle.liveCount()).toBe(0);

    handle.destroy();
    // Nothing was destroyed twice — the pool was emptied by the first call.
    expect(fake.created.every((o) => o.destroyCount === 1)).toBe(true);
  });

  it('is inert after destroy(): burst() and update() neither throw nor allocate', () => {
    const fake = createFakeScene();
    const handle = createConfettiBurst(fake.scene, burstOptions());
    handle.destroy();

    expect(() => {
      handle.burst(10, 10);
      handle.update(16);
    }).not.toThrow();
    expect(fake.created).toHaveLength(6); // the original pool, nothing new
    expect(handle.liveCount()).toBe(0);
  });
});

/** Party-shaped fall options. */
function fallOptions(over: Partial<Parameters<typeof createConfettiFall>[1]> = {}) {
  return {
    count: 12,
    spawnAbovePx: 200,
    fallSpeedMinPxPerSec: 100,
    fallSpeedMaxPxPerSec: 100,
    driftMaxPxPerSec: 40,
    spinMaxRadPerSec: 4,
    sizeMinPx: 6,
    sizeMaxPx: 14,
    depth: 60,
    rng: cyclingRng([0.2, 0.45, 0.6, 0.85]),
    ...over,
  };
}

describe('createConfettiFall — pool invariants', () => {
  it('allocates exactly `count` pieces once and keeps every one in the air', () => {
    const fake = createFakeScene();
    const handle = createConfettiFall(fake.scene, fallOptions());

    expect(fake.created).toHaveLength(12);
    expect(handle.liveCount()).toBe(12);

    // A full minute of rain at 60Hz — many recycles, zero allocations.
    for (let i = 0; i < 3600; i++) handle.update(1000 / 60);
    expect(fake.created).toHaveLength(12);
    expect(handle.liveCount()).toBe(12);
  });

  it('seeds the pool ALREADY SPREAD so the first frame is a full rain', () => {
    const fake = createFakeScene();
    createConfettiFall(fake.scene, fallOptions({ count: 40, rng: Math.random }));
    // Not all queued above the top edge: many pieces start well down-screen.
    const onScreen = fake.created.filter((o) => o.y > 0 && o.y < DESIGN_HEIGHT);
    expect(onScreen.length).toBeGreaterThan(10);
  });

  it('recycles a piece back ABOVE the top once it passes the bottom', () => {
    const fake = createFakeScene();
    const handle = createConfettiFall(fake.scene, fallOptions());

    // Long enough that every piece has crossed the screen at least once.
    for (let i = 0; i < 600; i++) handle.update(1000 / 60);
    for (const piece of fake.created) {
      expect(piece.y).toBeLessThanOrEqual(DESIGN_HEIGHT);
      expect(piece.y).toBeGreaterThanOrEqual(-200);
    }
  });

  it('keeps every piece inside the horizontal band despite constant drift', () => {
    const fake = createFakeScene();
    const handle = createConfettiFall(fake.scene, fallOptions({ driftMaxPxPerSec: 400 }));

    for (let i = 0; i < 900; i++) handle.update(1000 / 60);
    for (const piece of fake.created) {
      expect(piece.x).toBeGreaterThanOrEqual(0);
      expect(piece.x).toBeLessThanOrEqual(DESIGN_WIDTH);
    }
  });

  it('destroy() frees every Rectangle, and a SECOND destroy() is a no-op', () => {
    const fake = createFakeScene();
    const handle = createConfettiFall(fake.scene, fallOptions());

    handle.destroy();
    expect(fake.live()).toHaveLength(0);
    expect(handle.liveCount()).toBe(0);

    handle.destroy();
    expect(fake.created.every((o) => o.destroyCount === 1)).toBe(true);
    expect(() => handle.update(16)).not.toThrow();
  });
});
