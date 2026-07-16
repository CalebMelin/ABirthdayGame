// Scripted-event dispatch + seam (PLAN-05 ST-4 stub → PLAN-06 Task A seam).
// GameScene calls dispatchLevelEvents once in create() to kick off a level's
// `events`; it now RETURNS an array of handles the scene drives every frame
// (update), tears down on shutdown (destroy), and can consult when the bike
// crosses the finish flag (onFinish, e.g. level 15's cop spin-out finale).
//
// Task A wired the SEAM; the per-event systems land per later PLAN-06 task.
// Level 7 traffic (task B) and level 12's Caleb pickup (task C) are now REAL —
// the `traffic` case constructs createTraffic (src/systems/traffic.ts) and the
// `calebPickup` case constructs createPickup (src/systems/pickup.ts). Police
// (task D) still pushes an INERT handle (`{ update(){}, destroy(){} }`) until it
// lands — see the TODO breadcrumb marking where createPolice goes. The level-11
// wheelieRider + level-18 billboard cases stay PLAN-07 no-op stubs (they push no
// handle). This never throws.
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

/** An inert handle for an event whose real system hasn't been built yet
 * (traffic/police/pickup, PLAN-06 tasks B/C/D). Holds no state and renders
 * nothing — a fresh one per event so a later task can swap in a real handle
 * at exactly that push site without touching the others. */
function inertHandle(): LevelEventHandle {
  return {
    update() {
      // no-op until the real system lands
    },
    destroy() {
      // no-op — nothing was created
    },
  };
}

/**
 * Dispatches each of `config.events` (none if absent), returning the live
 * handles GameScene drives. Traffic constructs a real system; police/pickup
 * return inert handles and wheelieRider/billboard push nothing — see the
 * module comment. Never throws.
 *
 * @param scene runtime handle to Phaser's factories, for the PLAN-06
 *   implementations that spawn cars/play cutscenes (referenced today only in a
 *   dev-only breadcrumb so it stays live for those tasks).
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
        // TODO(PLAN-06 task D): handles.push(createPolice(scene, event, ctx))
        // — level 15's chase (rubber-band pursuer; caught → ctx.softFail(...);
        // onFinish() plays the cop spin-out + "WOOHOO!" and delays the hand-off).
        handles.push(inertHandle());
        break;
      case 'calebPickup':
        // Level 12's mid-level stop at Caleb's house (PLAN-06 task C): as the
        // bike reaches the pickup x it auto-brakes to a stop (ctx.setInputOverride,
        // NOT a force), Caleb hops on with a "Caleb hopped on!!" toast, then
        // ctx.passenger.activate() makes him ride pillion for the rest of the game.
        handles.push(createPickup(scene, event, ctx));
        break;
      case 'wheelieRider':
        // PLAN-07 no-op stub (level 11's easter egg) — pushes no handle.
        break;
      case 'billboard':
        // PLAN-07 no-op stub (level 18's billboard) — pushes no handle.
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
