// Trick detection + tulips (PLAN-07 task 1 — NORTH_STAR §4 "Tricks & tulips").
// Landing a full airborne flip awards a tulip: the bike rig (bike.ts) already
// accumulates signed chassis rotation per air phase (BikeHandle
// .airborneRotation — radians, reset at TAKEOFF so a finished flip's total is
// still readable after touchdown, per the 2026-07-14 DECISIONS entry), and this
// module watches for the LANDING step (airborne true -> false, not crashed) on
// the fixed 60 Hz physics tick, counts full flips from |rotation| with a
// forgiving threshold (TRICKS.flipThresholdDeg = 330 for a 360 flip), then:
//   - persists IMMEDIATELY via save.addTulips (that's what makes "failing a
//     level keeps tulips already awarded" true — the restart re-reads the
//     saved count; an UNLANDED trick simply never reaches the award),
//   - toasts "Backflip!! 🌷" / "Frontflip!! 🌷" (verbatim from PLAN-07 —
//     rotation < 0 is the gas / nose-up direction = backflip, see bike.ts),
//   - arcs a tulip sprite up to the bouquet HUD in the TOP-RIGHT corner.
// The bouquet HUD grows with the persisted count (single tulip -> small bunch
// -> full bouquet, thresholds in TRICKS) with the count beside it, and is
// always visible — a fresh player sees the single tulip + 0 (it teaches the
// mechanic exists), a returning player with 12 sees the full bouquet
// immediately. Purely sentimental: no spending, no shop (NORTH_STAR §4).
//
// ZERO Matter bodies: the bouquet, count, toast, and arcing tulips are plain
// GameObjects (Image/Text/Container), so they never touch NORTH_STAR §8's
// <100-body budget. Detection reads BikeHandle getters only — no collision
// hooks, no bodies, and bike.ts stays byte-unchanged.
//
// Fixed-step discipline (the house rule bike.ts/traffic.ts/police.ts follow):
// the landing transition is sampled on the SAME fixed 60 Hz
// `scene.matter.world.on('beforeupdate', ...)` step the bike updates its
// airborne state on (registered here AFTER the bike's own listener — GameScene
// creates the bike first — so within a step we read POST-update bike state;
// removed in destroy() so it can't leak across scene.restart()). Sampling per
// render frame instead could straddle/miss a landing between frames at low
// refresh rates. Visual layout (the zoom counter-transform) is per render
// frame via layout(), like the pedals/⏸ button.
//
// SCREEN-SPACE + ZOOM: the play camera zooms (CAMERA.zoomMin..zoomMax), and a
// scrollFactor-0 object still scales/drifts with zoom around the screen
// center. Everything here therefore lives inside ONE root Container that
// GameScene's per-frame layout(zoom) counter-positions/-scales with the SAME
// zoomCompensated* helpers as the pedals/⏸ button — children then use plain
// design-space coordinates, and (bonus) the tulip ARC's endpoint lands exactly
// on the bouquet at any zoom. Derivation: the root sits at
// zoomCompensatedPosition((0,0)) with scale 1/zoom, so a child at design point
// c renders at pivot + (pivot + (0-pivot)/zoom + c/zoom - pivot)*zoom = c.
//
// Like bike.ts / police.ts / pickup.ts (and UNLIKE decorations.ts), this
// module has NO runtime Phaser import and does NOT import ui.ts — its only
// non-type imports are the pure constants + pedals.ts's pure zoom helpers —
// so it stays import-safe in Node. The pure helpers below (flip counting,
// direction -> toast, bouquet growth stage, the landing predicate) are
// unit-tested in tests/tricks.test.ts; the createTricks factory only ever
// CALLS METHODS on the runtime scene/bike/save handles handed to it (same
// contract as createBike/createPolice).
import type Phaser from 'phaser';
import {
  TRICKS,
  DEPTHS,
  TEXTURE_KEYS,
  DESIGN_WIDTH,
  DESIGN_HEIGHT,
  FONT_STACK_PIXEL,
  TEXT_COLOR,
  snapFontSize,
} from './constants';
import { zoomCompensatedPosition, zoomCompensatedScale } from './pedals';
import type { Vec2 } from './pedals';
import type { BikeHandle } from './bike';
import type { SaveSystem } from './save';

/** VERBATIM copy from PLAN-07 task 1 (CLAUDE.md Rule 4 — never paraphrase or
 * restyle). Shown when a landed flip's accumulated rotation is NEGATIVE — the
 * gas / nose-up direction (PLAN-02's measured backflips landed at -376/-508
 * degrees). The 🌷 emoji (U+1F337) renders fine in Phaser text — the fail
 * overlay already ships 💛. */
