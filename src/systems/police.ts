// Level 15 "City Boulevard" police chase (PLAN-06 Task 3). A single police car
// pursues Gabby (+ pillion Caleb) from behind with a RUBBER-BAND speed law:
// holding gas ALWAYS pulls away (the cop's hard-cap speed is a fraction < 1 of
// the bike's full-gas top speed), while stopping/crashing/long-slow lets the cop
// close. Getting caught (cop within catchDistancePx CONTINUOUSLY for > catchTimeMs)
// is a friendly soft-fail with verbatim personal copy + an instant restart
// (GameScene's softFail handles the overlay + restart). Crossing the finish flag
// plays a cop spin-out puff + a "WOOHOO!" escape toast (the onFinish finale).
//
// ZERO Matter bodies: the cop, its flashing lights, and the spin-out puff are all
// plain Phaser GameObjects (Image/Rectangle/Graphics/Text), so they never touch
// NORTH_STAR §8's <100-body budget — level 15 (14000px) is already ~86 bodies with
// the bike, and the cop adds NONE. "Collision"/catch is a MANUAL JS distance check
// against ctx.bike.x each fixed step (see isCopOnBike), never a Matter contact.
//
// Frame-rate independence (see the PLAN-06 design brief): the cop's x-integration
// runs on the SAME fixed 60 Hz `scene.matter.world.on('beforeupdate', ...)` step
// the bike drives its control laws off (registered here, REMOVED in destroy() so
// it can't leak across scene.restart() — mirrors bike.ts / traffic.ts). A cop moved
// per RENDER frame would run ~2x fast on a 120 Hz phone, silently making the chase
// harder/easier per display — the exact hazard bike.ts / traffic.ts avoid.
//
// Like bike.ts / terrain.ts / traffic.ts / pickup.ts (and UNLIKE decorations.ts),
// this module has NO runtime Phaser import and does NOT import ui.ts — its only
// non-type imports are the pure constants — so it stays import-safe in Node. The
// pure helpers below (the rubber-band speed law, the hard-cap, refresh-independent
// displacement, the catch timer, the rolling-average window) are therefore unit-
// tested directly in tests/police.test.ts; the createPolice factory only ever
// CALLS METHODS on the runtime scene/ctx handles handed to it (same contract as
// createBike). It draws the "WOOHOO!" toast through a tiny local pixel-text helper
// (replicating ui.ts's createPixelText from the shared font constants) rather than
// importing ui.ts, exactly so the pure helpers stay Node-testable.
import type Phaser from 'phaser';
import {
  POLICE,
  BIKE_TUNING,
  TEXTURE_KEYS,
  DEPTHS,
  PALETTE,
  DESIGN_WIDTH,
  FONT_STACK_PIXEL,
  TEXT_COLOR,
  snapFontSize,
} from './constants';
import type { LevelEventHandle, EventContext } from '../levels/events';
import type { PoliceEvent } from '../levels/types';

/** VERBATIM personal content (NORTH_STAR §5 row 15 / CLAUDE.md Rule 4 — never
 * paraphrase). The soft-fail toast when the cop catches Gabby. Uses the ASCII
 * three-dots `...` + straight apostrophes form (the rendered pixel font is
 * ASCII-only — see the PLAN-05 "ASCII-only rendered copy" DECISIONS entry;
 * NORTH_STAR §5 writes it with a Unicode ellipsis, the plan/brief use ASCII),
 * and the ONCOMING POLICE CAR emoji (U+1F694). GameScene.failLevel already
 * sizes/wraps this ~50-char line (see FAIL.overlayLong* in constants.ts). */
export const POLICE_CAUGHT_MESSAGE = "They got us!! ...let's pretend that didn't happen \u{1F694}";

/** VERBATIM personal content (NORTH_STAR §5 / CLAUDE.md Rule 4). The escape
 * toast shown by the onFinish finale when Gabby shakes the cop at the finish. */
export const POLICE_ESCAPE_MESSAGE = 'WOOHOO!';

