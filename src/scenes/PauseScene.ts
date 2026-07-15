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
      onClick: () => {
        // Continue the SAME run where it froze: un-pause GameScene, stop this
        // menu. (resume acts on GameScene by key; stop() with no arg stops the
        // caller — this PauseScene.)
        this.scene.resume(SCENE_KEYS.game);
        this.scene.stop();
      },
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
  }
}