export const BACKFLIP_TOAST_MESSAGE = 'Backflip!! \u{1F337}';

/** VERBATIM copy from PLAN-07 task 1 (CLAUDE.md Rule 4). Shown when a landed
 * flip's accumulated rotation is POSITIVE — the brake / nose-down direction. */
export const FRONTFLIP_TOAST_MESSAGE = 'Frontflip!! \u{1F337}';

// ---------------------------------------------------------------------------
// Pure helpers — no Phaser/Matter/DOM. Unit-tested in tests/tricks.test.ts.
// ---------------------------------------------------------------------------

/** Radians -> degrees without Phaser (this module must stay runtime-Phaser-
 * free — see module doc). BikeHandle.airborneRotation is radians; the award
 * rule below is authored in degrees (TRICKS.flipThresholdDeg). Pure. */
const RAD_TO_DEG = 180 / Math.PI;
export function rotationDegrees(rotationRad: number): number {
  return rotationRad * RAD_TO_DEG;
}

/**
 * The award rule: full flips landed from a signed airborne rotation
 * (degrees). n flips need |rotation| >= n*fullFlipDeg - grace, where grace =
 * fullFlipDeg - flipThresholdDeg (30 at the shipped 330 threshold) — i.e.
 * flips = floor((|deg| + 30) / 360): 330 -> 1, 689 -> 1, 690 -> 2. Forgiving
 * on purpose (NORTH_STAR §4 "≥360°" with the PLAN-07 threshold): the
 * stabilization assist settles the last few degrees after touchdown, so a
 * human-landed 360 reads ~330-380 at the landing step. Total: non-finite
 * input awards 0. Pure.
 */
export function flipsFromDegrees(rotationDeg: number): number {
  if (!Number.isFinite(rotationDeg)) return 0;
  const grace = TRICKS.fullFlipDeg - TRICKS.flipThresholdDeg;
  return Math.floor((Math.abs(rotationDeg) + grace) / TRICKS.fullFlipDeg);
}

/** The toast for a landed flip's direction: NEGATIVE accumulated rotation is
 * the gas / nose-up direction = backflip; positive = frontflip (see the
 * BikeInput docs in bike.ts + PLAN-02's measured -376/-508 backflips). Only
 * meaningful when flipsFromDegrees awarded >= 1 (|deg| >= 330, so the sign is
 * never ambiguous); defined total anyway (0 reads as frontflip, unreachable).
 * Pure. */
export function flipToastMessage(rotationDeg: number): string {
  return rotationDeg < 0 ? BACKFLIP_TOAST_MESSAGE : FRONTFLIP_TOAST_MESSAGE;
}

/** The bouquet HUD's growth stages (`as const` string union — tsconfig's
 * erasableSyntaxOnly forbids TS enums): a single tulip icon, a small bunch
 * (TRICKS.bunchAtCount+), the full bouquet (TRICKS.bouquetAtCount+). */
export type BouquetStage = 'single' | 'bunch' | 'bouquet';

/** Growth stage for a tulip count. Total: negative/NaN counts read as the
 * starting single-tulip stage (they fail both >= checks). Pure. */
export function bouquetStage(count: number): BouquetStage {
  if (count >= TRICKS.bouquetAtCount) return 'bouquet';
  if (count >= TRICKS.bunchAtCount) return 'bunch';
  return 'single';
}

/**
 * The award gate: true ONLY on the fixed step where the bike transitions
 * airborne -> grounded with no crash latched. One award per air phase falls
 * out of the transition edge itself — rotation only resets at the NEXT
 * takeoff, but this can't re-fire until the bike leaves the ground again.
 * The crashed guard is what makes "no award from a crashed landing" true
 * (bike.crashed latches on head-hit, so a mid-air head clip also blocks the
 * eventual touchdown). Rolling over hills never enters here without a real
 * airborne phase first — the "no false positives" acceptance criterion.
 * Pure.
 */
export function isLandingStep(
  wasAirborne: boolean,
  airborneNow: boolean,
  crashed: boolean
): boolean {
  return wasAirborne && !airborneNow && !crashed;
}

