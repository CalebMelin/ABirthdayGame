// GameScene v1 (PLAN-02 tasks 3+4): terrain + bike + camera + finish flag
// + soft-fail/restart loop, driven by a hardcoded test level. Real
// per-level configs replace TEST_LEVEL in PLAN-05; the debug overlay
// (PLAN-02 task 5) and touch pedals (PLAN-03) land later.
import Phaser from 'phaser';
import {
  DESIGN_WIDTH,
  DESIGN_HEIGHT,
  PALETTE,
  DEPTHS,
  SCENE_KEYS,
  TEXTURE_KEYS,
  TERRAIN,
  CAMERA,
  FAIL,
  DEBUG_OVERLAY,
} from '../systems/constants';
import { createPixelText } from '../systems/ui';
import { createTerrain } from '../systems/terrain';
import type { TerrainHandle, TerrainSpec } from '../systems/terrain';
import { createBike, bikeSpawnY } from '../systems/bike';
import type { BikeHandle } from '../systems/bike';
import { createGameInput } from '../systems/input';
import type { GameInput } from '../systems/input';
import { createPedals } from '../systems/pedals';
import type { PedalsHandle } from '../systems/pedals';
import { normalizeLevel } from './types';
import type { LevelSceneData } from './types';

// ---------------------------------------------------------------------------
// Hardcoded test level (PLAN-02 only — PLAN-05 replaces this with real
// per-level LevelConfigs; until then EVERY level number plays this terrain).
// These are level-config values, not global tunables, so they live here
// rather than in constants.ts (CLAUDE.md: tunables live in constants.ts OR
// in level configs).
// ---------------------------------------------------------------------------

/** Gentle rolling test terrain: flat spawn zone, hilliness well under the
 * cap, two authored jump ramps (the backflip opportunities task 6's tuning
 * pass needs), and a flat end zone holding the finish flag. Length chosen
 * so a full-gas run lands in NORTH_STAR's 20-45s window (browser-verified:
 * ~30s), while keeping the ground collision chain + bike inside NORTH_STAR
 * §8's <100-bodies budget (90 ground segments + 3 bike bodies = 93,
 * browser-verified via scripts/playtest-drive.mjs). */
export const TEST_LEVEL: TerrainSpec = {
  seed: 220222, // Gabby is 22 on 2/22 — any fixed seed works, this one's cute
  length: 15000,
  hilliness: 0.45,
  jumps: [
    // Two deliberately different ramps (browser-tested in the task-6
    // feel-tuning pass):
    // - 5200: low + wide "hop" ramp — a short, safe pop that lands clean
    //   with gas held (accidental-flip-proof by airtime alone).
    // - 10584: the trick ramp ("kicker"). Its geometry is deliberately
    //   aligned to the physics collision-chain grid (chain nodes sit
    //   every 168px — the segmentTargetPx/sampleSpacingPx stride — so
    //   base/peak/end land exactly on the nodes 10584/10752/10920): the
    //   chain renders the raised cosine as a clean TRIANGLE kicker, and
    //   the bike launches off the peak at the up-chord's angle with real
    //   upward velocity (~0.55-1.0s of air, browser-measured). A wider
    //   ramp puts a flat-top chord across the crest and the bike launches
    //   FLAT with half the airtime — do not "fix" this by making it
    //   bigger (browser-tested: a 140x700 ramp gave LESS air than this).
    //   Height 106 is the max the 45-degree maxJumpSlope cap allows at
    //   width 336 without auto-widening (which would break the node
    //   alignment). Gas-only over it is safe (browser-measured: +16deg
    //   rotation at landing, no crash): held-from-ground pedals get little
    //   pitch authority (bike.ts airPitchAuthority) and the stabilization
    //   assist fills the rest. CAUTION for bigger jumps: that guarantee is
    //   coupled to airtime — past BIKE_TUNING.heldPitchDelaySteps (0.7s)
    //   held pedals start gaining authority, and past delay+ramp (~1.2s)
    //   they have FULL authority, so a huge jump can make a gas-holding
    //   non-gamer flip. Re-verify gas-only survival per level (see the
    //   heldPitchDelaySteps doc in constants.ts).
    // Placement is seed-aware (also browser-tested): a ramp stacked on a
    // hill crest whose back side falls away turns into a launch cliff —
    // an earlier x=9800 spot did exactly that and full-gas runs crashed
    // on landing every time. Both sites below have flat-to-rising ground
    // after the ramp so the hop lands predictably.
    { x: 5200, width: 520, height: 55 },
    { x: 10584, width: 336, height: 106 },
  ],
  flatZones: [
    { start: 0, end: 700 }, // spawn runway (visual == physics on flats — see bikeSpawnY doc)
    // Flat RUN-UP before the trick kicker: the rolling bumps that would
    // otherwise precede it made approach speed (and therefore flip
    // airtime) vary ~8% run-to-run — enough to drop a marginal backflip
    // under 360. A flat approach makes the launch reproducible. NOTE the
    // zone must end at least TERRAIN.flatBlendPx (160) BEFORE the ramp
    // base (10584): flat zones are stamped AFTER jumps, so a blend region
    // overlapping the ramp would squash its face. Reusable level-design
    // pattern for every trick ramp in PLAN-05.
    { start: 10000, end: 10424 },
    { start: 14200, end: 15000 }, // finish-flag zone
  ],
};

