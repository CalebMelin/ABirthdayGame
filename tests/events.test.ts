// Seam tests for dispatchLevelEvents (PLAN-06 Task A). events.ts has NO runtime
// Phaser import (its `import type` lines are erased), so the dispatcher runs in
// plain Node. The `traffic` case (PLAN-06 task B, src/systems/traffic.ts), the
// `calebPickup` case (PLAN-06 task C, src/systems/pickup.ts), and the
// `wheelieRider` case (PLAN-07 task 2, src/systems/wheelieRider.ts) now construct
// REAL systems (all import-safe: no runtime Phaser, no ui.ts), so the stand-ins
// below are functional stubs rich enough for createTraffic to build its sprite
// pool + run a frame, createPickup to build its house/mailbox/Caleb GameObjects,
// and createWheelieRider to prepare its textures (police is still inert and
// ignores them) — without a real Phaser. These lock the seam's handle-count
// contract.
import { describe, expect, it } from 'vitest';
import { dispatchLevelEvents } from '../src/levels/events';
import type { EventContext } from '../src/levels/events';
import type { LevelConfig, LevelEvent } from '../src/levels/types';

/** A chainable Phaser GameObject stub: any method returns the same node (so
 * `scene.add.rectangle(...).setOrigin(...).setDepth(...)` chains), and it carries
 * a numeric `width` so createPickup can size its MELIN mailbox board to fit its
 * label. One generic stub covers every scene.add.* factory createTraffic /
 * createPickup use (image/rectangle/graphics/text/container). */
function stubNode(): unknown {
  const target: Record<string, unknown> = { width: 40, height: 20, type: 'Stub', x: 0, y: 0 };
  const proxy: unknown = new Proxy(target, {
    get(t, prop) {
      return prop in t ? t[prop as string] : () => proxy;
    },
  });
  return proxy;
}

// Scene stub: dispatch reads scene.scene.key (dev breadcrumb); createTraffic
// calls scene.add.image(...) + registers/removes a matter.world 'beforeupdate'
// listener; createPickup calls scene.add.rectangle/graphics/text/image/container
// and (only during the cutscene, not at construction) scene.time.now /
// scene.tweens.add; createWheelieRider calls scene.textures.exists(...) while
// preparing its two textures (both bail to their "not registered"/"cache miss"
// fallback here — see palette.ts's recolorTexture — so no canvas/get/createCanvas
// stub is needed) and, on the normal construction path (bike.x stays 0, so the
// trigger never fires — see fakeCtx below), never touches scene.cameras. `add` is
// a Proxy returning a fresh chainable node per factory, which also covers
// createWheelieRider's own scene.add.graphics()-drawn placeholder texture.
const fakeScene = {
  scene: { key: 'GameScene' },
  add: new Proxy({}, { get: () => () => stubNode() }),
  matter: { world: { on: () => {}, off: () => {} } },
  time: { now: 0 },
  tweens: { add: () => stubNode(), killTweensOf: () => {} },
  textures: { exists: () => false },
} as unknown as Parameters<typeof dispatchLevelEvents>[0];

// Ctx stub: createTraffic's update() reads isEnded/bike.x/terrain.heightAt and
// may call softFail; createPickup reads terrain.heightAt at construction (to seat
// its props on the ground); createWheelieRider reads worldLength (the default-x
// fallback) at construction. With bike.x at 0 no encounter/pickup/wheelie-rider
// trigger fires, so update() is a safe no-op here.
const fakeCtx = {
  calebPickedUp: false,
  bike: { x: 0, y: 500, speed: 10, airborne: false },
  terrain: { heightAt: () => 500 },
  worldLength: 8000,
  finishX: 7500,
  passenger: { active: false, activate: () => {} },
  isEnded: () => false,
  softFail: () => {},
  setInputOverride: () => {},
} as unknown as EventContext;

function configWith(events: LevelEvent[]): LevelConfig {
  return {
    id: 1,
    name: 'test',
    theme: 'suburbs',
    terrain: { seed: 1, length: 8000, hilliness: 0, jumps: [] },
    events,
  };
}

describe('dispatchLevelEvents', () => {
  it('returns no handles when a level has no events', () => {
    const config = { ...configWith([]) };
    delete (config as { events?: unknown }).events;
    expect(dispatchLevelEvents(fakeScene, config, fakeCtx)).toEqual([]);
  });

  it('returns one handle each for traffic / police / calebPickup / wheelieRider', () => {
    for (const event of [
      { type: 'traffic' },
      { type: 'police' },
      { type: 'calebPickup', x: 6250 },
      { type: 'wheelieRider', x: 6500 },
    ] satisfies LevelEvent[]) {
      const handles = dispatchLevelEvents(fakeScene, configWith([event]), fakeCtx);
      expect(handles).toHaveLength(1);
      expect(typeof handles[0].update).toBe('function');
      expect(typeof handles[0].destroy).toBe('function');
    }
  });

  it('returns a real handle for wheelieRider (PLAN-07 task 2) but NO handle for the billboard stub', () => {
    const handles = dispatchLevelEvents(
      fakeScene,
      configWith([
        { type: 'wheelieRider', x: 500 },
        { type: 'billboard', x: 500, text: 'hi' },
      ]),
      fakeCtx
    );
    expect(handles).toHaveLength(1);
    expect(typeof handles[0].update).toBe('function');
    expect(typeof handles[0].destroy).toBe('function');
  });

  it('returns one handle per real event, in order, for a mixed list', () => {
    const handles = dispatchLevelEvents(
      fakeScene,
      configWith([
        { type: 'traffic' },
        { type: 'wheelieRider', x: 500 },
        { type: 'police' },
      ]),
      fakeCtx
    );
    // traffic + wheelieRider + police all produce real handles now (PLAN-07 task 2).
    expect(handles).toHaveLength(3);
  });

  it('inert handles are safe to update() and destroy() (no throw)', () => {
    const [handle] = dispatchLevelEvents(fakeScene, configWith([{ type: 'traffic' }]), fakeCtx);
    expect(() => {
      handle.update();
      handle.destroy();
    }).not.toThrow();
  });

  it('the wheelieRider handle is safe to update() and destroy() (no throw), incl. double-destroy', () => {
    const [handle] = dispatchLevelEvents(fakeScene, configWith([{ type: 'wheelieRider', x: 6500 }]), fakeCtx);
    expect(() => {
      handle.update();
      handle.destroy();
      handle.destroy(); // idempotent — a second teardown must never throw
    }).not.toThrow();
  });
});
