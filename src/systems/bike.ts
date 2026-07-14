// The bike rig (PLAN-02 task 2) — the single most feel-critical module in
// the game. Builds the Matter composite (chassis + head fail-sensor as one
// compound body, two sprung wheels), drives it from {gas, brake} input
// (recorded per render frame, applied once per fixed 60 Hz physics step —
// see BEFORE_UPDATE_EVENT), tracks airborne state + cumulative airborne
// rotation (trick detection, PLAN-07), and DETECTS head-vs-terrain crashes. It deliberately
// does NOT render fail overlays, restart anything, or check the world-bottom
// fail — those are the consuming GameScene's job (PLAN-02 task 4); this
// module only exposes the signals (`crashed`, `onCrash`).
//
// IMPORTANT — this file must have NO RUNTIME import of 'phaser'. Vitest runs
// in plain Node (no DOM/WebGL); importing the real Phaser module there
// crashes. `import type Phaser` below is erased entirely at compile time, so
// the pure helpers (angle math, wheel/chassis control laws, spawn-height
// math) stay importable from tests/bike.test.ts. `createBike` only ever
// CALLS METHODS on a `scene` object handed to it at runtime by the real
// (browser-side) caller — same pattern as terrain.ts.
import type Phaser from 'phaser';
import { BIKE_TUNING, DEPTHS, TEXTURE_KEYS } from './constants';
import { TERRAIN_BODY_LABEL } from './terrain';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Per-frame player input, fed to {@link BikeHandle.update} by the scene.
 * Just the two pedals — the whole game is gas/brake only (NORTH_STAR §4). */
export interface BikeInput {
  /** Right pedal: drive forward on the ground, pitch nose-UP (backflip
   * direction) in the air. */
  gas: boolean;
  /** Left pedal: brake (then mild reverse once stopped) on the ground,
   * pitch nose-DOWN in the air. Wins over gas if both are held. */
  brake: boolean;
}

/** Optional hooks for {@link createBike}. */
export interface BikeOptions {
  /** Called exactly once, the moment the head sensor first touches a
   * terrain body. The scene shows the friendly fail overlay + restarts;
   * the bike itself just goes limp (input is ignored from then on, physics
   * keeps tumbling until `destroy()`). */
  onCrash?: () => void;
}

/** Everything a scene needs after spawning the bike. All getters are live
 * (re-read them each frame; they reflect the physics bodies directly). */
export interface BikeHandle {
  /** Records this frame's pedal input and re-pins the sprites to their
   * bodies. Call once per scene update() (render frame). The control laws
   * themselves run on the Matter world's 'beforeupdate' hook — exactly
   * once per fixed 60 Hz physics step — so acceleration/flip rates are
   * identical on a 120 Hz phone, a 60 Hz desktop, or under frame drops. */
  update(input: BikeInput): void;
  /** Chassis center x, px (world space). */
  readonly x: number;
  /** Chassis center y, px (world space). */
  readonly y: number;
  /** Chassis rotation, radians (0 = upright, positive = clockwise /
   * nose-down when facing right). Unwrapped by Matter — may exceed ±π
   * after flips. */
  readonly angle: number;
  /** Chassis linear speed, px per physics step (magnitude, always ≥ 0). */
  readonly speed: number;
  /** Signed horizontal velocity, px per physics step — camera lookahead
   * (PLAN-02 task 3) wants the travel DIRECTION, which `speed` discards. */
  readonly velocityX: number;
  /** True while NEITHER wheel is touching a terrain body. */
  readonly airborne: boolean;
  /** Cumulative signed chassis rotation (radians) accumulated during the
   * CURRENT airborne phase — or, once landed, during the most recent one.
   * Reset happens at TAKEOFF, not landing, so trick detection (PLAN-07)
   * and the debug overlay can still read a completed flip's total after
   * touchdown. ~±2π after a full flip. */
  readonly airborneRotation: number;
  /** True once the head sensor has touched terrain. Latches on; a crashed
   * bike ignores input (scene restarts via destroy() + createBike()). */
  readonly crashed: boolean;
  /** The chassis compound body (chassis rect + head sensor part) — for
   * camera follow targets or scripted-event forces. */
  readonly chassis: MatterJS.BodyType;
  /** Every top-level Matter body this bike added to the world (chassis
   * compound, rear wheel, front wheel) — the debug overlay's body-leak
   * check (PLAN-02 task 5) counts against this. A fresh array per read;
   * mutating it never affects the rig. */
  readonly bodies: MatterJS.BodyType[];
  /** Removes ALL bodies, constraints, sprites, and world event listeners
   * this bike registered. Safe to call twice. After destroy(), update()
   * is a no-op — restart = destroy() + createBike() with no leaks (the
   * PLAN-02 "no physics body leaks after 3 restarts" criterion).
   * The consuming scene should ALSO call this from its shutdown handler
   * as a backstop, so the world listeners can never accumulate if some
   * restart path forgets an explicit destroy(). */
  destroy(): void;
}