// ---------------------------------------------------------------------------
// Presentation-only local constants (placeholder art). Following the
// decorations.ts / pickup.ts / police.ts precedent, the DRAWING dimensions of
// the placeholder bouquet fan / count text / toast / arc start (no gameplay
// effect — PLAN-10 replaces the art) stay here rather than in constants.ts.
// The FEEL/timing/threshold knobs live in the TRICKS block (constants.ts).
// All lengths are px at the 1280x720 DESIGN scale.
// ---------------------------------------------------------------------------

/** The camera's zoom pivot — the design-screen center (same value as
 * pedals.ts's PIVOT / GameScene's PAUSE_BUTTON_PIVOT). */
const PIVOT: Vec2 = { x: DESIGN_WIDTH / 2, y: DESIGN_HEIGHT / 2 };

/** The root container's design-space origin. Children of the root use plain
 * design coordinates (see the module doc's derivation). */
const ROOT_ORIGIN: Vec2 = { x: 0, y: 0 };

/** Anchor insets from the top-right corner, sized against the LARGEST stage
 * (the 7-tulip bouquet fan below). WIDTH is the fan's true bounding
 * half-width — outer tulips at dx ±27 plus a 28-degree-rotated 16x24
 * tulip's ~12.7px half-width ≈ 39.7 — so no stage ever clips the RIGHT
 * edge. HEIGHT is the anchor's drop from the top edge, ≥ the fan's TOP
 * extent (~14px above center: the upright center tulip at dy -2), so no
 * stage ever clips the TOP edge; it is NOT the full bounding half-height —
 * the outer lobes dip ~21px BELOW the anchor (dy +7 plus a rotated tulip's
 * ~14.4px half-height), past this inset but downward into open screen,
 * which clips nothing. */
const BOUQUET_HALF_WIDTH_PX = 40;
const BOUQUET_HALF_HEIGHT_PX = 18;

/** The bouquet cluster's CENTER, design space — one TRICKS.hudMarginPx in
 * from the top-right corner (mirroring the ⏸ button's top-left margin). */
const BOUQUET_ANCHOR: Vec2 = {
  x: DESIGN_WIDTH - TRICKS.hudMarginPx - BOUQUET_HALF_WIDTH_PX,
  y: TRICKS.hudMarginPx + BOUQUET_HALF_HEIGHT_PX,
};

/** Gap between the count text's right edge and the cluster's left edge. */
const COUNT_GAP_PX = 10;
/** Count text size (snapped to the 8px pixel grid by snapFontSize). */
const COUNT_FONT_SIZE_PX = 16;

/** How each growth stage fans its tex-tulip sprites around the cluster
 * center (dx/dy px, angle degrees). Placeholder composition — PLAN-10 may
 * replace the whole cluster with real bouquet art. */
const STAGE_FANS: Record<BouquetStage, ReadonlyArray<{ dx: number; dy: number; angleDeg: number }>> = {
  single: [{ dx: 0, dy: 0, angleDeg: 0 }],
  bunch: [
    { dx: -12, dy: 3, angleDeg: -16 },
    { dx: 0, dy: -2, angleDeg: 0 },
    { dx: 12, dy: 3, angleDeg: 16 },
  ],
  bouquet: [
    { dx: -27, dy: 7, angleDeg: -28 },
    { dx: -18, dy: 3, angleDeg: -18 },
    { dx: -9, dy: 0, angleDeg: -9 },
    { dx: 0, dy: -2, angleDeg: 0 },
    { dx: 9, dy: 0, angleDeg: 9 },
    { dx: 18, dy: 3, angleDeg: 18 },
    { dx: 27, dy: 7, angleDeg: 28 },
  ],
};

/** Trick toast center (design space). y = 260 sits BELOW the intro banner's
 * title row (~200) and the pickup/police toasts (180), so a flip landed near
 * one of those beats never overlaps their text. */
const TOAST_X_PX = DESIGN_WIDTH / 2;
const TOAST_Y_PX = 260;
const TOAST_FONT_SIZE_PX = 32;

/** Where an awarded tulip's arc LAUNCHES from (design screen space) —
 * roughly where the bike reads on screen mid-drive (the camera centers on
 * the bike, offset by lookahead at speed), so the tulip visually flies off
 * the landing up to the bouquet. */
const ARC_START: Vec2 = { x: DESIGN_WIDTH / 2 - 120, y: DESIGN_HEIGHT / 2 + 60 };

/** Centered pixel-font text, replicating ui.ts's createPixelText from the
 * shared font constants — inlined so this module needs no runtime
 * ui.ts/Phaser import (keeping the pure helpers above Node-testable; same
 * discipline as pickup.ts/police.ts). */
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
// Runtime factory (calls scene/bike/save methods only — see module doc).
// ---------------------------------------------------------------------------

