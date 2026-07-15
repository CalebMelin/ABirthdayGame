import { describe, expect, it } from 'vitest';
import { MARKERS, remapColor, remapPixels } from '../src/systems/palette';
import type { ColorRemap } from '../src/systems/palette';
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
