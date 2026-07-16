// Level 7 "invisible cars" traffic (PLAN-06 Task 1). Oncoming cars drift into
// Gabby's lane and must be dodged by BRAKING (level 7 is the one level gas-only
// doesn't clear). See the TRAFFIC constants block (src/systems/constants.ts) for
// the model + geometry, and level07.ts's TrafficEvent for the per-encounter
// layout. Collision is a friendly soft-fail with verbatim personal copy, then
// an instant restart (GameScene's softFail handles the overlay + restart).
//
// ZERO Matter bodies: cars are plain pooled Phaser Images (like decorations.ts /
// passenger.ts), so they never touch NORTH_STAR §8's <100-body budget. Collision
// is a MANUAL JS overlap against ctx.bike.x each frame (see isTrafficCollision).
//
// Like bike.ts / terrain.ts / passenger.ts (and UNLIKE decorations.ts), this
// module has NO runtime Phaser import and does NOT import ui.ts — its only
// non-type imports are the pure constants — so it stays import-safe in Node.
// The pure helpers below (lane fraction, lane y, collision predicate, spawn
// scheduling) are therefore unit-tested directly in tests/traffic.test.ts; the
// createTraffic factory only ever CALLS METHODS on the runtime `scene`/`ctx`
// handles handed to it (same contract as createBike).
import type Phaser from 'phaser';
import { TRAFFIC, TEXTURE_KEYS, DEPTHS } from './constants';
import type { LevelEventHandle, EventContext } from '../levels/events';
import type { TrafficEvent } from '../levels/types';

/** VERBATIM personal content (NORTH_STAR §5 row 7 / CLAUDE.md Rule 4 — never
 * paraphrase). The soft-fail toast shown when a car hits Gabby. Includes the
 * yellow-heart emoji; GameScene.failLevel already sizes/wraps long messages. */
export const TRAFFIC_FAIL_MESSAGE = "They really don't see us!! Go again 💛";

// ---------------------------------------------------------------------------
// Per-level defaults for any TrafficEvent field a config omits. level07.ts
// authors all of them explicitly; these are the safety net that keeps an
// under-specified traffic event still sane (same "total function" spirit as
// terrain.ts's normalizeSpec).
// ---------------------------------------------------------------------------
const DEFAULTS = {
  carCount: 6,
  carSpeedPxPerFrame: 6,
  firstSpawnX: 2800,
  spacingPx: 1500,
  laneDropTelegraphMs: 3000,
} as const;

// ---------------------------------------------------------------------------
// Pure helpers — no Phaser/Matter/DOM. Unit-tested in tests/traffic.test.ts.
// ---------------------------------------------------------------------------

/** Clamp to [0, 1]. */
export function trafficClamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/**
 * A car's lane-descent fraction: 0 = fully in the FAR (harmless) lane, 1 =
 * fully in the NEAR (dangerous) lane. Symmetric about the encounter centre —
 * the car eases IN as it nears the centre from the right and back OUT as it
 * leaves to the left, ramping across the `driftPx` band at each edge of the
 * `zoneHalfPx` window. Pure.
 */
export function trafficLaneFraction(
  carX: number,
  encounterX: number,
  zoneHalfPx: number,
  driftPx: number
): number {
  const dist = Math.abs(carX - encounterX);
  if (driftPx <= 0) return dist <= zoneHalfPx ? 1 : 0;
  return trafficClamp01((zoneHalfPx - dist) / driftPx);
}

/**
 * Screen y (px) for a car sprite given its lane fraction `f`, blending from
 * the far-lane height (f=0, higher up / further back) to the near-lane height
 * (f=1, down on the road) above the ground `surfaceY`. Pure.
 */
export function trafficLaneY(
  surfaceY: number,
  f: number,
  farLaneOffsetPx: number,
  nearLaneOffsetPx: number
): number {
  return surfaceY - (farLaneOffsetPx + (nearLaneOffsetPx - farLaneOffsetPx) * f);
}

/**
 * The manual collision predicate: a car hits the bike only while it is at
 * least `laneThreshold` descended into the near lane AND horizontally within
 * `halfWidthPx` of the bike. Purely horizontal + lane (level 7 is flat), no
 * Matter body involved. Pure.
 */
