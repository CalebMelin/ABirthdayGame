// Level 11 "Highway On-Ramp" wheelie-rider easter egg (PLAN-07 task 2). NORTH_STAR
// §5 row 11 (the authority — never explained in-game, no toast, no text): a
// GUARANTEED, NON-INTERACTIVE cameo — an all-black rider in a black helmet
// wheelies past on a YELLOW motorcycle, overtaking Gabby from behind, then rides
// off ahead. src/levels/types.ts's REQUIRED_EVENTS locks the `wheelieRider` event
// to level 11 only, and this module only ever reacts to a DISPATCHED event, so it
// structurally can never appear anywhere else.
//
// ZERO Matter bodies (the game sits at 99/100 on level 22 — hard rule): the
// motorcycle (2 wheels + a recolored chassis) and rider are plain Images in one
// Container, driven on the fixed 60 Hz `scene.matter.world.on('beforeupdate', ...)`
// step (registered here, REMOVED in destroy() behind the nulled-world guard — same
// discipline as bike.ts/traffic.ts/police.ts, so nothing leaks across
// scene.restart()); dust puffs are plain Graphics, tween-driven (pickup.ts's
// heart / police.ts's spin-out-puff style: spawn, tween, self-destroy).
// Non-interactive means exactly that: this module never calls ctx.softFail or
// ctx.setInputOverride, and never touches the player's bike/input at all — it
// only ever READS ctx.bike/ctx.terrain.
//
// Like bike.ts/terrain.ts/traffic.ts/pickup.ts/police.ts (and UNLIKE ui.ts, the
// ONE module left in src/systems with a runtime `import Phaser` — decorations.ts
// was the example here until PLAN-07 task 3 made it import-safe too, see its own
// doc), this module has NO runtime Phaser import and does NOT import
// ui.ts — its non-type imports are the pure constants + the palette-swap engine +
// the character swatch data (both themselves import-safe in Node — see their own
// module docs) — so it stays import-safe in Node. The pure helpers below (the
// trigger predicate, the speed/displacement math, the spawn/despawn geometry, the
// ground-follow smoothing step, the default-x resolution) are unit-tested directly
// in tests/wheelieRider.test.ts; the createWheelieRider factory only ever CALLS
// METHODS on the runtime scene/ctx handles handed to it (same contract as
// createBike/createPolice).
import type Phaser from 'phaser';
import { WHEELIE_RIDER, BIKE_TUNING, TEXTURE_KEYS, DEPTHS, PALETTE } from './constants';
import { MARKERS, recolorTexture } from './palette';
import type { ColorRemap } from './palette';
import { resolveBike } from '../data/characters';
import type { LevelEventHandle, EventContext } from '../levels/events';
import type { WheelieRiderEvent } from '../levels/types';

// ---------------------------------------------------------------------------
// Pure helpers — no Phaser/Matter/DOM. Unit-tested in tests/wheelieRider.test.ts.
// ---------------------------------------------------------------------------

/**
 * Resolves the event's trigger x: the authored `event.x` if given, else the
 * PLAN-07 "sensible default" of mid-level (half of worldLength). level11.ts
 * always authors `x` explicitly (6500 of 13000) — this is the safety net for
 * a hypothetically under-specified config (same "total function" spirit as
 * traffic.ts's DEFAULTS / police.ts's DEFAULTS), expressed as one small
 * function rather than a DEFAULTS object since `x` is this event's ONLY
 * optional field. Pure.
 */
export function resolveWheelieRiderTriggerX(eventX: number | undefined, worldLength: number): number {
  return eventX ?? worldLength / 2;
}

/**
 * The trigger predicate: arm once the bike has reached/passed `triggerX` AND
 * is grounded AND is moving (at/above a small "not parked" threshold).
 * Guarding on grounded+moving (rather than firing the instant x is crossed)
 * is what keeps "guaranteed" true without ever surprising a bounced/airborne
 * player. The predicate is simply re-evaluated every fixed step by the caller
 * (see createWheelieRider) — even if the bike briefly rolled backward below
 * `triggerX` again (reverse-creep, rolling back down a hill), it would just
 * re-arm and fire on the next forward pass; in practice a level-11 player is
 * always moving comfortably forward at x=6500, so it fires within a step or
 * two of first reaching it. Pure.
 */
