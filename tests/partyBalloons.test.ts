// Tests for the party's poppable balloons (PLAN-09 ST-2 —
// src/systems/partyBalloons.ts). That module is import-safe (type-only Phaser),
// so its pure rise/sway/recycle/spawn/dedupe helpers load and run in plain Node;
// the Container/Zone wiring is browser-verified instead.
//
// BEHAVIORAL, never a constant against itself (the tests/notes.test.ts /
// tests/finale.test.ts discipline): the motion expectations are re-derived here
// from first principles (distance = speed x time; a sine's own zeros and peaks),
// the spawn bounds are checked against the SCREEN rather than against the
// constants that produced them wherever possible, and the balloon-count guard
// is written against PLAN-09's literal acceptance criterion (>= 20), not
// against PARTY.balloonCount.
import { describe, expect, it } from 'vitest';
import {
  BALLOON_TINTS,
  BALLOON_ENTRY_KNOT_Y,
  BALLOON_RECYCLE_KNOT_Y,
  balloonHitCenterY,
  balloonRiseY,
  balloonSpawn,
  balloonSwayOffsetPx,
  createPartyBalloons,
  isDuplicatePopEvent,
  popEventKey,
  shouldRecycleBalloon,
} from '../src/systems/partyBalloons';
import { DEPTHS, DESIGN_HEIGHT, DESIGN_WIDTH, PALETTE, PARTY, UI_MIN_TOUCH_PX } from '../src/systems/constants';
import { createFakeScene, fakePointer, seededRandom } from './fakeScene';

/** A deterministic rng that walks a fixed list of draws, wrapping — so a spawn
 * roll is fully reproducible without depending on how many draws it makes. */
