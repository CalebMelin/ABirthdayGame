// Unified player input (PLAN-03 task 1): a single abstraction that merges
// keyboard AND touch into the {gas, brake} the bike consumes each frame.
// Either source works at any time with no mode switch — a pedal is DOWN if
// ANY of its sources is down (see mergePedals). Touch pedals themselves
// (PLAN-03 task 2) are separate GameObjects; they feed this handle their
// live pressed state via setTouchGas/setTouchBrake, and this module merges
// that signal in exactly like a key.
//
// IMPORTANT — this file must have NO RUNTIME import of 'phaser', for the
// same reason as bike.ts/terrain.ts: vitest runs in plain Node (no DOM/
// WebGL), and importing the real Phaser module there crashes. `import type
// Phaser` below is erased entirely at compile time (verbatimModuleSyntax +
// tsconfig's erasableSyntaxOnly), and the pure `mergePedals` helper touches
// no Phaser at all — that's the Node-tested core (tests/input.test.ts).
// `createGameInput` only ever CALLS METHODS on a `scene` handed to it at
// runtime by the real (browser-side) caller; the keyboard/touch wiring
// itself is browser-verified, same pure-vs-browser split as bike.ts. Keys
// are added by STRING name (KeyboardPlugin.addKey accepts 'RIGHT'/'W'/…),
// so no runtime reference to Phaser.Input.Keyboard.KeyCodes is needed here.
import type Phaser from 'phaser';
import type { BikeInput } from './bike';

// ---------------------------------------------------------------------------
// Pure helper — no Phaser/DOM, unit-tested in tests/input.test.ts.
// ---------------------------------------------------------------------------

/**
 * OR-merges every input source into the {gas, brake} the bike consumes: a
 * pedal is DOWN iff ANY of its sources — any mapped key's live isDown, or
 * the touch pedal boolean — is down. OR (never a toggle/latch/priority) is
 * what lets keyboard and touch drive simultaneously with no mode switch,
 * and lets the several keys mapped to one action (Right/Up/W/D) be held or
 * rolled between without ever fighting or dropping the pedal.
 *
 * Deliberately a pure per-frame SNAPSHOT with NO edge-filtering, debounce,
 * coalescing, or smoothing of any kind: the bike's backflip mechanic reads
 * real press/release transitions (see bike.ts nextPedalAirFresh), so every
 * source boolean must pass through live and untouched — a press reaches
 * bike.update the same step it happens, a release the same step it happens.
 * Conflict between gas and brake is likewise NOT resolved here (bike.ts
 * decides brake-wins); both are reported verbatim.
 */
export function mergePedals(
  gasSources: readonly boolean[],
  brakeSources: readonly boolean[]
): BikeInput {
  return {
    gas: gasSources.some((down) => down),
    brake: brakeSources.some((down) => down),
  };
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** The input handle a scene holds for a run. Created fresh in create() and
 * torn down in the scene's SHUTDOWN handler (keys are per-run, like the
 * bike/terrain handles), so a scene.restart() can't leak or double-register.
 */
export interface GameInput {
  /** THIS frame's merged pedal state — `(any gas key down) OR touchGas`,
   * `(any brake key down) OR touchBrake`. Assignable straight to
   * {@link BikeInput}. Read once per scene update() (render frame); the
   * bike samples it per fixed physics step internally. */
  sample(): BikeInput;
  /** Set by task 2's touch gas pedal on a genuine pointerdown (true) /
   * pointerup (false). Stored VERBATIM — never debounced or delayed — so a
   * real pointer transition reaches bike.update() untouched (the backflip
   * mechanic keys off the edge; see mergePedals). */
  setTouchGas(down: boolean): void;
  /** Touch brake pedal counterpart of {@link setTouchGas}. */
  setTouchBrake(down: boolean): void;
  /** Removes every Key (and its capture) this handle registered. Safe to
   * call more than once. The scene calls this from its SHUTDOWN handler as
   * the owning teardown — in the normal restart path Phaser's
   * KeyboardPlugin.shutdown() has already removed all keys, so this is the
   * explicit, symmetric cleanup the rig owns (matching bike/terrain
   * destroy()). */
  destroy(): void;
}

// ---------------------------------------------------------------------------
// Phaser wiring (never imports Phaser at runtime — see module doc).
// ---------------------------------------------------------------------------

/** Keyboard mapping (NORTH_STAR §2 desktop controls + the free WASD bonus):
 * gas = Right/Up/W/D, brake = Left/Down/S/A. String names on purpose —
 * KeyboardPlugin.addKey resolves them against KeyCodes, so this file needs
 * no runtime Phaser value (see module doc). */
const GAS_KEY_NAMES = ['RIGHT', 'UP', 'W', 'D'] as const;
const BRAKE_KEY_NAMES = ['LEFT', 'DOWN', 'S', 'A'] as const;

/**
 * Builds the per-run input handle. `scene` is used purely as a runtime
 * handle to Phaser's keyboard plugin (same contract as createBike/
 * createTerrain) — the caller passes a real, already-constructed
 * Phaser.Scene from browser code.
 *
 * scene.input.keyboard may be undefined (keyboard input disabled / no DOM);
 * guarded like the existing GameScene code. When it is, no keys are created
 * and only the touch signals drive — sample() still works.
 */
export function createGameInput(scene: Phaser.Scene): GameInput {
  const keyboard = scene.input.keyboard;

  // addKey is idempotent per keycode and returns cleanly-typed Key objects
  // (unlike addKeys' loosely-typed object); keeping the references lets
  // sample() poll them and destroy() remove exactly what we added.
  const gasKeys = keyboard ? GAS_KEY_NAMES.map((name) => keyboard.addKey(name)) : [];
  const brakeKeys = keyboard ? BRAKE_KEY_NAMES.map((name) => keyboard.addKey(name)) : [];

  // Touch pedal signals, written verbatim by task 2's pedals (see the
  // setTouch* docs). NEVER filtered — the backflip mechanic needs raw edges.
  let touchGas = false;
  let touchBrake = false;

  function sample(): BikeInput {
    // Append the touch signal as one more source of each pedal, then let
    // the pure OR-merge collapse them — keyboard and touch are peers.
    return mergePedals(
      [...gasKeys.map((key) => key.isDown), touchGas],
      [...brakeKeys.map((key) => key.isDown), touchBrake]
    );
  }

  function setTouchGas(down: boolean): void {
    touchGas = down;
  }

  function setTouchBrake(down: boolean): void {
    touchBrake = down;
  }

  function destroy(): void {
    // Remove each key we added, destroying the Key and dropping its capture
    // so nothing lingers across a restart. removeKey is a no-op for an
    // already-removed key, so this is safe to call more than once. The
    // `keyboard?.` guard is only for the (empty-arrays) no-keyboard case.
    for (const key of [...gasKeys, ...brakeKeys]) {
      keyboard?.removeKey(key, true, true);
    }
  }

  return { sample, setTouchGas, setTouchBrake, destroy };
}