// ---------------------------------------------------------------------------
// Pure helpers — no Phaser/Matter/DOM, unit-tested in tests/bike.test.ts.
// ---------------------------------------------------------------------------

const TWO_PI = Math.PI * 2;

/** Wraps any angle into [-π, π). Pure. */
export function normalizeAngle(radians: number): number {
  return ((((radians + Math.PI) % TWO_PI) + TWO_PI) % TWO_PI) - Math.PI;
}

/** Shortest signed rotation (radians, in [-π, π)) that would bring a
 * chassis at `angle` back to upright (0). Feeding this to a corrective
 * spring has a deliberately friendly property: a bike that is already
 * MORE than halfway through a flip gets pushed ONWARD to complete it
 * rather than yanked backward — the assist finishes your flips for you. */
export function shortestArcToUpright(angle: number): number {
  return normalizeAngle(-angle);
}

/** One step of airborne-rotation bookkeeping: adds the frame's signed
 * angle delta (wrap-safe, so crossing ±π doesn't spuriously add ~2π) to
 * the running total. Assumes < half a revolution per step — at
 * maxAirAngularVelocity (0.12 rad/step) that leaves ~26x headroom. */
export function accumulateAirborneRotation(
  accumulated: number,
  previousAngle: number,
  currentAngle: number
): number {
  return accumulated + normalizeAngle(currentAngle - previousAngle);
}

/**
 * The wheel control law: given a wheel's current angular velocity
 * (rad/step) and the pedals, returns next step's angular velocity.
 * `driven` = the rear wheel (gets gas spin-up and the reverse creep);
 * the front wheel only ever receives brake damping.
 *
 * - Brake (wins over gas): multiplicative damping toward zero — except
 *   the driven wheel, once near-stopped, creeps gently BACKWARD up to
 *   maxReverseWheelAngularVelocity ("when stopped, mild reverse").
 * - Gas: fixed spin-up per step (the torque limit) capped at
 *   maxWheelAngularVelocity. A wheel already spinning faster than the cap
 *   (e.g. rolling downhill) is left alone rather than clamped down, so
 *   holding gas downhill never acts as a surprise brake.
 * - Neither: unchanged — friction/physics own coasting.
 */
export function nextWheelAngularVelocity(
  current: number,
  gas: boolean,
  brake: boolean,
  driven: boolean
): number {
  if (brake) {
    const withinReverseBand =
      current <= BIKE_TUNING.reverseEngageThreshold &&
      current >= -BIKE_TUNING.maxReverseWheelAngularVelocity;
    if (driven && withinReverseBand) {
      return Math.max(
        current - BIKE_TUNING.reverseSpinUpPerStep,
        -BIKE_TUNING.maxReverseWheelAngularVelocity
      );
    }
    // Also covers rolling backward FASTER than the reverse cap (e.g. after
    // sliding back down a hill): damp toward zero like any other braking.
    return current * (1 - BIKE_TUNING.brakeDampingFactor);
  }
  if (gas && driven && current < BIKE_TUNING.maxWheelAngularVelocity) {
    return Math.min(
      current + BIKE_TUNING.gasSpinUpPerStep,
      BIKE_TUNING.maxWheelAngularVelocity
    );
  }
  return current;
}

