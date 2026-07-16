// Level 12 "Picking Up Caleb" pickup cutscene (PLAN-06 Task 2). Mid-level, the
// bike reaches Caleb's house, AUTO-BRAKES to a stop (via ctx.setInputOverride —
// never a Matter force), Caleb runs over and hops on with a tiny heart + a
// "Caleb hopped on!!" toast, then control returns and he rides pillion for the
// rest of the game (the persistent passenger — passenger.ts — is activated here;
// its cross-level persistence on 13-22 is already handled by save.ts's
// deriveCalebPickedUp). The whole beat is a GIFT: it can NEVER fail the player.
//
// See the PICKUP constants block (src/systems/constants.ts) for the gameplay
// tunables (trigger window, stop threshold, cutscene/heart/toast timing) and
// level12.ts's CalebPickupEvent for the per-level placement. The placeholder
// DRAWING dimensions for the house/mailbox/Caleb stay as local documented consts
// below (decorations.ts precedent — PLAN-10 replaces the art wholesale).
//
// ZERO Matter bodies: the house, mailbox, standing Caleb, heart and toast are all
// plain Phaser GameObjects (Rectangle/Graphics/Image/Container/Text), so they
// never touch NORTH_STAR §8's <100-body budget — same as decorations.ts /
// passenger.ts / traffic.ts.
//
// Like bike.ts / terrain.ts / passenger.ts / traffic.ts (and UNLIKE
// decorations.ts), this module has NO runtime Phaser import and does NOT import
// ui.ts — its only non-type imports are the pure constants — so it stays
// import-safe in Node. It draws pixel text through a tiny local helper
// (replicating ui.ts's createPixelText from the shared font constants) rather
// than importing ui.ts, exactly so the pure helpers below (the approach/stop
// predicates + the cutscene state machine) can be unit-tested directly in
// tests/pickup.test.ts. The createPickup factory only ever CALLS METHODS on the
// runtime scene/ctx handles handed to it (same contract as createBike).
import type Phaser from 'phaser';
import {
  PICKUP,
  DEPTHS,
  PALETTE,
  TEXTURE_KEYS,
  DESIGN_WIDTH,
  FONT_STACK_PIXEL,
  TEXT_COLOR,
  snapFontSize,
} from './constants';
import type { LevelEventHandle, EventContext } from '../levels/events';
import type { CalebPickupEvent } from '../levels/types';

/** VERBATIM personal content (CLAUDE.md Rule 4 / PLAN06 brief — never
 * paraphrase). The mailbox nameplate outside Caleb's house. */
export const MAILBOX_LABEL = 'MELIN';

/** VERBATIM personal content (CLAUDE.md Rule 4 / PLAN06 brief — never
 * paraphrase). The toast shown the instant Caleb hops on the back. */
export const PICKUP_TOAST_MESSAGE = 'Caleb hopped on!!';

// ---------------------------------------------------------------------------
// Pure helpers + the cutscene state machine — no Phaser/Matter/DOM. Unit-tested
// in tests/pickup.test.ts.
// ---------------------------------------------------------------------------

/** The cutscene's phases (`as const` string union — tsconfig's
 * `erasableSyntaxOnly` forbids TS enums). Progression is one-way:
 * approaching -> braking -> stopped -> hopping -> done, and never re-triggers. */
export type PickupPhase = 'approaching' | 'braking' | 'stopped' | 'hopping' | 'done';

/** Per-frame signals the state machine transitions on. */
export interface PickupSignals {
  /** The bike has reached the trigger window near the pickup x. */
  atTrigger: boolean;
  /** The (auto-braked) bike has slowed to a stop. */
  stopped: boolean;
  /** ms elapsed since the hop beat began (meaningful only while 'hopping'). */
  hopElapsedMs: number;
}

/**
 * Whether the bike has reached the pickup trigger: it approaches from the left
 * (spawn x < pickup x), so it triggers once within `stopWindowPx` to the LEFT of
 * `pickupX` (and stays triggered past it, defensively). Pure.
 */
export function shouldBeginPickup(bikeX: number, pickupX: number, stopWindowPx: number): boolean {
  return bikeX >= pickupX - stopWindowPx;
}

/** Whether the bike has slowed enough to count as stopped for the pickup. Pure. */
export function isStoppedForPickup(speedPxPerStep: number, thresholdPxPerStep: number): boolean {
  return speedPxPerStep <= thresholdPxPerStep;
}

/**
 * The cutscene state machine's next phase (one transition per call). Pure and
 * total — a `never` guard makes adding a future PickupPhase a compile error.
 * 'stopped' is transient (advances to 'hopping' the next call, once the beat is
 * kicked off); 'done' is terminal (never re-triggers).
 */