export function shouldTriggerWheelieRider(
  bikeX: number,
  triggerX: number,
  airborne: boolean,
  speedPxPerStep: number,
  minSpeedPxPerStep: number
): boolean {
  return bikeX >= triggerX && !airborne && speedPxPerStep >= minSpeedPxPerStep;
}

/**
 * The rider's own constant travel speed (px per fixed step): a multiple of
 * the bike's full-gas FLAT top speed. Pure (mirrors police.ts's copHardCap).
 */
export function wheelieRiderTopSpeedPxPerStep(
  bikeFullGasTopSpeedPxPerStep: number,
  speedMultiplier: number
): number {
  return bikeFullGasTopSpeedPxPerStep * speedMultiplier;
}

/**
 * Rightward displacement (px) over `elapsedMs` of wall-clock time, given a
 * speed authored as px per fixed 60 Hz step. Refresh-INDEPENDENT (mirrors
 * police.ts's copDisplacement / traffic.ts's trafficCarDisplacement — see
 * either's doc comment for why a raw per-render-frame `x += speed` is the
 * exact hazard this avoids). Pure — see the frame-rate test in
 * tests/wheelieRider.test.ts.
 */
export function wheelieRiderDisplacement(
  speedPxPerStep: number,
  elapsedMs: number,
  fps = WHEELIE_RIDER.fps
): number {
  return speedPxPerStep * (elapsedMs / (1000 / fps));
}

/** Where (world x) the rider spawns: `marginPx` behind the camera's CURRENT
 * left edge, so he is guaranteed off-screen the instant he appears. Pure. */
export function wheelieRiderSpawnX(cameraLeftEdgeX: number, marginPx: number): number {
  return cameraLeftEdgeX - marginPx;
}

/** One fixed-step exponential smoothing step toward `targetY` — damps the
 * rolling-hill heightmap into a smooth vertical glide instead of snapping to
 * every sample (see WHEELIE_RIDER.groundFollowLerp). Pure. */
export function wheelieRiderNextGroundY(currentY: number, targetY: number, followLerp: number): number {
  return currentY + (targetY - currentY) * followLerp;
}

/**
 * The despawn predicate: true once the rider has cleared BOTH the camera's
 * current right edge (by `aheadCameraMarginPx`) AND the bike itself (by
 * `aheadOfBikeLeadPx`). Requiring both is what keeps a later camera
 * lookahead/zoom-out swing from ever bringing an about-to-be-culled rider
 * back on screen right before he's destroyed (see WHEELIE_RIDER's doc). Pure.
 */
export function shouldDespawnWheelieRider(
  riderX: number,
  cameraRightEdgeX: number,
  aheadCameraMarginPx: number,
  bikeX: number,
  aheadOfBikeLeadPx: number
): boolean {
  return riderX > cameraRightEdgeX + aheadCameraMarginPx && riderX > bikeX + aheadOfBikeLeadPx;
}

// ---------------------------------------------------------------------------
// Presentation-only local constants (placeholder art). Following the
// decorations.ts / pickup.ts / police.ts / tricks.ts precedent, the DRAWING
// dimensions/colors of the placeholder rider texture + the dust puff (no
// gameplay effect — PLAN-10 replaces the art) stay here rather than in
// constants.ts. The GAMEPLAY/feel tunables live in the WHEELIE_RIDER block
// (constants.ts). All lengths are px at the 1280x720 DESIGN scale.
// ---------------------------------------------------------------------------

/** Matches BootScene's tex-gabby/tex-caleb placeholder rider size (24x48), so
 * the SAME BIKE_TUNING.riderOffsetX/Y placement math used for the player's
 * own rider (bike.ts) produces an equally coherent look here. */
