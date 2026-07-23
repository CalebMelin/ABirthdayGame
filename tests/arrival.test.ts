// Pure-logic tests for level 22's party-arrival cutscene (PLAN-09 ST-5).
// arrival.ts is import-safe (no runtime Phaser, no ui.ts), so these exercise its
// exported pure helpers directly — the ride-in geometry, the crawl controller
// and the phase machine — plus the ARRIVAL constants' own invariants. The
// scene-touching createArrival factory is covered by the browser harness
// (scripts/playtest-arrival.mjs), not here.
import { describe, expect, it } from 'vitest';
import {
  ARRIVAL_DISMOUNT_OFFSETS,
  arrivalCrawlPedals,
  arrivalGeometry,
  nextArrivalPhase,
} from '../src/systems/arrival';
import type { ArrivalPhase, ArrivalSignals } from '../src/systems/arrival';
import { ARRIVAL, BIKE_TUNING, LEVEL } from '../src/systems/constants';
import { level22 } from '../src/levels/level22';
import type { LevelEvent } from '../src/levels/types';

/** The finish flag's world x on the level the arrival actually ships on —
 * DERIVED the way GameScene derives it (terrain.worldLength -
 * LEVEL.finishMarginPx) rather than hardcoded, so retuning either input moves
 * these tests with the game. */
const LEVEL22_FINISH_X = level22.terrain.length - LEVEL.finishMarginPx;

/** The event level22.ts actually authors — the values the shipped game runs. */
const LEVEL22_ARRIVAL = level22.events?.find(
  (event): event is Extract<LevelEvent, { type: 'partyArrival' }> => event.type === 'partyArrival'
);

describe('arrivalGeometry', () => {
  it('lays the three landmarks out around the finish flag', () => {
    expect(arrivalGeometry(15500, 900, 360, 300)).toEqual({
      rideInX: 14600,
      crawlX: 15140,
      doorX: 15800,
    });
  });

  it('keeps the ordering invariant rideInX < crawlX < finishX < doorX', () => {
    const finishX = 15500;
    const { rideInX, crawlX, doorX } = arrivalGeometry(finishX, 900, 360, 300);
    expect(rideInX).toBeLessThan(crawlX);
    expect(crawlX).toBeLessThan(finishX);
    expect(finishX).toBeLessThan(doorX);
  });

  it('holds that ordering at the SHIPPED constants on the SHIPPED level', () => {
    const { rideInX, crawlX, doorX } = arrivalGeometry(
      LEVEL22_FINISH_X,
      ARRIVAL.rideInLeadPx,
      ARRIVAL.crawlLeadPx,
      ARRIVAL.doorAheadOfFinishPx
    );
    expect(rideInX).toBeLessThan(crawlX);
    expect(crawlX).toBeLessThan(LEVEL22_FINISH_X);
    expect(LEVEL22_FINISH_X).toBeLessThan(doorX);
  });

  it('is pure arithmetic — a zero lead collapses onto the flag itself', () => {
    expect(arrivalGeometry(1000, 0, 0, 0)).toEqual({
      rideInX: 1000,
      crawlX: 1000,
      doorX: 1000,
    });
  });
});

describe('level 22 authors an arrival that fits the level it ships on', () => {
  it('carries the partyArrival event NORTH_STAR §5 row 22 requires', () => {
    expect(LEVEL22_ARRIVAL).toBeDefined();
  });

  it('slows down INSIDE the finish flat zone, on genuinely level ground', () => {
    // The braking/crawl is the one part of the ride-in whose ground must be
    // flat: it is where the bike decelerates and settles onto its approach
    // speed. (The ride-in TAKEOVER deliberately starts further back, on ordinary
    // rolling terrain — holding gas there is what a player does anyway.)
    const crawlX = LEVEL22_FINISH_X - ARRIVAL.crawlLeadPx;
    const finishZone = level22.terrain.flatZones?.find((zone) => zone.end >= LEVEL22_FINISH_X);
    expect(finishZone).toBeDefined();
    expect(crawlX).toBeGreaterThanOrEqual(finishZone!.start);
    expect(crawlX).toBeLessThanOrEqual(finishZone!.end);
  });

  it('stands the venue on ground the level actually has, past the flag', () => {
    const doorX =
      LEVEL22_FINISH_X + (LEVEL22_ARRIVAL?.doorAheadOfFinishPx ?? ARRIVAL.doorAheadOfFinishPx);
    expect(doorX).toBeGreaterThan(LEVEL22_FINISH_X);
    expect(doorX).toBeLessThan(level22.terrain.length);
  });

  it('takes control before the flag, from far enough out to re-launch a stopped bike', () => {
    const rideInX = LEVEL22_FINISH_X - (LEVEL22_ARRIVAL?.rideInLeadPx ?? ARRIVAL.rideInLeadPx);
    expect(rideInX).toBeLessThan(LEVEL22_FINISH_X - ARRIVAL.crawlLeadPx);
    // Well past the spawn flat zone — the arrival is the last stretch of the
    // level, never most of it.
    expect(rideInX).toBeGreaterThan(level22.terrain.length / 2);
  });
});

