import { describe, expect, it } from 'vitest';
// shouldBlock is the pure, Phaser-free AND DOM-free core of the portrait
// rotate-phone guard (PLAN-03 task 3). orientation.ts uses `import type Phaser`
// (erased at compile) and only ever touches document/window/screen/the Phaser
// `game` INSIDE installOrientationGuard at runtime — never at module import —
// so importing this predicate here pulls no Phaser/DOM into the Node test env
// (same pure-vs-browser split as pedals.ts's zoomCompensated* helpers). The
// DOM overlay + loop.sleep/wake wiring is browser-verified instead
// (scripts/playtest-orientation.mjs).
import { shouldBlock } from '../src/systems/orientation';

describe('shouldBlock', () => {
  it('blocks ONLY when the device is portrait AND touch (a phone held upright)', () => {
    expect(shouldBlock(true, true)).toBe(true);
  });

  it('does not block a touch device in landscape (the normal riding position)', () => {
    expect(shouldBlock(false, true)).toBe(false);
  });

  it('NEVER blocks a non-touch device, even in a portrait-shaped window — desktop/dev is never interrupted by a narrow window (the load-bearing "desktop not blocked" guarantee)', () => {
    expect(shouldBlock(true, false)).toBe(false);
  });

  it('does not block a non-touch device in landscape either', () => {
    expect(shouldBlock(false, false)).toBe(false);
  });
});