/** Bike spawn x, inside the spawn flat zone with room behind for the
 * camera's world-start clamp to settle. */
const SPAWN_X = 250;

/** Finish-flag x, inside the end flat zone with runway left after it so
 * crossing at speed never runs out of world before the transition. */
const FINISH_X = 14500;

/** EXACT soft-fail copy from NORTH_STAR §4 — verbatim personal content,
 * never paraphrase (CLAUDE.md Rule 4). */
const FAIL_OVERLAY_TEXT = 'Oops! Go again 💛';

/** The scene keeps at most this reference set of live handles; everything
 * is destroyed + recreated by scene.restart() on fail (see failLevel). */
export class GameScene extends Phaser.Scene {
  private level = 1;
  private terrain: TerrainHandle | undefined;
  private bike: BikeHandle | undefined;
  /** Unified keyboard+touch pedals (PLAN-03 task 1). NOT named `input` —
   * that's already Phaser.Scene's InputPlugin. Recreated every create() and
   * destroyed in the SHUTDOWN handler (its Keys are per-run, same lifecycle
   * as the bike/terrain handles). */
  private gameInput: GameInput | undefined;
  /** On-screen touch gas/brake pedals (PLAN-03 task 2). Created only on
   * touch-capable devices (inert no-op handle on desktop), laid out every
   * update() to stay screen-fixed under camera zoom, and destroyed in the
   * SHUTDOWN handler — same per-run lifecycle as gameInput/bike/terrain, so
   * scene.restart() can't leak Zones or pointer listeners. */
  private pedals: PedalsHandle | undefined;
  /** Y below which the bike counts as fallen off the world (lowest terrain
   * surface point + FAIL.worldBottomMarginPx). */
  private worldBottomY = 0;
  /** Current smoothed camera lookahead offset, px (see updateCamera). */
  private lookaheadPx = 0;
  /** Latched once the run is over (crashed, fell, or finished) so the fail
   * overlay/transition can only fire once per run. */
  private ended = false;
  /** Dev-only debug overlay (PLAN-02 task 5) — always declared (cheap: just
   * these three field slots), but only ever CREATED/READ inside an
   * `import.meta.env.DEV` gate, which Vite dead-code-eliminates from
   * production builds (same pattern as the `__gabbyGame` exposure in
   * main.ts). `debugText`/`debugKey` are recreated every create() because
   * scene.restart() destroys the previous text object and clears
   * previously-added keys (same lifecycle as `gameInput` above). */
  private debugText: Phaser.GameObjects.Text | undefined;
  private debugKey: Phaser.Input.Keyboard.Key | undefined;
  /** Deliberately NOT reset in create() (unlike `ended`/`lookaheadPx`): this
   * is the one piece of overlay state meant to survive scene.restart(), so
   * toggling stays on/off across a fail-restart. */
  private debugVisible = false;