export function isTrafficCollision(
  carX: number,
  bikeX: number,
  laneFraction: number,
  halfWidthPx: number,
  laneThreshold: number
): boolean {
  return laneFraction >= laneThreshold && Math.abs(carX - bikeX) <= halfWidthPx;
}

/**
 * How far RIGHT of its encounter centre a car must spawn so it is telegraphed
 * in the far lane for `telegraphMs` before it starts descending into the near
 * lane (which begins `zoneHalfPx` from the centre). Pure.
 */
export function trafficSpawnAheadPx(
  zoneHalfPx: number,
  carSpeedPxPerFrame: number,
  telegraphMs: number,
  bufferPx: number,
  fps = TRAFFIC.fps
): number {
  const telegraphFrames = (telegraphMs / 1000) * fps;
  return zoneHalfPx + carSpeedPxPerFrame * telegraphFrames + bufferPx;
}

/**
 * Leftward displacement (px) of a car over `elapsedMs` of wall-clock time,
 * given a speed authored as px per fixed 60 Hz frame. Refresh-INDEPENDENT: it
 * depends only on elapsed TIME, so integrating it on the fixed 60 Hz physics
 * step (as createTraffic does — one call per `beforeupdate`, elapsedMs =
 * 1000/fps) yields identical wall-clock motion at 30/60/120 Hz. A raw
 * per-render-frame `car.x -= speed` would instead run ~2x fast on a 120 Hz
 * display, collapsing the mandated >=3s telegraph and the dodge windows (the
 * exact hazard bike.ts avoids by driving its control laws off the same fixed
 * step). Pure — see the frame-rate test in tests/traffic.test.ts.
 */
export function trafficCarDisplacement(
  carSpeedPxPerFrame: number,
  elapsedMs: number,
  fps = TRAFFIC.fps
): number {
  return carSpeedPxPerFrame * (elapsedMs / (1000 / fps));
}

/** Fixed world x-positions of the `count` encounter centres, evenly spaced. Pure. */
export function trafficEncounterCenters(firstX: number, spacingPx: number, count: number): number[] {
  const centers: number[] = [];
  for (let i = 0; i < count; i++) centers.push(firstX + i * spacingPx);
  return centers;
}

/** Whether the bike has approached an encounter closely enough to spawn its
 * car (bike within `triggerLeadPx` to the left of the centre). Pure. */
export function shouldTriggerEncounter(bikeX: number, encounterX: number, triggerLeadPx: number): boolean {
  return bikeX >= encounterX - triggerLeadPx;
}

// ---------------------------------------------------------------------------
// Runtime factory (calls scene/ctx methods only — see module doc).
// ---------------------------------------------------------------------------

/** Matter world per-engine-step event — the SAME fixed 60 Hz hook bike.ts
 * drives its control laws off (see its BEFORE_UPDATE_EVENT doc). Car motion is
 * integrated here, never on the render frame, so it stays refresh-independent
 * (see trafficCarDisplacement). String literal on purpose: the named constant
 * lives on the runtime Phaser module this file must not import. */
const BEFORE_UPDATE_EVENT = 'beforeupdate';

/** One pooled car sprite + its live state. `active` false = idle in the pool. */
interface Car {
  sprite: Phaser.GameObjects.Image;
  active: boolean;
  x: number;
  encounterX: number;
  /** true if this car's encounter is a punch-through (short trigger lead) one. */
  punchThrough: boolean;
}

/** One encounter: fixed world centre, whether its car has spawned, and whether
 * it's a "punch-through" encounter (short trigger lead so a confident player
 * can accelerate through the gap before the car drops — vs the default
 * brake-to-hang-back encounters). Still avoidable by braking either way. */
interface Encounter {
  centerX: number;
  triggered: boolean;
  punchThrough: boolean;
}

/** DEV-only live snapshot the browser playtest harness reads off the scene to
 * script a dodge driver + assert avoidability (stripped from prod builds). */
