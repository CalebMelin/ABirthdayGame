// Seam tests for dispatchLevelEvents (PLAN-06 Task A). events.ts has NO runtime
// Phaser import (its `import type` lines are erased), and the inert handles it
// returns today never touch `scene`/`ctx`, so the dispatcher runs in plain Node
// with minimal stand-ins. These lock the seam's shape so later tasks (B/C/D)
// that swap inert handles for real systems keep the same handle-count contract.
import { describe, expect, it } from 'vitest';
import { dispatchLevelEvents } from '../src/levels/events';
import type { EventContext } from '../src/levels/events';
import type { LevelConfig, LevelEvent } from '../src/levels/types';

// Minimal stand-ins — dispatch only reads scene.scene.key (dev breadcrumb) and
// passes ctx straight through to the (inert) handles, which ignore it.
const fakeScene = { scene: { key: 'GameScene' } } as unknown as Parameters<
  typeof dispatchLevelEvents
>[0];
const fakeCtx = { calebPickedUp: false } as unknown as EventContext;

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