/**
 * The airborne chassis control law: given the chassis' current angular
 * velocity (rad/step) and angle, returns next step's angular velocity.
 * Only ever applied while airborne — grounded pitch belongs to real
 * physics (wheel grip, suspension), never to this.
 *
 * - A pedal held: fixed pitch step (gas = nose-up/backflip = negative in
 *   screen coords, brake = nose-down = positive). A step that would
 *   overshoot maxAirAngularVelocity lands exactly ON the cap (symmetric
 *   with the wheel law's top-speed clamp); spin already beyond the cap
 *   (violent bounce) is held rather than snapped back, and pedaling back
 *   down from beyond it is always allowed.
 *   Both pedals held cancel to zero input (and no assist — the player is
 *   clearly "doing something").
 * - No pedal held: the auto-stabilization assist (NORTH_STAR "easy"
 *   mandate) — a weak spring toward upright (via shortestArcToUpright, so
 *   past-halfway flips complete instead of reversing) plus damping so the
 *   bike settles level instead of oscillating.
 */
export function airborneChassisAngularVelocity(
  current: number,
  angle: number,
  gas: boolean,
  brake: boolean
): number {
  if (gas || brake) {
    const direction = (brake ? 1 : 0) - (gas ? 1 : 0);
    const next = current + direction * BIKE_TUNING.airSpinStepPerStep;
    const cap = BIKE_TUNING.maxAirAngularVelocity;
    if (Math.abs(next) <= cap || Math.abs(next) < Math.abs(current)) {
      // Within the cap, or pedaling back DOWN from beyond it — allowed.
      return next;
    }
    // The step would overshoot the cap: land exactly ON it — unless spin
    // is ALREADY beyond the cap (violent bounce), which is held rather
    // than snapped back.
    return Math.abs(current) >= cap ? current : Math.sign(next) * cap;
  }
  const sprung =
    current + BIKE_TUNING.stabilizationGain * shortestArcToUpright(angle);
  return sprung * (1 - BIKE_TUNING.stabilizationDamping);
}

/** The chassis-center spawn y for a bike whose wheels should hover just
 * above the ground surface at `groundSurfaceY` (e.g. `terrain.heightAt(x)`).
 * Includes spawnClearancePx of air on purpose: terrain's physics chain is
 * coarser than its visual polyline, so in a trough the collision surface
 * can sit slightly ABOVE heightAt(x) — spawning with clearance (and on a
 * flat zone, where visual == physics) avoids ever spawning intersecting
 * the ground. The bike just settles onto its suspension for a frame or two. */
export function bikeSpawnY(groundSurfaceY: number): number {
  return (
    groundSurfaceY -
    (BIKE_TUNING.wheelDropPx + BIKE_TUNING.wheelRadius + BIKE_TUNING.spawnClearancePx)
  );
}

// ---------------------------------------------------------------------------
// Matter construction (never imports Phaser at runtime — see module doc).
// ---------------------------------------------------------------------------

/** Matter labels for the bike's own bodies/parts — debugging aids; the
 * collision logic below compares body REFERENCES, not these strings. */
const CHASSIS_LABEL = 'bike-chassis';
const HEAD_LABEL = 'bike-head';
const REAR_WHEEL_LABEL = 'bike-wheel-rear';
const FRONT_WHEEL_LABEL = 'bike-wheel-front';

/** Matter world collision event names. String literals on purpose: the
 * named constants live on the runtime Phaser module
 * (Phaser.Physics.Matter.Events.COLLISION_START/END), which this file must
 * not import (see module doc comment). */
const COLLISION_START_EVENT = 'collisionstart';
const COLLISION_END_EVENT = 'collisionend';

/** Fired by the Phaser Matter world exactly once per ENGINE STEP: Phaser's
 * World.update() runs a fixed-timestep accumulator (0..N Engine.update
 * calls per render frame, each 1000/60 ms), and each Engine.update emits
 * Matter's 'beforeUpdate', which World relays as this event (verified in
 * phaser/src/physics/matter-js/World.js — the stepping loop and the relay).
 * All rate-based control-law work hooks THIS, never the render-frame
 * update(): per-step increments applied per render frame would run ~2x hot
 * on a 120 Hz phone and ~0.5x under 30 fps frame drops. */
const BEFORE_UPDATE_EVENT = 'beforeupdate';

/** Matter's default collision category/mask ("collide with everything").
 * Spelled out because the ambient ICollisionFilter type requires all three
 * fields — only `group` is actually meaningful to the bike. */
const DEFAULT_COLLISION_CATEGORY = 0x0001;
const DEFAULT_COLLISION_MASK = 0xffffffff;