/** Matter world per-engine-step event — the SAME fixed 60 Hz hook
 * bike.ts/police.ts drive their rate-based work off. Landing detection runs
 * here, never on the render frame. String literal on purpose: the named
 * constant lives on the runtime Phaser module this file must not import. */
const BEFORE_UPDATE_EVENT = 'beforeupdate';

/** The handle GameScene holds for the trick/tulip system over one run.
 * Created in create() (AFTER the bike, so this module's beforeupdate
 * listener runs after the bike's within each step), laid out every update()
 * with the camera's current zoom, destroyed in the SHUTDOWN handler — same
 * per-run lifecycle as pedals/pauseButton. NOT a LevelEvent: tricks run in
 * every level, so GameScene wires this directly rather than through
 * events.ts. */
export interface TricksHandle {
  /** Re-position + re-scale the HUD root so every screen-anchored piece
   * (bouquet, count, toast, arcing tulips) holds its fixed on-screen spot
   * under the current camera `zoom` — identical math to the pedals/⏸ button.
   * Call every frame from GameScene.update(), AFTER updateCamera(). */
  layout(zoom: number): void;
  /** Removes the fixed-step listener and destroys every GameObject/tween
   * this system created. Safe to call twice. GameScene calls it from the
   * SHUTDOWN handler (outside the matter-world guard — the world listener
   * removal self-guards a nulled world, like police.ts). */
  destroy(): void;
}

/** DEV-only live snapshot the browser playtest harness
 * (scripts/playtest-tulips.mjs) reads off the scene to assert the HUD /
 * persistence / no-false-positive behavior (stripped from prod builds via
 * import.meta.env.DEV, same as __police/__pickup). */
interface TricksDebug {
  /** The count the HUD text currently shows (savedCount minus in-flight arcs). */
  displayedCount(): number;
  /** The persisted count, read live through the real save system. */
  savedCount(): number;
  stage(): BouquetStage;
  countText(): string;
  /** Tulip sprites currently composing the bouquet cluster (1 / 3 / 7). */
  clusterTulips(): number;
  /** Clean (uncrashed) landings observed this run — proof air phases happened. */
  landings(): number;
  /** Tulips awarded this run (0 on a no-flip drive — the negative path). */
  awardedTulips(): number;
  /** Largest |rotation| (degrees) seen at any clean landing this run. */
  maxLandingRotationDeg(): number;
  inFlightArcs(): number;
  /** Live root-container transform + the bouquet anchor (design space), so
   * the harness can compute the RENDERED screen point of the bouquet under
   * the current zoom and assert it never drifts. */
  rootX(): number;
  rootY(): number;
  rootScale(): number;
  anchorX: number;
  anchorY: number;
  backflipMessage: string;
  frontflipMessage: string;
}

/**
 * Builds the trick/tulip system for one run. `scene`/`bike`/`save` are
 * runtime handles only (same contract as createBike/createPolice): the
 * factory never touches globals, so a scene.restart() rebuilds it cleanly
 * from the freshly-persisted count. NO Matter body is created.
 *
 * Deliberately NOT gated on the run having ended: detection only needs the
 * bike's own signals (`airborne`, `crashed`, `airborneRotation`). On an
 * IMMEDIATE finish (no finale delay) the scene transition destroys this
 * system the same frame, so a still-airborne flip never lands under it and
 * is simply never awarded — matching the "unlanded trick never awards"
 * rule. But the run being `ended` does NOT stop detection while the scene
 * lives on: during a finish-DELAY finale hold (e.g. level 15's
 * POLICE.finaleHoldMs ~1200ms) the Matter world keeps stepping and this
 * listener stays live, so a flip landed cleanly during the hold — like one
 * landed during the brief soft-fail overlay window — STILL AWARDS (persist
 * + toast + arc, all swept by the shutdown teardown). Kind and deliberate,
 * per the easy mandate: it WAS landed; genuine crashes are blocked by the
 * crashed latch. NOTE for PLAN-08's per-level tulip accounting: awards can
 * therefore land after `ended` flips true, any time up to scene shutdown.
 */
