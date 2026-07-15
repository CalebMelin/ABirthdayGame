// GameScene v1 (PLAN-02 tasks 3+4): terrain + bike + camera + finish flag
// + soft-fail/restart loop, driven by a hardcoded test level. Real
// per-level configs replace TEST_LEVEL in PLAN-05. The dev debug overlay
// (PLAN-02 task 5) and the touch pedals + ⏸ pause menu (PLAN-03) have since
// landed here too.
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
  PAUSE,
} from '../systems/constants';
import { createPixelText } from '../systems/ui';
import { createTerrain } from '../systems/terrain';
import type { TerrainHandle, TerrainSpec } from '../systems/terrain';
import { createBike, bikeSpawnY } from '../systems/bike';
import type { BikeHandle } from '../systems/bike';
import { createGameInput } from '../systems/input';
import type { GameInput } from '../systems/input';
import { createPedals, zoomCompensatedPosition, zoomCompensatedScale } from '../systems/pedals';
import type { PedalsHandle, Vec2 } from '../systems/pedals';
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

/** The camera's zoom pivot (design-screen center). The ⏸ button is screen-
 * anchored (scrollFactor 0) and counter-positioned/-scaled around this pivot
 * every frame exactly like the touch pedals, so it holds a fixed on-screen
 * spot as the play camera zooms (see layoutPauseButton). Mirrors pedals.ts. */
const PAUSE_BUTTON_PIVOT: Vec2 = { x: DESIGN_WIDTH / 2, y: DESIGN_HEIGHT / 2 };

/** Fixed on-screen point (design space) the ⏸ button's center holds — one
 * margin in from the top-left corner. */