/** The bike's collision filter: default category/mask, plus the per-bike
 * non-colliding group that stops wheels colliding with the chassis. */
function bikeCollisionFilter(group: number): {
  group: number;
  category: number;
  mask: number;
} {
  return {
    group,
    category: DEFAULT_COLLISION_CATEGORY,
    mask: DEFAULT_COLLISION_MASK,
  };
}

/** Structural stand-ins for Phaser's Matter collision event payloads —
 * just the fields the handlers below touch. Keeps the handlers decoupled
 * from the exact Phaser event type names while staying fully typed. */
interface CollisionPairLike {
  bodyA: MatterJS.BodyType;
  bodyB: MatterJS.BodyType;
}
interface CollisionEventLike {
  pairs: CollisionPairLike[];
}

/**
 * Spawns the bike with its chassis centered at (x, y) — pass
 * `bikeSpawnY(terrain.heightAt(x))` for y to sit the wheels just above the
 * ground (see its doc comment for why the clearance exists).
 *
 * Composite anatomy:
 * - ONE compound body: the chassis rect + a small `isSensor` head circle
 *   near the rider's head. A sensor part rides the compound rigidly (no
 *   constraint slop), reports collisions, and — being a sensor with
 *   near-zero density — never affects the bike's dynamics.
 * - TWO wheel bodies, each hung on two constraints: a soft vertical spring
 *   (the suspension travel) + a stiffer diagonal strut to the chassis
 *   center (triangulates the wheel so the wheelbase can't fold fore/aft).
 * - All bike bodies share one non-colliding Matter group, so wheels never
 *   collide with the chassis they overlap.
 * - Sprites (wheels, chassis, rider) are visual-only and re-pinned to the
 *   bodies every update(); the rider has NO physics body of her own — the
 *   head sensor is the only "rider physics".
 *
 * `scene` is used purely as a runtime handle to Phaser's factories (same
 * contract as terrain.ts's createTerrain).
 */
