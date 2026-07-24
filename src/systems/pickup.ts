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
// level12.ts's CalebPickupEvent for the per-level placement. The (permanently
// procedural) DRAWING dimensions for the house/mailbox/Caleb stay as local
// documented consts below (decorations.ts precedent — intentional pixel art,
// improved in place by PLAN-10 ST-4a, not placeholder awaiting replacement).
//
// ZERO Matter bodies: the house, mailbox, standing Caleb, heart and toast are all
// plain Phaser GameObjects (Rectangle/Graphics/Image/Container/Text), so they
// never touch NORTH_STAR §8's <100-body budget — same as decorations.ts /
// passenger.ts / traffic.ts.
//
// Like bike.ts / terrain.ts / passenger.ts / traffic.ts (and UNLIKE ui.ts, the
// ONE module left in src/systems with a runtime `import Phaser` — decorations.ts
// was the example here until PLAN-07 task 3 made it import-safe too, see its own
// doc), this module has NO runtime Phaser import and does NOT import
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
  DESIGN_WIDTH,
  FONT_STACK_PIXEL,
  TEXT_COLOR,
  snapFontSize,
} from './constants';
import { calebFigureParts } from './calebFigure';
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
// Presentation-only local constants. Following the decorations.ts / themes.ts
// precedent, the DRAWING dimensions of the (permanently procedural)
// house/mailbox/Caleb/heart/toast — intentional pixel art improved in place by
// PLAN-10 ST-4a, no gameplay effect — stay here rather than in constants.ts. The
// GAMEPLAY tunables (trigger window, stop threshold, cutscene/heart/toast timing)
// live in the PICKUP block in constants.ts. All lengths are px at the 1280x720
// DESIGN scale.
// ---------------------------------------------------------------------------

// --- Caleb's house: a cute cottage (body + peaked roof w/ eave + door w/ knob +
// two paned windows + a chimney). Its FOOTPRINT/position is unchanged so the
// pickup choreography (bike stops in front, Caleb runs out) is unaffected.
const HOUSE_WIDTH_PX = 184;
const HOUSE_HEIGHT_PX = 150;
const HOUSE_OUTLINE_PX = 4;
const HOUSE_ROOF_HEIGHT_PX = 72;
/** How far the roof eaves overhang the house body on each side, px. */
const HOUSE_ROOF_OVERHANG_PX = 22;
/** Roof outline stroke, px (the STYLE-GUIDE dark edge around the peak). */
const HOUSE_ROOF_OUTLINE_PX = 3;
/** A slim eave board across the roof base, px tall — the roof's overhang lip. */
const HOUSE_EAVE_HEIGHT_PX = 8;
const HOUSE_DOOR_WIDTH_PX = 46;
const HOUSE_DOOR_HEIGHT_PX = 74;
/** Round brass-ish door knob, px. */
const HOUSE_DOOR_KNOB_SIZE_PX = 7;
/** How far the knob's centre is inset from the door's road-side (right) edge, px. */
const HOUSE_DOOR_KNOB_INSET_PX = 9;
/** Two square paned windows flanking the door: size, centre inset from the house
 * centre x, and centre height above the ground. */
const HOUSE_WINDOW_SIZE_PX = 38;
const HOUSE_WINDOW_X_OFFSET_PX = 56;
const HOUSE_WINDOW_Y_ABOVE_GROUND_PX = 98;
/** Muntin (window-pane divider) thickness, px. */
const HOUSE_WINDOW_MUNTIN_PX = 3;
/** A brick chimney poking through the right roof slope. */
const HOUSE_CHIMNEY_WIDTH_PX = 18;
const HOUSE_CHIMNEY_HEIGHT_PX = 54;
const HOUSE_CHIMNEY_X_OFFSET_PX = 44;
/** How far the chimney cap oversails the flue on each side, px. */
const HOUSE_CHIMNEY_CAP_OVERHANG_PX = 3;
const HOUSE_CHIMNEY_CAP_HEIGHT_PX = 7;
/** House center x relative to the pickup x — set BACK from the road so the bike
 * stops in front of it. Negative = left of the pickup x. */
const HOUSE_X_OFFSET_PX = -80;

