// PauseScene (PLAN-03 task 5): the pause menu overlay. Launched OVER a paused
// GameScene (GameScene.pauseGame does scene.pause() then scene.launch(pause)),
// so the Matter world + bike are frozen (a paused scene stops updating) while
// THIS scene stays active to process the menu's input — a paused scene also
// stops processing input, which is exactly why the menu can't live on
// GameScene itself.
//
// It renders on top because it sits AFTER GameScene in main.ts's scene list
// (later = composited above), and its camera never clears (default transparent
// background), so the frozen GameScene shows through — dimmed by the
// semi-transparent rectangle below. This scene's camera is plain zoom 1, so
// title/buttons use design coords directly (no zoom compensation needed here,
// unlike GameScene's screen-anchored HUD).
import Phaser from 'phaser';
import {
  DESIGN_WIDTH,
  DESIGN_HEIGHT,
  PALETTE,
  DEPTHS,
  SCENE_KEYS,
  PAUSE,
} from '../systems/constants';
import { createPixelText, createPixelButton } from '../systems/ui';
import { normalizeLevel } from './types';
import type { LevelSceneData } from './types';

export class PauseScene extends Phaser.Scene {
  /** The level GameScene was paused on — needed so Restart reboots the SAME
   * level. Received via init(data) (same LevelSceneData/normalizeLevel pattern
   * GameScene uses), passed in by GameScene.pauseGame(). */
  private level = 1;
  /** Esc / P ALSO resume from the menu (they opened it, so the key toggles it
   * shut). GameScene polls its OWN Esc/P to OPEN; a paused GameScene's update()
   * is frozen, so the resume-side polling must live HERE. Added in create(),
   * polled with JustDown in update(); Phaser clears them on this scene's
   * shutdown (scene.stop on resume) and create() re-adds them next launch, so
   * no stacking. The press that OPENED the menu can't bleed through to resume it
   * instantly: GameScene owned that keydown and Phaser's KeyboardPlugin
   * resetKeys() on PAUSE clears it, while THESE keys are added a frame later and
   * never see it — only a fresh press resumes. */
  private escKey: Phaser.Input.Keyboard.Key | undefined;
  private pKey: Phaser.Input.Keyboard.Key | undefined;

  constructor() {
    super(SCENE_KEYS.pause);
  }

  init(data: LevelSceneData): void {
    this.level = normalizeLevel(data.level);
  }

  create(): void {
    // Dim the frozen game behind the menu. Sits at the back of THIS scene
    // (depth 0) so the title/buttons draw over it; it still composites above
    // GameScene because PauseScene renders after GameScene entirely.
    this.add
      .rectangle(
        DESIGN_WIDTH / 2,
        DESIGN_HEIGHT / 2,
        DESIGN_WIDTH,
        DESIGN_HEIGHT,
        PALETTE.plum,
        PAUSE.dimAlpha
      )
      .setDepth(DEPTHS.background);

    createPixelText(this, DESIGN_WIDTH / 2, PAUSE.titleY, 'Paused', 48).setDepth(DEPTHS.ui);

    // Three stacked options — exactly these three (YAGNI: no Settings/Quit/
    // Volume). Each transition's cross-scene semantics: ScenePlugin.start(key)
    // shuts down the CALLING scene (this PauseScene) and starts `key`;
    // stop/resume/pause(otherKey) act on another scene by key.
    createPixelButton(this, {
      x: DESIGN_WIDTH / 2,
      y: PAUSE.firstButtonY,
      label: 'Resume',
      minWidth: PAUSE.buttonMinWidth,
      onClick: () => this.resume(),
    });

    createPixelButton(this, {
      x: DESIGN_WIDTH / 2,
      y: PAUSE.firstButtonY + PAUSE.buttonSpacingY,
      label: 'Restart',
      minWidth: PAUSE.buttonMinWidth,
      onClick: () => {
        // Fresh run of the same level (bike back at spawn). Explicitly stop the
        // paused GameScene first so it fully shuts down (SHUTDOWN teardown),
        // then start it fresh — start() also shuts down THIS PauseScene.
        this.scene.stop(SCENE_KEYS.game);
        this.scene.start(SCENE_KEYS.game, { level: this.level });
      },
    });

    createPixelButton(this, {
      x: DESIGN_WIDTH / 2,
      y: PAUSE.firstButtonY + PAUSE.buttonSpacingY * 2,
      label: 'Level Select',
      minWidth: PAUSE.buttonMinWidth,
      onClick: () => {
        // Back to the level grid. Explicitly stop the lingering paused
        // GameScene so it doesn't stay paused in the background; start() on the
        // level-select also shuts down THIS PauseScene.
        this.scene.stop(SCENE_KEYS.game);
        this.scene.start(SCENE_KEYS.levelSelect);
      },
    });

    // Esc / P toggle the menu shut (they opened it), matching how GameScene
    // polls the same keys to OPEN. Same KeyCodes as GameScene for consistency.
    // Polled in update() below; cleared by Phaser's KeyboardPlugin on this
    // scene's shutdown (like GameScene's Esc/P), re-added next launch.
    this.escKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    this.pKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.P);
  }

  /** Poll Esc / P to resume (they toggle the menu shut). Runs every frame while
   * this scene is active — GameScene's own update() is frozen while paused, so
   * the resume-side key handling can't live there. */
  update(): void {
    if (
      (this.escKey && Phaser.Input.Keyboard.JustDown(this.escKey)) ||
      (this.pKey && Phaser.Input.Keyboard.JustDown(this.pKey))
    ) {
      this.resume();
    }
  }

  /** Continue the SAME run where it froze: un-pause GameScene, stop this menu.
   * Shared by the Resume button and the Esc/P keys. (resume acts on GameScene by
   * key; stop() with no arg stops the caller — this PauseScene.) */
  private resume(): void {
    this.scene.resume(SCENE_KEYS.game);
    this.scene.stop();
  }
}