// ---------------------------------------------------------------------------
// Per-chase defaults for any PoliceEvent field a config omits. level15.ts
// authors all of them explicitly; these are the safety net that keeps an
// under-specified police event still sane AND still fair (same "total function"
// spirit as traffic.ts's DEFAULTS / terrain.ts's normalizeSpec).
// INVARIANT: copMaxSpeedFrac is the kinematic guarantee that a gas-holding player
// can never be caught (the EASY mandate) — but it must be set against the level's
// *sustained gas-only cruise on its actual rolling terrain*, which is well under
// the bike's theoretical FLAT top speed (BIKE_TUNING.maxWheelAngularVelocity x
// wheelRadius = 10.8). Browser-measured on level 15: cruise ~7.9 px/step, dipping
// to ~5.9 on the steepest climbs. So the hard cap must sit below THAT climb
// minimum (0.45 x 10.8 = 4.86 < 5.9), not merely < 1 — otherwise the cop out-runs
// the player on climbs and slowly reels them in (it did at 0.85). The browser
// harness (scripts/playtest-level15.mjs) proves the guarantee empirically; a level
// with hillier terrain would need a still-lower frac.
// ---------------------------------------------------------------------------
const DEFAULTS = {
  startBehindPx: 600,
  catchDistancePx: 200,
  catchTimeMs: 1500,
  copMaxSpeedFrac: 0.45,
  catchupBonusPxPerFrame: 3,
} as const;

// ---------------------------------------------------------------------------
// Pure helpers — no Phaser/Matter/DOM. Unit-tested in tests/police.test.ts.
// ---------------------------------------------------------------------------

/**
 * The cop's HARD-CAP speed (px per fixed step): a fraction of the bike's full-gas
 * top speed. MUST be < the bike's top speed (copMaxSpeedFrac < 1) so a player
 * holding gas at top speed always out-runs the cop — the kinematic guarantee
 * behind the EASY mandate ("the cop must NEVER catch a gas-holding player"). Pure.
 */
export function copHardCap(copMaxSpeedFrac: number, bikeFullGasTopSpeedPxPerStep: number): number {
  return copMaxSpeedFrac * bikeFullGasTopSpeedPxPerStep;
}

/**
 * The rubber-band speed law (px per fixed step): the cop chases at the player's
 * recent average forward speed plus a small catch-up bonus, CLAMPED to the hard
 * cap (and never negative). Net effect: when the player is fast (holding gas) the
 * `+ bonus` is swallowed by the cap and the cop trails; when the player is
 * stopped/slow the cop closes at ~bonus px/step. Pure.
 */
export function copRubberBandSpeed(
  playerAvgSpeedPxPerStep: number,
  catchupBonusPxPerStep: number,
  hardCapPxPerStep: number
): number {
  const target = playerAvgSpeedPxPerStep + catchupBonusPxPerStep;
  const capped = Math.min(target, hardCapPxPerStep);
  return capped < 0 ? 0 : capped;
}

/** The player's FORWARD speed for the rubber-band average: the bike's signed
 * horizontal velocity floored at 0, so reversing/stopped reads as ~0 (and the
 * cop closes) rather than as motion. Pure. */
export function forwardSpeed(velocityXPxPerStep: number): number {
  return velocityXPxPerStep > 0 ? velocityXPxPerStep : 0;
}

/**
 * Rightward displacement (px) of the cop over `elapsedMs` of wall-clock time,
 * given a speed authored as px per fixed 60 Hz step. Refresh-INDEPENDENT: it
 * depends only on elapsed TIME, so integrating it on the fixed 60 Hz physics step
 * (as createPolice does — one call per `beforeupdate`, elapsedMs = 1000/fps)
 * yields identical wall-clock motion at 30/60/120 Hz. A raw per-render-frame
 * `cop.x += speed` would instead run ~2x fast on a 120 Hz display, silently
 * changing how fast the cop closes — the exact hazard bike.ts/traffic.ts avoid.
 * Pure — see the frame-rate test in tests/police.test.ts (mirrors traffic's). */
export function copDisplacement(
  speedPxPerStep: number,
  elapsedMs: number,
  fps = POLICE.fps
): number {
  return speedPxPerStep * (elapsedMs / (1000 / fps));
}

