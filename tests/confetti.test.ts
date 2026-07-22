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
  confettiColorAt,
  confettiFadeAlpha,
  confettiLaunchAngleRad,
  confettiRangeAt,
  confettiWrapX,
  shouldRecycleFallingConfetti,
  stepConfettiKinematics,
} from '../src/systems/confetti';
import type { ConfettiKinematics } from '../src/systems/confetti';
import { PALETTE } from '../src/systems/constants';

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