// --- Mailbox: a wood post carrying a real little rounded mailbox (box + a red
// flag) whose front is the MELIN nameplate (rendered byte-exact via pixelText).
const MAILBOX_POST_WIDTH_PX = 12;
const MAILBOX_POST_HEIGHT_PX = 74;
const MAILBOX_POST_OUTLINE_PX = 3;
const MAILBOX_BOARD_HEIGHT_PX = 36;
/** Nameplate grows to fit its text (like decorations.ts's signs) but never narrower. */
const MAILBOX_BOARD_MIN_WIDTH_PX = 88;
const MAILBOX_TEXT_PAD_PX = 12;
const MAILBOX_TEXT_SIZE_PX = 16;
const MAILBOX_OUTLINE_PX = 3;
/** The rounded mailbox body around the nameplate: its height, how far it frames
 * the nameplate on each side, its corner radius, and how far it overlaps the
 * post top so it reads as mounted (not floating). */
const MAILBOX_BOX_HEIGHT_PX = 46;
const MAILBOX_BOX_MARGIN_PX = 15;
const MAILBOX_BOX_RADIUS_PX = 12;
const MAILBOX_BOX_ON_POST_PX = 8;
/** The classic little red mailbox flag on the box's road side. */
const MAILBOX_FLAG_WIDTH_PX = 13;
const MAILBOX_FLAG_HEIGHT_PX = 12;
const MAILBOX_FLAG_POLE_PX = 3;
const MAILBOX_FLAG_RISE_PX = 22;
/** Mailbox center x relative to the pickup x — between the house and the road. */
const MAILBOX_X_OFFSET_PX = 84;

