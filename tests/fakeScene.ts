// A duck-typed stand-in for the slice of Phaser.Scene that the import-safe
// systems modules actually touch — `scene.add.{rectangle,image,container,zone}`
// and `scene.time.now`. NOT a test suite (no `.test.` in the name, so Vitest's
// default include never collects it); it is the shared fixture two suites use.
//
// WHY IT EXISTS: the pool invariants that matter most — "allocated once, never
// grown", "recycled rather than re-created", "destroy() frees everything and is
// safe twice", "one press pops exactly one balloon", "a repeat press is a no-op"
// — live in the FACTORIES, not in the pure helpers, and were previously
// evidenced only by an uncommitted throwaway browser script. tests/palette.test.ts
// established the pattern this follows: build a plain object exposing only the
// handful of methods the code under test calls, bridge it with
// `as unknown as Phaser.Scene` (never `any`), and keep the suite DOM-free and
// runtime-Phaser-free. Extracted here rather than copied into both suites —
// see systems/pixelText.ts's module doc for what this codebase thinks of
// copy #4 of a helper.
//
// FIDELITY THAT MATTERS: `add.container(x, y, children)` REMOVES its children
// from the display list, exactly as Phaser's Container.addHandler does, so
// `displayList()` counts what a real scene would count and a leak assertion
// means something.
import type Phaser from 'phaser';

/** Every kind of GameObject the systems under test create. */
export type FakeObjectKind = 'rectangle' | 'image' | 'container' | 'zone';

/** One fake GameObject. Every setter is chainable (Phaser's convention) and
 * simply records what was set, so a test can assert on the final state. */
export interface FakeGameObject {
  readonly kind: FakeObjectKind;
  readonly textureKey: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  fillColor: number;
  tint: number | null;
  depth: number;
  visible: boolean;
  alpha: number;
  rotation: number;
  scaleValue: number;
  originX: number;
  originY: number;
  /** Mirrors Phaser: an object is interactive after setInteractive() and
   * input-disabled after disableInteractive(). `null` = never made
   * interactive. */
  inputEnabled: boolean | null;
  destroyed: boolean;
  /** Children handed to add.container(); they leave the display list. */
  readonly children: FakeGameObject[];
  /** How many times destroy() has been called (a double destroy must not
   * double-count anything). */
  destroyCount: number;
  setDepth(value: number): FakeGameObject;
  setVisible(value: boolean): FakeGameObject;
  setAlpha(value: number): FakeGameObject;
  setOrigin(x: number, y?: number): FakeGameObject;
  setScale(value: number): FakeGameObject;
  setPosition(x: number, y: number): FakeGameObject;
  setFillStyle(color: number): FakeGameObject;
  setStrokeStyle(width: number, color: number): FakeGameObject;
  setTint(color: number): FakeGameObject;
  setInteractive(): FakeGameObject;
  disableInteractive(): FakeGameObject;
  on(event: string, handler: (...args: never[]) => void): FakeGameObject;
  destroy(): void;
  /** Test-only: deliver an event to this object's listeners, the way Phaser's
   * InputPlugin would. */
  fire(event: string, ...args: unknown[]): void;
}

export interface FakeScene {
  /** Pass this to the factory under test. */
  readonly scene: Phaser.Scene;
  /** EVERY object ever created, destroyed or not — the allocation ledger. */
  readonly created: FakeGameObject[];
  /** Objects currently on the display list (containers hold their children off
   * it, exactly as Phaser does). */
  displayList(): FakeGameObject[];
  /** Objects of a kind that have not been destroyed. */
  live(kind?: FakeObjectKind): FakeGameObject[];
  /** Advance the scene clock (`scene.time.now`). */
  setNow(ms: number): void;
  advance(ms: number): void;
  now(): number;
}

