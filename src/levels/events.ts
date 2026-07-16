// Scripted-event dispatch + seam (PLAN-05 ST-4 stub → PLAN-06 Task A seam).
// GameScene calls dispatchLevelEvents once in create() to kick off a level's
// `events`; it now RETURNS an array of handles the scene drives every frame
// (update), tears down on shutdown (destroy), and can consult when the bike
// crosses the finish flag (onFinish, e.g. level 15's cop spin-out finale).
//
// Task A wired the SEAM; the per-event systems land per later PLAN-06/07 task.
// Level 7 traffic (task B), level 12's Caleb pickup (task C), and level 15's
// police chase (task D) are now REAL — the `traffic`/`calebPickup`/`police`
// cases construct createTraffic (src/systems/traffic.ts) / createPickup
// (src/systems/pickup.ts) / createPolice (src/systems/police.ts). Level 11's
// wheelieRider easter egg (PLAN-07 task 2) and level 18's billboard easter egg
// (PLAN-07 task 3) are now REAL too — the `wheelieRider`/`billboard` cases
// construct createWheelieRider (src/systems/wheelieRider.ts) / createBillboard
// (src/systems/billboard.ts). EVERY LevelEvent variant now dispatches to a real
// system. This never throws.
//
// The `switch (event.type)` stays EXHAUSTIVE with a `never` guard in the
// default case, so adding a future LevelEvent variant without a case here is a
// compile error rather than a silently-ignored event.
//
// No runtime Phaser import (every `import type` below is erased at compile
// time), so this stays cheap to import; `scene`/`ctx` are threaded through for
// the PLAN-06 implementations that WILL spawn cars / play cutscenes.
import type Phaser from 'phaser';
import type { LevelConfig } from './types';
import type { BikeHandle } from '../systems/bike';
import type { TerrainHandle } from '../systems/terrain';
import type { PassengerHandle } from '../systems/passenger';
import { createTraffic } from '../systems/traffic';
import { createPickup } from '../systems/pickup';
import { createPolice } from '../systems/police';
import { createWheelieRider } from '../systems/wheelieRider';
import { createBillboard } from '../systems/billboard';

// ---------------------------------------------------------------------------
// Public seam types (PLAN-06 Task A — the contract every event system + the
// consuming GameScene share; later tasks B/C/D construct handles to this shape).
// ---------------------------------------------------------------------------

/** A live scripted-event system GameScene drives. Returned (one per real
 * event) by dispatchLevelEvents. */
export interface LevelEventHandle {
  /** Called once per GameScene.update() render frame, after bike.update()
   * (and only while the run is live — GameScene stops calling this once the
   * run has ended/finished). */
  update(): void;
  /** Called on GameScene SHUTDOWN. Destroys every GameObject the handle made
   * (these systems are non-Matter, so teardown runs outside the matter-world
   * guard, same as backdrop/decorations). */
  destroy(): void;
  /** Optional: called when the bike crosses the finish flag, BEFORE GameScene
   * transitions to LevelComplete. Return a delay in ms to hold the transition
   * (for the police escape finale); return void/0 for no delay. */
  onFinish?(): number | void;
}

/** What GameScene passes into the event systems. Systems capture the concrete
 * references handed in — safe, because these handles are recreated every
 * create(); `bike` may be read every frame via the getters it exposes. */