describe('arrivalCrawlPedals', () => {
  const target = ARRIVAL.crawlSpeedPxPerStep;

  it('brakes only while the bike is running faster than the target', () => {
    expect(arrivalCrawlPedals(target + 0.01, target)).toEqual({ gas: false, brake: true });
    // Full gas-only cruise — the state the crawl exists to bleed off.
    const topSpeed = BIKE_TUNING.maxWheelAngularVelocity * BIKE_TUNING.wheelRadius;
    expect(arrivalCrawlPedals(topSpeed, target)).toEqual({ gas: false, brake: true });
  });

  it('gasses at or below the target, so the flag is ALWAYS reached', () => {
    expect(arrivalCrawlPedals(target, target)).toEqual({ gas: true, brake: false });
    expect(arrivalCrawlPedals(target - 0.01, target)).toEqual({ gas: true, brake: false });
    // A player who has stopped dead: the cutscene drives them in.
    expect(arrivalCrawlPedals(0, target)).toEqual({ gas: true, brake: false });
  });

  it('gasses a bike rolling BACKWARDS (signed velocity, not a magnitude)', () => {
    // Passing BikeHandle.speed (a magnitude) here would read a fast reverse as
    // "too fast" and brake it further away from the flag — the bug this
    // signature exists to make impossible.
    expect(arrivalCrawlPedals(-5, target)).toEqual({ gas: true, brake: false });
  });

  it('never holds gas and brake together', () => {
    for (const v of [-9, -1, 0, 0.5, target, target + 3, 20]) {
      const pedals = arrivalCrawlPedals(v, target);
      expect(pedals.gas && pedals.brake).toBe(false);
    }
  });

  it('never brakes below BIKE_TUNING.reverseEngageThreshold territory', () => {
    // Held brake at a near-stop is what engages the bike's reverse creep. The
    // controller only ever brakes strictly ABOVE the (positive) target, so a
    // crawling bike is never braked backwards off the flag.
    expect(target).toBeGreaterThan(0);
    expect(arrivalCrawlPedals(0.0001, target).brake).toBe(false);
  });
});

describe('nextArrivalPhase', () => {
  const nowhere: ArrivalSignals = { atRideIn: false, atCrawl: false, finished: false };
  const atRideIn: ArrivalSignals = { atRideIn: true, atCrawl: false, finished: false };
  const atCrawl: ArrivalSignals = { atRideIn: true, atCrawl: true, finished: false };
  const finished: ArrivalSignals = { atRideIn: true, atCrawl: true, finished: true };

  it('waits at approaching until the bike reaches the ride-in point', () => {
    expect(nextArrivalPhase('approaching', nowhere)).toBe('approaching');
    expect(nextArrivalPhase('approaching', atRideIn)).toBe('ridingIn');
  });

  it('holds gas until the bike reaches the crawl point', () => {
    expect(nextArrivalPhase('ridingIn', atRideIn)).toBe('ridingIn');
    expect(nextArrivalPhase('ridingIn', atCrawl)).toBe('crawling');
  });

  it('stays crawling until the run ends', () => {
    expect(nextArrivalPhase('crawling', atCrawl)).toBe('crawling');
    expect(nextArrivalPhase('crawling', finished)).toBe('arrived');
  });

  it('jumps straight to arrived from ANY phase once the run has ended', () => {
    for (const phase of ['approaching', 'ridingIn', 'crawling'] satisfies ArrivalPhase[]) {
      expect(nextArrivalPhase(phase, finished)).toBe('arrived');
    }
  });

  it('is terminal at arrived — the finale can never re-trigger', () => {
    for (const signals of [nowhere, atRideIn, atCrawl, finished]) {
      expect(nextArrivalPhase('arrived', signals)).toBe('arrived');
    }
  });

  it('never skips a phase in one call (one transition per call)', () => {
    // atCrawl is true from `approaching` too (the bike could enter the level
    // already past both points on a replay), but the machine still steps
    // through ridingIn so the pedals are actually taken before the crawl.
    expect(nextArrivalPhase('approaching', atCrawl)).toBe('ridingIn');
  });
});