export function createBike(
  scene: Phaser.Scene,
  x: number,
  y: number,
  options: BikeOptions = {}
): BikeHandle {
  const t = BIKE_TUNING;
  const onCrashCallback = options.onCrash;

  // One negative group per bike instance: members of the same negative
  // group never collide with each other (wheels overlap the chassis).
  const group = scene.matter.body.nextGroup(true);

  // --- chassis compound: rect + head sensor -------------------------------
  // scene.matter.bodies.* are pure factories (nothing enters the world
  // until world.add below) — required for compound assembly.
  const chassisPart = scene.matter.bodies.rectangle(
    x,
    y,
    t.chassisWidth,
    t.chassisHeight,
    {
      label: CHASSIS_LABEL,
      density: t.chassisDensity,
      friction: t.chassisFriction,
      collisionFilter: bikeCollisionFilter(group),
    }
  );
  const headPart = scene.matter.bodies.circle(
    x + t.headOffsetX,
    y + t.headOffsetY,
    t.headSensorRadius,
    {
      label: HEAD_LABEL,
      isSensor: true,
      density: t.headSensorDensity, // near-zero: must not move the COM
      collisionFilter: bikeCollisionFilter(group),
    }
  );
  const chassis = scene.matter.body.create({
    parts: [chassisPart, headPart],
    collisionFilter: bikeCollisionFilter(group),
  });
  scene.matter.world.add(chassis);

  // --- wheels --------------------------------------------------------------
  const wheelOptions = {
    density: t.wheelDensity,
    friction: t.wheelFriction,
    restitution: t.wheelRestitution,
    collisionFilter: bikeCollisionFilter(group),
  };
  const rearWheel = scene.matter.add.circle(
    x - t.wheelbase / 2,
    y + t.wheelDropPx,
    t.wheelRadius,
    { ...wheelOptions, label: REAR_WHEEL_LABEL }
  );
  const frontWheel = scene.matter.add.circle(
    x + t.wheelbase / 2,
    y + t.wheelDropPx,
    t.wheelRadius,
    { ...wheelOptions, label: FRONT_WHEEL_LABEL }
  );

  // --- suspension ----------------------------------------------------------
  // pointA offsets are relative to the compound's center of mass, which is
  // the chassis rect's center to within ~0.05px (the head sensor part's
  // density is near-zero — see headSensorDensity's doc comment).
  const strutLength = Math.hypot(t.wheelbase / 2, t.wheelDropPx);
  function hangWheel(wheel: MatterJS.BodyType, sideSign: -1 | 1): MatterJS.ConstraintType[] {
    const spring = scene.matter.add.constraint(
      chassis,
      wheel,
      t.wheelDropPx,
      t.suspensionStiffness,
      {
        pointA: { x: (sideSign * t.wheelbase) / 2, y: 0 },
        pointB: { x: 0, y: 0 },
        damping: t.suspensionDamping,
      }
    );
    const strut = scene.matter.add.constraint(
      chassis,
      wheel,
      strutLength,
      t.strutStiffness,
      {
        pointA: { x: 0, y: 0 },
        pointB: { x: 0, y: 0 },
        damping: t.strutDamping,
      }
    );
    return [spring, strut];
  }
  const constraints = [...hangWheel(rearWheel, -1), ...hangWheel(frontWheel, 1)];

  // --- sprites (visual only) ----------------------------------------------
  // Wheels are added before the chassis so that, at equal depth, the
  // chassis renders on top of the wheel discs.
  const rearSprite = scene.add
    .image(rearWheel.position.x, rearWheel.position.y, TEXTURE_KEYS.wheel)
    .setDepth(DEPTHS.bike);
  const frontSprite = scene.add
    .image(frontWheel.position.x, frontWheel.position.y, TEXTURE_KEYS.wheel)
    .setDepth(DEPTHS.bike);
  const chassisSprite = scene.add
    .image(x, y, TEXTURE_KEYS.bike)
    .setDepth(DEPTHS.bike);
  const riderSprite = scene.add
    .image(x + t.riderOffsetX, y + t.riderOffsetY, TEXTURE_KEYS.gabby)
    .setDepth(DEPTHS.rider);

  // --- collision tracking ---------------------------------------------------
  // Counts (not booleans): a wheel can rest on two adjacent terrain
  // segments at once, producing two start events but only one end when it
  // leaves one of them.
  let rearContacts = 0;
  let frontContacts = 0;
  let crashed = false;
  let destroyed = false;
  let airborne = false;
  let airborneRotation = 0;
  let previousAngle = chassis.angle;
  // Latest pedal state, recorded per RENDER frame by update() and consumed
  // per PHYSICS step by onBeforeUpdate below (field copies, so a caller
  // mutating/reusing its input object between frames can't surprise us).
  let gasHeld = false;
  let brakeHeld = false;

  function applyPairDelta(
    mine: MatterJS.BodyType,
    other: MatterJS.BodyType,
    delta: number
  ): void {
    if (other.label !== TERRAIN_BODY_LABEL) return;
    if (mine === rearWheel) {
      rearContacts = Math.max(0, rearContacts + delta);
    } else if (mine === frontWheel) {
      frontContacts = Math.max(0, frontContacts + delta);
    } else if (mine === headPart && delta > 0 && !crashed) {
      // Matter reports collisions per compound PART, so the sensor part
      // arrives here directly — no need to dig through body.parts.
      crashed = true;
      onCrashCallback?.();
    }
  }

  function makeCollisionHandler(delta: number): (event: CollisionEventLike) => void {
    return (event: CollisionEventLike): void => {
      for (const pair of event.pairs) {
        applyPairDelta(pair.bodyA, pair.bodyB, delta);
        applyPairDelta(pair.bodyB, pair.bodyA, delta);
      }
    };
  }
  const onCollisionStart = makeCollisionHandler(1);
  const onCollisionEnd = makeCollisionHandler(-1);
  scene.matter.world.on(COLLISION_START_EVENT, onCollisionStart);
  scene.matter.world.on(COLLISION_END_EVENT, onCollisionEnd);

  // --- per-frame drive + bookkeeping ---------------------------------------
  function syncSprites(): void {
    const angle = chassis.angle;
    chassisSprite.setPosition(chassisPart.position.x, chassisPart.position.y);
    chassisSprite.setRotation(angle);
    rearSprite.setPosition(rearWheel.position.x, rearWheel.position.y);
    rearSprite.setRotation(rearWheel.angle);
    frontSprite.setPosition(frontWheel.position.x, frontWheel.position.y);
    frontSprite.setRotation(frontWheel.angle);
    // Rider: chassis-local offset rotated into world space.
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    riderSprite.setPosition(
      chassisPart.position.x + t.riderOffsetX * cos - t.riderOffsetY * sin,
      chassisPart.position.y + t.riderOffsetX * sin + t.riderOffsetY * cos
    );
    riderSprite.setRotation(angle);
  }

  /** All rate-based work lives HERE, on the world's per-engine-step hook
   * (see BEFORE_UPDATE_EVENT) — never in the render-frame update() — so
   * the rad/step control laws and the airborne-rotation sampling run
   * exactly once per fixed 60 Hz physics step at any display refresh
   * rate. Runs just before the step consumes the velocities it sets. */
  function onBeforeUpdate(): void {
    // A crashed bike goes limp: pedals ignored, assist off, physics keeps
    // tumbling until the scene restarts. (Friendlier than freezing it.)
    const gas = !crashed && gasHeld;
    const brake = !crashed && brakeHeld;

    // Wheel spin is driven in the air too — harmless (setting a wheel's
    // angular velocity applies no reaction torque to the chassis), and a
    // spinning rear wheel bites immediately on landing, which feels right.
    const nextRear = nextWheelAngularVelocity(rearWheel.angularVelocity, gas, brake, true);
    if (nextRear !== rearWheel.angularVelocity) {
      scene.matter.setAngularVelocity(rearWheel, nextRear);
    }
    const nextFront = nextWheelAngularVelocity(frontWheel.angularVelocity, gas, brake, false);
    if (nextFront !== frontWheel.angularVelocity) {
      scene.matter.setAngularVelocity(frontWheel, nextFront);
    }

    const airborneNow = rearContacts === 0 && frontContacts === 0;
    if (airborneNow) {
      if (!airborne) {
        // Takeoff: discard the PREVIOUS air phase's total now — not at
        // landing — so trick detection can read a finished flip's rotation
        // any time after touchdown (see BikeHandle.airborneRotation).
        airborneRotation = 0;
      }
      airborneRotation = accumulateAirborneRotation(airborneRotation, previousAngle, chassis.angle);
      if (!crashed) {
        scene.matter.setAngularVelocity(
          chassis,
          airborneChassisAngularVelocity(chassis.angularVelocity, chassis.angle, gas, brake)
        );
      }
    }
    previousAngle = chassis.angle;
    airborne = airborneNow;
  }
  scene.matter.world.on(BEFORE_UPDATE_EVENT, onBeforeUpdate);

  function update(input: BikeInput): void {
    if (destroyed) return;
    gasHeld = input.gas;
    brakeHeld = input.brake;
    // Sprite pinning stays per RENDER frame (not per physics step) so the
    // visuals track the freshest body transforms every drawn frame.
    syncSprites();
  }

  // --- teardown -------------------------------------------------------------
  function destroy(): void {
    if (destroyed) return;
    destroyed = true;
    // Listeners first (no callbacks during teardown), then constraints
    // (never leave one dangling on a removed body), then bodies, sprites.
    scene.matter.world.off(BEFORE_UPDATE_EVENT, onBeforeUpdate);
    scene.matter.world.off(COLLISION_START_EVENT, onCollisionStart);
    scene.matter.world.off(COLLISION_END_EVENT, onCollisionEnd);
    for (const constraint of constraints) {
      scene.matter.world.removeConstraint(constraint);
    }
    scene.matter.world.remove([chassis, rearWheel, frontWheel]);
    chassisSprite.destroy();
    rearSprite.destroy();
    frontSprite.destroy();
    riderSprite.destroy();
  }

  return {
    update,
    destroy,
    get x() {
      return chassisPart.position.x;
    },
    get y() {
      return chassisPart.position.y;
    },
    get angle() {
      return chassis.angle;
    },
    get speed() {
      return Math.hypot(chassis.velocity.x, chassis.velocity.y);
    },
    get velocityX() {
      return chassis.velocity.x;
    },
    get airborne() {
      return airborne;
    },
    get airborneRotation() {
      return airborneRotation;
    },
    get crashed() {
      return crashed;
    },
    chassis,
    get bodies() {
      // Fresh copy per read — consumers can't corrupt the rig's own list.
      return [chassis, rearWheel, frontWheel];
    },
  };
}
