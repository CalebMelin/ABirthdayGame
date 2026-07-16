// GameScene (PLAN-02 tasks 3+4 -> PLAN-05 ST-4): terrain + bike + camera +
// finish flag + soft-fail/restart loop, now DATA-DRIVEN by the real per-level
// LevelConfig. PLAN-05 ST-4 replaced PLAN-02's single hardcoded TEST_LEVEL with
// getLevelConfig(level) and added, additively: the theme parallax backdrop,
// ambient decoration placeholders, the scripted-event dispatch stub, and the
// level-start intro banner. The feel-critical rig — bike, camera
// (setUpCamera/updateCamera/CAMERA), input/pedals, pause menu, fail/restart —
// is UNCHANGED from PLAN-02/03; only the terrain SOURCE moved to config. The
// dev debug overlay (PLAN-02 task 5) and the touch pedals + ⏸ pause menu
// (PLAN-03) live here too.
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
  failOverlayFontSizePx,
  LEVEL,
  LEVEL_INTRO,
  DEBUG_OVERLAY,
  PAUSE,
} from '../systems/constants';
import { createPixelText, createPixelPanel } from '../systems/ui';
import { createTerrain } from '../systems/terrain';
import type { TerrainHandle } from '../systems/terrain';
import { createBike, bikeSpawnY } from '../systems/bike';
import type { BikeHandle } from '../systems/bike';
import { createGameInput } from '../systems/input';
import type { GameInput } from '../systems/input';
import { createPedals, zoomCompensatedPosition, zoomCompensatedScale } from '../systems/pedals';
import type { PedalsHandle, Vec2 } from '../systems/pedals';
import { getSave, deriveCalebPickedUp } from '../systems/save';
import { defaultCharacter } from '../data/characters';
import { buildCharacterTextures } from '../systems/characterTextures';
import { getLevelConfig } from '../levels';
import { getLevelTerrainSpec } from '../levels/types';
import type { LevelConfig } from '../levels/types';
import { THEMES, createBackdrop } from '../systems/themes';
import type { BackdropHandle } from '../systems/themes';
import { createDecorations } from '../systems/decorations';
import type { DecorationsHandle } from '../systems/decorations';
import { createPassenger } from '../systems/passenger';
import type { PassengerHandle } from '../systems/passenger';
import { createTricks } from '../systems/tricks';
import type { TricksHandle } from '../systems/tricks';
import { dispatchLevelEvents } from '../levels/events';
import type { EventContext, LevelEventHandle } from '../levels/events';
import { normalizeLevel } from './types';
import type { LevelSceneData } from './types';

