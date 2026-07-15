// Touch pedals (PLAN-03 task 2): a screen-anchored HUD gas/brake control for
// touch devices. GAS sits bottom-RIGHT, BRAKE bottom-LEFT; both are big
// pixel-art buttons over generous invisible hit Zones (the whole bottom
// corner), driven by Phaser multi-pointer input so both can be held at once
// and a swap mid-press works.
//
// IMPORTANT — like terrain.ts/input.ts/bike.ts, this file has NO RUNTIME
// import of 'phaser': vitest runs in plain Node (no DOM/WebGL) and importing
// the real Phaser module there crashes. `import type Phaser` below is erased
// at compile time (verbatimModuleSyntax + erasableSyntaxOnly). To stay
// runtime-Phaser-free, createPedals only ever CALLS METHODS on the `scene`
// handed to it (never `new Phaser.Geom.*` etc — the Zone's default hit area
// is used instead, computed inside Phaser from the Zone's width/height). The
// pure zoomCompensated* helpers touch no Phaser at all and are the Node-
// tested core (tests/pedals.test.ts); the Zone/Container wiring is browser-
// verified (scripts/playtest-touch.mjs).
//
// CRITICAL — DO NOT BREAK BACKFLIPS. The bike keys its flip mechanic off REAL
// press/release edges delivered to input.ts (see mergePedals / bike.ts
// nextPedalAirFresh). Every pointer handler below therefore sets the touch
// flag the INSTANT the event fires: pointerdown -> true, pointerup/out/
// upoutside -> false. No timers, no debounce, no coalescing of rapid
// release-repress, no re-press on drag-back-in. A press is true the instant
// it happens; a release is false the instant it happens; nothing in between.
import type Phaser from 'phaser';
import { DESIGN_WIDTH, DESIGN_HEIGHT, PALETTE, DEPTHS, PEDALS } from './constants';
import type { GameInput } from './input';
// isTouchDevice moved to the shared device.ts (PLAN-03 task 3): the touch
// pedals and the portrait orientation guard are now both consumers, so the
// device predicate lives in one place. Same runtime-safe contract as before
// (only touches navigator/window when called).
import { isTouchDevice } from './device';

// ---------------------------------------------------------------------------
// Pure helpers — no Phaser/DOM, unit-tested in tests/pedals.test.ts.
// ---------------------------------------------------------------------------

/** A plain 2D point. */
export interface Vec2 {
  x: number;
  y: number;
}

/**
 * The world position a setScrollFactor(0) object must sit at so that, once
 * the camera renders it through `zoom` (which pivots around `pivot` = the
 * screen center), it appears at the FIXED screen point `screen`.
 *
 * The camera maps a world point P to screen `pivot + (P - pivot) * zoom`.
 * Solving `screen = pivot + (P - pivot) * zoom` for P gives the formula
 * below — the exact inverse — so a corner-anchored HUD object no longer
 * drifts inward/shrinks as the camera zooms out. Pure; `pivot` is a
 * parameter (never a hidden global) so it stays trivially testable.
 */
export function zoomCompensatedPosition(screen: Vec2, pivot: Vec2, zoom: number): Vec2 {
  return {
    x: pivot.x + (screen.x - pivot.x) / zoom,
    y: pivot.y + (screen.y - pivot.y) / zoom,
  };
}

/** The object scale that cancels the camera zoom, holding apparent size
 * constant: `scale * zoom == 1`, so a native-sized pedal stays native-sized
 * on screen at any zoom. */