// --- Standing Caleb: built by the shared calebFigure.ts — now just the real
// tex-caleb sprite (committed brown-haired art as of PLAN-10 ST-2, so he reads
// as brown-haired / distinct from blonde Dom with NO overlay; the old brown
// hair-band was removed when the art became real — see calebFigure.ts). He runs
// to the bike on pickup, then the persistent pillion sprite (passenger.ts) takes over.
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

  // --- Caleb's house: a cute cottage (non-Matter). Same footprint/position as
  // before so the pickup choreography is untouched. Drawn back-to-front:
  // chimney (behind the roof) -> body -> roof(+eave) -> windows -> door(+knob). ---
  const houseX = pickupX + HOUSE_X_OFFSET_PX;
  const houseGroundY = ctx.terrain.heightAt(houseX);
  const roofBaseY = houseGroundY - HOUSE_HEIGHT_PX;
  const roofApexY = roofBaseY - HOUSE_ROOF_HEIGHT_PX;

  // Chimney FIRST, so the roof triangle draws over its lower half and only the
  // top pokes out of the right slope. Brick flue + a slate cap.
  const chimneyX = houseX + HOUSE_CHIMNEY_X_OFFSET_PX;
  const chimneyTopY = roofApexY + HOUSE_ROOF_HEIGHT_PX * 0.28; // partway down the slope
  const chimney = track(scene.add.graphics().setDepth(DEPTHS.props));
  chimney.fillStyle(PALETTE.brickRed, 1);
  chimney.fillRect(
    chimneyX - HOUSE_CHIMNEY_WIDTH_PX / 2,
    chimneyTopY,
    HOUSE_CHIMNEY_WIDTH_PX,
    HOUSE_CHIMNEY_HEIGHT_PX
  );
  chimney.lineStyle(HOUSE_ROOF_OUTLINE_PX, PALETTE.outline, 1);
  chimney.strokeRect(
    chimneyX - HOUSE_CHIMNEY_WIDTH_PX / 2,
    chimneyTopY,
    HOUSE_CHIMNEY_WIDTH_PX,
    HOUSE_CHIMNEY_HEIGHT_PX
  );
  chimney.fillStyle(PALETTE.slate, 1);
  chimney.fillRect(
    chimneyX - HOUSE_CHIMNEY_WIDTH_PX / 2 - HOUSE_CHIMNEY_CAP_OVERHANG_PX,
    chimneyTopY,
    HOUSE_CHIMNEY_WIDTH_PX + HOUSE_CHIMNEY_CAP_OVERHANG_PX * 2,
    HOUSE_CHIMNEY_CAP_HEIGHT_PX
  );

  // Body (cream, dark outline).
  track(
    scene.add
      .rectangle(houseX, houseGroundY, HOUSE_WIDTH_PX, HOUSE_HEIGHT_PX, PALETTE.cream)
      .setOrigin(0.5, 1)
      .setStrokeStyle(HOUSE_OUTLINE_PX, PALETTE.outline)
      .setDepth(DEPTHS.props)
  );

  // Peaked roof with a dark outline, over an eave board that laps the body.
  const roofLeftX = houseX - HOUSE_WIDTH_PX / 2 - HOUSE_ROOF_OVERHANG_PX;
  const roofRightX = houseX + HOUSE_WIDTH_PX / 2 + HOUSE_ROOF_OVERHANG_PX;
  const roof = track(scene.add.graphics().setDepth(DEPTHS.props + 1));
  roof.fillStyle(PALETTE.brickRed, 1);
  roof.fillTriangle(roofLeftX, roofBaseY, roofRightX, roofBaseY, houseX, roofApexY);
  roof.lineStyle(HOUSE_ROOF_OUTLINE_PX, PALETTE.outline, 1);
  roof.strokeTriangle(roofLeftX, roofBaseY, roofRightX, roofBaseY, houseX, roofApexY);
  roof.fillStyle(PALETTE.brown, 1);
  roof.fillRect(roofLeftX, roofBaseY, roofRightX - roofLeftX, HOUSE_EAVE_HEIGHT_PX);
  roof.lineStyle(HOUSE_ROOF_OUTLINE_PX, PALETTE.outline, 1);
  roof.strokeRect(roofLeftX, roofBaseY, roofRightX - roofLeftX, HOUSE_EAVE_HEIGHT_PX);

  // Two paned windows flanking the door (sky glass, dark frame + cross muntins).
  const windowCenterY = houseGroundY - HOUSE_WINDOW_Y_ABOVE_GROUND_PX;
  for (const wx of [houseX - HOUSE_WINDOW_X_OFFSET_PX, houseX + HOUSE_WINDOW_X_OFFSET_PX]) {
    track(
      scene.add
        .rectangle(wx, windowCenterY, HOUSE_WINDOW_SIZE_PX, HOUSE_WINDOW_SIZE_PX, PALETTE.sky)
        .setStrokeStyle(HOUSE_OUTLINE_PX, PALETTE.outline)
        .setDepth(DEPTHS.props + 1)
    );
    track(
      scene.add
        .rectangle(wx, windowCenterY, HOUSE_WINDOW_MUNTIN_PX, HOUSE_WINDOW_SIZE_PX, PALETTE.outline)
        .setDepth(DEPTHS.props + 2)
    );
    track(
      scene.add
        .rectangle(wx, windowCenterY, HOUSE_WINDOW_SIZE_PX, HOUSE_WINDOW_MUNTIN_PX, PALETTE.outline)
        .setDepth(DEPTHS.props + 2)
    );
  }

  // Front door (brown, dark outline) with a little round knob.
  track(
    scene.add
      .rectangle(houseX, houseGroundY, HOUSE_DOOR_WIDTH_PX, HOUSE_DOOR_HEIGHT_PX, PALETTE.brown)
      .setOrigin(0.5, 1)
      .setStrokeStyle(HOUSE_OUTLINE_PX, PALETTE.outline)
      .setDepth(DEPTHS.props + 1)
  );
  const knob = track(scene.add.graphics().setDepth(DEPTHS.props + 2));
  knob.fillStyle(PALETTE.sunshine, 1);
  knob.fillCircle(
    houseX + HOUSE_DOOR_WIDTH_PX / 2 - HOUSE_DOOR_KNOB_INSET_PX,
    houseGroundY - HOUSE_DOOR_HEIGHT_PX / 2,
    HOUSE_DOOR_KNOB_SIZE_PX / 2
  );

  // --- Mailbox with the MELIN nameplate (verbatim). A wood post carries a
  // rounded mailbox body + a red flag; the nameplate IS the box's front. ---
  const mailboxX = pickupX + MAILBOX_X_OFFSET_PX;
  const mailboxGroundY = ctx.terrain.heightAt(mailboxX);
  // Wood post.
  track(
    scene.add
      .rectangle(mailboxX, mailboxGroundY, MAILBOX_POST_WIDTH_PX, MAILBOX_POST_HEIGHT_PX, PALETTE.brown)
      .setOrigin(0.5, 1)
      .setStrokeStyle(MAILBOX_POST_OUTLINE_PX, PALETTE.outline)
      .setDepth(DEPTHS.props)
  );

  // Box mounted on the post top. The nameplate (and thus the box) is sized to fit
  // the label, so measure it first at a throwaway y — same trick as drawBillboard.
  const postTopY = mailboxGroundY - MAILBOX_POST_HEIGHT_PX;
  const boxCenterY = postTopY + MAILBOX_BOX_ON_POST_PX - MAILBOX_BOX_HEIGHT_PX / 2;
  const label = track(
    pixelText(scene, mailboxX, boxCenterY, MAILBOX_LABEL, MAILBOX_TEXT_SIZE_PX).setDepth(DEPTHS.props + 1)
  );
  const boardWidth = Math.max(MAILBOX_BOARD_MIN_WIDTH_PX, label.width + MAILBOX_TEXT_PAD_PX * 2);
  const boxWidth = boardWidth + MAILBOX_BOX_MARGIN_PX * 2;
  const boxLeft = mailboxX - boxWidth / 2;
  const boxTop = boxCenterY - MAILBOX_BOX_HEIGHT_PX / 2;

  // Rounded mailbox body (steelBlue) + the red flag on its road side.
  const box = track(scene.add.graphics().setDepth(DEPTHS.props));
  box.fillStyle(PALETTE.steelBlue, 1);
  box.fillRoundedRect(boxLeft, boxTop, boxWidth, MAILBOX_BOX_HEIGHT_PX, MAILBOX_BOX_RADIUS_PX);
  box.lineStyle(MAILBOX_OUTLINE_PX, PALETTE.outline, 1);
  box.strokeRoundedRect(boxLeft, boxTop, boxWidth, MAILBOX_BOX_HEIGHT_PX, MAILBOX_BOX_RADIUS_PX);
  const flagBaseX = boxLeft + boxWidth;
  const flagTopY = boxCenterY - MAILBOX_FLAG_RISE_PX;
  box.fillStyle(PALETTE.outline, 1);
  box.fillRect(flagBaseX, flagTopY, MAILBOX_FLAG_POLE_PX, MAILBOX_FLAG_RISE_PX); // pole
  box.fillStyle(PALETTE.coral, 1);
  box.fillRect(flagBaseX + MAILBOX_FLAG_POLE_PX, flagTopY, MAILBOX_FLAG_WIDTH_PX, MAILBOX_FLAG_HEIGHT_PX);
  box.lineStyle(MAILBOX_OUTLINE_PX, PALETTE.outline, 1);
  box.strokeRect(flagBaseX + MAILBOX_FLAG_POLE_PX, flagTopY, MAILBOX_FLAG_WIDTH_PX, MAILBOX_FLAG_HEIGHT_PX);

  // Cream nameplate on the box front (the MELIN label draws over it at props+1).
  track(
    scene.add
      .rectangle(mailboxX, boxCenterY, boardWidth, MAILBOX_BOARD_HEIGHT_PX, PALETTE.cream)
      .setStrokeStyle(MAILBOX_OUTLINE_PX, PALETTE.outline)
      .setDepth(DEPTHS.props)
  );

  // --- Standing (brown-haired) Caleb, waving outside; runs to the bike on
  // pickup. A Container of the tex-caleb Image (real brown-haired art as of
  // PLAN-10 ST-2 — src/art/sprites.mjs drawCaleb; the old brown hair-band overlay
  // is gone, see calebFigure.ts), so one tween slides it. The persistent PILLION
  // Caleb (passenger.ts, activated below) uses the same tex-caleb sprite, so he
  // now reads as brown-haired seated behind Gabby too. ---
  const calebStandX = pickupX + CALEB_STAND_X_OFFSET_PX;
  const calebGroundY = ctx.terrain.heightAt(calebStandX);
  const standingCaleb = track(
    scene.add
      .container(calebStandX, calebGroundY, calebFigureParts(scene))
      .setDepth(DEPTHS.props + 2)
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