// Terrain, spawn x, and finish x are all DATA-DRIVEN now (PLAN-05 ST-4). The
// hardcoded PLAN-02 TEST_LEVEL and the SPAWN_X/FINISH_X module constants were
// removed: create() builds terrain from getLevelConfig(level) via
// getLevelTerrainSpec, spawns at LEVEL.spawnXPx, and places the finish at
// terrain.worldLength - LEVEL.finishMarginPx (every level config reserves a
// {0,700} spawn flat zone and a {length-900,length} finish flat zone sized for
// exactly these). The old trick-kicker geometry (x=10584) now lives only in the
// PLAN-05 level configs / their authoring notes.

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
  /** True when this run began as a fail-restart (failLevel passes fromFail:true
   * on scene.restart). Set from init data every init(); gates the intro banner
   * in create() so re-reading the one-liner after every crash is suppressed. A
   * fresh entry from LevelSelect/LevelComplete carries no fromFail, so it shows. */
  private fromFail = false;
  private terrain: TerrainHandle | undefined;
  /** Theme parallax backdrop (PLAN-05 ST-4): sky bands + far/near silhouette
   * layers at DEPTHS.background. Plain Graphics/Rectangles — NOT Matter — so it's
   * created every create() and destroyed in SHUTDOWN OUTSIDE the matter-world
   * guard (same lifecycle as pedals/pauseButton, NOT bike/terrain). update() is
   * called per frame (currently a no-op — see BackdropHandle). */
  private backdrop: BackdropHandle | undefined;
  /** Ambient decoration placeholders (PLAN-05 ST-4): signs/billboards/balloons/
   * streamers sitting on the ground surface. Purely visual, NO Matter bodies (so
   * they never touch NORTH_STAR §8's <100-body budget). Same non-Matter teardown
   * as backdrop — destroyed in SHUTDOWN outside the matter-world guard. */
  private decorations: DecorationsHandle | undefined;
  /** Persistent Caleb pillion sprite (PLAN-06 Task A). Cosmetic ONLY — no
   * Matter body — so, like backdrop/decorations, it's created every create()
   * and destroyed in SHUTDOWN OUTSIDE the matter-world guard. Visible from
   * spawn on levels where Caleb is aboard (derived, see deriveCalebPickedUp),
   * else hidden until level 12's pickup cutscene calls passenger.activate(). */
  private passenger: PassengerHandle | undefined;
  /** Live scripted-event handles (PLAN-06 Task A seam) — one per real event in
   * config.events. Driven each update() (while the run is live), consulted for
   * finish-delays via onFinish(), and destroyed in SHUTDOWN (non-Matter, so
   * outside the matter-world guard). Reset to [] on teardown. */
  private eventHandles: LevelEventHandle[] = [];
  /** Cutscene pedal override (PLAN-06 Task A). When non-null, GameScene feeds
   * THIS to bike.update() instead of the sampled pedals (e.g. level 12's
   * auto-brake stop); null = player back in control. Set via the EventContext's
   * setInputOverride. Reset to null on teardown. */
  private inputOverride: { gas: boolean; brake: boolean } | null = null;
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
  /** Trick/tulip system (PLAN-07 task 1): fixed-step flip detection off the
   * bike's airborne rotation + the persistent bouquet HUD top-RIGHT (the ⏸
   * button's mirror corner), laid out every update() with the same
   * zoom-compensation. Runs in EVERY level (not a LevelEvent). ZERO Matter
   * bodies; its fixed-step listener self-removes in destroy(), so — like
   * pedals/pauseButton — it's recreated every create() and destroyed in
   * SHUTDOWN outside the matter-world guard. */
  private tricks: TricksHandle | undefined;
  /** Esc / P desktop pause keys (PLAN-03 task 5). Added in create(), polled
   * with JustDown in update(); cleared by Phaser's KeyboardPlugin on shutdown
   * (same as the dev debugKey), reassigned each create(). */
  private escKey: Phaser.Input.Keyboard.Key | undefined;
  private pKey: Phaser.Input.Keyboard.Key | undefined;
  /** Y below which the bike counts as fallen off the world (lowest terrain
   * surface point + FAIL.worldBottomMarginPx). */
  private worldBottomY = 0;
  /** Finish-flag world x. Derived in create() as
   * terrain.worldLength - LEVEL.finishMarginPx (config-driven now, replacing
   * the removed module-const FINISH_X). Read in update()'s finish check. */
  private finishX = 0;
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
    // Set every (re)start, since fields persist across scene.restart() on the
    // same instance: a fail-restart passes fromFail:true (suppresses the intro
    // banner); a fresh entry from LevelSelect/LevelComplete omits it (shows it).
    this.fromFail = data.fromFail === true;
  }

  create(): void {
    // Fields persist across scene.restart() (same Scene instance), so all
    // per-run state resets here.
    this.ended = false;
    this.lookaheadPx = 0;
    this.inputOverride = null;

    // Resolve this level's config (TOTAL function — clamps/defaults a bad id).
    const config = getLevelConfig(this.level);

    // Theme sky as the camera base fill: the parallax backdrop draws its own sky
    // bands + silhouette layers over this at DEPTHS.background (replaces the flat
    // PALETTE.sky fill). sky.bottom so any un-painted edge matches the lower band.
    this.cameras.main.setBackgroundColor(THEMES[config.theme].sky.bottom);

    // Config-driven terrain (ST-4): the level's own TerrainSpec (via the
    // getLevelTerrainSpec seam) + the theme's ground colors, replacing PLAN-02's
    // single hardcoded TEST_LEVEL.
    this.terrain = createTerrain(this, getLevelTerrainSpec(config), THEMES[config.theme].ground);
    this.worldBottomY =
      Math.max(...this.terrain.points.map((p) => p.y)) + FAIL.worldBottomMarginPx;
    // Finish x from the terrain length minus the level's reserved finish flat
    // zone margin (config convention: every level ends with a {length-900,
    // length} flat zone). Stored so update()'s finish check sources it.
    this.finishX = this.terrain.worldLength - LEVEL.finishMarginPx;

    // Parallax theme backdrop (sky bands + far/near silhouette layers) at
    // DEPTHS.background, over the base sky fill. NOT Matter — torn down outside
    // the matter-world guard in SHUTDOWN (see below).
    this.backdrop = createBackdrop(this, config.theme, this.terrain.worldLength);

    // Ambient scenery placeholders (signs/billboards/balloons/streamers) sitting
    // on the ground surface. Purely visual — NO Matter bodies. Also torn down
    // outside the matter-world guard.
    this.decorations = createDecorations(this, config, this.terrain);

    // Build the in-game bike+rider textures through the SAME one-source-of-
    // truth path CharacterCreationScene's live preview uses (PLAN-04 task 4):
    // the player's saved character choice, palette-swapped via
    // buildCharacterTextures. loadCharacter() returns null on a missing/
    // malformed save (?? defaultCharacter() covers it), and
    // buildCharacterTextures's remaps/keys already resolve any corrupt/
    // unknown saved id to defaults — no extra normalization needed here.
    // Read-only: GameScene must never write/reset save data.
    const character = getSave().loadCharacter() ?? defaultCharacter();
    const { riderTextureKey, bikeTextureKey } = buildCharacterTextures(this, character);

    this.bike = createBike(this, LEVEL.spawnXPx, bikeSpawnY(this.terrain.heightAt(LEVEL.spawnXPx)), {
      onCrash: () => this.failLevel(),
      // `wheel` intentionally left unset — stays bike.ts's default
      // (TEXTURE_KEYS.wheel). Only the motorcycle BODY color is a player
      // choice; wheels stay the raw dark placeholder regardless.
      textures: { bike: bikeTextureKey, rider: riderTextureKey },
    });

    // Finish flag stands ON the terrain surface (origin at its base), at the
    // config-derived finish x.
    this.add
      .image(this.finishX, this.terrain.heightAt(this.finishX), TEXTURE_KEYS.flag)
      .setOrigin(0.5, 1)
      .setDepth(DEPTHS.props);

    // Persistent passenger (PLAN-06 Task A): Caleb rides pillion once picked up
    // (level 12) and thereafter (13-22, DERIVED from save progress — never a
    // stored flag). Cosmetic sprite only (ZERO Matter bodies). Read-only save:
    // GameScene must never WRITE progress here. Created AFTER the bike so it can
    // pin to bike.chassis every frame; visible from spawn iff Caleb is aboard.
    const calebPickedUp = deriveCalebPickedUp(this.level, getSave().loadProgress());
    this.passenger = createPassenger(this, this.bike, { active: calebPickedUp });

    // Scripted-event dispatch (PLAN-06 Task A seam): each event returns a handle
    // GameScene drives per-frame (update), tears down (destroy), and can consult
    // for a finish-hold (onFinish). Traffic/police/pickup/wheelieRider/billboard
    // are all REAL systems now (PLAN-06 tasks B/C/D + PLAN-07 tasks 2/3) — see
    // src/levels/events.ts's dispatch switch. Never throws — a special-event
    // level (7/11/12/15/18) enters cleanly. Built AFTER bike + terrain + finishX
    // + passenger exist.
    const ctx: EventContext = {
      bike: this.bike,
      terrain: this.terrain,
      finishX: this.finishX,
      worldLength: this.terrain.worldLength,
      calebPickedUp,
      passenger: this.passenger,
      isEnded: () => this.ended,
      softFail: (message) => this.failLevel(message),
      setInputOverride: (input) => {
        this.inputOverride = input;
      },
    };
    this.eventHandles = dispatchLevelEvents(this, config, ctx);

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

    // Trick/tulip system (PLAN-07 task 1): flip detection on the fixed 60 Hz
    // step + the tulip bouquet HUD top-right (the ⏸ button's mirror corner),
    // fed by the SAME save system every scene shares (awards persist the
    // instant a flip lands, so a later fail-restart keeps them). Runs in
    // every level. Must come AFTER createBike: its fixed-step listener
    // registers behind the bike's, so it reads post-update bike state, and
    // it watches the bike handle directly.
    this.tricks = createTricks(this, this.bike, getSave());

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

    // Intro one-liner banner (ST-4): the level name + optional introText,
    // screen-anchored over a cream panel, held briefly then faded out — see
    // showIntroBanner. Non-blocking (gameplay runs immediately). Suppressed on a
    // fail-restart (fromFail) so a crash doesn't re-show it every attempt; a
    // fresh entry from LevelSelect/LevelComplete carries no fromFail, so it shows.
    if (!this.fromFail) {
      this.showIntroBanner(config);
    }

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
      // Backdrop + decorations are plain Graphics/Rectangles/Images, NOT Matter,
      // so — like input/pedals/pauseButton below — they're destroyed OUTSIDE the
      // matter-world guard above. They hold no Matter bodies, so their teardown
      // must run on EVERY shutdown regardless of whether the physics world
      // survived; putting them INSIDE the guard would leak them on the normal
      // shutdown path (where matter.world is already nulled).
      this.backdrop?.destroy();
      this.backdrop = undefined;
      this.decorations?.destroy();
      this.decorations = undefined;
      // Passenger + scripted-event handles are plain GameObjects, NO Matter
      // bodies — so, like backdrop/decorations above, they're torn down OUTSIDE
      // the matter-world guard (their teardown must run on EVERY shutdown
      // regardless of whether the physics world survived). Reset the fields so
      // scene.restart() (which re-runs create() on the SAME instance) starts
      // clean and can't leak handles or a stale cutscene input override.
      this.passenger?.destroy();
      this.passenger = undefined;
      for (const handle of this.eventHandles) handle.destroy();
      this.eventHandles = [];
      this.inputOverride = null;
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
      // Trick/tulip system: plain GameObjects + a fixed-step world listener
      // whose removal SELF-GUARDS a nulled matter world (see tricks.ts
      // destroy, same pattern as police.ts) — so, like the other non-Matter
      // handles here, it's torn down OUTSIDE the matter-world guard and must
      // run on EVERY shutdown. Tulip PERSISTENCE needs nothing here: awards
      // were saved the instant each flip landed.
      this.tricks?.destroy();
      this.tricks = undefined;
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

    // Pedals for THIS frame. The run being over (crashed/fell/finished) forces
    // both pedals false — exactly as before, so bike.update can't be driven
    // during the fail/finish freeze. While live, a cutscene inputOverride (e.g.
    // level 12's auto-brake, set via EventContext.setInputOverride) WINS over
    // the sampled pedals; otherwise the merged keyboard+touch pedals drive
    // (input.ts OR-merges every gas/brake source — see mergePedals).
    let gas = false;
    let brake = false;
    if (!this.ended) {
      if (this.inputOverride) {
        ({ gas, brake } = this.inputOverride);
      } else if (this.gameInput) {
        ({ gas, brake } = this.gameInput.sample());
      }
    }
    this.bike.update({ gas, brake });

    // Persistent passenger pins to the bike every frame — including during the
    // crash tumble (cosmetic, so it follows Gabby regardless of run state).
    this.passenger?.update();

    if (!this.ended && this.bike.y > this.worldBottomY) {
      this.failLevel();
    }

    // Drive the scripted-event handles ONLY while the run is live. The `!ended`
    // gate is what actually stops hazards once a fail/finish fires — a handle's
    // update() simply STOPS being called from that point on (it does NOT keep
    // ticking and self-early-return). So any finish/fail finale a system wants
    // to show MUST be self-driving (a tween/particle emitter started in
    // onFinish()/softFail()), never a per-frame update(). Systems can observe an
    // end they didn't cause via ctx.isEnded(). One caveat: if handle A's
    // update() calls ctx.softFail() mid-loop, handles later in THIS iteration
    // still get one final update() call this frame (ended is now true, but the
    // loop was already entered) — harmless for the inert handles today, and a
    // real system should treat a same-frame ctx.isEnded()===true as "stop".
    if (!this.ended) {
      for (const handle of this.eventHandles) handle.update();
    }

    if (!this.ended && this.bike.x >= this.finishX) {
      this.ended = true;
      // Let event handles play a finish finale (e.g. level 15's cop spin-out)
      // and hold the LevelComplete hand-off by the LONGEST delay any returns.
      // The run stays "ended" (input frozen) through the hold; the passenger +
      // camera keep updating so the finale is visible. NOTE: handle.update() is
      // NO LONGER called after this point (the !ended gate above skips it), so a
      // finale started in onFinish() must animate itself via tweens/particles —
      // it will NOT receive per-frame update() ticks during the delay window.
      let finishDelayMs = 0;
      for (const handle of this.eventHandles) {
        const delay = handle.onFinish?.();
        if (typeof delay === 'number' && delay > finishDelayMs) finishDelayMs = delay;
      }
      const goToComplete = (): void => {
        this.scene.start(SCENE_KEYS.levelComplete, { level: this.level });
      };
      if (finishDelayMs > 0) {
        this.time.delayedCall(finishDelayMs, goToComplete);
      } else {
        goToComplete();
        return;
      }
    }

    this.updateCamera();

    // Per-frame backdrop hook. Currently a documented NO-OP (parallax is
    // Phaser-native scrollFactor, reprojected every frame with no help from us)
    // — called anyway so future animated-backdrop work has a driver. After
    // updateCamera() so any future camera-derived motion reads the fresh scroll.
    this.backdrop?.update();

    // Keep the touch pedals visually fixed on screen despite the camera's
    // speed-zoom: layout() counter-scales/positions them for THIS frame's
    // zoom. After updateCamera() so it reads the freshest zoom. No-op on
    // desktop (inert handle). See PedalsHandle.layout / zoomCompensatedPosition.
    this.pedals?.layout(this.cameras.main.zoom);

    // Keep the ⏸ button screen-fixed under the camera's speed-zoom, using the
    // SAME zoom-compensation helpers/pivot as the pedals. After updateCamera()
    // so it reads the freshest zoom.
    this.layoutPauseButton(this.cameras.main.zoom);

    // Keep the tulip bouquet HUD (top-right) screen-fixed the same way. Runs
    // even while ended (like the ⏸ layout above) so the bouquet holds its
    // corner through finish finales/fail overlays.
    this.tricks?.layout(this.cameras.main.zoom);

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
  private failLevel(message: string = FAIL_OVERLAY_TEXT): void {
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
    // Size + word-wrap the toast so BOTH the short default and a long custom
    // softFail message (e.g. level 15's verbatim ~50-char line) render fully
    // inside the screen. The default short message is under the threshold and
    // narrower than the wrap box, so it stays visually identical to before.
    createPixelText(this, DESIGN_WIDTH / 2, DESIGN_HEIGHT / 2, message, failOverlayFontSizePx(message))
      .setScrollFactor(0)
      .setWordWrapWidth(DESIGN_WIDTH - FAIL.overlayWrapMarginPx * 2)
      .setAlign('center')
      .setDepth(DEPTHS.overlay + 1);

    // The bike stays limp/tumbling under the overlay (see bike.ts crash
    // handling) until the restart — friendlier than freezing the world.
    // fromFail:true so the restarted run SUPPRESSES the intro banner (re-reading
    // the one-liner after every crash is annoying — see init()/showIntroBanner).
    this.time.delayedCall(FAIL.overlayDurationMs, () => {
      this.scene.restart({ level: this.level, fromFail: true });
    });
  }

  // --------------------------------------------------------------- intro
  /** Level-start intro banner (ST-4): the level name (title) + optional
   * introText one-liner (subtitle), centered in the upper third on a cream
   * backing panel, screen-anchored (scrollFactor 0) at DEPTHS.overlay. Holds
   * for LEVEL_INTRO.holdMs, then fades over LEVEL_INTRO.fadeMs and destroys
   * itself. Non-blocking — gameplay runs the whole time; the camera sits at
   * CAMERA.zoomMax while the bike is stationary, so a scrollFactor-0 banner
   * reads correctly and fades before speed/zoom build (no zoom compensation
   * needed). The cream panel keeps the plum pixel-text legible over ANY theme
   * backdrop. Only called when NOT a fail-restart (see create()/init()).
   *
   * No explicit teardown field: if the scene restarts mid-fade, Phaser's
   * shutdown sweeps these GameObjects + the tween (same as the failLevel
   * overlay); otherwise the tween's onComplete destroys them. */
  private showIntroBanner(config: LevelConfig): void {
    const centerX = DESIGN_WIDTH / 2;

    const title = createPixelText(this, centerX, LEVEL_INTRO.titleY, config.name, LEVEL_INTRO.titleFontSizePx)
      .setScrollFactor(0)
      .setDepth(DEPTHS.overlay);
    const texts: Phaser.GameObjects.Text[] = [title];

    const topY = LEVEL_INTRO.titleY - title.height / 2;
    let bottomY = LEVEL_INTRO.titleY + title.height / 2;
    let maxTextWidth = title.width;

    if (config.introText) {
      const subtitleY = LEVEL_INTRO.titleY + LEVEL_INTRO.subtitleGapPx;
      const subtitle = createPixelText(
        this,
        centerX,
        subtitleY,
        config.introText,
        LEVEL_INTRO.subtitleFontSizePx
      )
        .setScrollFactor(0)
        .setDepth(DEPTHS.overlay);
      texts.push(subtitle);
      bottomY = subtitleY + subtitle.height / 2;
      maxTextWidth = Math.max(maxTextWidth, subtitle.width);
    }

    // Cream backing panel sized to fit the text, one depth BELOW it so the plum
    // text always draws on top (added after the texts, but its lower depth wins
    // Phaser's depth sort). Fades together with the text.
    const panelWidth = maxTextWidth + LEVEL_INTRO.paddingXPx * 2;
    const panelHeight = bottomY - topY + LEVEL_INTRO.paddingYPx * 2;
    const panel = createPixelPanel(this, centerX, (topY + bottomY) / 2, panelWidth, panelHeight)
      .setScrollFactor(0)
      .setDepth(DEPTHS.overlay - 1);

    const targets: Phaser.GameObjects.GameObject[] = [panel, ...texts];
    this.tweens.add({
      targets,
      alpha: 0,
      delay: LEVEL_INTRO.holdMs,
      duration: LEVEL_INTRO.fadeMs,
      ease: 'Quad.easeIn',
      onComplete: () => {
        for (const obj of targets) obj.destroy();
      },
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
