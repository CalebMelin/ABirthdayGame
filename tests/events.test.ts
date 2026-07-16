// Seam tests for dispatchLevelEvents (PLAN-06 Task A). events.ts has NO runtime
// Phaser import (its `import type` lines are erased), so the dispatcher runs in
// plain Node. The `traffic` case now constructs a REAL system (PLAN-06 task B,
// src/systems/traffic.ts — itself import-safe: no runtime Phaser, no ui.ts), so
// the stand-ins below are functional stubs rich enough for createTraffic to
// build its sprite pool + run a frame without a real Phaser (police/pickup are
// still inert and ignore them). These lock the seam's handle-count contract.
import { describe, expect, it } from 'vitest';
import { dispatchLevelEvents } from '../src/levels/events';
import type { EventContext } from '../src/levels/events';
import type { LevelConfig, LevelEvent } from '../src/levels/types';

/** A chainable Phaser.GameObjects.Image stub — every setter returns itself. */
function stubImage(): Record<string, () => unknown> {
  const image: Record<string, () => unknown> = {};
  for (const method of [
    'setDepth',
    'setVisible',
    'setOrigin',
    'setFlipX',
    'setAlpha',
    'setPosition',
    'setTint',
    'setScale',
    'destroy',
  ]) {
    image[method] = () => image;
  }
  return image;
}

// Scene stub: dispatch reads scene.scene.key (dev breadcrumb); createTraffic
// calls scene.add.image(...) to build its pool.
const fakeScene = {
  scene: { key: 'GameScene' },
  add: { image: () => stubImage() },
} as unknown as Parameters<typeof dispatchLevelEvents>[0];

// Ctx stub: createTraffic's update() reads isEnded/bike.x/terrain.heightAt and
// may call softFail. With bike.x at 0 no encounter triggers, so update() is a
// safe no-op here.
const fakeCtx = {
  calebPickedUp: false,
  bike: { x: 0 },
  terrain: { heightAt: () => 500 },
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

  it('returns one handle each for traffic / police / calebPickup', () => {
    for (const event of [
      { type: 'traffic' },
      { type: 'police' },
      { type: 'calebPickup', x: 6250 },
    ] satisfies LevelEvent[]) {
      const handles = dispatchLevelEvents(fakeScene, configWith([event]), fakeCtx);
      expect(handles).toHaveLength(1);
      expect(typeof handles[0].update).toBe('function');
      expect(typeof handles[0].destroy).toBe('function');
    }
  });

  it('returns NO handle for the PLAN-07 wheelieRider / billboard stubs', () => {
    const handles = dispatchLevelEvents(
      fakeScene,
      configWith([
        { type: 'wheelieRider', x: 500 },
        { type: 'billboard', x: 500, text: 'hi' },
      ]),
      fakeCtx
    );
    expect(handles).toEqual([]);
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
    // traffic + police produce handles; wheelieRider does not.
    expect(handles).toHaveLength(2);
  });

  it('inert handles are safe to update() and destroy() (no throw)', () => {
    const [handle] = dispatchLevelEvents(fakeScene, configWith([{ type: 'traffic' }]), fakeCtx);
    expect(() => {
      handle.update();
      handle.destroy();
    }).not.toThrow();
  });
});