const PAUSE_BUTTON_SCREEN: Vec2 = {
  x: PAUSE.buttonMarginPx + PAUSE.buttonSizePx / 2,
  y: PAUSE.buttonMarginPx + PAUSE.buttonSizePx / 2,
};

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
  /** ⏸ pause button (PLAN-03 task 5): a small always-visible HUD tap target,
   * top-left, that opens the pause menu. scrollFactor 0 + DEPTHS.hud like the
   * pedals, laid out every update() with the same zoom-compensation so it
   * holds its screen spot as the camera zooms. Recreated every create() and
   * destroyed in SHUTDOWN — same per-run lifecycle as gameInput/pedals. */
  private pauseButton: Phaser.GameObjects.Container | undefined;
  /** Esc / P desktop pause keys (PLAN-03 task 5). Added in create(), polled
   * with JustDown in update(); cleared by Phaser's KeyboardPlugin on shutdown
   * (same as the dev debugKey), reassigned each create(). */
  private escKey: Phaser.Input.Keyboard.Key | undefined;
  private pKey: Phaser.Input.Keyboard.Key | undefined;
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

    // ⏸ pause button (PLAN-03 task 5): a small HUD tap target, top-left,
    // always visible on desktop AND touch (unlike the pedals, which are
    // touch-only). Opens the pause menu on tap/click; Esc/P do the same on
    // desktop. Laid out every update() with the pedals' zoom-compensation
    // helpers so it holds its screen spot as the camera zooms.
    this.pauseButton = this.createPauseButton();

    // Esc / P both pause on desktop. JustDown-polled in update(). No conflict
    // with gameplay keys (arrows/WASD via gameInput) or the dev debug toggle
    // (backtick). Cleared on shutdown by Phaser's KeyboardPlugin (like debugKey).
    this.escKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    this.pKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.P);

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

    // Clear held touch/pedal state whenever the scene RESUMES from the pause
    // menu. A paused scene's InputPlugin stops delivering pointer events
    // (Systems.canInput() is false while paused), so a touch pedal released
    // while the menu is up never fires its pointerup — the pedal would resume
    // stuck-on (phantom gas). onResume() (a stable bound method so it can be
    // removed) resets it. `on`, not `once` — every resume must clear — and it's
    // removed in the SHUTDOWN handler below so scene.restart() (which re-runs
    // create() on the SAME instance) can't stack duplicate RESUME listeners.
    this.events.on(Phaser.Scenes.Events.RESUME, this.onResume, this);

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
      // ⏸ button is a plain GameObject (Container) — always safe to destroy
      // (no Matter world dependency). Destroying it removes its input
      // registration + pointer listeners so a restart can't leak. The Esc/P
      // Keys are cleared by Phaser's KeyboardPlugin on shutdown (same as the
      // dev debugKey), so they need no explicit teardown here.
      this.pauseButton?.destroy();
      this.pauseButton = undefined;
      // Remove the RESUME listener registered in create() (see above). The
      // Scene instance persists across scene.restart() and create() re-adds it,
      // so without this off() the RESUME handlers would stack across restarts.
      this.events.off(Phaser.Scenes.Events.RESUME, this.onResume, this);
    });
  }

  update(): void {
    if (!this.bike || !this.terrain) return;

    // Esc / P → pause (desktop). JustDown fires once per physical press.
    // pauseGame() no-ops if the run already ended or the scene isn't the
    // active one, so this is safe here; return so we don't also drive the
    // bike/camera on the frame we hand off to the pause menu.
    if (
      (this.escKey && Phaser.Input.Keyboard.JustDown(this.escKey)) ||
      (this.pKey && Phaser.Input.Keyboard.JustDown(this.pKey))
    ) {
      this.pauseGame();
      return;
    }

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

    // Keep the ⏸ button screen-fixed under the camera's speed-zoom, using the
    // SAME zoom-compensation helpers/pivot as the pedals. After updateCamera()
    // so it reads the freshest zoom.
    this.layoutPauseButton(this.cameras.main.zoom);

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

  // --------------------------------------------------------------- pause
  /** Builds the ⏸ HUD button: a chunky pixel face (shadow + outlined cream
   * face + two dark bars) in a Container, made interactive over a generous
   * (>= UI_MIN_TOUCH_PX) hit rectangle. scrollFactor 0 + DEPTHS.hud so it's a
   * fixed HUD control; layoutPauseButton() pins it under camera zoom. A
   * tap/click opens the pause menu (pauseGame). */
  private createPauseButton(): Phaser.GameObjects.Container {
    const size = PAUSE.buttonSizePx;

    const shadow = this.add
      .rectangle(0, PAUSE.shadowOffsetPx, size, size, PALETTE.outline)
      .setOrigin(0.5);
    const face = this.add
      .rectangle(0, 0, size, size, PALETTE.cream)
      .setOrigin(0.5)
      .setStrokeStyle(PAUSE.outlineWidthPx, PALETTE.outline);

    // The two vertical bars (⏸) in one Graphics, centered on (0,0) so the
    // pressed-state shift just nudges its y. Dark plum for contrast on the
    // cream face — placeholder art (real glyph: PLAN-10), same style as pedals.
    const bars = this.add.graphics();
    bars.fillStyle(PALETTE.plum, 1);
    const barCenter = PAUSE.glyphBarGapPx / 2 + PAUSE.glyphBarWidthPx / 2;
    const barLeft = -PAUSE.glyphBarWidthPx / 2;
    const barTop = -PAUSE.glyphBarHeightPx / 2;
    bars.fillRect(-barCenter + barLeft, barTop, PAUSE.glyphBarWidthPx, PAUSE.glyphBarHeightPx);
    bars.fillRect(barCenter + barLeft, barTop, PAUSE.glyphBarWidthPx, PAUSE.glyphBarHeightPx);

    const container = this.add.container(0, 0, [shadow, face, bars]);
    container.setScrollFactor(0).setDepth(DEPTHS.hud);

    // Interactive on the CONTAINER with a STATIC hit rectangle in local space
    // (concentric, sized to the >= 88px touch target). Never setSize() an
    // interactive container (ui.ts gotcha: a non-zero size shifts the hit rect
    // by half its size). The face/glyph move on press but the hit rect (on the
    // container) does not, so a press can't drop the pointer. layoutPauseButton
    // re-scales the container every frame; Phaser transforms this hit rect by
    // that scale, so the tap target tracks the art under zoom exactly like the
    // pedals' Zone.
    const hitHalf = PAUSE.hitSizePx / 2;
    container.setInteractive({
      hitArea: new Phaser.Geom.Rectangle(-hitHalf, -hitHalf, PAUSE.hitSizePx, PAUSE.hitSizePx),
      hitAreaCallback: Phaser.Geom.Rectangle.Contains,
      useHandCursor: true,
    });

    const restore = (): void => {
      face.setFillStyle(PALETTE.cream);
      face.y = 0;
      bars.y = 0;
    };
    container.on('pointerover', () => face.setFillStyle(PALETTE.sunshine));
    container.on('pointerout', restore);
    container.on('pointerdown', () => {
      face.y = PAUSE.shadowOffsetPx;
      bars.y = PAUSE.shadowOffsetPx;
    });
    container.on('pointerup', () => {
      restore();
      this.pauseGame();
    });

    // Place once at native zoom (the camera starts at CAMERA.zoomMax = 1) so it
    // renders in the right spot on the very first frame, before update() runs.
    container.setPosition(PAUSE_BUTTON_SCREEN.x, PAUSE_BUTTON_SCREEN.y);
    return container;
  }

  /** Re-position + re-scale the ⏸ button so it holds its fixed on-screen point
   * and size under the current camera `zoom` — identical math to the pedals
   * (imported zoomCompensated* helpers + shared PAUSE_BUTTON_PIVOT). */
  private layoutPauseButton(zoom: number): void {
    if (!this.pauseButton) return;
    const p = zoomCompensatedPosition(PAUSE_BUTTON_SCREEN, PAUSE_BUTTON_PIVOT, zoom);
    this.pauseButton.setPosition(p.x, p.y);
    this.pauseButton.setScale(zoomCompensatedScale(zoom));
  }

  /** Open the pause menu: freeze THIS scene (scene.pause() stops GameScene's
   * update → the Matter world + bike freeze) and launch PauseScene in parallel
   * on top (active for input). Shared by the ⏸ button and Esc/P.
   *
   * No-op if the run already ended (this.ended — never pause a crash/finish
   * transition) or GameScene isn't the active scene (guards double-pause /
   * pausing while the menu is already up: a paused scene's input is paused too,
   * so the button can't fire then, but Esc/P polling + defensiveness make the
   * guard explicit). */
  private pauseGame(): void {
    if (this.ended || !this.scene.isActive()) return;
    this.scene.pause();
    this.scene.launch(SCENE_KEYS.pause, { level: this.level });
  }

  /** Fired on scene RESUME (leaving the pause menu). Clears any held touch/pedal
   * state so a resume can never start under a phantom-held pedal.
   *
   * WHY: while THIS scene is paused its InputPlugin stops dispatching pointer
   * events (Systems.canInput() is false when paused), so a finger lifted off the
   * touch GAS/BRAKE pedal WHILE the menu is up never delivers its pointerup —
   * setTouchGas/Brake(false)/the pedal's release() never run and the bike would
   * resume under phantom gas. Resetting on resume is the safe direction: a
   * genuinely-still-held finger just needs a re-press (same already-accepted
   * behavior as the fail/restart path). Clearing the input flags directly covers
   * the desktop/no-pedal case (belt-and-suspenders); pedals.releaseAll() also
   * fixes the pedal visuals. The orientation auto-pause path is untouched by
   * this — it uses game.loop.sleep() (the scene stays RUNNING), so its DOM
   * pointer events queue and drain normally and never emit a scene RESUME. */
  private onResume(): void {
    this.gameInput?.setTouchGas(false);
    this.gameInput?.setTouchBrake(false);
    this.pedals?.releaseAll();
  }
}