export function createTricks(
  scene: Phaser.Scene,
  bike: BikeHandle,
  save: SaveSystem
): TricksHandle {
  // --- the screen-space root (see the module doc's zoom derivation) ---
  const root = scene.add.container(ROOT_ORIGIN.x, ROOT_ORIGIN.y).setScrollFactor(0).setDepth(DEPTHS.hud);

  // Every tween-targeted GameObject is tracked so destroy() can kill their
  // tweens BEFORE the root (which owns them all as children) is destroyed —
  // an abnormal shutdown mid-arc/toast/pop can't leave a tween running
  // against a destroyed target (same rationale as police.ts's finale
  // cleanup). Destroyed entries are harmless to killTweensOf.
  const tweened: Phaser.GameObjects.GameObject[] = [];
  function track<T extends Phaser.GameObjects.GameObject>(obj: T): T {
    tweened.push(obj);
    return obj;
  }

  // --- bouquet cluster + count text (always visible, including count 0) ---
  const cluster = track(scene.add.container(BOUQUET_ANCHOR.x, BOUQUET_ANCHOR.y));
  root.add(cluster);
  const countText = pixelText(
    scene,
    BOUQUET_ANCHOR.x - BOUQUET_HALF_WIDTH_PX - COUNT_GAP_PX,
    BOUQUET_ANCHOR.y,
    '0',
    COUNT_FONT_SIZE_PX
  ).setOrigin(1, 0.5);
  root.add(countText);

  let currentStage: BouquetStage | null = null;

  /** Rebuild the cluster's tulip fan for `stage` (cheap + rare: only when
   * the growth stage actually changes). removeAll(true) destroys the old
   * fan's Images. */
  function drawCluster(stage: BouquetStage): void {
    cluster.removeAll(true);
    for (const fan of STAGE_FANS[stage]) {
      const tulip = scene.add.image(fan.dx, fan.dy, TEXTURE_KEYS.tulip);
      tulip.setAngle(fan.angleDeg);
      cluster.add(tulip);
    }
  }

  // --- award/HUD state ---
  // Arcs still flying to the corner: the HUD count shows savedCount minus
  // these, then bumps as each lands (the count "arrives" with the tulip).
  // Persistence never waits for the animation — save.addTulips runs at the
  // landing step itself.
  let inFlight = 0;
  let landings = 0;
  let awardedTulips = 0;
  let maxLandingRotationDeg = 0;
  let activeToast: Phaser.GameObjects.Text | null = null;

  /** Refresh the count text + growth stage from the persisted count (minus
   * in-flight arcs), with an optional arrival "pop". Math.max guards a
   * mid-flight resetAll (savedCount could drop below inFlight). */
  function refreshHud(pop: boolean): void {
    const displayed = Math.max(0, save.getTulips() - inFlight);
    countText.setText(String(displayed));
    const stage = bouquetStage(displayed);
    if (stage !== currentStage) {
      currentStage = stage;
      drawCluster(stage);
    }
    if (pop) {
      scene.tweens.killTweensOf(cluster); // restart, don't stack, mid-pop pops
      cluster.setScale(TRICKS.popScale);
      scene.tweens.add({
        targets: cluster,
        scale: 1,
        duration: TRICKS.popMs,
        ease: 'Quad.easeOut',
      });
    }
  }
  refreshHud(false); // initial render straight from the persisted count

  /** Show the direction toast (replacing any still-fading previous one, so
   * back-to-back flips never overlap text). Same hold-then-fade shape as the
   * pickup/police toasts. */
  function showToast(message: string): void {
    if (activeToast) {
      scene.tweens.killTweensOf(activeToast);
      activeToast.destroy();
    }
    const toast = track(pixelText(scene, TOAST_X_PX, TOAST_Y_PX, message, TOAST_FONT_SIZE_PX));
    root.add(toast);
    activeToast = toast;
    scene.tweens.add({
      targets: toast,
      alpha: 0,
      delay: TRICKS.toastHoldMs,
      duration: TRICKS.toastFadeMs,
      onComplete: () => {
        toast.destroy();
        if (activeToast === toast) activeToast = null;
      },
    });
  }

  /** Launch one awarded tulip arcing from mid-screen up to the bouquet.
   * The per-axis eases (x slow-then-fast, y fast-then-slow toward the
   * higher corner) bow the path upward — it reads as an arc without any
   * bezier bookkeeping, and the single tween targets the sprite itself so
   * destroy()'s killTweensOf covers it. */
  function launchArc(index: number): void {
    const tulip = track(scene.add.image(ARC_START.x, ARC_START.y, TEXTURE_KEYS.tulip));
    root.add(tulip);
    scene.tweens.add({
      targets: tulip,
      x: { value: BOUQUET_ANCHOR.x, ease: 'Sine.easeIn' },
      y: { value: BOUQUET_ANCHOR.y, ease: 'Sine.easeOut' },
      duration: TRICKS.arcDurationMs,
      delay: index * TRICKS.arcStaggerMs,
      onComplete: () => {
        tulip.destroy();
        inFlight = Math.max(0, inFlight - 1);
        refreshHud(true); // the count bumps as the tulip arrives
      },
    });
  }

  /** A landed trick: persist first (restart-safe), then the feedback. */
  function award(flips: number, rotationDeg: number): void {
    save.addTulips(flips);
    awardedTulips += flips;
    showToast(flipToastMessage(rotationDeg));
    inFlight += flips;
    for (let i = 0; i < flips; i++) launchArc(i);
  }

  // --- fixed-step landing detection ---
  // bike.airborne starts false and flips true a step after spawn (the rig
  // spawns with wheel clearance), so the settle touchdown reads as a landing
  // with ~0 rotation -> 0 flips -> no award. Registered AFTER the bike's own
  // beforeupdate listener (GameScene creates the bike first), so this reads
  // the step's POST-update airborne/rotation state.
  let wasAirborne = false;
  function onBeforeUpdate(): void {
    const airborneNow = bike.airborne;
    if (isLandingStep(wasAirborne, airborneNow, bike.crashed)) {
      landings++;
      const rotationDeg = rotationDegrees(bike.airborneRotation);
      const magnitude = Math.abs(rotationDeg);
      if (magnitude > maxLandingRotationDeg) maxLandingRotationDeg = magnitude;
      const flips = flipsFromDegrees(rotationDeg);
      if (flips > 0) award(flips, rotationDeg);
    }
    wasAirborne = airborneNow;
  }
  scene.matter.world.on(BEFORE_UPDATE_EVENT, onBeforeUpdate);

  // DEV-only: expose live state for scripts/playtest-tulips.mjs (stashed on
  // the scene, which persists across scene.restart()). Prod builds skip this
  // whole branch (Vite dead-code-eliminates `import.meta.env.DEV`).
  const devScene = scene as unknown as { __tricks?: TricksDebug };
  if (import.meta.env.DEV) {
    devScene.__tricks = {
      displayedCount: () => Math.max(0, save.getTulips() - inFlight),
      savedCount: () => save.getTulips(),
      stage: () => currentStage ?? 'single',
      countText: () => countText.text,
      clusterTulips: () => cluster.length,
      landings: () => landings,
      awardedTulips: () => awardedTulips,
      maxLandingRotationDeg: () => maxLandingRotationDeg,
      inFlightArcs: () => inFlight,
      rootX: () => root.x,
      rootY: () => root.y,
      rootScale: () => root.scaleX,
      anchorX: BOUQUET_ANCHOR.x,
      anchorY: BOUQUET_ANCHOR.y,
      backflipMessage: BACKFLIP_TOAST_MESSAGE,
      frontflipMessage: FRONTFLIP_TOAST_MESSAGE,
    };
  }

  function layout(zoom: number): void {
    const p = zoomCompensatedPosition(ROOT_ORIGIN, PIVOT, zoom);
    root.setPosition(p.x, p.y);
    root.setScale(zoomCompensatedScale(zoom));
  }
  // Place once at native zoom (the camera starts at CAMERA.zoomMax = 1) so
  // the HUD renders in the right spot on the very first frame — same as the
  // pedals/⏸ button.
  layout(1);

  function destroy(): void {
    // Remove the world listener FIRST (no callbacks during teardown). Same
    // rationale as police.ts: on the normal shutdown/restart path Phaser's
    // Matter plugin has already destroyed the world (taking every world
    // listener with it) and nulled scene.matter.world by the time this runs,
    // so off() is only needed (and only safe) if the world somehow survived.
    const world = scene.matter.world as Phaser.Physics.Matter.World | null;
    if (world) world.off(BEFORE_UPDATE_EVENT, onBeforeUpdate);
    // Kill in-flight tweens (toast fade / tulip arcs / cluster pop) BEFORE
    // destroying their targets. Idempotent: a second destroy() sees an empty
    // list and killTweensOf([]) is a harmless no-op.
    scene.tweens.killTweensOf(tweened);
    tweened.length = 0;
    activeToast = null;
    // The root owns every visual as a child — one destroy sweeps them all.
    root.destroy();
    if (import.meta.env.DEV) delete devScene.__tricks;
  }

  return { layout, destroy };
}