/** The gap (px) the cop trails the bike by — positive while the cop is behind
 * (its normal state; createPolice clamps the cop to never render ahead). Pure. */
export function copGapPx(bikeX: number, copX: number): number {
  return bikeX - copX;
}

/** Whether the cop is "on" the bike this step: within `catchDistancePx` of it.
 * Anything at/closer than the gap counts (including a cop clamped right onto the
 * bike). Pure — the manual, body-free catch test. */
export function isCopOnBike(bikeX: number, copX: number, catchDistancePx: number): boolean {
  return copGapPx(bikeX, copX) <= catchDistancePx;
}

/**
 * The continuous-contact catch timer (ms): accumulate `elapsedMs` while the cop
 * stays within catch distance, RESET to 0 the instant the gap re-opens. So only
 * SUSTAINED closeness counts — brushing past the catch distance for a step or two
 * never triggers. Pure. */
export function nextCatchTimerMs(
  accumulatedMs: number,
  withinCatchDistance: boolean,
  elapsedMs: number
): number {
  return withinCatchDistance ? accumulatedMs + elapsedMs : 0;
}

/** Caught once the cop has been within catch distance CONTINUOUSLY for STRICTLY
 * more than catchTimeMs (matches NORTH_STAR §5's "for >1.5s"). Pure. */
export function isCaught(accumulatedMs: number, catchTimeMs: number): boolean {
  return accumulatedMs > catchTimeMs;
}

/** Length (in fixed steps) of the rolling forward-speed window — the ms window
 * converted to whole steps at `fps`, floored at 1 so the average always has at
 * least one sample. Pure. */
export function rollingAvgWindowSteps(windowMs: number, fps = POLICE.fps): number {
  return Math.max(1, Math.round((windowMs / 1000) * fps));
}

// ---------------------------------------------------------------------------
// Presentation-only local constants (placeholder art). Following the
// decorations.ts / pickup.ts precedent, the DRAWING dimensions of the throwaway
// placeholder cop lights / spin-out puff / toast (no gameplay effect — PLAN-10
// replaces the art) stay here rather than in constants.ts. The GAMEPLAY/feel
// tunables live in the POLICE block (constants.ts) + level15.ts's PoliceEvent.
// All lengths are px at the 1280x720 DESIGN scale.
// ---------------------------------------------------------------------------

/** Matches BootScene's tex-police-car placeholder (110x40). The cop Image has a
 * centered origin, so its center sits this far (half its height) above the road
 * surface to rest its wheels ~on the ground. */
const COP_SPRITE_HEIGHT_PX = 40;
const COP_RIDE_HALF_PX = COP_SPRITE_HEIGHT_PX / 2;
/** Flashing light-bar rectangles perched above the cab. */
const LIGHT_WIDTH_PX = 12;
const LIGHT_HEIGHT_PX = 8;
/** Gap from the cop's roof (top edge) up to the light bar, px. */
const LIGHT_ABOVE_PX = 6;
/** How far each light sits left/right of the cop's center x, px. */
const LIGHT_SPREAD_PX = 13;
/** Placeholder siren colors from the existing pastel palette (real art is
 * PLAN-10): warm coral reads as the RED light, cool steel-blue as the BLUE. */
const LIGHT_RED_COLOR = PALETTE.coral;
const LIGHT_BLUE_COLOR = PALETTE.steelBlue;
/** Spin-out puff: a burst of dust the cop kicks up as it loses you. */
const PUFF_RADIUS_PX = 26;
const PUFF_GROW = 2.2;
/** "WOOHOO!" toast (screen-anchored, like the fail overlay / pickup toast). */
const TOAST_Y_PX = 180;
const TOAST_FONT_SIZE_PX = 40;

/** Centered pixel-font text, replicating ui.ts's createPixelText from the shared
 * font constants — inlined so this module needs no runtime ui.ts/Phaser import
 * (keeping the pure helpers above Node-testable; same discipline as
 * traffic.ts/pickup.ts). */