export function zoomCompensatedScale(zoom: number): number {
  return 1 / zoom;
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** The handle GameScene holds for the pedals over one run. Created in
 * create(), laid out every update(), destroyed in the SHUTDOWN handler —
 * same per-run lifecycle as the bike/terrain/input handles, so scene.restart
 * can't leak Zones or listeners. On pure desktop it is an inert no-op. */
export interface PedalsHandle {
  /** Re-position + re-scale both pedals so each holds its fixed on-screen
   * point and size under the current camera `zoom`. Call every frame from
   * GameScene.update(), AFTER updateCamera() (freshest zoom). No-op on
   * desktop. */
  layout(zoom: number): void;
  /** Destroy both pedals' Zones + visuals (and their listeners). Safe to
   * call once per run from the scene's SHUTDOWN handler. No-op on desktop. */
  destroy(): void;
}

// ---------------------------------------------------------------------------
// Phaser wiring (never imports Phaser at runtime — see module doc).
// ---------------------------------------------------------------------------

/** The camera's zoom pivot — the design-screen center (see CAMERA / the
 * fail-overlay sizing in GameScene, which relies on the same pivot). */
const PIVOT: Vec2 = { x: DESIGN_WIDTH / 2, y: DESIGN_HEIGHT / 2 };

/** Minimum concurrent pointers we need: two thumbs on the two pedals + one
 * of margin. addPointer tops the manager up to this (see createPedals). */
const NEEDED_POINTERS = 3;

/** Which glyph a pedal draws. */
type PedalGlyph = 'gas' | 'brake';

/** Everything one pedal needs: where it lives on screen, what it draws, and
 * the input edges it delivers. */
interface PedalConfig {
  /** Fixed screen point the visible face is centered on. */
  faceCenter: Vec2;
  /** Fixed screen point the invisible hit Zone is centered on (its own
   * anchor — the generous corner region, not the face). */
  hitCenter: Vec2;
  glyph: PedalGlyph;
  /** Face fill while pressed (gas = sunshine, brake = coral). */
  pressedFace: number;
  /** Genuine press edge -> input.setTouch{Gas,Brake}(true). */
  onDown: () => void;
  /** Genuine release edge -> input.setTouch{Gas,Brake}(false). */
  onUp: () => void;
}

/** One built pedal: a layout(zoom) that keeps it screen-fixed, and destroy. */
interface Pedal {
  layout(zoom: number): void;
  destroy(): void;
}

/** Draws the directional glyph centered on (0,0) in its own Graphics so the
 * pressed-state shift just nudges its y. Solid fill (no outline) in plum for
 * crisp contrast on the cream face — placeholder art (real glyphs: PLAN-10). */
function drawGlyph(scene: Phaser.Scene, glyph: PedalGlyph): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  const half = PEDALS.glyphSizePx / 2;
  g.fillStyle(PALETTE.plum, 1);
  if (glyph === 'gas') {
    // Right-pointing triangle (▶) = forward/go.
    g.fillTriangle(-half, -half, -half, half, half, 0);
  } else {
    // Solid square (■) = a distinct "stop" symbol.
    g.fillRect(-half, -half, PEDALS.glyphSizePx, PEDALS.glyphSizePx);
  }
  return g;
}

/** Positions + scales a screen-anchored object so it renders at `screen` at
 * native size under `zoom` (see zoomCompensated* docs). */
function place(
  obj: Phaser.GameObjects.Container | Phaser.GameObjects.Zone,
  screen: Vec2,
  zoom: number
): void {
  const p = zoomCompensatedPosition(screen, PIVOT, zoom);
  obj.setPosition(p.x, p.y);
  obj.setScale(zoomCompensatedScale(zoom));
}

/** Builds one pedal: a chunky pixel face (shadow + outlined face + glyph) in
 * a Container, plus a separate invisible interactive Zone covering the whole
 * bottom corner. Wires the genuine, immediate press/release edges. */
function buildPedal(scene: Phaser.Scene, cfg: PedalConfig): Pedal {
  const size = PEDALS.visibleSizePx;

  // ---- visuals: a Container so the whole face moves/scales as one unit.
  // The container is NOT interactive (the Zone is), so the ui.ts "never
  // setSize() an interactive Container" gotcha does not apply here.
  const shadow = scene.add
    .rectangle(0, PEDALS.shadowOffsetPx, size, size, PALETTE.outline)
    .setOrigin(0.5);
  const face = scene.add
    .rectangle(0, 0, size, size, PALETTE.cream)
    .setOrigin(0.5)
    .setStrokeStyle(PEDALS.outlineWidthPx, PALETTE.outline);
  const glyph = drawGlyph(scene, cfg.glyph);
  const visual = scene.add.container(0, 0, [shadow, face, glyph]);
  visual.setDepth(DEPTHS.hud).setScrollFactor(0);

  // ---- hit area: an invisible Zone covering the whole bottom corner,
  // larger than the visible art. Its DEFAULT hit area (a centered rectangle
  // derived from the Zone's width/height, inside Phaser) is exactly the
  // region we want — so we never reference Phaser.Geom here (keeps this file
  // runtime-Phaser-free; see module doc).
  const zone = scene.add.zone(0, 0, PEDALS.hitRegionWidthPx, PEDALS.hitRegionHeightPx);
  zone.setDepth(DEPTHS.hud).setScrollFactor(0);
  zone.setInteractive();

  // ---- press visuals + GENUINE, IMMEDIATE input edges (see module CRITICAL
  // note). press()/release() are the ONLY places the touch flag flips, and
  // each runs synchronously inside its pointer handler — no filtering.
  const press = (): void => {
    face.setFillStyle(cfg.pressedFace);
    face.y = PEDALS.pressOffsetPx;
    glyph.y = PEDALS.pressOffsetPx;
  };
  const release = (): void => {
    face.setFillStyle(PALETTE.cream);
    face.y = 0;
    glyph.y = 0;
  };
  const onDown = (): void => {
    cfg.onDown(); // -> setTouch*(true) the instant the finger lands
    press();
  };
  const onUp = (): void => {
    cfg.onUp(); // -> setTouch*(false) the instant the finger lifts/leaves
    release();
  };
  zone.on('pointerdown', onDown);
  // Three release paths, all -> false (idempotent): a normal lift over the
  // pedal (pointerup), a finger that slides off the hit region while held
  // (pointerout), and a lift that happens after sliding off (pointerupoutside).
  // We deliberately do NOT listen for pointerover: sliding back in must NOT
  // re-press (that would synthesize an edge the finger never made).
  zone.on('pointerup', onUp);
  zone.on('pointerout', onUp);
  zone.on('pointerupoutside', onUp);

  return {
    layout(zoom: number): void {
      place(visual, cfg.faceCenter, zoom);
      place(zone, cfg.hitCenter, zoom);
    },
    destroy(): void {
      // Destroying removes the objects' input registration + listeners too.
      zone.destroy();
      visual.destroy();
    },
  };
}