export function nextPickupPhase(
  phase: PickupPhase,
  signals: PickupSignals,
  hopDurationMs: number
): PickupPhase {
  switch (phase) {
    case 'approaching':
      return signals.atTrigger ? 'braking' : 'approaching';
    case 'braking':
      return signals.stopped ? 'stopped' : 'braking';
    case 'stopped':
      return 'hopping';
    case 'hopping':
      return signals.hopElapsedMs >= hopDurationMs ? 'done' : 'hopping';
    case 'done':
      return 'done';
    default: {
      // Exhaustiveness guard: a new PickupPhase with no case above makes `phase`
      // no longer `never` here -> compile error. Runtime no-op (unreachable).
      const _exhaustive: never = phase;
      return _exhaustive;
    }
  }
}

// ---------------------------------------------------------------------------
// Presentation-only local constants (placeholder art). Following the
// decorations.ts / themes.ts precedent, the DRAWING dimensions of the throwaway
// placeholder house/mailbox/Caleb/heart/toast (no gameplay effect — PLAN-10
// replaces the art) stay here rather than in constants.ts. The GAMEPLAY tunables
// (trigger window, stop threshold, cutscene/heart/toast timing) live in the
// PICKUP block in constants.ts. All lengths are px at the 1280x720 DESIGN scale.
// ---------------------------------------------------------------------------

// --- Caleb's house: a cute pixel house (body + peaked roof + front door).
const HOUSE_WIDTH_PX = 184;
const HOUSE_HEIGHT_PX = 150;
const HOUSE_OUTLINE_PX = 4;
const HOUSE_ROOF_HEIGHT_PX = 72;
/** How far the roof eaves overhang the house body on each side, px. */
const HOUSE_ROOF_OVERHANG_PX = 22;
const HOUSE_DOOR_WIDTH_PX = 46;
const HOUSE_DOOR_HEIGHT_PX = 74;
/** House center x relative to the pickup x — set BACK from the road so the bike
 * stops in front of it. Negative = left of the pickup x. */
const HOUSE_X_OFFSET_PX = -80;

// --- Mailbox: a small post + a nameplate board reading MELIN, road-side.
const MAILBOX_POST_WIDTH_PX = 8;
const MAILBOX_POST_HEIGHT_PX = 74;
const MAILBOX_BOARD_HEIGHT_PX = 36;
/** Board grows to fit its text (like decorations.ts's signs) but never narrower. */
const MAILBOX_BOARD_MIN_WIDTH_PX = 88;
const MAILBOX_TEXT_PAD_PX = 12;
const MAILBOX_TEXT_SIZE_PX = 16;
const MAILBOX_OUTLINE_PX = 3;
/** Mailbox center x relative to the pickup x — between the house and the road. */
const MAILBOX_X_OFFSET_PX = 84;

// --- Standing Caleb: the tex-caleb placeholder + a BROWN hair band overlay so he
// reads as brown-haired (distinct from blonde Dom, NORTH_STAR §5). He runs to the
// bike on pickup, then the persistent pillion sprite (passenger.ts) takes over.
/** Matches BootScene's tex-caleb placeholder (24x48). */
const CALEB_SPRITE_WIDTH_PX = 24;
const CALEB_SPRITE_HEIGHT_PX = 48;
/** Height of the brown hair band across the top of the sprite, px. */
const CALEB_HAIR_BAND_HEIGHT_PX = 12;
/** Standing Caleb's x relative to the pickup x — just road-side, waiting. */
const CALEB_STAND_X_OFFSET_PX = 40;

// --- Tiny heart particle spawned as Caleb hops on.
const HEART_SIZE_PX = 16;
/** How far above the bike's chassis center the heart spawns, px. */
const HEART_ABOVE_BIKE_PX = 44;

// --- "Caleb hopped on!!" toast (screen-anchored, like the fail overlay).
const TOAST_Y_PX = 180;
const TOAST_FONT_SIZE_PX = 32;

/** Centered pixel-font text, replicating ui.ts's createPixelText from the shared
 * font constants — inlined so this module needs no runtime ui.ts/Phaser import
 * (keeping the pure helpers above Node-testable; same discipline as traffic.ts). */
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

/** DEV-only live snapshot the browser playtest harness reads off the scene to
 * script + assert the cutscene (stripped from prod builds). */
interface PickupDebug {
  phase(): PickupPhase;
  activated(): boolean;
  pickupX: number;
  stopWindowPx: number;
  mailboxText: string;
  toastText: string;
}

/**
 * Builds the level 12 pickup system and returns a {@link LevelEventHandle}
 * GameScene drives. `scene`/`ctx` are runtime handles only (same contract as
 * createBike). NO Matter body is created. The auto-brake is driven entirely
 * through ctx.setInputOverride (never a direct force on the bike), so the actual
 * deceleration runs on the bike's own fixed 60 Hz step — the cutscene logic here
 * (a position trigger + a speed threshold + a wall-clock hop timer) is naturally
 * refresh-independent, so it needs no beforeupdate hook.
 */
