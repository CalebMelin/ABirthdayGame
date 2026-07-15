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
} from '../systems/constants';
import { createPixelText } from '../systems/ui';
import { createTerrain } from '../systems/terrain';
import type { TerrainHandle, TerrainSpec } from '../systems/terrain';
import { createBike, bikeSpawnY } from '../systems/bike';
import type { BikeHandle } from '../systems/bike';
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
    // Deliberately low + wide (browser-tested): gas held in the air
    // pitches the nose up (backflip direction), so taller/steeper ramps
    // gave a full-gas run enough airtime to rotate past recovery and
    // faceplant — violating "holding only gas succeeds". At 55x520 the
    // hop is short enough to land clean with gas held; task 6's
    // feel-tuning pass owns making deliberate flips comfortable here.
    // Placement is seed-aware (also browser-tested): a ramp stacked on a
    // hill crest whose back side falls away turns into a launch cliff —
    // an earlier x=9800 spot did exactly that and full-gas runs crashed
    // on landing every time. Both sites below have flat-to-rising ground
    // after the ramp so the hop lands quickly.
    { x: 5200, width: 520, height: 55 },
    { x: 10500, width: 520, height: 55 },
  ],
  flatZones: [
    { start: 0, end: 700 }, // spawn runway (visual == physics on flats — see bikeSpawnY doc)
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
  private cursors: Phaser.Types.Input.Keyboard.CursorKeys | undefined;
  /** Y below which the bike counts as fallen off the world (lowest terrain
   * surface point + FAIL.worldBottomMarginPx). */
  private worldBottomY = 0;
  /** Current smoothed camera lookahead offset, px (see updateCamera). */
  private lookaheadPx = 0;
  /** Latched once the run is over (crashed, fell, or finished) so the fail
   * overlay/transition can only fire once per run. */
  private ended = false;

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

    // Temporary desktop mapping (NORTH_STAR §2): Right/Up = gas,
    // Left/Down = brake. Touch pedals arrive in PLAN-03.
    this.cursors = this.input.keyboard?.createCursorKeys();

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
    });
  }

  update(): void {
    if (!this.bike || !this.terrain) return;

    // OR-merge every key of an action so holding e.g. Right+Up (or rolling
    // between them) never fights or drops the pedal.
    const gas = this.ended ? false : this.keyDown('right') || this.keyDown('up');
    const brake = this.ended ? false : this.keyDown('left') || this.keyDown('down');
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
  }

  private keyDown(name: keyof Phaser.Types.Input.Keyboard.CursorKeys): boolean {
    return this.cursors?.[name].isDown === true;
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
   * (unlike the bike control laws, which are fixed-step). */
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