function seededRng(values: readonly number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

/** An rng that returns the same draw every time (pins a spawn to one corner of
 * every range at once). */
const constantRng = (value: number): (() => number) => () => value;

/** tex-balloon (24x32) at partyBalloons.ts's 2.4 placeholder scale. Written out
 * here rather than imported so the geometry assertions below are an INDEPENDENT
 * oracle, not the module agreeing with itself. */
const BODY_H = 32 * 2.4;
const BODY_W = 24 * 2.4;

describe('PLAN-09 acceptance: at least 20 balloons, even while popping', () => {
  it('keeps the pool at or above the plan\'s 20-balloon floor', () => {
    // The literal acceptance criterion from plans/PLAN-09-party-credits.md:
    // ">= 20 balloons + background crowd present". Guarded (not merely
    // satisfied) so a future "let's trim the pool" tweak fails here.
    expect(PARTY.balloonCount).toBeGreaterThanOrEqual(20);
  });

  it('has a ZERO-length invisible band: a rising balloon is never alive off-screen', () => {
    // This is what makes the criterion STRUCTURAL rather than statistical. The
    // body is bottom-anchored at the knot, so it occupies [knotY - BODY_H,
    // knotY]; how much of that overlaps the 0..DESIGN_HEIGHT viewport is:
    const visibleArea = (knotY: number): number =>
      Math.min(knotY, DESIGN_HEIGHT) - Math.max(knotY - BODY_H, 0);
    const entryKnotY = BALLOON_ENTRY_KNOT_Y;
    const recycleKnotY = BALLOON_RECYCLE_KNOT_Y;

    // The two endpoints are EXACTLY the zero-area boundaries — which is what
    // makes them the endpoints, and what leaves no INTERVAL in which a balloon
    // is alive but invisible (each is touched for at most a single frame).
    expect(visibleArea(entryKnotY)).toBe(0);
    expect(visibleArea(recycleKnotY)).toBe(0);

    // Everywhere strictly inside the flight, the balloon really is on screen.
    for (let knotY = entryKnotY - 0.25; knotY > recycleKnotY; knotY -= 0.25) {
      expect(visibleArea(knotY)).toBeGreaterThan(0);
      expect(shouldRecycleBalloon(knotY, recycleKnotY)).toBe(false);
    }
  });

  it('enters and recycles at exactly the visibility boundaries (no tuned slack)', () => {
    const entryKnotY = BALLOON_ENTRY_KNOT_Y;
    const recycleKnotY = BALLOON_RECYCLE_KNOT_Y;
    // Entry: the body's TOP edge exactly touches the bottom of the screen.
    expect(entryKnotY - BODY_H).toBe(DESIGN_HEIGHT);
    // Recycle: the body's BOTTOM edge exactly reaches the top of the screen.
    expect(recycleKnotY).toBe(0);
    // One px further out in either direction would already be wasted, invisible
    // flight time — which is precisely what would reopen the statistical gap.
    expect(shouldRecycleBalloon(recycleKnotY, recycleKnotY)).toBe(true);
    expect(shouldRecycleBalloon(recycleKnotY + 0.25, recycleKnotY)).toBe(false);
  });

  it('guarantees >= 20 VISIBLE as a worst-case bound, under sustained popping', () => {
    // Because the transit band is zero-length (test above), the only balloons
    // out of view are ones the player just popped. Bound that: a popped balloon
    // is out of view for the respawn delay PLUS UP TO ONE FRAME — update()
    // only tests `now >= respawnAtMs` once per frame, so modelling the window
    // as the delay alone would understate the worst case by a frame per pop.
    // A LOWER BOUND, not an average: the count never legally dips below this
    // while the player mashes.
    const outOfViewMs = PARTY.balloonRespawnDelayMs + PARTY.balloonWorstCaseFrameMs;
    const maxPoppedAtOnce = Math.ceil(PARTY.balloonWorstCasePopsPerSec * (outOfViewMs / 1000));
    const worstCaseVisible = PARTY.balloonCount - maxPoppedAtOnce;
    expect(worstCaseVisible).toBeGreaterThanOrEqual(20);

    // The assumed rate must stay genuinely punishing, or the bound above is
    // proved against nothing. It is an INSTANTANEOUS BURST rate: the browser
    // harness measured 8 balloons out at once at a 4.2/sec AVERAGE, because
    // real taps cluster — so the declared rate has to be several times any
    // plausible average, not equal to it.
    expect(PARTY.balloonWorstCasePopsPerSec).toBeGreaterThanOrEqual(10);

    // The modelled frame must be a genuinely pessimistic one, or the extra
    // frame is decoration: this scene measures 60fps, so the floor has to be
    // meaningfully worse than 16.7ms.
    expect(PARTY.balloonWorstCaseFrameMs).toBeGreaterThanOrEqual(30);

    // And the bound must have real SLACK over the guard, not sit on the line:
    // a future tweak to any of the four inputs should fail here before it
    // ships a 20-balloon party.
    expect(worstCaseVisible).toBeGreaterThan(24);
  });

  it('sizes the pop-confetti pool from that SAME worst case (one assumption)', () => {
    const overlappingBursts = Math.ceil(
      PARTY.balloonWorstCasePopsPerSec * (PARTY.popConfettiLifetimeMaxMs / 1000)
    );
    expect(PARTY.popConfettiConcurrentBursts).toBeGreaterThanOrEqual(overlappingBursts);
  });

  it('gives every balloon a thumb-sized hit target (NORTH_STAR §8)', () => {
    expect(PARTY.balloonHitSizePx).toBeGreaterThanOrEqual(UI_MIN_TOUCH_PX);
    // ...and it really is BIGGER than the drawn balloon, or the decoupled
    // visible-face/hit-area split would be pointless.
    expect(PARTY.balloonHitSizePx).toBeGreaterThan(BODY_W);
  });

  it('layers balloons above the cast and their pop puffs above the balloons', () => {
    // ST-1 recorded the invariant that nameTagDepth stays below DEPTHS.fx
    // precisely so this layer can sit above the cast — honour it.
    expect(PARTY.nameTagDepth).toBeLessThan(DEPTHS.fx);
    expect(PARTY.confettiFallDepth).toBeGreaterThan(PARTY.nameTagDepth);
    expect(PARTY.balloonDepth).toBeGreaterThan(PARTY.confettiFallDepth);
    expect(PARTY.popConfettiDepth).toBeGreaterThan(PARTY.balloonDepth);
  });
});

describe('balloonRiseY', () => {
  it('rises (screen y decreases) by exactly speed x time', () => {
    // 40 px/s for 3s = 120px up from y = 500.
    expect(balloonRiseY(500, 40, 3000)).toBeCloseTo(380, 10);
  });

  it('is frame-rate independent by construction (closed form, not an accumulator)', () => {
    // Sampling the same 2s at 60Hz, 120Hz or once must land on the same y.
    const at = (t: number) => balloonRiseY(800, 37, t);
    for (const stepMs of [1000 / 60, 1000 / 120, 250, 2000]) {
      let t = 0;
      while (t < 2000) t = Math.min(2000, t + stepMs);
      expect(at(t)).toBeCloseTo(at(2000), 12);
    }
    expect(at(2000)).toBeCloseTo(800 - 37 * 2, 10);
  });

  it('is the identity at t = 0 and monotonic thereafter', () => {
    expect(balloonRiseY(720, 50, 0)).toBe(720);
    let previous = 720;
    for (let t = 0; t <= 10_000; t += 250) {
      const y = balloonRiseY(720, 50, t);
      expect(y).toBeLessThanOrEqual(previous);
      previous = y;
    }
  });

  it('eventually clears the top of the screen at the SLOWEST configured speed', () => {
    // The endless supply depends on even the laziest balloon recycling.
    const entryKnotY = BALLOON_ENTRY_KNOT_Y;
    const recycleKnotY = BALLOON_RECYCLE_KNOT_Y;
    const y = balloonRiseY(entryKnotY, PARTY.balloonRiseMinPxPerSec, 120_000); // two minutes
    expect(shouldRecycleBalloon(y, recycleKnotY)).toBe(true);
  });

  it('crosses the screen in a reasonable time even at the slowest speed', () => {
    // Sanity on the FEEL, derived independently: the whole flight is
    // entry -> recycle px, so the slowest balloon should take well under a
    // minute (a balloon that took minutes would read as frozen).
    const entryKnotY = BALLOON_ENTRY_KNOT_Y;
    const recycleKnotY = BALLOON_RECYCLE_KNOT_Y;
    const slowestSeconds = (entryKnotY - recycleKnotY) / PARTY.balloonRiseMinPxPerSec;
    expect(slowestSeconds).toBeLessThan(45);
    const fastestSeconds = (entryKnotY - recycleKnotY) / PARTY.balloonRiseMaxPxPerSec;
    expect(fastestSeconds).toBeGreaterThan(5);
  });
});

describe('balloonSwayOffsetPx', () => {
  const AMP = 20;
  const PERIOD = 3000;

  it('starts at 0 and peaks a quarter-cycle later (a plain sine)', () => {
    expect(balloonSwayOffsetPx(0, 0, AMP, PERIOD)).toBeCloseTo(0, 10);
    expect(balloonSwayOffsetPx(PERIOD / 4, 0, AMP, PERIOD)).toBeCloseTo(AMP, 10);
    expect(balloonSwayOffsetPx(PERIOD / 2, 0, AMP, PERIOD)).toBeCloseTo(0, 10);
    expect(balloonSwayOffsetPx((PERIOD * 3) / 4, 0, AMP, PERIOD)).toBeCloseTo(-AMP, 10);
  });

  it('never exceeds its amplitude, and uses BOTH directions', () => {
    let sawLeft = false;
    let sawRight = false;
    for (let t = 0; t < 4 * PERIOD; t += 37) {
      const offset = balloonSwayOffsetPx(t, 0.13, AMP, PERIOD);
      expect(Math.abs(offset)).toBeLessThanOrEqual(AMP + 1e-9);
      if (offset < -AMP * 0.9) sawLeft = true;
      if (offset > AMP * 0.9) sawRight = true;
    }
    expect(sawLeft).toBe(true);
    expect(sawRight).toBe(true);
  });

  it('repeats exactly once per period', () => {
    for (let t = 0; t < PERIOD; t += 91) {
      expect(balloonSwayOffsetPx(t + PERIOD, 0.4, AMP, PERIOD)).toBeCloseTo(
        balloonSwayOffsetPx(t, 0.4, AMP, PERIOD),
        9
      );
    }
  });

  it('separates two balloons that differ ONLY in phase', () => {
    // Half a cycle apart => exactly opposite offsets, so a flock never sways
    // as one sheet.
    for (let t = 0; t < PERIOD; t += 101) {
      expect(balloonSwayOffsetPx(t, 0.5, AMP, PERIOD)).toBeCloseTo(
        -balloonSwayOffsetPx(t, 0, AMP, PERIOD),
        9
      );
    }
  });

  it('is SMOOTH, not the cast\'s deliberate 2-frame flip', () => {
    // partyCast's castBounceOffsetPx only ever returns 0 or -amplitude; a
    // balloon on a string must take intermediate values.
    const samples = new Set<number>();
    for (let t = 0; t < PERIOD; t += 50) {
      samples.add(Number(balloonSwayOffsetPx(t, 0, AMP, PERIOD).toFixed(4)));
    }
    expect(samples.size).toBeGreaterThan(10);
  });

  it('is total for a degenerate period', () => {
    expect(balloonSwayOffsetPx(1234, 0.2, AMP, 0)).toBe(0);
    expect(balloonSwayOffsetPx(1234, 0.2, AMP, -5)).toBe(0);
  });
});

describe('shouldRecycleBalloon', () => {
  const entryKnotY = BALLOON_ENTRY_KNOT_Y;
  const recycleKnotY = BALLOON_RECYCLE_KNOT_Y;

  it('holds a balloon anywhere it still has visible area', () => {
    for (const y of [entryKnotY, DESIGN_HEIGHT, 360, 1]) {
      expect(shouldRecycleBalloon(y, recycleKnotY)).toBe(false);
    }
  });

  it('recycles at the exact frame the body reaches zero visible area', () => {
    // INCLUSIVE: at knotY === limit the body spans [limit - BODY_H, limit] and
    // has zero overlap with the viewport, so that frame is the right one to
    // recycle on. A strict `<` would leave one frame of an invisible balloon.
    expect(shouldRecycleBalloon(recycleKnotY, recycleKnotY)).toBe(true);
    expect(shouldRecycleBalloon(recycleKnotY - 0.1, recycleKnotY)).toBe(true);
    expect(shouldRecycleBalloon(recycleKnotY + 0.1, recycleKnotY)).toBe(false);
  });

  it('never recycles a balloon with even a sliver still on screen', () => {
    // A knot 1px below the top edge leaves 1px of body showing — it must live.
    const sliver = 1;
    expect(Math.min(sliver, DESIGN_HEIGHT) - Math.max(sliver - BODY_H, 0)).toBeGreaterThan(0);
    expect(shouldRecycleBalloon(sliver, recycleKnotY)).toBe(false);
  });
});

describe('balloonHitCenterY', () => {
  it('centres the hit area on the BODY, which floats above the knot', () => {
    expect(balloonHitCenterY(500, 80)).toBe(460);
  });

  it('defaults to the drawn placeholder body height', () => {
    // 32px texture at 2.4 scale = 76.8 tall, so the centre sits 38.4 above.
    expect(balloonHitCenterY(500)).toBeCloseTo(500 - (32 * 2.4) / 2, 10);
  });

  it('always sits above its knot (never below it)', () => {
    for (const knot of [-100, 0, 360, 900]) {
      expect(balloonHitCenterY(knot)).toBeLessThan(knot);
    }
  });
});

describe('popEventKey / isDuplicatePopEvent', () => {
  it('treats the SAME physical press as one press', () => {
    const key = popEventKey(1, 12_345);
    expect(isDuplicatePopEvent(key, popEventKey(1, 12_345))).toBe(true);
  });

  it('treats a LATER press by the same pointer as a new press', () => {
    expect(isDuplicatePopEvent(popEventKey(1, 12_345), popEventKey(1, 12_346))).toBe(false);
  });

  it('treats a SECOND finger landing at the same instant as a new press', () => {
    // Multitouch: two thumbs can land on the same millisecond and must pop two
    // balloons. Only the (id, time) PAIR identifies a press.
    expect(isDuplicatePopEvent(popEventKey(1, 12_345), popEventKey(2, 12_345))).toBe(false);
  });

  it('accepts the very first press of a session', () => {
    expect(isDuplicatePopEvent(null, popEventKey(1, 0))).toBe(false);
  });
});

describe('BALLOON_TINTS', () => {
  it('offers genuinely varied colors (the plan asks for varied colors)', () => {
    expect(BALLOON_TINTS.length).toBeGreaterThanOrEqual(6);
    expect(new Set(BALLOON_TINTS).size).toBe(BALLOON_TINTS.length);
  });

  it('draws every tint from the game palette', () => {
    const palette = new Set<number>(Object.values(PALETTE));
    for (const tint of BALLOON_TINTS) expect(palette.has(tint)).toBe(true);
  });

  it('never tints a balloon in the dark outline color (it would read as a hole)', () => {
    expect(BALLOON_TINTS).not.toContain(PALETTE.outline);
    expect(BALLOON_TINTS).not.toContain(PALETTE.plum);
  });
});

describe('balloonSpawn', () => {
  it('keeps every balloon fully inside the screen horizontally', () => {
    // Swept across the whole draw range, not just the midpoint, and checked
    // against the SCREEN — the balloon is ~58px wide at placeholder scale, so
    // half of it (29) must still fit inside whatever margin was chosen.
    const halfWidthPx = BODY_W / 2;
    for (let u = 0; u < 1; u += 0.02) {
      const spawn = balloonSpawn(constantRng(u), 'recycle');
      expect(spawn.baseX - halfWidthPx).toBeGreaterThan(0);
      expect(spawn.baseX + halfWidthPx).toBeLessThan(DESIGN_WIDTH);
    }
  });

  it('keeps a swaying balloon on screen too (margin covers the sway)', () => {
    const halfWidthPx = BODY_W / 2;
    const worst = balloonSpawn(constantRng(0.999999), 'recycle');
    expect(worst.baseX + PARTY.balloonSwayMaxPx + halfWidthPx).toBeLessThanOrEqual(DESIGN_WIDTH);
    const leftmost = balloonSpawn(constantRng(0), 'recycle');
    expect(leftmost.baseX - PARTY.balloonSwayMaxPx - halfWidthPx).toBeGreaterThanOrEqual(0);
  });

  it('brings a RECYCLED balloon in from the bottom edge, ALREADY partly visible', () => {
    for (const u of [0, 0.25, 0.5, 0.75, 0.99]) {
      const { spawnY } = balloonSpawn(constantRng(u), 'recycle');
      // Knot below the bottom edge (it rises INTO view)...
      expect(spawnY).toBeGreaterThan(DESIGN_HEIGHT);
      // ...but its body top is already on screen, so there is no invisible
      // wait — this is what keeps the >= 20-visible bound structural.
      expect(spawnY - BODY_H).toBeLessThanOrEqual(DESIGN_HEIGHT);
    }
  });

  it('always enters at the SAME y on recycle (the derived flight start)', () => {
    const entryKnotY = BALLOON_ENTRY_KNOT_Y;
    for (const u of [0, 0.4, 0.99]) {
      expect(balloonSpawn(constantRng(u), 'recycle').spawnY).toBe(entryKnotY);
    }
  });

  it('seeds the INITIAL pool across the WHOLE flight (starts full, stays honest)', () => {
    const entryKnotY = BALLOON_ENTRY_KNOT_Y;
    const recycleKnotY = BALLOON_RECYCLE_KNOT_Y;
    const low = balloonSpawn(constantRng(0.02), 'initial');
    const high = balloonSpawn(constantRng(0.9), 'initial');
    expect(low.spawnY).toBeLessThan(DESIGN_HEIGHT / 2);
    expect(high.spawnY).toBeGreaterThan(DESIGN_HEIGHT / 2);
    // Never outside the flight: a seed above the recycle line would be culled
    // on frame 1, and one past the entry line would start invisible. The seed
    // distribution IS the steady-state one, so the party does not change
    // character a minute in.
    for (let u = 0; u < 1; u += 0.02) {
      const { spawnY } = balloonSpawn(constantRng(u), 'initial');
      expect(spawnY).toBeGreaterThanOrEqual(recycleKnotY);
      expect(spawnY).toBeLessThanOrEqual(entryKnotY);
    }
  });

  it('consumes 7 rng draws when INITIAL but 6 when RECYCLING (no fixed stride)', () => {
    // Documented for seeded harnesses (ST-3): the recycle entry y is derived,
    // not drawn, so a seeded run cannot assume a constant draws-per-balloon.
    const count = (mode: 'initial' | 'recycle'): number => {
      let draws = 0;
      balloonSpawn(() => {
        draws++;
        return 0.5;
      }, mode);
      return draws;
    };
    expect(count('initial')).toBe(7);
    expect(count('recycle')).toBe(6);
  });

  it('always rises (a balloon never sinks) at a speed inside the configured band', () => {
    for (let u = 0; u < 1; u += 0.02) {
      const spawn = balloonSpawn(constantRng(u), 'recycle');
      expect(spawn.riseSpeedPxPerSec).toBeGreaterThan(0);
      expect(spawn.riseSpeedPxPerSec).toBeGreaterThanOrEqual(PARTY.balloonRiseMinPxPerSec);
      expect(spawn.riseSpeedPxPerSec).toBeLessThanOrEqual(PARTY.balloonRiseMaxPxPerSec);
    }
  });

  it('always sways visibly, with a real period', () => {
    for (let u = 0; u < 1; u += 0.02) {
      const spawn = balloonSpawn(constantRng(u), 'recycle');
      expect(spawn.swayAmplitudePx).toBeGreaterThan(0);
      expect(spawn.swayPeriodMs).toBeGreaterThan(0);
      expect(spawn.swayPhase01).toBeGreaterThanOrEqual(0);
      expect(spawn.swayPhase01).toBeLessThanOrEqual(1);
    }
  });

  it('only ever picks a tint from BALLOON_TINTS, including at rng() === 1', () => {
    const tints = new Set(BALLOON_TINTS);
    for (let u = 0; u <= 1; u += 0.01) {
      expect(tints.has(balloonSpawn(constantRng(u), 'recycle').tint)).toBe(true);
    }
    // Math.random() never returns 1, but an injected rng might — must not
    // index past the end.
    expect(tints.has(balloonSpawn(constantRng(1), 'recycle').tint)).toBe(true);
  });

  it('reaches EVERY tint across a uniform sweep (no dead color)', () => {
    const seen = new Set<number>();
    for (let u = 0; u < 1; u += 0.005) seen.add(balloonSpawn(constantRng(u), 'recycle').tint);
    expect(seen.size).toBe(BALLOON_TINTS.length);
  });

  it('produces DIFFERENT flights from different draws (a flock, not a row)', () => {
    const a = balloonSpawn(seededRng([0.1, 0.2, 0.3, 0.4, 0.5, 0.6]), 'recycle');
    const b = balloonSpawn(seededRng([0.9, 0.8, 0.7, 0.6, 0.5, 0.4]), 'recycle');
    expect(a.baseX).not.toBe(b.baseX);
    expect(a.riseSpeedPxPerSec).not.toBe(b.riseSpeedPxPerSec);
    expect(a.swayPeriodMs).not.toBe(b.swayPeriodMs);
  });

  it('is deterministic for a given rng sequence (a seeded harness reproduces it)', () => {
    const draws = [0.11, 0.22, 0.33, 0.44, 0.55, 0.66, 0.77];
    expect(balloonSpawn(seededRng(draws), 'recycle')).toEqual(
      balloonSpawn(seededRng(draws), 'recycle')
    );
  });
});

// ---------------------------------------------------------------------------
// Factory / POOL + INTERACTION INVARIANTS. The helpers above cover the maths;
// these cover what actually degrades in a long party — the pooling, the pop
// lifecycle, the press dedupe and teardown. Driven through the shared
// duck-typed fake scene (tests/fakeScene.ts, the tests/palette.test.ts
// pattern): no DOM, no runtime Phaser, no browser needed.
// ---------------------------------------------------------------------------

describe('createPartyBalloons — pool + interaction invariants', () => {
  /** Build the flock on a fake scene, with a reproducible rng.
   *
   * seededRandom, NOT cyclingRng: balloonSpawn draws exactly 7 values, so any
   * cycle whose length divides 7 would hand all 32 balloons the identical spawn
   * and silently make every "the flock is varied / re-scattered" assertion
   * unfalsifiable (it did, until this suite caught it). */
  function mount(startNowMs = 0) {
    const fake = createFakeScene(startNowMs);
    const handle = createPartyBalloons(fake.scene, { rng: seededRandom(0xba1100) });
    return { fake, handle };
  }

  /** The interactive hit Zones, in pool order. */
  const zonesOf = (fake: ReturnType<typeof createFakeScene>) =>
    fake.created.filter((o) => o.kind === 'zone');

  it('allocates exactly one container + one hit Zone per balloon, ONCE', () => {
    const { fake, handle } = mount();

    expect(handle.count).toBe(PARTY.balloonCount);
    expect(handle.balloons()).toHaveLength(PARTY.balloonCount);
    expect(fake.live('container')).toHaveLength(PARTY.balloonCount);
    expect(fake.live('zone')).toHaveLength(PARTY.balloonCount);
    // Each container holds the string Rectangle + the balloon Image, and Phaser
    // takes container children OFF the display list.
    for (const container of fake.live('container')) {
      expect(container.children).toHaveLength(2);
    }
    const baseline = fake.created.length;

    // Ten seconds of 60Hz updates: many recycles, zero new GameObjects.
    for (let i = 0; i < 600; i++) {
      fake.advance(1000 / 60);
      handle.update(1000 / 60);
    }
    expect(fake.created).toHaveLength(baseline);
    expect(handle.balloons()).toHaveLength(PARTY.balloonCount);
  });

  it('starts every balloon alive, visible and tappable', () => {
    const { fake, handle } = mount();
    expect(handle.balloons().every((b) => b.alive)).toBe(true);
    expect(handle.balloons().every((b) => b.pops === 0)).toBe(true);
    expect(zonesOf(fake).every((z) => z.inputEnabled === true)).toBe(true);
  });

  it('pops exactly the pressed balloon, hides it, and disables ONLY its Zone', () => {
    const { fake, handle } = mount();
    const zones = zonesOf(fake);

    zones[4].fire('pointerdown', fakePointer(1, 1000));

    const after = handle.balloons();
    expect(after[4].pops).toBe(1);
    expect(after[4].alive).toBe(false);
    // Everybody else untouched.
    expect(after.filter((b) => !b.alive)).toHaveLength(1);
    expect(after.reduce((sum, b) => sum + b.pops, 0)).toBe(1);
    // Its Zone stops swallowing presses meant for balloons behind it...
    expect(zones[4].inputEnabled).toBe(false);
    // ...and no other Zone was affected.
    expect(zones.filter((z) => z.inputEnabled === false)).toHaveLength(1);
  });

  it('throws a confetti puff on the pop (pieces appear on the pop layer)', () => {
    const { fake, handle } = mount();
    const popLayer = () =>
      fake.created.filter((o) => o.kind === 'rectangle' && o.depth === PARTY.popConfettiDepth && o.visible);

    expect(popLayer()).toHaveLength(0);
    zonesOf(fake)[2].fire('pointerdown', fakePointer(1, 500));
    expect(popLayer()).toHaveLength(PARTY.popConfettiCount);
    expect(handle.balloons()[2].alive).toBe(false);
  });

  it('is IDEMPOTENT: pressing an already-popped balloon does nothing', () => {
    const { fake, handle } = mount();
    const zones = zonesOf(fake);

    zones[0].fire('pointerdown', fakePointer(1, 100));
    expect(handle.balloons()[0].pops).toBe(1);

    // A genuinely NEW press (different downTime) on the same, still-popped
    // balloon — the dedupe cannot be what saves us here.
    zones[0].fire('pointerdown', fakePointer(1, 200));
    zones[0].fire('pointerdown', fakePointer(2, 300));
    expect(handle.balloons()[0].pops).toBe(1);
    expect(handle.balloons().reduce((sum, b) => sum + b.pops, 0)).toBe(1);
  });

  it('pops only ONE balloon when a single press reaches two overlapping Zones', () => {
    const { fake, handle } = mount();
    const zones = zonesOf(fake);
    const press = fakePointer(1, 4242);

    // Phaser's own topOnly would normally deliver this once; the dedupe is the
    // belt-and-braces that holds even if it is ever switched off.
    zones[7].fire('pointerdown', press);
    zones[8].fire('pointerdown', press);
    zones[9].fire('pointerdown', press);

    expect(handle.balloons().reduce((sum, b) => sum + b.pops, 0)).toBe(1);
    expect(handle.balloons()[7].pops).toBe(1);
    expect(handle.balloons()[8].pops).toBe(0);
  });

  it('lets TWO fingers landing on the same millisecond pop two balloons', () => {
    const { fake, handle } = mount();
    const zones = zonesOf(fake);

    zones[3].fire('pointerdown', fakePointer(1, 9000));
    zones[11].fire('pointerdown', fakePointer(2, 9000)); // same time, other finger

    expect(handle.balloons()[3].pops).toBe(1);
    expect(handle.balloons()[11].pops).toBe(1);
  });

  it('floats a popped balloon back in — visible, tappable, at the derived entry y', () => {
    const { fake, handle } = mount(1000);
    const zones = zonesOf(fake);
    const entryKnotY = BALLOON_ENTRY_KNOT_Y;

    zones[6].fire('pointerdown', fakePointer(1, 1000));
    expect(handle.balloons()[6].alive).toBe(false);

    // Not yet — the respawn beat has not elapsed.
    fake.advance(PARTY.balloonRespawnDelayMs - 50);
    handle.update(16);
    expect(handle.balloons()[6].alive).toBe(false);

    fake.advance(100);
    handle.update(16);
    const back = handle.balloons()[6];
    expect(back.alive).toBe(true);
    expect(back.y).toBe(entryKnotY); // enters ALREADY partly on screen
    expect(back.pops).toBe(1); // the counter survives the recycle
    expect(zones[6].inputEnabled).toBe(true); // poppable again
    // ...and its hit area came back WITH it. Re-enabling input at a stale
    // position would leave a balloon that looks tappable but answers a press
    // somewhere else entirely.
    expect(zones[6].x).toBe(back.x);
    expect(zones[6].y).toBe(balloonHitCenterY(back.y));

    // It also keeps tracking on the frames AFTER the re-entry.
    fake.advance(500);
    handle.update(500);
    const drifted = handle.balloons()[6];
    expect(zones[6].x).toBe(drifted.x);
    expect(zones[6].y).toBe(balloonHitCenterY(drifted.y));
  });

  it('recycles a balloon that rises off the top, without allocating — and its hit Zone follows it every frame', () => {
    const { fake, handle } = mount(0);
    const zones = zonesOf(fake);
    const entryKnotY = BALLOON_ENTRY_KNOT_Y;
    const recycleKnotY = BALLOON_RECYCLE_KNOT_Y;
    const baseline = fake.created.length;

    // Longer than the slowest possible full flight.
    const slowestFlightMs = ((entryKnotY - recycleKnotY) / PARTY.balloonRiseMinPxPerSec) * 1000;
    for (let t = 0; t < slowestFlightMs + 2000; t += 100) {
      fake.advance(100);
      handle.update(100);
      for (const b of handle.balloons()) {
        if (!b.alive) continue;
        // At no point is a live balloon parked off-screen.
        expect(b.y).toBeGreaterThan(recycleKnotY);
        expect(b.y).toBeLessThanOrEqual(entryKnotY);
        // THE HIT AREA TRACKS THE BALLOON. Without the per-frame
        // zone.setPosition in update(), every balloon would stay tappable only
        // at its spawn point while drifting visibly away from its own hit
        // area — the whole flock would look poppable and answer nowhere, and
        // nothing else in this suite would notice.
        expect(zones[b.index].x).toBe(b.x);
        expect(zones[b.index].y).toBe(balloonHitCenterY(b.y));
      }
    }
    expect(fake.created).toHaveLength(baseline);
  });

  it('re-SCATTERS the flock after a backgrounded tab, instead of forming a row', () => {
    // scene.time.now is Phaser's raw rAF timestamp, so a hidden tab that
    // resumes jumps it by the whole wall-clock gap. Every balloon is then far
    // past the recycle line on one frame; queueing them all at the entry y
    // would resume the party as a single horizontal row.
    const { fake, handle } = mount(0);
    const baseline = fake.created.length;

    fake.advance(5 * 60 * 1000); // five minutes in one frame
    handle.update(16);

    const ys = handle.balloons().map((b) => b.y);
    expect(ys.every((y) => y > BALLOON_RECYCLE_KNOT_Y && y <= BALLOON_ENTRY_KNOT_Y)).toBe(true);
    // Spread across the flight, not stacked on one line.
    expect(new Set(ys.map((y) => y.toFixed(3))).size).toBeGreaterThan(PARTY.balloonCount / 2);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(BALLOON_ENTRY_KNOT_Y / 2);
    // Still no allocation, and still exactly one pool.
    expect(fake.created).toHaveLength(baseline);
  });

  it('positions each hit Zone on its balloon from the very first frame', () => {
    // Covers `place()` as well as update(): a balloon must be tappable where it
    // is drawn before update() has ever run.
    const { fake, handle } = mount();
    const zones = zonesOf(fake);
    for (const b of handle.balloons()) {
      expect(zones[b.index].x).toBe(b.x);
      expect(zones[b.index].y).toBe(balloonHitCenterY(b.y));
    }
  });

  it('destroy() frees every object it made, and a SECOND destroy() is a no-op', () => {
    const { fake, handle } = mount();
    handle.destroy();

    expect(fake.live()).toHaveLength(0);
    expect(fake.displayList()).toHaveLength(0);
    expect(handle.balloons()).toHaveLength(0);

    handle.destroy();
    // Containers destroy their children, so each child sees exactly one
    // destroy() from its container and none from a second teardown.
    expect(fake.created.every((o) => o.destroyCount === 1)).toBe(true);
  });

  it('is inert after destroy(): update() neither throws nor resurrects anything', () => {
    const { fake, handle } = mount();
    const baseline = fake.created.length;
    handle.destroy();

    expect(() => {
      fake.advance(5000);
      handle.update(16);
    }).not.toThrow();
    expect(fake.created).toHaveLength(baseline);
    expect(fake.live()).toHaveLength(0);
    // The pool SIZE it was built with is still reportable after teardown.
    expect(handle.count).toBe(PARTY.balloonCount);
  });
});