export function createFakeScene(startNowMs = 0): FakeScene {
  const created: FakeGameObject[] = [];
  let displayed: FakeGameObject[] = [];
  let nowMs = startNowMs;

  function make(kind: FakeObjectKind, textureKey: string | null): FakeGameObject {
    const handlers = new Map<string, Array<(...args: never[]) => void>>();
    const obj: FakeGameObject = {
      kind,
      textureKey,
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      fillColor: 0,
      tint: null,
      depth: 0,
      visible: true,
      alpha: 1,
      rotation: 0,
      scaleValue: 1,
      originX: 0.5,
      originY: 0.5,
      inputEnabled: null,
      destroyed: false,
      children: [],
      destroyCount: 0,
      setDepth(value) {
        obj.depth = value;
        return obj;
      },
      setVisible(value) {
        obj.visible = value;
        return obj;
      },
      setAlpha(value) {
        obj.alpha = value;
        return obj;
      },
      setOrigin(x, y) {
        obj.originX = x;
        obj.originY = y ?? x;
        return obj;
      },
      setScale(value) {
        obj.scaleValue = value;
        return obj;
      },
      setPosition(x, y) {
        obj.x = x;
        obj.y = y;
        return obj;
      },
      setFillStyle(color) {
        obj.fillColor = color;
        return obj;
      },
      setStrokeStyle() {
        return obj;
      },
      setTint(color) {
        obj.tint = color;
        return obj;
      },
      setInteractive() {
        obj.inputEnabled = true;
        return obj;
      },
      disableInteractive() {
        // Phaser's disableInteractive() flips input.enabled; it does NOT drop
        // the InteractiveObject, which is why setInteractive() can re-enable it.
        if (obj.inputEnabled !== null) obj.inputEnabled = false;
        return obj;
      },
      on(event, handler) {
        const list = handlers.get(event) ?? [];
        list.push(handler);
        handlers.set(event, list);
        return obj;
      },
      destroy() {
        obj.destroyCount++;
        obj.destroyed = true;
        displayed = displayed.filter((o) => o !== obj);
        // A Container destroys its children with it.
        for (const child of obj.children) child.destroy();
      },
      fire(event, ...args) {
        for (const handler of handlers.get(event) ?? []) {
          (handler as (...a: unknown[]) => void)(...args);
        }
      },
    };
    created.push(obj);
    displayed.push(obj);
    return obj;
  }

  const add = {
    rectangle(x: number, y: number, width: number, height: number, fillColor: number) {
      const obj = make('rectangle', null);
      obj.x = x;
      obj.y = y;
      obj.width = width;
      obj.height = height;
      obj.fillColor = fillColor;
      return obj;
    },
    image(x: number, y: number, key: string) {
      const obj = make('image', key);
      obj.x = x;
      obj.y = y;
      return obj;
    },
    zone(x: number, y: number, width: number, height: number) {
      const obj = make('zone', null);
      obj.x = x;
      obj.y = y;
      obj.width = width;
      obj.height = height;
      return obj;
    },
    container(x: number, y: number, children: FakeGameObject[] = []) {
      const obj = make('container', null);
      obj.x = x;
      obj.y = y;
      obj.children.push(...children);
      // Phaser removes a Container's children from the display list.
      displayed = displayed.filter((o) => !children.includes(o));
      return obj;
    },
  };

  // Duck-typed bridge: the modules under test only ever CALL METHODS on the
  // scene handle (their documented contract), so this exposes exactly those.
  const scene = {
    add,
    time: {
      get now(): number {
        return nowMs;
      },
    },
  } as unknown as Phaser.Scene;

  return {
    scene,
    created,
    displayList: () => displayed.slice(),
    live: (kind) => created.filter((o) => !o.destroyed && (kind === undefined || o.kind === kind)),
    setNow: (ms) => {
      nowMs = ms;
    },
    advance: (ms) => {
      nowMs += ms;
    },
    now: () => nowMs,
  };
}

/** A fake Phaser pointer, the two fields partyBalloons.ts reads off a
 * pointerdown. `id` distinguishes fingers; `downTime` distinguishes presses. */
export function fakePointer(id: number, downTime: number): Phaser.Input.Pointer {
  return { id, downTime } as unknown as Phaser.Input.Pointer;
}

/** A deterministic rng that walks a fixed cycle of draws. Handy where a test
 * needs reproducible values and does NOT care whether consecutive consumers
 * differ from one another.
 *
 * CAUTION — this is the wrong tool whenever a test asserts that two consumers
 * got DIFFERENT values: if the cycle length divides the number of draws each
 * consumer makes, every consumer sees the identical sequence. (balloonSpawn
 * draws exactly 7, so a 7-value cycle handed all 32 balloons the same spawn and
 * quietly made a "the flock re-scatters" assertion unfalsifiable.) Use
 * seededRandom for those. */
export function cyclingRng(values: readonly number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

/** A deterministic, well-distributed PRNG (mulberry32) in [0, 1). Reproducible
 * from its seed, but with no short period to accidentally align with a
 * consumer's draw count — the right default wherever a test needs randomness
 * that behaves like randomness. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
