// Pure-logic tests for the level 15 police chase (PLAN-06 task 3). police.ts is
// import-safe (no runtime Phaser, no ui.ts), so these exercise the exported pure
// helpers directly — the rubber-band speed law, the hard-cap, the refresh-
// independent displacement, the forward-speed floor, the catch timer + predicate,
// and the rolling-average window. The scene-touching createPolice factory is
// covered by the browser harness (scripts/playtest-level15.mjs), not here.
import { describe, expect, it } from 'vitest';
import {
  copHardCap,
  copRubberBandSpeed,
  forwardSpeed,
  copDisplacement,
  copGapPx,
  isCopOnBike,
  nextCatchTimerMs,
  isCaught,
  rollingAvgWindowSteps,
  POLICE_CAUGHT_MESSAGE,
  POLICE_ESCAPE_MESSAGE,
} from '../src/systems/police';
import { BIKE_TUNING } from '../src/systems/constants';

const BIKE_TOP_SPEED = BIKE_TUNING.maxWheelAngularVelocity * BIKE_TUNING.wheelRadius; // 10.8

describe('POLICE verbatim personal copy (byte-exact — CLAUDE.md Rule 4)', () => {
  it('caught soft-fail is the ASCII form with the ONCOMING POLICE CAR emoji', () => {
    // NEVER paraphrase. ASCII three-dots + straight apostrophes (the rendered
    // pixel font is ASCII-only — see PLAN-05 "ASCII-only rendered copy"), and the
    // 🚔 emoji is U+1F694. Compared against a code-point literal so an accidental
    // smart-quote / Unicode-ellipsis / emoji swap fails the test.
    expect(POLICE_CAUGHT_MESSAGE).toBe(
      "They got us!! ...let's pretend that didn't happen \u{1F694}"
    );
    expect(POLICE_CAUGHT_MESSAGE).toBe("They got us!! ...let's pretend that didn't happen 🚔");
    // Guard the specific ASCII bytes the brief called out: three ASCII dots (not
    // U+2026), straight apostrophes (not curly), exactly two '!'.
    expect(POLICE_CAUGHT_MESSAGE).toContain(' ...');
    expect(POLICE_CAUGHT_MESSAGE).not.toContain('…'); // no Unicode ellipsis
    expect(POLICE_CAUGHT_MESSAGE).toContain("let's");
    expect(POLICE_CAUGHT_MESSAGE).toContain("didn't");
    expect(POLICE_CAUGHT_MESSAGE).not.toContain('’'); // no curly apostrophe
    expect(POLICE_CAUGHT_MESSAGE).toContain('!!');
  });

  it('escape finale toast is the byte-exact ASCII "WOOHOO!"', () => {
    expect(POLICE_ESCAPE_MESSAGE).toBe('WOOHOO!');
  });
});

describe('copHardCap', () => {
  it('is the fraction of the bike full-gas top speed', () => {
    expect(copHardCap(0.85, BIKE_TOP_SPEED)).toBeCloseTo(9.18, 6);
    expect(copHardCap(0.5, 10)).toBe(5);
  });

  it('stays strictly below the bike top speed for any frac < 1 (the EASY guarantee)', () => {
    for (const frac of [0.5, 0.7, 0.85, 0.95, 0.999]) {
      expect(copHardCap(frac, BIKE_TOP_SPEED)).toBeLessThan(BIKE_TOP_SPEED);
    }
  });
});

describe('copRubberBandSpeed', () => {
  const cap = copHardCap(0.85, BIKE_TOP_SPEED); // 9.18
  const bonus = 3;

  it('a gas-holding player at top speed pulls away: cop is capped below the bike', () => {
    // avg near the bike's 10.8 top speed → target 13.8 clamped to the 9.18 cap,
    // which is < 10.8, so the gap GROWS every step.
    const speed = copRubberBandSpeed(BIKE_TOP_SPEED, bonus, cap);
    expect(speed).toBe(cap);
    expect(speed).toBeLessThan(BIKE_TOP_SPEED);
  });

  it('a stopped player gets closed on at ~the catch-up bonus', () => {
    expect(copRubberBandSpeed(0, bonus, cap)).toBe(bonus);
  });

  it('tracks the player just above their speed while below the cap', () => {
    expect(copRubberBandSpeed(4, bonus, cap)).toBe(7); // 4 + 3, under the 9.18 cap
  });

  it('never returns a negative speed', () => {
    expect(copRubberBandSpeed(-5, 0, cap)).toBe(0);
  });
});

describe('forwardSpeed', () => {
  it('passes through forward motion and floors reverse/stopped at 0', () => {
    expect(forwardSpeed(8.4)).toBe(8.4);
    expect(forwardSpeed(0)).toBe(0);
    expect(forwardSpeed(-2.7)).toBe(0); // reverse-creep reads as stopped → cop closes
  });
});