  constructor() {
    super(SCENE_KEYS.game);
  }

  init(data: LevelSceneData): void {
    this.level = normalizeLevel(data.level);
  }

  create(): void {
    // Fields persist across scene.restart() (same Scene instance), so all
    // per-run state resets here.
    this.ended = false;
    this.lookaheadPx = 0;

    // Simple sky fill for now — parallax backdrops/themes are PLAN-05/06.
    this.cameras.main.setBackgroundColor(PALETTE.sky);

    this.terrain = createTerrain(this, TEST_LEVEL);
    this.worldBottomY =
      Math.max(...this.terrain.points.map((p) => p.y)) + FAIL.worldBottomMarginPx;

    this.bike = createBike(this, SPAWN_X, bikeSpawnY(this.terrain.heightAt(SPAWN_X)), {
      onCrash: () => this.failLevel(),
    });

    // Finish flag stands ON the terrain surface (origin at its base).
    this.add
      .image(FINISH_X, this.terrain.heightAt(FINISH_X), TEXTURE_KEYS.flag)
      .setOrigin(0.5, 1)
      .setDepth(DEPTHS.props);

    // Unified input (PLAN-03 task 1): keyboard (Right/Up/W/D = gas,
    // Left/Down/S/A = brake) merged with the touch pedals (task 2 feeds
    // them in via setTouchGas/setTouchBrake) — either works at any time.
    this.gameInput = createGameInput(this);

    // Touch pedals (PLAN-03 task 2): GAS bottom-right, BRAKE bottom-left,
    // feeding the same gameInput via setTouchGas/setTouchBrake. Created only
    // on touch devices (inert no-op on pure desktop, so this line is free
    // there). Must come AFTER gameInput exists — the pedals drive it.
    this.pedals = createPedals(this, this.gameInput);

    // Dev-only debug overlay (PLAN-02 task 5): FPS, speed, airborne state,
    // cumulative airborne rotation, crashed flag, Matter body count —
    // toggled with the backtick/tilde key (` — the D key is now gas as of
    // PLAN-03 task 1, so the toggle moved to a non-gameplay key). See the
    // `debugText`/`debugKey`/`debugVisible` field docs above for the
    // restart lifecycle.
    if (import.meta.env.DEV) {
      this.debugText = createPixelText(
        this,
        DEBUG_OVERLAY.marginPx,
        DEBUG_OVERLAY.marginPx,
        '',
        DEBUG_OVERLAY.fontSizePx
      )
        .setOrigin(0, 0)
        .setAlign('left')
        .setScrollFactor(0)
        .setDepth(DEPTHS.overlay)
        .setVisible(this.debugVisible);
      this.debugKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.BACKTICK);
    }

    this.setUpCamera();