export interface EventContext {
  /** Fresh per create(); read bike.x, bike.velocityX, bike.speed,
   * bike.airborne, bike.chassis. */
  bike: BikeHandle;
  /** heightAt(x), worldLength. */
  terrain: TerrainHandle;
  finishX: number;
  worldLength: number;
  /** Derived at spawn (see save.ts deriveCalebPickedUp) — never a stored flag. */
  calebPickedUp: boolean;
  /** Shared persistent passenger; level 12's pickup calls passenger.activate(). */
  passenger: PassengerHandle;
  /** Whether the run has ended (crashed / fell / finished). Lets a system
   * OBSERVE a fail/finish it didn't cause — e.g. the police cop freezing its
   * pursuit once the player is caught by something else, or a finale reacting
   * to the finish. Note: GameScene stops calling handle.update() the instant
   * the run ends, so this reads true only inside onFinish() or a stray same-
   * frame call after another handle's softFail — a system must NOT rely on
   * per-frame update() ticks after the run ends (drive finales from
   * tweens/particles, not update()). */
  isEnded(): boolean;
  /** Trigger a soft fail with a CUSTOM overlay message + instant restart. */
  softFail(message: string): void;
  /** Force the bike's pedal input for a cutscene (e.g. auto-brake). null =
   * release override (player back in control). GameScene applies this in
   * update(). */
  setInputOverride(input: { gas: boolean; brake: boolean } | null): void;
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

/**
 * Dispatches each of `config.events` (none if absent), returning the live
 * handles GameScene drives. Traffic/pickup/police/wheelieRider/billboard each
 * construct a real system — see the module comment. Never throws.
 *
 * @param scene runtime handle to Phaser's factories — passed straight through
 *   to createTraffic/createPickup/createPolice/createWheelieRider/
 *   createBillboard, each of which spawns cars/plays cutscenes/builds its own
 *   GameObjects directly off it (also used for the dev-only breadcrumb below).
 * @param ctx the shared {@link EventContext} the real systems will consume.
 */
export function dispatchLevelEvents(
  scene: Phaser.Scene,
  config: LevelConfig,
  ctx: EventContext
): LevelEventHandle[] {
  const events = config.events ?? [];
  const handles: LevelEventHandle[] = [];

  if (import.meta.env.DEV && events.length > 0) {
    // Dev-only breadcrumb (Vite strips it from production builds): confirms the
    // loader handed this level's scripted events to the scene, and surfaces the
    // derived passenger state — useful while verifying levels 7/11/12/15/18.
    console.debug(
      `[events] level ${config.id} (${scene.scene.key}): ${events.length} event(s), calebPickedUp=${ctx.calebPickedUp}`
    );
  }

  for (const event of events) {
    switch (event.type) {
      case 'traffic':
        // Level 7's oncoming "invisible cars" (PLAN-06 task B): cars drift into
        // Gabby's near lane and must be braked past; a hit soft-fails with the
        // verbatim "They really don't see us!! Go again 💛" + instant restart.
        handles.push(createTraffic(scene, event, ctx));
        break;
      case 'police':
        // Level 15's chase (PLAN-06 task D): a single non-Matter cop rubber-bands
        // from behind — holding gas always pulls away (copMaxSpeedFrac < 1), only
        // stopping/crashing lets it close; caught soft-fails with the verbatim
        // "They got us!! ...let's pretend that didn't happen 🚔" + instant restart,
        // and onFinish() plays the cop spin-out + "WOOHOO!" and holds the hand-off.
        handles.push(createPolice(scene, event, ctx));
        break;
      case 'calebPickup':
        // Level 12's mid-level stop at Caleb's house (PLAN-06 task C): as the
        // bike reaches the pickup x it auto-brakes to a stop (ctx.setInputOverride,
        // NOT a force), Caleb hops on with a "Caleb hopped on!!" toast, then
        // ctx.passenger.activate() makes him ride pillion for the rest of the game.
        handles.push(createPickup(scene, event, ctx));
        break;
      case 'wheelieRider':
        // Level 11's guaranteed, non-interactive easter egg (PLAN-07 task 2): an
        // all-black helmeted rider on a yellow motorcycle wheelies past,
        // overtaking from behind, then rides off ahead. Never fails the player,
        // never touches input — see src/systems/wheelieRider.ts.
        handles.push(createWheelieRider(scene, event, ctx));
        break;
      case 'billboard':
        // Level 18's easter-egg billboard (PLAN-07 task 3): a static
        // decoration rendered through the SAME shared drawer, same
        // DEPTHS.props layer, same scroll behavior as every decoy billboard
        // in the level's `decorations` array (see DECISIONS.md's
        // parallax-vs-same-layer judgment call) — so it reads as "just
        // another billboard," discoverable only by reading it. `config.theme`
        // is passed through so its frame color matches the level's decoys
        // exactly. Zero Matter bodies, no fixed-step listener, never
        // fails/awards anything.
        handles.push(createBillboard(scene, event, ctx, config.theme));
        break;
      default: {
        // Exhaustiveness guard: a new LevelEvent variant with no case above
        // makes `event` no longer `never` here -> compile error. Runtime no-op
        // — never reached for a valid config, and this must not throw.
        const _exhaustive: never = event;
        void _exhaustive;
        break;
      }
    }
  }

  return handles;
}