export function createPickup(
  scene: Phaser.Scene,
  event: CalebPickupEvent,
  ctx: EventContext
): LevelEventHandle {
  const pickupX = event.x;
  const stopWindowPx = event.stopWindowPx ?? PICKUP.stopWindowPx;

  // Every created GameObject is tracked so destroy() can tear them all down on
  // level teardown/restart (double-destroy is safe — Phaser guards it).
  const objects: Phaser.GameObjects.GameObject[] = [];
  function track<T extends Phaser.GameObjects.GameObject>(obj: T): T {
    objects.push(obj);
    return obj;
  }

  // --- Caleb's house (non-Matter placeholder) ---
  const houseX = pickupX + HOUSE_X_OFFSET_PX;
  const houseGroundY = ctx.terrain.heightAt(houseX);
  track(
    scene.add
      .rectangle(houseX, houseGroundY, HOUSE_WIDTH_PX, HOUSE_HEIGHT_PX, PALETTE.cream)
      .setOrigin(0.5, 1)
      .setStrokeStyle(HOUSE_OUTLINE_PX, PALETTE.outline)
      .setDepth(DEPTHS.props)
  );
  const roofBaseY = houseGroundY - HOUSE_HEIGHT_PX;
  const roof = track(scene.add.graphics().setDepth(DEPTHS.props));
  roof.fillStyle(PALETTE.brickRed, 1);
  roof.fillTriangle(
    houseX - HOUSE_WIDTH_PX / 2 - HOUSE_ROOF_OVERHANG_PX,
    roofBaseY,
    houseX + HOUSE_WIDTH_PX / 2 + HOUSE_ROOF_OVERHANG_PX,
    roofBaseY,
    houseX,
    roofBaseY - HOUSE_ROOF_HEIGHT_PX
  );
  track(
    scene.add
      .rectangle(houseX, houseGroundY, HOUSE_DOOR_WIDTH_PX, HOUSE_DOOR_HEIGHT_PX, PALETTE.brown)
      .setOrigin(0.5, 1)
      .setDepth(DEPTHS.props + 1)
  );

  // --- Mailbox with the MELIN nameplate (verbatim) ---
  const mailboxX = pickupX + MAILBOX_X_OFFSET_PX;
  const mailboxGroundY = ctx.terrain.heightAt(mailboxX);
  track(
    scene.add
      .rectangle(mailboxX, mailboxGroundY, MAILBOX_POST_WIDTH_PX, MAILBOX_POST_HEIGHT_PX, PALETTE.outline)
      .setOrigin(0.5, 1)
      .setDepth(DEPTHS.props)
  );
  const boardCenterY = mailboxGroundY - MAILBOX_POST_HEIGHT_PX - MAILBOX_BOARD_HEIGHT_PX / 2;
  // Text first (depth props+1) so the board can be sized to fit it and the label
  // always draws over the board — same order/trick as decorations.ts's drawSign.
  const label = track(pixelText(scene, mailboxX, boardCenterY, MAILBOX_LABEL, MAILBOX_TEXT_SIZE_PX).setDepth(DEPTHS.props + 1));
  const boardWidth = Math.max(MAILBOX_BOARD_MIN_WIDTH_PX, label.width + MAILBOX_TEXT_PAD_PX * 2);
  track(
    scene.add
      .rectangle(mailboxX, boardCenterY, boardWidth, MAILBOX_BOARD_HEIGHT_PX, PALETTE.cream)
      .setStrokeStyle(MAILBOX_OUTLINE_PX, PALETTE.outline)
      .setDepth(DEPTHS.props)
  );

  // --- Standing (brown-haired) Caleb, waving outside; runs to the bike on
  // pickup. A Container of the tex-caleb Image + a brown hair band, so one tween
  // slides both together. NOTE(PLAN-10): the persistent PILLION Caleb
  // (passenger.ts, activated below) still renders as the neutral sky-blue
  // tex-caleb placeholder — NOT blonde — until PLAN-10 gives him real brown-haired
  // art; only this standing Caleb gets the brown-band overlay for now. ---
  const calebStandX = pickupX + CALEB_STAND_X_OFFSET_PX;
  const calebGroundY = ctx.terrain.heightAt(calebStandX);
  const calebBody = scene.add.image(0, 0, TEXTURE_KEYS.caleb).setOrigin(0.5, 1);
  const calebHair = scene.add.rectangle(
    0,
    -CALEB_SPRITE_HEIGHT_PX + CALEB_HAIR_BAND_HEIGHT_PX / 2,
    CALEB_SPRITE_WIDTH_PX,
    CALEB_HAIR_BAND_HEIGHT_PX,
    PALETTE.brown
  );
  const standingCaleb = track(
    scene.add.container(calebStandX, calebGroundY, [calebBody, calebHair]).setDepth(DEPTHS.props + 2)
  );
  let standingCalebAlive = true;

  // --- cutscene state ---
  let phase: PickupPhase = 'approaching';
  let hopStartMs = 0;

  /** Spawn the tiny heart (drawn in local space, then positioned + floated up). */
  function spawnHeart(x: number, y: number): void {
    const g = track(scene.add.graphics().setDepth(DEPTHS.fx));
    g.fillStyle(PALETTE.coral, 1);
    const s = HEART_SIZE_PX;
    g.fillCircle(-s * 0.28, -s * 0.15, s * 0.42);
    g.fillCircle(s * 0.28, -s * 0.15, s * 0.42);
    g.fillTriangle(-s * 0.62, s * 0.02, s * 0.62, s * 0.02, 0, s * 0.85);
    g.setPosition(x, y);
    scene.tweens.add({
      targets: g,
      y: y - PICKUP.heartRisePx,
      alpha: 0,
      duration: PICKUP.heartRiseMs,
      onComplete: () => g.destroy(),
    });
  }

  /** Kick off the hop beat: heart + toast + Caleb sliding to the bike. */
  function startBeat(): void {
    spawnHeart(ctx.bike.x, ctx.bike.y - HEART_ABOVE_BIKE_PX);
    const toast = track(
      pixelText(scene, DESIGN_WIDTH / 2, TOAST_Y_PX, PICKUP_TOAST_MESSAGE, TOAST_FONT_SIZE_PX)
        .setScrollFactor(0)
        .setDepth(DEPTHS.overlay)
    );
    scene.tweens.add({
      targets: toast,
      alpha: 0,
      delay: PICKUP.toastHoldMs,
      duration: PICKUP.toastFadeMs,
      onComplete: () => toast.destroy(),
    });
    // Caleb runs/slides over to wherever the bike came to rest.
    scene.tweens.add({
      targets: standingCaleb,
      x: ctx.bike.x,
      duration: PICKUP.hopDurationMs,
      ease: 'Sine.easeIn',
    });
  }

  function onEnterPhase(entered: PickupPhase): void {
    switch (entered) {
      case 'braking':
        // Auto-brake to a stop on the flat zone — via the input override, NOT a
        // force. The held player gas is ignored while an override is set.
        ctx.setInputOverride({ gas: false, brake: true });
        break;
      case 'stopped':
        // Release the brake but keep the override (gas+brake both false) so the
        // bike neither reverse-creeps nor drives off under held player gas while
        // the beat plays.
        ctx.setInputOverride({ gas: false, brake: false });
        break;
      case 'hopping':
        hopStartMs = scene.time.now;
        startBeat();
        break;
      case 'done':
        // Caleb is aboard: reveal the pillion, hand control back, retire the
        // standing sprite. Persistence on 13-22 is save-derived (deriveCalebPickedUp).
        ctx.passenger.activate();
        ctx.setInputOverride(null);
        if (standingCalebAlive) {
          standingCaleb.destroy();
          standingCalebAlive = false;
        }
        break;
      case 'approaching':
        break;
      default: {
        const _exhaustive: never = entered;
        void _exhaustive;
        break;
      }
    }
  }

  function update(): void {
    // Defensive: never drive the cutscene once the run has ended (GameScene
    // stops calling update() then anyway). Terminal 'done' is a no-op too, so the
    // pickup can never re-trigger.
    if (ctx.isEnded() || phase === 'done') return;

    const signals: PickupSignals = {
      atTrigger: shouldBeginPickup(ctx.bike.x, pickupX, stopWindowPx),
      stopped: isStoppedForPickup(ctx.bike.speed, PICKUP.stopSpeedPxPerStep),
      hopElapsedMs: phase === 'hopping' ? scene.time.now - hopStartMs : 0,
    };
    const next = nextPickupPhase(phase, signals, PICKUP.hopDurationMs);
    if (next !== phase) {
      phase = next;
      onEnterPhase(phase);
    }
  }

  // DEV-only: expose live state for scripts/playtest-level12.mjs (stashed on the
  // scene, which persists across scene.restart()). Prod builds skip this whole
  // branch (Vite dead-code-eliminates `import.meta.env.DEV`).
  const devScene = scene as unknown as { __pickup?: PickupDebug };
  if (import.meta.env.DEV) {
    devScene.__pickup = {
      phase: () => phase,
      activated: () => ctx.passenger.active,
      pickupX,
      stopWindowPx,
      mailboxText: MAILBOX_LABEL,
      toastText: PICKUP_TOAST_MESSAGE,
    };
  }

  function destroy(): void {
    for (const obj of objects) obj.destroy();
    objects.length = 0;
    if (import.meta.env.DEV) delete devScene.__pickup;
  }

  return { update, destroy };
}