describe('ARRIVAL_DISMOUNT_OFFSETS — the two figures walk in side by side', () => {
  const { gabby, caleb } = ARRIVAL_DISMOUNT_OFFSETS;

  it('gives them EXACTLY equal walks, so they cross the forecourt in step', () => {
    // Each walks `doorX - anchor - (landAheadPx + doorStopShortPx)`, so equal
    // sums == equal distances. Both set off on one shared beat
    // (ARRIVAL.walkInDelayMs), so equal distance is what actually keeps them
    // together — chaining each walk onto its own landing let the first to land
    // overtake the other. Asserted here rather than claimed in a comment: an
    // earlier comment quoted the arithmetic result and went stale the moment a
    // screenshot pass moved the landings.
    expect(gabby.landAheadPx + gabby.doorStopShortPx).toBe(
      caleb.landAheadPx + caleb.doorStopShortPx
    );
  });

  it('keeps Gabby ahead of Caleb the whole way — she leads, it is her party', () => {
    expect(gabby.landAheadPx).toBeGreaterThan(caleb.landAheadPx);
    // Smaller "short of the doorway" == further along, so she stays in front.
    expect(gabby.doorStopShortPx).toBeLessThan(caleb.doorStopShortPx);
  });

  it('lands both of them AHEAD of the bike, on the doorway side', () => {
    expect(caleb.landAheadPx).toBeGreaterThan(0);
    expect(gabby.landAheadPx).toBeGreaterThan(0);
  });

  it('stops both of them short of the doorway centre, never past it', () => {
    expect(gabby.doorStopShortPx).toBeGreaterThan(0);
    expect(caleb.doorStopShortPx).toBeGreaterThan(0);
  });
});

describe('ARRIVAL pacing invariants', () => {
  it('holds the hand-off until every finale tween has finished', () => {
    // finaleHoldMs is what onFinish() returns to GameScene; the LAST thing the
    // finale animates is the dusk wash, which ends at washDelayMs + washFadeMs +
    // duskFadeMs. Asserted rather than restated as arithmetic in a comment.
    const lastTweenEndsMs = ARRIVAL.washDelayMs + ARRIVAL.washFadeMs + ARRIVAL.duskFadeMs;
    expect(ARRIVAL.finaleHoldMs).toBeGreaterThanOrEqual(lastTweenEndsMs);
  });

  it('dismounts Caleb (the pillion) first, and only once he has LANDED and stepped clear', () => {
    expect(ARRIVAL.hopOffDelayMs).toBeLessThan(ARRIVAL.gabbyOffDelayMs);
    // Gabby materialises at the seated rider's spot, so Caleb must be off the
    // bike and standing before she does or the two sprites tangle over it.
    expect(ARRIVAL.gabbyOffDelayMs).toBeGreaterThanOrEqual(
      ARRIVAL.hopOffDelayMs + ARRIVAL.hopDownMs
    );
  });

  it('starts the shared walk only once BOTH of them have landed', () => {
    // The walk is one shared beat (not one chained onto each landing) so they
    // cross the forecourt together — which requires nobody setting off mid-hop.
    expect(ARRIVAL.walkInDelayMs).toBeGreaterThanOrEqual(
      ARRIVAL.gabbyOffDelayMs + ARRIVAL.hopDownMs
    );
  });

  it('gets BOTH of them all the way inside before the light wash takes the screen', () => {
    // The light swells AFTER they arrive; it must never cover their arrival.
    const walkEndsMs = ARRIVAL.walkInDelayMs + ARRIVAL.walkInMs;
    expect(walkEndsMs).toBeLessThanOrEqual(ARRIVAL.washDelayMs);
    expect(walkEndsMs).toBeLessThan(ARRIVAL.finaleHoldMs);
  });

  it('opens the doors before the bike can reach the flag from the crawl point', () => {
    // The doors start opening when the crawl does. At the crawl's own approach
    // speed the bike needs crawlLeadPx / crawlSpeedPxPerStep steps (at 60 Hz) to
    // cover the remaining distance — and that must exceed the door tween, or she
    // crosses the flag before the venue has opened. This is the FASTEST the
    // crawl can deliver her; a bike arriving hot spends longer braking first.
    const stepsToFlag = ARRIVAL.crawlLeadPx / ARRIVAL.crawlSpeedPxPerStep;
    const msToFlag = (stepsToFlag / 60) * 1000;
    expect(msToFlag).toBeGreaterThan(ARRIVAL.doorsOpenMs);
  });

  it('keeps the venue inside the runway the level has past the flag', () => {
    // LEVEL.finishMarginPx of ground exists past the finish flag on EVERY level;
    // the doorway (and so the facade drawn around it) has to fit in it.
    expect(ARRIVAL.doorAheadOfFinishPx).toBeGreaterThan(0);
    expect(ARRIVAL.doorAheadOfFinishPx).toBeLessThan(LEVEL.finishMarginPx);
  });

  it('crawls slower than the bike cruises, and slower than its full-gas top speed', () => {
    const topSpeed = BIKE_TUNING.maxWheelAngularVelocity * BIKE_TUNING.wheelRadius;
    expect(ARRIVAL.crawlSpeedPxPerStep).toBeGreaterThan(0);
    expect(ARRIVAL.crawlSpeedPxPerStep).toBeLessThan(topSpeed);
  });
});
