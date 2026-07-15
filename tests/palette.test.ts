import { describe, expect, it, vi } from 'vitest';
import { MARKERS, recolorTexture, remapColor, remapPixels } from '../src/systems/palette';
import type { ColorRemap } from '../src/systems/palette';
// Type-only: constructing a duck-typed fake scene for recolorTexture's
// non-canvas branches, never importing the runtime Phaser module (keeps
// this suite DOM-free — same import-safety contract as the module itself).
import type Phaser from 'phaser';
import { PALETTE } from '../src/systems/constants';

/** Packs [r,g,b,a] pixel tuples into the flat Uint8ClampedArray shape
 * CanvasRenderingContext2D's ImageData.data uses — what remapPixels walks. */
function pixels(...rgba: [number, number, number, number][]): Uint8ClampedArray {
  return new Uint8ClampedArray(rgba.flat());
}

describe('MARKERS', () => {
  it('are distinct from every PALETTE color (exact-RGB swap safety)', () => {
    // The whole scheme depends on marker colors never legitimately
    // appearing in the game's real pastel art — otherwise an exact-RGB
    // match could recolor a pixel that was never meant to be a marker.
    const markerValues = Object.values(MARKERS);
    const paletteValues = Object.values(PALETTE);
    for (const marker of markerValues) {
      expect(paletteValues).not.toContain(marker);
    }
  });

  it('are four distinct colors from each other', () => {
    const markerValues = Object.values(MARKERS);
    expect(new Set(markerValues).size).toBe(markerValues.length);
  });
});

describe('remapColor', () => {
  const remap: ColorRemap = [
    { from: MARKERS.hair, to: 0x774411 },
    { from: MARKERS.eyes, to: 0x3366ff },
  ];

  it('returns the mapped color on an exact match (hit)', () => {
    expect(remapColor(MARKERS.hair, remap)).toBe(0x774411);
  });

  it('matches the correct entry among multiple mappings', () => {
    expect(remapColor(MARKERS.eyes, remap)).toBe(0x3366ff);
  });

  it('returns the original color unchanged when nothing matches (miss)', () => {
    expect(remapColor(0x123456, remap)).toBe(0x123456);
  });

  it('returns the original color when the remap is empty', () => {
    expect(remapColor(MARKERS.hair, [])).toBe(MARKERS.hair);
  });
});

describe('remapPixels', () => {
  const remap: ColorRemap = [{ from: MARKERS.hair, to: 0x102030 }];

  it('recolors a fully opaque pixel matching a marker, leaving alpha at 255', () => {
    const data = pixels([0xff, 0x00, 0xff, 255]); // MARKERS.hair, opaque
    remapPixels(data, remap);
    expect(Array.from(data)).toEqual([0x10, 0x20, 0x30, 255]);
  });

  it('leaves a fully transparent pixel completely untouched, even matching a marker', () => {
    const data = pixels([0xff, 0x00, 0xff, 0]); // MARKERS.hair color, alpha 0
    remapPixels(data, remap);
    expect(Array.from(data)).toEqual([0xff, 0x00, 0xff, 0]);
  });

  it('recolors a partly-opaque pixel, preserving its exact alpha', () => {
    const data = pixels([0xff, 0x00, 0xff, 128]); // MARKERS.hair, half-opaque
    remapPixels(data, remap);
    expect(Array.from(data)).toEqual([0x10, 0x20, 0x30, 128]);
  });

  it('leaves a non-marker opaque pixel completely unchanged', () => {
    const data = pixels([12, 34, 56, 255]);
    remapPixels(data, remap);
    expect(Array.from(data)).toEqual([12, 34, 56, 255]);
  });

  it('writes R, G, B channels in the correct order (fully asymmetric color)', () => {
    // Every OTHER case here uses MARKER colors, and all four markers have
    // <= 2 distinct byte values (e.g. 0xff00ff), so an R<->B read/write
    // channel-swap bug would pass them all. A fully asymmetric from/to
    // (all six bytes distinct) is the only input that pins channel order.
    const data = pixels([0x11, 0x22, 0x33, 255]);
    remapPixels(data, [{ from: 0x112233, to: 0x445566 }]);
    expect(Array.from(data)).toEqual([0x44, 0x55, 0x66, 255]);
  });

  it('is a no-op on an empty buffer', () => {
    const data = new Uint8ClampedArray(0);
    expect(() => remapPixels(data, remap)).not.toThrow();
    expect(data.length).toBe(0);
  });

  it('recolors only the matching, non-transparent pixels across a multi-pixel buffer', () => {
    const data = pixels(
      [0xff, 0x00, 0xff, 255], // matches -> recolored
      [1, 2, 3, 255], // no match -> unchanged
      [0xff, 0x00, 0xff, 0] // matches but fully transparent -> unchanged
    );
    remapPixels(data, remap);
    expect(Array.from(data)).toEqual([
      0x10, 0x20, 0x30, 255,
      1, 2, 3, 255,
      0xff, 0x00, 0xff, 0,
    ]);
  });
});

