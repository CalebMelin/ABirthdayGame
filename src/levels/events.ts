// Scripted-event dispatch (PLAN-05 ST-4): the seam GameScene calls once in
// create() to kick off a level's `events`. Every variant is a DOCUMENTED
// NO-OP placeholder today — the real implementations (level 7 traffic, level
// 15 police, level 12 Caleb pickup, level 11 wheelie-rider, level 18 billboard)
// land in PLAN-06/07. This satisfies PLAN-05's "the loader must already
// dispatch them" + its acceptance criterion "special-event levels dispatch
// their (stub) events without errors": it never throws and renders nothing yet.
//
// The `switch (event.type)` is EXHAUSTIVE with a `never` guard in the default
// case, so adding a future LevelEvent variant without a case here is a compile
// error rather than a silently-ignored event.
//
// No runtime Phaser import (the `import type Phaser` below is erased at compile
// time), so this stays cheap to import; the `scene` param is threaded through
// for the PLAN-06/07 implementations that WILL spawn cars / play cutscenes.
import type Phaser from 'phaser';
import type { LevelConfig } from './types';

/**
 * Dispatches each of `config.events` (none if absent). Currently every case is
 * a no-op placeholder — see the module comment. Never throws.
 *
 * @param scene reserved for the PLAN-06/07 implementations (car/cutscene
 *   spawning); referenced today only in a dev-only breadcrumb below so the
 *   param stays live for those plans.
 */
export function dispatchLevelEvents(scene: Phaser.Scene, config: LevelConfig): void {
  const events = config.events ?? [];

  if (import.meta.env.DEV && events.length > 0) {
    // Dev-only breadcrumb (Vite strips it from production builds): confirms the
    // loader handed this level's scripted events to the scene — useful while
    // verifying the special-event levels (7/11/12/15/18) dispatch cleanly.
    console.debug(`[events] level ${config.id} (${scene.scene.key}): ${events.length} event(s)`);
  }

  for (const event of events) {
    switch (event.type) {
      case 'traffic':
        // TODO(PLAN-06): spawn level 7's oncoming "invisible cars" traffic
        // (cars drift into Gabby's lane; collisions = soft fail/restart).
        break;
      case 'police':
        // TODO(PLAN-06): start level 15's police chase (a pursuer from behind;
        // falling too far back = soft fail/restart).
        break;
      case 'calebPickup':
        // TODO(PLAN-06): play level 12's mid-level Caleb pickup cutscene, then
        // ride two-up (Caleb pillion) for the rest of the game.
        break;
      case 'wheelieRider':
        // TODO(PLAN-07): level 11's guaranteed, non-interactive easter egg —
        // an all-black rider wheelies past on a yellow motorcycle.
        break;
      case 'billboard':
        // TODO(PLAN-07): render level 18's easter-egg billboard text
        // (event.text — locked personal content) among the decoy billboards.
        break;
      default: {
        // Exhaustiveness guard: a new LevelEvent variant with no case above
        // makes `event` no longer `never` here -> compile error. Runtime no-op
        // — never reached for a valid config, and this stub must not throw.
        const _exhaustive: never = event;
        void _exhaustive;
        break;
      }
    }
  }
}