interface TrafficDebug {
  encounters: Array<{ centerX: number; punchThrough: boolean }>;
  cars(): Array<{
    x: number;
    encounterX: number;
    laneFraction: number;
    dangerous: boolean;
    punchThrough: boolean;
  }>;
}

/**
 * Builds the level 7 traffic system and returns a {@link LevelEventHandle}
 * GameScene drives. `scene`/`ctx` are runtime handles only (same contract as
 * createBike). NO Matter body is created — cars are pooled Images. Car motion,
 * spawning, and collision run on the Matter world's fixed 60 Hz `beforeupdate`
 * step (registered here, removed in destroy()), so the hazard behaves
 * identically at any display refresh rate — same discipline as bike.ts.
 */
export function createTraffic(
  scene: Phaser.Scene,
  event: TrafficEvent,
  ctx: EventContext
): LevelEventHandle {
  const carCount = event.carCount ?? DEFAULTS.carCount;
  const carSpeed = event.carSpeedPxPerFrame ?? DEFAULTS.carSpeedPxPerFrame;
  const firstSpawnX = event.firstSpawnX ?? DEFAULTS.firstSpawnX;
  const spacingPx = event.spacingPx ?? DEFAULTS.spacingPx;
  const telegraphMs = event.laneDropTelegraphMs ?? DEFAULTS.laneDropTelegraphMs;
  const punchIndices = new Set(event.punchThroughIndices ?? []);

  const spawnAheadPx = trafficSpawnAheadPx(
    TRAFFIC.zoneHalfPx,
    carSpeed,
    telegraphMs,
    TRAFFIC.spawnBufferPx
  );

  const encounters: Encounter[] = trafficEncounterCenters(firstSpawnX, spacingPx, carCount).map(
    (centerX, i) => ({ centerX, triggered: false, punchThrough: punchIndices.has(i) })
  );

  // Fixed sprite pool (recycled) — created once, hidden until a car spawns.
  // INVARIANT: poolSize MUST exceed the max number of cars simultaneously
  // active near the player, or the `!car` spawn fallback below silently drops a
  // spawn until one frees — which would shorten that encounter's telegraph
  // (breaking the >=3s guarantee). With the level07 spacing the worst case is
  // ~3 concurrent; TRAFFIC.poolSize (5) keeps a margin. Re-check if re-tuned.
  const pool: Car[] = [];
  for (let i = 0; i < TRAFFIC.poolSize; i++) {
    const sprite = scene.add
      .image(0, 0, TEXTURE_KEYS.car)
      .setDepth(DEPTHS.props)
      .setFlipX(true) // face the oncoming (leftward) travel direction
      .setVisible(false);
    pool.push({ sprite, active: false, x: 0, encounterX: 0, punchThrough: false });
  }

  function laneFractionOf(car: Car): number {
    return trafficLaneFraction(car.x, car.encounterX, TRAFFIC.zoneHalfPx, TRAFFIC.driftPx);
  }

  // DEV-only: expose live state for scripts/playtest-level07.mjs. Stashed on
  // the scene (which persists across scene.restart()); prod builds skip this
  // whole branch (Vite dead-code-eliminates `import.meta.env.DEV`).
  const devScene = scene as unknown as {
    __traffic?: TrafficDebug;
    __lastTrafficSoftFail?: string;
  };
  if (import.meta.env.DEV) {
    devScene.__traffic = {
      encounters: encounters.map((e) => ({ centerX: e.centerX, punchThrough: e.punchThrough })),
      cars: () =>
        pool
          .filter((c) => c.active)
          .map((c) => {
            const f = laneFractionOf(c);
            return {
              x: c.x,
              encounterX: c.encounterX,
              laneFraction: f,
              punchThrough: c.punchThrough,
              dangerous: isTrafficCollision(
                c.x,
                ctx.bike.x,
                f,
                TRAFFIC.collisionHalfWidthPx,
                TRAFFIC.collisionLaneThreshold
              ),
            };
          }),
    };
  }

  // One car's per-step leftward advance on the fixed 60 Hz tick — the whole
  // reason motion lives on beforeupdate (see trafficCarDisplacement).
  const stepDeltaX = trafficCarDisplacement(carSpeed, 1000 / TRAFFIC.fps);

  /** Runs once per fixed physics step (see BEFORE_UPDATE_EVENT). Spawns,
   * moves, renders, and collides the cars at a refresh-independent rate. */
  function onBeforeUpdate(): void {
    // Defensive: the Matter world keeps stepping after a fail/finish even
    // though GameScene stops calling handle.update() — never drive hazards once
    // the run has ended (see EventContext.isEnded).
    if (ctx.isEnded()) return;
    const bikeX = ctx.bike.x;

    // --- spawn: trigger each encounter as the bike approaches it ---
    for (const e of encounters) {
      if (e.triggered) continue;
      const triggerLead = e.punchThrough ? TRAFFIC.punchTriggerLeadPx : TRAFFIC.triggerLeadPx;
      if (!shouldTriggerEncounter(bikeX, e.centerX, triggerLead)) continue;
      const car = pool.find((c) => !c.active);
      if (!car) {
        // Pool momentarily full — retry next step. Should never happen (see the
        // poolSize INVARIANT above); surface it in dev if it ever does.
        if (import.meta.env.DEV) console.warn('[traffic] pool exhausted — telegraph at risk');
        continue;
      }
      const tintIndex = encounters.indexOf(e) % TRAFFIC.tints.length;
      car.active = true;
      car.x = e.centerX + spawnAheadPx;
      car.encounterX = e.centerX;
      car.punchThrough = e.punchThrough;
      car.sprite.setTint(TRAFFIC.tints[tintIndex]).setVisible(true);
      e.triggered = true;
    }

    // --- move, render, and collide the active cars ---
    for (const car of pool) {
      if (!car.active) continue;
      car.x -= stepDeltaX;
      const f = laneFractionOf(car);
      const y = trafficLaneY(
        ctx.terrain.heightAt(car.x),
        f,
        TRAFFIC.farLaneOffsetPx,
        TRAFFIC.nearLaneOffsetPx
      );
      car.sprite.setPosition(car.x, y);
      car.sprite.setAlpha(TRAFFIC.farLaneAlpha + (TRAFFIC.nearLaneAlpha - TRAFFIC.farLaneAlpha) * f);

      if (
        isTrafficCollision(
          car.x,
          bikeX,
          f,
          TRAFFIC.collisionHalfWidthPx,
          TRAFFIC.collisionLaneThreshold
        )
      ) {
        if (import.meta.env.DEV) devScene.__lastTrafficSoftFail = TRAFFIC_FAIL_MESSAGE;
        ctx.softFail(TRAFFIC_FAIL_MESSAGE);
        return; // run ended — stop touching hazards this step
      }

      // Recycle once the car is well off the left of the screen behind the bike.
      if (car.x < bikeX - TRAFFIC.recycleBehindPx) {
        car.active = false;
        car.sprite.setVisible(false);
      }
    }
  }
  scene.matter.world.on(BEFORE_UPDATE_EVENT, onBeforeUpdate);

  function update(): void {
    // No-op: all motion/collision runs on the fixed-step beforeupdate hook
    // above (refresh-independent). The seam still calls this every render frame.
  }

  function destroy(): void {
    // Remove the world listener FIRST (no callbacks during teardown). Unlike
    // bike.ts (whose destroy runs INSIDE GameScene's matter-world null guard),
    // event handles are torn down OUTSIDE it — and on the normal shutdown/
    // restart path Phaser's Matter plugin has already destroyed the world
    // (taking every world listener with it) and nulled scene.matter.world by
    // the time this runs. So off() is only needed (and only safe) if the world
    // somehow survived; skip it otherwise — no listener can leak, it's gone.
    const world = scene.matter.world as Phaser.Physics.Matter.World | null;
    if (world) world.off(BEFORE_UPDATE_EVENT, onBeforeUpdate);
    for (const car of pool) car.sprite.destroy();
    pool.length = 0;
    if (import.meta.env.DEV) {
      delete devScene.__traffic;
      delete devScene.__lastTrafficSoftFail;
    }
  }

  return { update, destroy };
}