const RIDER_TEXTURE_WIDTH_PX = 24;
const RIDER_TEXTURE_HEIGHT_PX = 48;
/** Helmet band height across the top of the texture, px — the rest reads as
 * the suit/jacket. */
const HELMET_HEIGHT_PX = 14;
/** A thin visor stripe within the helmet band — "black ROUND/VISOR helmet"
 * (NORTH_STAR §5): a hair lighter than pure black so the helmet silhouettes
 * with a visor line rather than reading as a flat block, while staying
 * overwhelmingly black at game scale. */
const VISOR_Y_PX = 6;
const VISOR_HEIGHT_PX = 3;
const VISOR_INSET_PX = 2;
/** Near-black suit/jacket fill. */
const RIDER_BODY_COLOR = 0x141414;
/** Pure black helmet dome. */
const RIDER_HELMET_COLOR = 0x000000;
/** Dark-grey visor stripe — subtle, not a real color. */
const RIDER_VISOR_COLOR = 0x3a3a3a;
/** Dust puff peak scale (grows from 1 to this while fading — "Quad.easeOut",
 * matching police.ts's spin-out-puff style). */
const DUST_PUFF_GROW = 1.8;

/** Dedicated recolorTexture cache key for the egg's yellow motorcycle —
 * DELIBERATELY distinct from src/data/characters.ts's own `tex-bike|<id>`
 * variant-key format (even though a player could ALSO pick the 'yellow' bike
 * color): this egg's correctness must never depend on the player's own
 * character-texture cache existing/matching, only on characters.ts's
 * 'yellow' SWATCH COLOR (via resolveBike — see ensureYellowBikeTexture). */
const YELLOW_BIKE_VARIANT_KEY = 'tex-wheelie-rider-bike';

/** Recolors the shared tex-bike-base to characters.ts's dedicated 'yellow'
 * bike swatch (present specifically for this easter egg — NORTH_STAR §5 /
 * PLAN-04) via the palette-swap engine, which already guards + caches per
 * variant key (palette.ts's recolorTexture). Returns the resulting texture
 * key. Safe to call every level-11 entry — recolorTexture's own exists-check
 * makes repeat calls a cheap cache hit. */
function ensureYellowBikeTexture(scene: Phaser.Scene): string {
  const remap: ColorRemap = [{ from: MARKERS.bikeBody, to: resolveBike('yellow').color }];
  return recolorTexture(scene, TEXTURE_KEYS.bikeBase, YELLOW_BIKE_VARIANT_KEY, remap);
}

/** Generates the bespoke all-black + black-helmet rider texture the first
 * time it's needed (guarded by a key-exists check — the same lazy,
 * cache-once convention recolorTexture itself uses), rather than in
 * BootScene: this rider is confined to a single level, so there's no reason
 * to pre-generate it for every boot. Crude, clearly-separated bands (helmet
 * + visor stripe over a near-black suit) at placeholder-art fidelity —
 * matches every other TEXTURE_SPECS placeholder in this codebase (solid
 * rectangles; PLAN-10 replaces the art wholesale). */
function ensureWheelieRiderTexture(scene: Phaser.Scene): void {
  const key = TEXTURE_KEYS.wheelieRider;
  if (scene.textures.exists(key)) return;

  const gfx = scene.add.graphics();
  gfx.fillStyle(RIDER_BODY_COLOR, 1);
  gfx.fillRect(0, 0, RIDER_TEXTURE_WIDTH_PX, RIDER_TEXTURE_HEIGHT_PX);
  gfx.fillStyle(RIDER_HELMET_COLOR, 1);
  gfx.fillRect(0, 0, RIDER_TEXTURE_WIDTH_PX, HELMET_HEIGHT_PX);
  gfx.fillStyle(RIDER_VISOR_COLOR, 1);
  gfx.fillRect(VISOR_INSET_PX, VISOR_Y_PX, RIDER_TEXTURE_WIDTH_PX - VISOR_INSET_PX * 2, VISOR_HEIGHT_PX);
  gfx.generateTexture(key, RIDER_TEXTURE_WIDTH_PX, RIDER_TEXTURE_HEIGHT_PX);
  gfx.destroy();
}