describe('copDisplacement (frame-rate independence)', () => {
  const speed = 9; // px per 60 Hz step

  it('advances one 60 Hz step worth of px for a single fixed step', () => {
    expect(copDisplacement(speed, 1000 / 60)).toBeCloseTo(speed, 6);
  });

  it('gives EQUAL wall-time displacement at 30 / 60 / 120 Hz', () => {
    // Integrated over the SAME 1000ms of wall time, total displacement must be
    // identical regardless of how many fixed steps subdivide it — 9px * 60 = 540.
    // A raw per-render-frame `cop.x += speed` would instead give 270 / 540 / 1080.
    const totalOver = (steps: number, dtMs: number): number => {
      let d = 0;
      for (let i = 0; i < steps; i++) d += copDisplacement(speed, dtMs);
      return d;
    };
    const at60 = totalOver(60, 1000 / 60);
    const at30 = totalOver(30, 1000 / 30);
    const at120 = totalOver(120, 1000 / 120);
    expect(at60).toBeCloseTo(540, 6);
    expect(at30).toBeCloseTo(at60, 6);
    expect(at120).toBeCloseTo(at60, 6);
  });

  it('scales linearly with elapsed time', () => {
    expect(copDisplacement(speed, 2 * (1000 / 60))).toBeCloseTo(2 * speed, 6);
    expect(copDisplacement(speed, 0)).toBe(0);
  });
});

describe('copGapPx / isCopOnBike', () => {
  it('the gap is positive while the cop trails the bike', () => {
    expect(copGapPx(1000, 400)).toBe(600);
    expect(copGapPx(1000, 1000)).toBe(0); // clamped right onto the bike
  });

  it('is "on" the bike only within the catch distance', () => {
    expect(isCopOnBike(1000, 820, 200)).toBe(true); // gap 180 <= 200
    expect(isCopOnBike(1000, 800, 200)).toBe(true); // gap 200 == 200 (inclusive)
    expect(isCopOnBike(1000, 799, 200)).toBe(false); // gap 201 > 200
  });
});

describe('nextCatchTimerMs / isCaught', () => {
  const stepMs = 1000 / 60;
  const catchTimeMs = 1500;

  it('accumulates while within catch distance and resets the instant the gap re-opens', () => {
    let t = 0;
    t = nextCatchTimerMs(t, true, stepMs);
    expect(t).toBeCloseTo(stepMs, 6);
    t = nextCatchTimerMs(t, true, stepMs);
    expect(t).toBeCloseTo(2 * stepMs, 6);
    t = nextCatchTimerMs(t, false, stepMs); // gap re-opened → reset
    expect(t).toBe(0);
  });

  it('is caught only after STRICTLY more than catchTimeMs of continuous contact', () => {
    // Simulate holding within catch distance step by step; caught fires just past
    // 1.5s (90 steps of 16.67ms = 1500.03ms > 1500).
    let t = 0;
    let caughtAtStep = -1;
    for (let step = 1; step <= 200; step++) {
      t = nextCatchTimerMs(t, true, stepMs);
      if (isCaught(t, catchTimeMs)) {
        caughtAtStep = step;
        break;
      }
    }
    expect(caughtAtStep).toBe(90); // ~1.5s at 60 Hz
    expect(isCaught(catchTimeMs, catchTimeMs)).toBe(false); // exactly at the bound is NOT caught
    expect(isCaught(catchTimeMs + 0.01, catchTimeMs)).toBe(true);
  });
});

describe('rollingAvgWindowSteps', () => {
  it('converts a ms window to whole fixed steps', () => {
    expect(rollingAvgWindowSteps(500, 60)).toBe(30);
    expect(rollingAvgWindowSteps(1000, 60)).toBe(60);
  });

  it('never returns fewer than one step (the average always has a sample)', () => {
    expect(rollingAvgWindowSteps(0, 60)).toBe(1);
    expect(rollingAvgWindowSteps(1, 60)).toBe(1);
  });
});

// An integration-style check of the design invariant the harness also proves:
// with the level15 tuning (copMaxSpeedFrac 0.45), the cop's hard cap sits below
// the bike's *sustained gas-only cruise on level 15's rolling terrain* (browser-
// measured ~7.9 px/step, dipping to ~5.9 on the steepest climbs), so a gas-holding
// player out-runs the cop even mid-climb — the gap can only grow, the cop never
// catches. (A cap tuned to the FLAT top speed 10.8, as an earlier pass did at
// 0.85 → 9.18, sat ABOVE the ~5.9 climb dips and reeled the player in — the bug
// this level's low frac fixes.)
describe('level 15 gas-only-uncatchable invariant', () => {
  const LEVEL15_FRAC = 0.45; // IN SYNC WITH src/levels/level15.ts's PoliceEvent
  const MEASURED_CLIMB_MIN_PX_PER_STEP = 5.9; // browser-measured p5 gas-only cruise dip

  it('the cop hard cap is below the level-15 climb-minimum cruise speed', () => {
    const cap = copHardCap(LEVEL15_FRAC, BIKE_TOP_SPEED);
    expect(cap).toBeCloseTo(4.86, 6);
    expect(cap).toBeLessThan(MEASURED_CLIMB_MIN_PX_PER_STEP);
  });

  it('so even at the climb-minimum speed the cop still loses ground (never catches)', () => {
    const cap = copHardCap(LEVEL15_FRAC, BIKE_TOP_SPEED);
    // At the worst sustained gas-only speed (a climb dip), with the catch-up
    // bonus, the cop is STILL capped below the player → the gap only grows.
    const copStep = copRubberBandSpeed(MEASURED_CLIMB_MIN_PX_PER_STEP, 3, cap);
    expect(copStep).toBe(cap);
    expect(MEASURED_CLIMB_MIN_PX_PER_STEP - copStep).toBeGreaterThan(0);
  });
});