    // Backstop teardown (see BikeHandle.destroy doc). In the normal
    // restart/transition path Phaser's Matter plugin has ALREADY destroyed
    // the entire world (bodies, constraints, world listeners) and nulled
    // scene.matter.world by the time this runs — its own SHUTDOWN listener
    // is registered at plugin start, before create() — so calling
    // bike/terrain destroy() then would dereference the null world. The
    // explicit destroys only run (and are only needed) if the world
    // somehow survived shutdown. `once`, not `on` — create() re-registers
    // after every restart, so `on` would stack handlers.
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      // Runtime null-check: typed non-null, but MatterPhysics.shutdown
      // really does set it to null (see node_modules/phaser/src/physics/
      // matter-js/MatterPhysics.js).
      if (this.matter.world as Phaser.Physics.Matter.World | null) {
        this.bike?.destroy();
        this.terrain?.destroy();
      }
      this.bike = undefined;
      this.terrain = undefined;
      // Input is DOM/keyboard, not Matter — always safe to tear down (no
      // world-null guard needed). Removes the Keys it registered so restart
      // can't leak or double-register (see GameInput.destroy).
      this.gameInput?.destroy();
      this.gameInput = undefined;
      // Pedals are DOM/input + GameObjects, not Matter — always safe to tear
      // down (no world-null guard). Destroys their Zones + visuals + pointer
      // listeners so a restart can't leak or double-register (no-op on
      // desktop). Same ownership as gameInput above.
      this.pedals?.destroy();
      this.pedals = undefined;
    });
  }

  update(): void {
    if (!this.bike || !this.terrain) return;

    // Merged keyboard+touch pedals for THIS frame (input.ts OR-merges every
    // gas/brake source — see mergePedals). The this.ended gate forces both
    // pedals false the instant the run is over (crashed/fell/finished),
    // exactly as before, so bike.update can't be driven during the
    // fail/finish freeze.
    const { gas, brake } = this.gameInput
      ? this.ended
        ? { gas: false, brake: false }
        : this.gameInput.sample()
      : { gas: false, brake: false };
    this.bike.update({ gas, brake });

    if (!this.ended && this.bike.y > this.worldBottomY) {
      this.failLevel();
    }

    if (!this.ended && this.bike.x >= FINISH_X) {
      this.ended = true;
      this.scene.start(SCENE_KEYS.levelComplete, { level: this.level });
      return;
    }

    this.updateCamera();

    // Keep the touch pedals visually fixed on screen despite the camera's
    // speed-zoom: layout() counter-scales/positions them for THIS frame's
    // zoom. After updateCamera() so it reads the freshest zoom. No-op on
    // desktop (inert handle). See PedalsHandle.layout / zoomCompensatedPosition.
    this.pedals?.layout(this.cameras.main.zoom);

    // Dev-only debug overlay (PLAN-02 task 5). Inlined here (rather than
    // delegated to a private method) on purpose: `import.meta.env.DEV` is
    // statically false in production, and Vite's minifier only proves an
    // `if (false) { ... }` BRANCH dead and strips it — a same-named class
    // method would still be emitted as a reachable member even though this
    // call site to it was removed, defeating the tree-shake (same pattern
    // as the `__gabbyGame` exposure in main.ts, which is also inlined).
    if (import.meta.env.DEV && this.debugKey && this.debugText) {
      if (Phaser.Input.Keyboard.JustDown(this.debugKey)) {
        this.debugVisible = !this.debugVisible;
        this.debugText.setVisible(this.debugVisible);
      }
      if (this.debugVisible) {
        // BikeHandle.speed is px per physics STEP (see its doc) — x60 for
        // a human-readable px/s readout (DEBUG_OVERLAY.physicsStepsPerSecond).
        const speedPxPerSec = Math.round(this.bike.speed * DEBUG_OVERLAY.physicsStepsPerSecond);
        // airborneRotation is radians and resets at TAKEOFF, not landing
        // (see its doc) — degrees here purely for human readability.
        const airRotationDeg = Math.round(Phaser.Math.RadToDeg(this.bike.airborneRotation));
        this.debugText.setText(
          [
            `FPS: ${Math.round(this.game.loop.actualFps)}`,
            `Speed: ${speedPxPerSec} px/s`,
            `Airborne: ${this.bike.airborne}`,
            `Air rot: ${airRotationDeg}deg (resets @ takeoff)`,
            `Crashed: ${this.bike.crashed}`,
            `Bodies: ${this.matter.world.getAllBodies().length}`,
          ].join('\n')
        );
      }
    }
  }

  // -------------------------------------------------------------- camera
  /** Bounds + initial framing. The bounds clamp (Phaser applies it in
   * preRender for any scroll value, zoom-aware) is what guarantees the
   * camera never shows before world start or below the ground fill. */
  private setUpCamera(): void {
    if (!this.bike || !this.terrain) return;
    const cam = this.cameras.main;
    cam.setBounds(
      0,
      CAMERA.boundsTopPx,
      this.terrain.worldLength,
      TERRAIN.groundFillBottomYPx - CAMERA.boundsTopPx
    );
    cam.setZoom(CAMERA.zoomMax);
    // centerOn also sets cam.midPoint immediately, so the first update()'s
    // lerp starts from the spawn framing instead of swooping in from (0,0).
    cam.centerOn(this.bike.x, this.bike.y + CAMERA.verticalOffsetPx);
  }

  /** Manual follow (not startFollow): lookahead in the travel direction,
   * softer vertical than horizontal, slight zoom-out with speed. Each
   * smoothing rate is an independent CAMERA knob. Lerps run per render
   * frame — cosmetic only, so mild frame-rate dependence is acceptable
   * (unlike the bike control laws, which are fixed-step). Concretely: a
   * 120Hz display calls this twice as often as 60Hz, so each lerp fraction
   * compounds twice as fast — the camera reads roughly 2x snappier there.
   * If the feel-tuning pass (task 6) finds that matters, the fix is
   * dt-normalizing each factor `f` before use: `1 - (1 - f) ** (dt / 16.67)`. */
  private updateCamera(): void {
    if (!this.bike) return;
    const cam = this.cameras.main;

    // Lookahead: signed by travel direction, scaled by |speed|, and itself
    // smoothed so direction changes swing the camera over gradually.
    const speedRatioSigned = Phaser.Math.Clamp(
      this.bike.velocityX / CAMERA.fullSpeedPxPerStep,
      -1,
      1
    );
    const lookaheadTarget = speedRatioSigned * CAMERA.lookaheadMaxPx;
    this.lookaheadPx = Phaser.Math.Linear(this.lookaheadPx, lookaheadTarget, CAMERA.lookaheadLerp);

    const targetX = this.bike.x + this.lookaheadPx;
    const targetY = this.bike.y + CAMERA.verticalOffsetPx;
    cam.centerOn(
      Phaser.Math.Linear(cam.midPoint.x, targetX, CAMERA.followLerpX),
      Phaser.Math.Linear(cam.midPoint.y, targetY, CAMERA.followLerpY)
    );

    const speedRatio = Phaser.Math.Clamp(this.bike.speed / CAMERA.fullSpeedPxPerStep, 0, 1);
    const zoomTarget = CAMERA.zoomMax - (CAMERA.zoomMax - CAMERA.zoomMin) * speedRatio;
    cam.setZoom(Phaser.Math.Linear(cam.zoom, zoomTarget, CAMERA.zoomLerp));
  }

  // ---------------------------------------------------------------- fail
  /** Soft fail (head crash or fell off world): friendly overlay with the
   * exact NORTH_STAR copy, then a full scene.restart() after
   * FAIL.overlayDurationMs — comfortably under the 500ms restart budget
   * (create() rebuilds terrain+bike in a few ms). scene.restart() was
   * chosen over in-place recreate because scene shutdown + the explicit
   * SHUTDOWN backstop above tear down every body/listener/game-object in
   * one well-defined sweep, which is what makes the "no leaks after 3
   * restarts" criterion hold by construction. */
  private failLevel(): void {
    if (this.ended) return;
    this.ended = true;

    // Overlay pieces are scrollFactor-0 (screen-anchored). A scroll-
    // factor-0 object still scales with camera zoom around the camera
    // center, so at zoomMin the viewport shows DESIGN/zoomMin world px —
    // the dim rect is oversized by 1/zoomMin to always cover it fully.
    const dimW = DESIGN_WIDTH / CAMERA.zoomMin;
    const dimH = DESIGN_HEIGHT / CAMERA.zoomMin;
    this.add
      .rectangle(DESIGN_WIDTH / 2, DESIGN_HEIGHT / 2, dimW, dimH, PALETTE.bgPink, 0.6)
      .setScrollFactor(0)
      .setDepth(DEPTHS.overlay);
    createPixelText(this, DESIGN_WIDTH / 2, DESIGN_HEIGHT / 2, FAIL_OVERLAY_TEXT, 40)
      .setScrollFactor(0)
      .setDepth(DEPTHS.overlay + 1);

    // The bike stays limp/tumbling under the overlay (see bike.ts crash
    // handling) until the restart — friendlier than freezing the world.
    this.time.delayedCall(FAIL.overlayDurationMs, () => {
      this.scene.restart({ level: this.level });
    });
  }
}