// ---------------------------------------------------------------------------
// Runtime factory (calls scene/ctx methods only — see module doc).
// ---------------------------------------------------------------------------

/** Matter world per-engine-step event — the SAME fixed 60 Hz hook
 * bike.ts/traffic.ts/police.ts drive their rate-based work off. String
 * literal on purpose: the named constant lives on the runtime Phaser module
 * this file must not import. */
const BEFORE_UPDATE_EVENT = 'beforeupdate';

/** DEV-only live snapshot the browser playtest harness
 * (scripts/playtest-level11.mjs) reads off the scene to script + assert the
 * pass (stripped from prod builds via import.meta.env.DEV, same as
 * __police/__pickup/__traffic/__tricks). */
interface WheelieRiderDebug {
  /** The resolved trigger x (event.x ?? worldLength/2) — fixed for the run. */
  triggerX: number;
  /** How many times the rider has spawned this run — must be exactly 1 for
   * a completed pass (the state machine structurally can't exceed 1; the
   * harness asserts it empirically anyway). */
  spawnCount(): number;
  /** True from the trigger instant until despawn. */
  active(): boolean;
  /** True once cleanup has run (GameObjects destroyed) — stays true forever
   * after (the rider never reappears). */
  despawned(): boolean;
  /** Current world x of the rider's rear-wheel ground-contact point, or
   * null before the first spawn / after despawn. */
  riderX(): number | null;
  /** The recolored-yellow bike-base texture key actually applied. */
  bikeTextureKey: string;
  /** The bespoke all-black + black-helmet rider texture key actually
   * applied. */
  riderTextureKey: string;
}

/**
 * Builds level 11's guaranteed, non-interactive wheelie-rider easter egg and
 * returns a {@link LevelEventHandle} GameScene drives. `scene`/`ctx` are
 * runtime handles only (same contract as createBike/createPolice). NO Matter
 * body is created — the whole rig is a Container of plain Images, plus
 * tween-driven dust Graphics. Motion, the ground-follow glide, dust timing,
 * and the trigger/despawn checks all run on the Matter world's fixed 60 Hz
 * `beforeupdate` step (registered here, removed in destroy()), so the pass
 * plays out identically at any display refresh rate — same discipline as
 * bike.ts/traffic.ts/police.ts. Never calls ctx.softFail or
 * ctx.setInputOverride — this egg can NEVER fail the player or touch input.
 */