/**
 * Builds the touch pedals for a run, or an inert handle on pure desktop.
 *
 * `scene` is used purely as a runtime handle to Phaser's GameObject/Input
 * factories (same contract as createBike/createTerrain/createGameInput) —
 * this module never imports Phaser itself. `input` is the task-1 GameInput
 * the pedals feed via setTouchGas/setTouchBrake.
 *
 * On a non-touch device (see isTouchDevice) NOTHING is created and an inert
 * no-op handle is returned — pedals show on touch-capable devices only, never
 * on pure desktop (they'd just clutter a mouse player's screen and steal
 * clicks).
 */
export function createPedals(scene: Phaser.Scene, input: GameInput): PedalsHandle {
  if (!isTouchDevice()) {
    // Pure desktop: inert — no Zones, no visuals, no pointers added. Both
    // handle methods are no-ops so GameScene wires them unconditionally.
    return { layout: () => {}, destroy: () => {} };
  }

  // Guarantee >= 3 concurrent pointers so both pedals can be held at once and
  // a swap mid-press works. The InputManager PERSISTS across scene.restart(),
  // and addPointer only ever ADDS (capped at 10), so top up to the target
  // instead of blindly +2 every create() (which would creep to the cap over
  // restarts). addPointer is the sanctioned multi-touch enabler (task spec).
  const have = scene.input.manager.pointers.length;
  if (have < NEEDED_POINTERS) {
    scene.input.addPointer(NEEDED_POINTERS - have);
  }

  const half = PEDALS.visibleSizePx / 2;
  // Both faces sit one margin above the bottom edge.
  const faceY = DESIGN_HEIGHT - PEDALS.marginPx - half;
  // Both hit Zones hug the very bottom corner (centered in the corner band).
  const hitY = DESIGN_HEIGHT - PEDALS.hitRegionHeightPx / 2;

  // GAS — bottom RIGHT. BRAKE — bottom LEFT. Independent booleans (they go to
  // different setters), so both can be down simultaneously with no shared
  // state between them.
  const gas = buildPedal(scene, {
    faceCenter: { x: DESIGN_WIDTH - PEDALS.marginPx - half, y: faceY },
    hitCenter: { x: DESIGN_WIDTH - PEDALS.hitRegionWidthPx / 2, y: hitY },
    glyph: 'gas',
    pressedFace: PALETTE.sunshine,
    onDown: () => input.setTouchGas(true),
    onUp: () => input.setTouchGas(false),
  });
  const brake = buildPedal(scene, {
    faceCenter: { x: PEDALS.marginPx + half, y: faceY },
    hitCenter: { x: PEDALS.hitRegionWidthPx / 2, y: hitY },
    glyph: 'brake',
    pressedFace: PALETTE.coral,
    onDown: () => input.setTouchBrake(true),
    onUp: () => input.setTouchBrake(false),
  });

  // Place them once at native zoom (the camera starts at CAMERA.zoomMax = 1)
  // so they render correctly on the very first frame, before update() runs.
  gas.layout(1);
  brake.layout(1);

  return {
    layout(zoom: number): void {
      gas.layout(zoom);
      brake.layout(zoom);
    },
    destroy(): void {
      gas.destroy();
      brake.destroy();
    },
  };
}