function pixelText(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  sizePx: number
): Phaser.GameObjects.Text {
  return scene.add
    .text(Math.round(x), Math.round(y), text, {
      fontFamily: FONT_STACK_PIXEL,
      fontSize: `${snapFontSize(sizePx)}px`,
      color: TEXT_COLOR,
      align: 'center',
    })
    .setOrigin(0.5);
}

// ---------------------------------------------------------------------------
// Runtime factory (calls scene/ctx methods only — see module doc).
// ---------------------------------------------------------------------------

/** Matter world per-engine-step event — the SAME fixed 60 Hz hook bike.ts /
 * traffic.ts drive their rate-based work off. Cop motion + catch detection are
 * integrated here, never on the render frame, so the chase stays refresh-
 * independent (see copDisplacement). String literal on purpose: the named
 * constant lives on the runtime Phaser module this file must not import. */
const BEFORE_UPDATE_EVENT = 'beforeupdate';

/** DEV-only live snapshot the browser playtest harness reads off the scene to
 * script + assert the chase (stripped from prod builds via import.meta.env.DEV). */
interface PoliceDebug {
  copX(): number;
  /** Current gap the cop trails the bike by, px. */
  gap(): number;
  /** Smallest gap the cop has reached this run, px (the "closest call"). */
  closestGap(): number;
  /** Current continuous within-catch-distance accumulation, ms. */
  catchTimerMs(): number;
  catchDistancePx: number;
  catchTimeMs: number;
  hardCap: number;
  startBehindPx: number;
  caughtMessage: string;
  escapeMessage: string;
}

/**
 * Builds the level 15 police chase and returns a {@link LevelEventHandle}
 * GameScene drives. `scene`/`ctx` are runtime handles only (same contract as
 * createBike). NO Matter body is created — the cop is a plain Image. Cop motion,
 * the rubber-band speed law, and catch detection run on the Matter world's fixed
 * 60 Hz `beforeupdate` step (registered here, removed in destroy()), so the chase
 * behaves identically at any display refresh rate — same discipline as bike.ts.
 */