export function createWheelieRider(
  scene: Phaser.Scene,
  event: WheelieRiderEvent,
  ctx: EventContext
): LevelEventHandle {
  const triggerX = resolveWheelieRiderTriggerX(event.x, ctx.worldLength);
  const bikeFullGasTopSpeed = BIKE_TUNING.maxWheelAngularVelocity * BIKE_TUNING.wheelRadius;
  const speedPxPerStep = wheelieRiderTopSpeedPxPerStep(bikeFullGasTopSpeed, WHEELIE_RIDER.speedMultiplier);
  const stepMs = 1000 / WHEELIE_RIDER.fps;

  // Prepared eagerly (guarded/cached, cheap) so the very first trigger never
  // hitches on texture generation.
  ensureWheelieRiderTexture(scene);
  const bikeTextureKey = ensureYellowBikeTexture(scene);
  const riderTextureKey = TEXTURE_KEYS.wheelieRider;

  let triggered = false;
  let spawnCount = 0;
  let despawned = false;
  let riderX = 0;
  let riderGroundY = 0;
  let dustAccumMs = 0;

  // Every GameObject the rig creates (the container + any live dust puffs) is
  // tracked so destroy() can tear them all down on level teardown/restart/
  // despawn (double-destroy is safe — Phaser guards it; killTweensOf([]) is a
  // harmless no-op). Mirrors police.ts's `objects` + `track()` convention.
  const objects: Phaser.GameObjects.GameObject[] = [];
  function track<T extends Phaser.GameObjects.GameObject>(obj: T): T {
    objects.push(obj);
    return obj;
  }
  function untrack(obj: Phaser.GameObjects.GameObject): void {
    const index = objects.indexOf(obj);
    if (index >= 0) objects.splice(index, 1);
  }

  let container: Phaser.GameObjects.Container | undefined;

  /** Composes the wheelie rig — rear wheel, front wheel, recolored chassis,
   * bespoke rider — into one Container whose LOCAL ORIGIN (0,0) is the rear
   * wheel's ground-contact point, so rotating the container by
   * WHEELIE_RIDER.pitchDeg pivots almost exactly there: the rear wheel stays
   * near-planted while the front visibly lifts — the wheelie's signature
   * (NORTH_STAR §5). Geometry reuses BIKE_TUNING's own wheelbase/wheelRadius/
   * wheelDropPx/riderOffsetX/Y so the composite reads as "the same bike",
   * just recolored + posed. */
  function spawn(): void {
    const cam = scene.cameras.main;
    riderX = wheelieRiderSpawnX(cam.worldView.left, WHEELIE_RIDER.spawnBehindCameraMarginPx);
    riderGroundY = ctx.terrain.heightAt(riderX);

    const rearWheel = scene.add.image(0, -BIKE_TUNING.wheelRadius, TEXTURE_KEYS.wheel);
    const frontWheel = scene.add.image(BIKE_TUNING.wheelbase, -BIKE_TUNING.wheelRadius, TEXTURE_KEYS.wheel);
    const chassisLocalY = -(BIKE_TUNING.wheelRadius + BIKE_TUNING.wheelDropPx);
    const chassis = scene.add.image(BIKE_TUNING.wheelbase / 2, chassisLocalY, bikeTextureKey);
    const rider = scene.add.image(
      BIKE_TUNING.wheelbase / 2 + BIKE_TUNING.riderOffsetX,
      chassisLocalY + BIKE_TUNING.riderOffsetY,
      riderTextureKey
    );

    container = track(
      scene.add
        .container(riderX, riderGroundY, [rearWheel, frontWheel, chassis, rider])
        .setAngle(WHEELIE_RIDER.pitchDeg)
        // DEPTHS.props — same layer traffic cars / the police car already use,
        // which sits BELOW the player's own bike (DEPTHS.bike) and rider
        // (DEPTHS.rider): the egg reads as sharing the road but can never draw
        // OVER Gabby in a way that looks like a collision, whatever their
        // momentary x-overlap during the overtake (traffic/police precedent —
        // see the PLAN-07 brief).
        .setDepth(DEPTHS.props)
    );

    spawnCount++;
  }

  /** One small dust puff behind the rear wheel — world-space (NOT a child of
   * `container`, so it never inherits the wheelie pitch), spawned/tweened/
   * self-destroyed like pickup.ts's heart or police.ts's spin-out puff. */
  function spawnDustPuff(): void {
    const x = riderX - WHEELIE_RIDER.dustTrailBehindPx;
    const y = riderGroundY;
    const puff = track(scene.add.graphics().setDepth(DEPTHS.fx));
    // dustyTan (not police.ts's overcast grey — level 11's 'highway' theme
    // ground is PALETTE.slate, a near-identical grey that swallowed overcast
    // puffs in an early browser check) reads clearly as dust against every
    // theme's ground tone.
    puff.fillStyle(PALETTE.dustyTan, WHEELIE_RIDER.dustAlpha);
    puff.fillCircle(0, 0, WHEELIE_RIDER.dustRadiusPx);
    puff.setPosition(x, y);
    scene.tweens.add({
      targets: puff,
      y: y - WHEELIE_RIDER.dustRisePx,
      alpha: 0,
      scale: DUST_PUFF_GROW,
      duration: WHEELIE_RIDER.dustLifetimeMs,
      ease: 'Quad.easeOut',
      onComplete: () => {
        untrack(puff);
        puff.destroy();
      },
    });
  }

  /** Tears down every live GameObject (the container + any still-flying dust
   * puffs). Idempotent: a second call sees an empty `objects` and no-ops. */
  function destroyVisuals(): void {
    scene.tweens.killTweensOf(objects);
    for (const obj of objects) obj.destroy();
    objects.length = 0;
    container = undefined;
  }

  // DEV-only: expose live state for scripts/playtest-level11.mjs. Stashed on
  // the scene (which persists across scene.restart()); prod builds skip this
  // whole branch (Vite dead-code-eliminates `import.meta.env.DEV`).
  const devScene = scene as unknown as { __wheelieRider?: WheelieRiderDebug };
  if (import.meta.env.DEV) {
    devScene.__wheelieRider = {
      triggerX,
      spawnCount: () => spawnCount,
      active: () => triggered && !despawned,
      despawned: () => despawned,
      riderX: () => (triggered && !despawned ? riderX : null),
      bikeTextureKey,
      riderTextureKey,
    };
  }

  /** Runs once per fixed physics step (see BEFORE_UPDATE_EVENT). Before the
   * trigger: just watches for the grounded+moving+past-x condition. After:
   * integrates the constant-speed pass, the damped ground-follow, the dust
   * timer, and the despawn check — never touches input, never soft-fails. */
  function onBeforeUpdate(): void {
    // Defensive: the Matter world keeps stepping after a fail/finish even
    // though GameScene stops calling handle.update() — never drive (or even
    // trigger) the egg once the run has ended (see EventContext.isEnded).
    if (ctx.isEnded()) return;

    if (!triggered) {
      if (
        shouldTriggerWheelieRider(
          ctx.bike.x,
          triggerX,
          ctx.bike.airborne,
          ctx.bike.speed,
          WHEELIE_RIDER.triggerMinSpeedPxPerStep
        )
      ) {
        triggered = true;
        spawn();
      }
      return; // nothing more to do the very step it does (or doesn't) trigger
    }

    if (despawned) return; // inert forever once culled — never reappears

    riderX += wheelieRiderDisplacement(speedPxPerStep, stepMs, WHEELIE_RIDER.fps);
    riderGroundY = wheelieRiderNextGroundY(
      riderGroundY,
      ctx.terrain.heightAt(riderX),
      WHEELIE_RIDER.groundFollowLerp
    );
    container?.setPosition(riderX, riderGroundY);

    dustAccumMs += stepMs;
    if (dustAccumMs >= WHEELIE_RIDER.dustIntervalMs) {
      dustAccumMs -= WHEELIE_RIDER.dustIntervalMs;
      spawnDustPuff();
    }

    const cam = scene.cameras.main;
    if (
      shouldDespawnWheelieRider(
        riderX,
        cam.worldView.right,
        WHEELIE_RIDER.despawnAheadCameraMarginPx,
        ctx.bike.x,
        WHEELIE_RIDER.despawnAheadOfBikeLeadPx
      )
    ) {
      despawned = true;
      destroyVisuals();
    }
  }
  scene.matter.world.on(BEFORE_UPDATE_EVENT, onBeforeUpdate);

  function update(): void {
    // No-op: all trigger/motion/despawn logic runs on the fixed-step
    // beforeupdate hook above (refresh-independent). The seam still calls
    // this every render frame.
  }

  function destroy(): void {
    // Remove the world listener FIRST (no callbacks during teardown). Same
    // rationale as traffic.ts/police.ts: on the normal shutdown/restart path
    // Phaser's Matter plugin has already destroyed the world (taking every
    // world listener with it) and nulled scene.matter.world by the time this
    // runs, so off() is only needed (and only safe) if the world somehow
    // survived.
    const world = scene.matter.world as Phaser.Physics.Matter.World | null;
    if (world) world.off(BEFORE_UPDATE_EVENT, onBeforeUpdate);
    destroyVisuals();
    if (import.meta.env.DEV) delete devScene.__wheelieRider;
  }

  return { update, destroy };
}
