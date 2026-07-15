import { describe, expect, it } from 'vitest';
// zoomCompensatedPosition / zoomCompensatedScale are the pure, Phaser-free
// core of the touch-pedals HUD (PLAN-03 task 2). pedals.ts uses `import type
// Phaser` and only ever calls METHODS on the scene handed to it at runtime
// (same pure-vs-browser split as terrain.ts/input.ts), so importing it here
// pulls NO phaser runtime into the Node test env — these helpers are the
// Node-testable path; the Zone/Container wiring is browser-verified
// (scripts/playtest-touch.mjs).
//
// WHY they exist: GameScene's camera ZOOMS (CAMERA.zoomMin..zoomMax) during
// play. A setScrollFactor(0) HUD object is still rendered through that zoom,
// which pivots around the screen center (DESIGN_WIDTH/2, DESIGN_HEIGHT/2) —
// so a corner-anchored HUD object DRIFTS inward and SHRINKS as the camera
// zooms out (the render maps a world point P to `pivot + (P - pivot) * zoom`).
// These helpers compute the counter-position + counter-scale that cancel it
// exactly, holding each pedal at a FIXED screen point and FIXED apparent
// size. The tests pin that cancellation.
import { zoomCompensatedPosition, zoomCompensatedScale } from '../src/systems/pedals';

/** GameScene's zoom pivot — the design-screen center. */
const PIVOT = { x: 640, y: 360 };

/** Re-applies the camera's render transform to a world point, so a test can
 * assert "compensated position, once rendered, lands back on the target
 * screen point". Mirrors the mapping documented in pedals.ts. */
function render(worldPoint: { x: number; y: number }, pivot: { x: number; y: number }, zoom: number) {
  return {
    x: pivot.x + (worldPoint.x - pivot.x) * zoom,
    y: pivot.y + (worldPoint.y - pivot.y) * zoom,
  };
}

describe('zoomCompensatedScale', () => {
  it('is identity (1) at zoom 1 — stationary camera, native scale', () => {
    expect(zoomCompensatedScale(1)).toBe(1);
  });

  it('is 1/zoom so scale * zoom == 1 (apparent size held) at zoom 0.85', () => {
    expect(zoomCompensatedScale(0.85)).toBeCloseTo(1 / 0.85, 10);
    // The load-bearing property: object scale * camera zoom == native size.
    expect(zoomCompensatedScale(0.85) * 0.85).toBeCloseTo(1, 10);
  });
});

describe('zoomCompensatedPosition', () => {
  it('is the identity at zoom 1 (position == target screen point)', () => {
    const screen = { x: 1040, y: 570 };
    expect(zoomCompensatedPosition(screen, PIVOT, 1)).toEqual(screen);
  });

  it('leaves the pivot itself fixed at any zoom (zero lever arm)', () => {
    expect(zoomCompensatedPosition(PIVOT, PIVOT, 0.85)).toEqual(PIVOT);
    expect(zoomCompensatedPosition(PIVOT, PIVOT, 0.5)).toEqual(PIVOT);
  });

  it('pushes a corner-anchored point OUTWARD at zoom 0.85 (counters the inward drift)', () => {
    // Gas hit-region center screen point (bottom-right). At zoom 0.85 the
    // compensated world position must sit further from the pivot by 1/zoom.
    const screen = { x: 1040, y: 570 };
    const p = zoomCompensatedPosition(screen, PIVOT, 0.85);
    expect(p.x).toBeCloseTo(640 + (1040 - 640) / 0.85, 10); // 1110.588...
    expect(p.y).toBeCloseTo(360 + (570 - 360) / 0.85, 10); // 607.058...
    // Outward, not inward: x moved right of the target, y below it.
    expect(p.x).toBeGreaterThan(screen.x);
    expect(p.y).toBeGreaterThan(screen.y);
  });

  it('CANCELS the camera render exactly — compensated point renders back to the target (zoom 0.85)', () => {
    const screen = { x: 108, y: 612 }; // brake face-center screen anchor
    const p = zoomCompensatedPosition(screen, PIVOT, 0.85);
    expect(render(p, PIVOT, 0.85)).toEqual({
      x: expect.closeTo(screen.x, 10),
      y: expect.closeTo(screen.y, 10),
    });
  });

  it('CANCELS the camera render at an intermediate zoom too (0.92)', () => {
    const screen = { x: 1172, y: 612 }; // gas face-center screen anchor
    const back = render(zoomCompensatedPosition(screen, PIVOT, 0.92), PIVOT, 0.92);
    expect(back.x).toBeCloseTo(screen.x, 10);
    expect(back.y).toBeCloseTo(screen.y, 10);
  });
});