// The canvas draw/getImageData/putImageData path of recolorTexture needs a
// real DOM canvas (browser-verified separately), but its three early-exit
// branches are pure control flow over a `scene.textures` handle — testable
// here with a duck-typed fake, no DOM and no runtime Phaser import.
describe('recolorTexture — control flow (no canvas)', () => {
  /** Minimal stand-in for the slice of Phaser.Scene recolorTexture touches:
   * just the three `textures` methods it calls. The `as unknown as
   * Phaser.Scene` cast keeps this suite DOM/Phaser-free (we build a plain
   * object; the Phaser import is type-only). Each method defaults to a
   * spy/no-op and can be overridden per test. */
  function fakeScene(overrides: {
    exists?: (key: string) => boolean;
    get?: ReturnType<typeof vi.fn>;
    createCanvas?: ReturnType<typeof vi.fn>;
  }): Phaser.Scene {
    // A duck-typed fake exposing only the handful of `textures` methods
    // recolorTexture calls; `as unknown as` (not `any`) bridges to the full
    // Phaser.Scene type without pulling the runtime module into this suite.
    return {
      textures: {
        exists: overrides.exists ?? ((): boolean => false),
        get: overrides.get ?? vi.fn(),
        createCanvas: overrides.createCanvas ?? vi.fn(),
      },
    } as unknown as Phaser.Scene;
  }

  it('returns the variantKey on a cache hit without reading or creating any texture', () => {
    const get = vi.fn();
    const createCanvas = vi.fn();
    const scene = fakeScene({ exists: (key) => key === 'variant', get, createCanvas });

    expect(recolorTexture(scene, 'base', 'variant', [])).toBe('variant');
    // The whole point of the per-combination cache: no re-read, no re-draw.
    expect(get).not.toHaveBeenCalled();
    expect(createCanvas).not.toHaveBeenCalled();
  });

  it('falls back to baseKey (never throws) when the base texture is not registered', () => {
    const get = vi.fn();
    const createCanvas = vi.fn();
    // variantKey uncached AND baseKey unregistered.
    const scene = fakeScene({ exists: () => false, get, createCanvas });

    expect(() => recolorTexture(scene, 'missing-base', 'variant', [])).not.toThrow();
    expect(recolorTexture(scene, 'missing-base', 'variant', [])).toBe('missing-base');
    // Must bail BEFORE .get() (which would silently hand back __MISSING) or
    // any canvas creation.
    expect(get).not.toHaveBeenCalled();
    expect(createCanvas).not.toHaveBeenCalled();
  });

  it('falls back to baseKey (never throws) when createCanvas returns null', () => {
    // variantKey uncached, baseKey registered, but the canvas can't be made.
    const get = vi.fn(() => ({ source: [{ width: 24, height: 48 }] }));
    const createCanvas = vi.fn(() => null);
    const scene = fakeScene({ exists: (key) => key === 'base', get, createCanvas });

    expect(() => recolorTexture(scene, 'base', 'variant', [])).not.toThrow();
    expect(recolorTexture(scene, 'base', 'variant', [])).toBe('base');
    expect(createCanvas).toHaveBeenCalled();
  });
});