export function createPolice(
  scene: Phaser.Scene,
  event: PoliceEvent,
  ctx: EventContext
): LevelEventHandle {
  const startBehindPx = event.startBehindPx ?? DEFAULTS.startBehindPx;
  const catchDistancePx = event.catchDistancePx ?? DEFAULTS.catchDistancePx;
  const catchTimeMs = event.catchTimeMs ?? DEFAULTS.catchTimeMs;
  const copMaxSpeedFrac = event.copMaxSpeedFrac ?? DEFAULTS.copMaxSpeedFrac;
  const catchupBonus = event.catchupBonusPxPerFrame ?? DEFAULTS.catchupBonusPxPerFrame;

  // The bike's full-gas top speed (px/step) = the DRIVEN wheel-spin cap x wheel
  // radius (see BIKE_TUNING.maxWheelAngularVelocity's doc: 0.6 x 18 = 10.8). The
  // cop's hard cap is a fraction < 1 of this, so gas always out-runs the cop.
  const bikeFullGasTopSpeed = BIKE_TUNING.maxWheelAngularVelocity * BIKE_TUNING.wheelRadius;
  const hardCap = copHardCap(copMaxSpeedFrac, bikeFullGasTopSpeed);
  const stepMs = 1000 / POLICE.fps;
  const windowSteps = rollingAvgWindowSteps(POLICE.speedAvgWindowMs, POLICE.fps);

  // --- the cop (non-Matter placeholder Image) ---
  let copX = ctx.bike.x - startBehindPx;
  function copSurfaceY(x: number): number {
    return ctx.terrain.heightAt(x) - COP_RIDE_HALF_PX;
  }
  const cop = scene.add
    .image(copX, copSurfaceY(copX), TEXTURE_KEYS.policeCar)
    .setDepth(DEPTHS.props);

  // --- flashing red/blue light bars (siren; audio is PLAN-10) ---
  // TODO(PLAN-10): add the siren SFX loop here (start on create, stop in
  // destroy()); intentionally NO audio now.
  const redLight = scene.add
    .rectangle(copX - LIGHT_SPREAD_PX, 0, LIGHT_WIDTH_PX, LIGHT_HEIGHT_PX, LIGHT_RED_COLOR)
    .setDepth(DEPTHS.props + 1);
  const blueLight = scene.add
    .rectangle(copX + LIGHT_SPREAD_PX, 0, LIGHT_WIDTH_PX, LIGHT_HEIGHT_PX, LIGHT_BLUE_COLOR)
    .setDepth(DEPTHS.props + 1)
    .setVisible(false);
  let redPhase = true;
  let flashAccumMs = 0;

  // Every created GameObject is tracked so destroy() tears them all down on level
  // teardown/restart (double-destroy is safe — Phaser guards it). The finale toast
  // + puff (created in onFinish) are tracked too, so a shutdown DURING the finale
  // hold cleans them up.
  const objects: Phaser.GameObjects.GameObject[] = [cop, redLight, blueLight];
  function track<T extends Phaser.GameObjects.GameObject>(obj: T): T {
    objects.push(obj);
    return obj;
  }

  // --- rolling forward-speed average (fixed-size ring; O(1) per step) ---
  const samples = new Array<number>(windowSteps).fill(0);
  let sampleIndex = 0;
  let sampleSum = 0;

  // --- chase state ---
  let catchTimerMs = 0;
  let closestGap = startBehindPx; // smallest gap seen this run (starts at the spawn gap)
  let finaleStarted = false;

  /** Pin the cop + its light bars to (copX, road surface). */
  function syncCop(): void {
    const y = copSurfaceY(copX);
    cop.setPosition(copX, y);
    const lightY = y - COP_RIDE_HALF_PX - LIGHT_ABOVE_PX - LIGHT_HEIGHT_PX / 2;
    redLight.setPosition(copX - LIGHT_SPREAD_PX, lightY);
    blueLight.setPosition(copX + LIGHT_SPREAD_PX, lightY);
  }
  syncCop();

  // DEV-only: expose live state for scripts/playtest-level15.mjs. Stashed on the
  // scene (which persists across scene.restart()); prod builds skip this whole
  // branch (Vite dead-code-eliminates `import.meta.env.DEV`).
  const devScene = scene as unknown as {
    __police?: PoliceDebug;
    __lastPoliceSoftFail?: string;
  };
  if (import.meta.env.DEV) {
    devScene.__police = {
      copX: () => copX,
      gap: () => copGapPx(ctx.bike.x, copX),
      closestGap: () => closestGap,
      catchTimerMs: () => catchTimerMs,
      catchDistancePx,
      catchTimeMs,
      hardCap,
      startBehindPx,
      caughtMessage: POLICE_CAUGHT_MESSAGE,
      escapeMessage: POLICE_ESCAPE_MESSAGE,
    };
  }

  /** Runs once per fixed physics step (see BEFORE_UPDATE_EVENT). Flashes the
   * lights, integrates the rubber-band pursuit, and checks the catch timer at a
   * refresh-independent rate. */
  function onBeforeUpdate(): void {
    // Defensive: the Matter world keeps stepping after a fail/finish even though
    // GameScene stops calling handle.update() — freeze the cop once the run has
    // ended (the onFinish spin-out then self-drives via tweens; see EventContext
    // .isEnded's doc).
    if (ctx.isEnded()) return;

    // --- siren flash (cosmetic; refresh-independent as a bonus) ---
    flashAccumMs += stepMs;
    if (flashAccumMs >= POLICE.lightFlashPeriodMs) {
      flashAccumMs -= POLICE.lightFlashPeriodMs;
      redPhase = !redPhase;
      redLight.setVisible(redPhase);
      blueLight.setVisible(!redPhase);
    }

    // --- rubber-band pursuit ---
    // Roll the player's forward speed into the O(1) ring average.
    const fwd = forwardSpeed(ctx.bike.velocityX);
    sampleSum += fwd - samples[sampleIndex];
    samples[sampleIndex] = fwd;
    sampleIndex = (sampleIndex + 1) % windowSteps;
    const avgSpeed = sampleSum / windowSteps;

    const speed = copRubberBandSpeed(avgSpeed, catchupBonus, hardCap);
    // Advance toward the bike, but never render AHEAD of it (clamp to bike.x) —
    // when caught the cop sits right on Gabby's tail.
    copX = Math.min(copX + copDisplacement(speed, stepMs), ctx.bike.x);
    syncCop();

    // --- catch detection (manual distance test — no Matter body) ---
    const gap = copGapPx(ctx.bike.x, copX);
    if (gap < closestGap) closestGap = gap;
    catchTimerMs = nextCatchTimerMs(catchTimerMs, isCopOnBike(ctx.bike.x, copX, catchDistancePx), stepMs);
    if (isCaught(catchTimerMs, catchTimeMs)) {
      if (import.meta.env.DEV) devScene.__lastPoliceSoftFail = POLICE_CAUGHT_MESSAGE;
      ctx.softFail(POLICE_CAUGHT_MESSAGE);
      return; // run ended — stop pursuing this step
    }
  }
  scene.matter.world.on(BEFORE_UPDATE_EVENT, onBeforeUpdate);

  function update(): void {
    // No-op: all pursuit/catch runs on the fixed-step beforeupdate hook above
    // (refresh-independent). The seam still calls this every render frame.
  }

  /** The escape finale (crossing the finish flag). Self-driving via tweens/
   * particles: GameScene STOPS calling update() once the run ends, so nothing
   * here may rely on per-frame ticks (see EventContext.isEnded's doc). Returns the
   * ms GameScene holds the LevelComplete hand-off so the finale is visible. */
  function onFinish(): number {
    if (finaleStarted) return POLICE.finaleHoldMs; // idempotent (defensive)
    finaleStarted = true;

    // Cop loses control: spin out + drift back/down as Gabby pulls away.
    scene.tweens.add({
      targets: cop,
      angle: 540,
      x: cop.x - 40,
      y: cop.y + 24,
      duration: POLICE.finaleSpinMs,
      ease: 'Cubic.easeOut',
    });
    redLight.setVisible(false);
    blueLight.setVisible(false);

    // A dust puff where the cop skids out.
    const puff = track(scene.add.graphics().setDepth(DEPTHS.fx));
    puff.fillStyle(PALETTE.overcast, 1);
    puff.fillCircle(0, 0, PUFF_RADIUS_PX);
    puff.setPosition(cop.x, cop.y);
    scene.tweens.add({
      targets: puff,
      scale: PUFF_GROW,
      alpha: 0,
      duration: POLICE.finalePuffMs,
      ease: 'Quad.easeOut',
      onComplete: () => puff.destroy(),
    });

    // Screen-anchored "WOOHOO!" escape toast (byte-exact personal copy).
    const toast = track(
      pixelText(scene, DESIGN_WIDTH / 2, TOAST_Y_PX, POLICE_ESCAPE_MESSAGE, TOAST_FONT_SIZE_PX)
        .setScrollFactor(0)
        .setDepth(DEPTHS.overlay)
    );
    scene.tweens.add({
      targets: toast,
      alpha: 0,
      delay: POLICE.finaleToastHoldMs,
      duration: POLICE.finaleToastFadeMs,
      onComplete: () => toast.destroy(),
    });

    return POLICE.finaleHoldMs;
  }

  function destroy(): void {
    // Remove the world listener FIRST (no callbacks during teardown). Same
    // rationale as traffic.ts: on the normal shutdown/restart path Phaser's Matter
    // plugin has already destroyed the world (taking every world listener with it)
    // and nulled scene.matter.world by the time this runs, so off() is only needed
    // (and only safe) if the world somehow survived.
    const world = scene.matter.world as Phaser.Physics.Matter.World | null;
    if (world) world.off(BEFORE_UPDATE_EVENT, onBeforeUpdate);
    for (const obj of objects) obj.destroy();
    objects.length = 0;
    if (import.meta.env.DEV) {
      delete devScene.__police;
      delete devScene.__lastPoliceSoftFail;
    }
  }

  return { update, destroy, onFinish };
}
