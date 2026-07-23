import { describe, expect, it } from 'vitest';
import { encodePng } from '../src/art/lib/png.mjs';
import { Framebuffer } from '../src/art/lib/framebuffer.mjs';
import { MARKERS as ART_MARKERS, PALETTE as ART_PALETTE } from '../src/art/palette.mjs';
import { MARKERS } from '../src/systems/palette';
import { PALETTE } from '../src/systems/constants';
import {
  DEFAULT_CHARACTER,
  resolveBike,
  resolveEyes,
  resolveHair,
  resolveOutfit,
} from '../src/data/characters';
import { PROP_SIZES, readCommittedAsset, SPRITE_SIZES } from './committedArt.mjs';

// -----------------------------------------------------------------------------
// Tiny helpers to read a big-endian PNG without a Buffer type (the tsconfig
// limits `types` to vite/client, so Node's Buffer type isn't available — the
// encoder returns a Buffer at runtime, typed here as Uint8Array).
// -----------------------------------------------------------------------------
function u32(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] << 24) |
      (bytes[offset + 1] << 16) |
      (bytes[offset + 2] << 8) |
      bytes[offset + 3]) >>>
    0
  );
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Recompute a PNG chunk's CRC-32 the way the spec (and encoder) does. */
function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i];
    for (let k = 0; k < 8; k++) {
      crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

describe('encodePng', () => {
  it('writes the 8-byte PNG signature', () => {
    const png = encodePng(1, 1, new Uint8ClampedArray([0, 0, 0, 0]));
    expect(Array.from(png.slice(0, 8))).toEqual(PNG_SIGNATURE);
  });

  it('writes an IHDR describing the requested size, 8-bit RGBA', () => {
    const png = encodePng(3, 5, new Uint8ClampedArray(3 * 5 * 4));
    // After the 8-byte signature: length(4) + "IHDR"(4) + data(13) + crc(4).
    expect(u32(png, 8)).toBe(13); // IHDR data length
    expect(String.fromCharCode(png[12], png[13], png[14], png[15])).toBe('IHDR');
    const data = png.slice(16, 29);
    expect(u32(data, 0)).toBe(3); // width
    expect(u32(data, 4)).toBe(5); // height
    expect(data[8]).toBe(8); // bit depth
    expect(data[9]).toBe(6); // color type: RGBA
    expect(data[10]).toBe(0); // compression
    expect(data[11]).toBe(0); // filter
    expect(data[12]).toBe(0); // interlace
  });

  it('writes a correct CRC-32 over the IHDR chunk (type+data)', () => {
    const png = encodePng(2, 2, new Uint8ClampedArray(2 * 2 * 4));
    const typeAndData = png.slice(12, 29); // "IHDR" + 13 data bytes
    const storedCrc = u32(png, 29);
    expect(storedCrc).toBe(crc32(typeAndData));
  });

  it('ends with an IEND chunk', () => {
    const png = encodePng(1, 1, new Uint8ClampedArray(4));
    // IEND is a 12-byte chunk: length(4)=0 + "IEND"(4) + crc(4).
    const tail = png.slice(png.length - 12, png.length);
    expect(u32(tail, 0)).toBe(0);
    expect(String.fromCharCode(tail[4], tail[5], tail[6], tail[7])).toBe('IEND');
  });

  it('is byte-deterministic: identical pixels encode to identical bytes', () => {
    const pixels = new Uint8ClampedArray([
      255, 0, 255, 255, 0, 255, 255, 255, 0, 0, 0, 0, 12, 34, 56, 200,
    ]);
    const a = encodePng(2, 2, pixels);
    const b = encodePng(2, 2, pixels.slice());
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it('throws when the byte count does not match width*height*4', () => {
    expect(() => encodePng(2, 2, new Uint8ClampedArray(4))).toThrow();
  });
});

describe('Framebuffer', () => {
  it('starts fully transparent (all bytes zero)', () => {
    const fb = new Framebuffer(4, 4);
    expect(fb.data.length).toBe(4 * 4 * 4);
    expect(Array.from(fb.data).every((b) => b === 0)).toBe(true);
  });

  it('setPixel writes R,G,B,A in order and defaults to opaque', () => {
    const fb = new Framebuffer(2, 1);
    fb.setPixel(1, 0, 0x112233);
    expect(Array.from(fb.data.slice(4, 8))).toEqual([0x11, 0x22, 0x33, 255]);
    // The untouched pixel stays transparent.
    expect(Array.from(fb.data.slice(0, 4))).toEqual([0, 0, 0, 0]);
  });

  it('fillRect fills exactly the given rectangle, leaving the rest transparent', () => {
    const fb = new Framebuffer(3, 3);
    fb.fillRect(1, 1, 2, 2, 0xff8800);
    // (0,0) untouched.
    expect(Array.from(fb.data.slice(0, 4))).toEqual([0, 0, 0, 0]);
    // (1,1) filled.
    const i = (1 * 3 + 1) * 4;
    expect(Array.from(fb.data.slice(i, i + 4))).toEqual([0xff, 0x88, 0x00, 255]);
  });

  it('clips out-of-bounds writes instead of throwing or wrapping', () => {
    const fb = new Framebuffer(2, 2);
    expect(() => fb.fillRect(-5, -5, 20, 20, 0x010203)).not.toThrow();
    // Every in-bounds pixel got filled; the array is exactly 2x2.
    expect(fb.data.length).toBe(2 * 2 * 4);
    expect(Array.from(fb.data.slice(0, 4))).toEqual([0x01, 0x02, 0x03, 255]);
  });

  it('drawPixels maps grid characters through the palette, skipping transparent cells', () => {
    const fb = new Framebuffer(3, 2);
    const grid = ['.A.', 'BB.'];
    // 'A' opaque red, 'B' black (0 — must NOT be treated as transparent via a
    // truthiness bug), '.' transparent.
    fb.drawPixels(0, 0, grid, { '.': null, A: 0xff0000, B: 0x000000 });

    const px = (x: number, y: number): number[] => {
      const i = (y * 3 + x) * 4;
      return Array.from(fb.data.slice(i, i + 4));
    };
    expect(px(0, 0)).toEqual([0, 0, 0, 0]); // '.'
    expect(px(1, 0)).toEqual([0xff, 0x00, 0x00, 255]); // 'A'
    expect(px(0, 1)).toEqual([0x00, 0x00, 0x00, 255]); // 'B' black, opaque
    expect(px(2, 1)).toEqual([0, 0, 0, 0]); // '.'
  });

  it('round-trips through encodePng at the requested size', () => {
    const fb = new Framebuffer(2, 2);
    fb.fillRect(0, 0, 2, 2, 0x334455);
    const png = encodePng(fb.width, fb.height, fb.bytes());
    expect(Array.from(png.slice(0, 8))).toEqual(PNG_SIGNATURE);
    const data = png.slice(16, 29);
    expect(u32(data, 0)).toBe(2);
    expect(u32(data, 4)).toBe(2);
  });
});

describe('art palette markers', () => {
  it('exactly equal src/systems/palette.ts MARKERS (recolor depends on it)', () => {
    // If these ever drift, the base PNGs are painted with colors recolorTexture
    // will not match -> every character/bike recolor silently breaks.
    expect(ART_MARKERS.hair).toBe(MARKERS.hair);
    expect(ART_MARKERS.eyes).toBe(MARKERS.eyes);
    expect(ART_MARKERS.bikeBody).toBe(MARKERS.bikeBody);
    expect(ART_MARKERS.suit).toBe(MARKERS.suit);
    expect(ART_MARKERS.hair).toBe(0xff00ff);
    expect(ART_MARKERS.eyes).toBe(0x00ffff);
    expect(ART_MARKERS.bikeBody).toBe(0x00ff00);
    expect(ART_MARKERS.suit).toBe(0xff0000);
  });

  it('exposes the four marker values and a fixed outline/skin in the palette', () => {
    expect(ART_PALETTE.markerHair).toBe(MARKERS.hair);
    expect(ART_PALETTE.markerSuit).toBe(MARKERS.suit);
    expect(ART_PALETTE.outline).toBe(0x2a1820);
    expect(ART_PALETTE.skin).toBe(0xffcf9c);
  });

  it('default-look tones mirror DEFAULT_CHARACTER resolved colors, and a pastel/theme subset mirrors constants PALETTE', () => {
    // The raw tex-gabby / tex-bike fallback PNGs bake these four tones directly
    // into their committed bytes; if DEFAULT_CHARACTER's resolved colors drift,
    // those PNGs go silently stale. Resolve straight from DEFAULT_CHARACTER's
    // field values so the guard tracks the REAL default (not a hard-coded id).
    expect(ART_PALETTE.hairBlonde).toBe(resolveHair(DEFAULT_CHARACTER.hairColor).color);
    expect(ART_PALETTE.eyeBlue).toBe(resolveEyes(DEFAULT_CHARACTER.eyeColor).color);
    expect(ART_PALETTE.suitClassic).toBe(resolveOutfit(DEFAULT_CHARACTER.outfit).suitColor);
    expect(ART_PALETTE.bikePink).toBe(resolveBike(DEFAULT_CHARACTER.bikeColor).color);

    // Spot guard on the broader hand-mirrored pastel/theme set: a representative
    // subset must equal constants.ts PALETTE (the whole set is mirrored by hand
    // because palette.mjs is plain JS and can't import the TS constant).
    expect(ART_PALETTE.bgPink).toBe(PALETTE.bgPink);
    expect(ART_PALETTE.cream).toBe(PALETTE.cream);
    expect(ART_PALETTE.outline).toBe(PALETTE.outline);
    expect(ART_PALETTE.sunshine).toBe(PALETTE.sunshine);
    expect(ART_PALETTE.duskIndigo).toBe(PALETTE.duskIndigo);
  });
});

describe('committed art PNGs', () => {
  // Each committed PNG paired with the generator size it MUST match
  // (SPRITE_SIZES/PROP_SIZES hand-mirror BIKE_TUNING/TEXTURE_SPECS). Decoding
  // the real committed files makes "NEVER change an asset's committed size"
  // (src/art/palette.mjs STYLE GUIDE) enforceable in CI.
  const CASES: { file: string; size: { width: number; height: number } }[] = [
    { file: 'sprites/gabby-base.png', size: SPRITE_SIZES.rider },
    { file: 'sprites/bike-base.png', size: SPRITE_SIZES.bike },
    { file: 'sprites/gabby.png', size: SPRITE_SIZES.rider },
    { file: 'sprites/bike.png', size: SPRITE_SIZES.bike },
    { file: 'sprites/wheel.png', size: SPRITE_SIZES.wheel },
    { file: 'props/flag.png', size: PROP_SIZES.flag },
  ];

  it.each(CASES)('$file is committed at its generator size', ({ file, size }) => {
    const bytes = readCommittedAsset(file);
    // It really is a PNG...
    expect(Array.from(bytes.slice(0, 8))).toEqual(PNG_SIGNATURE);
    // ...and its IHDR width/height — right after the 8-byte signature + 4-byte
    // length + 4-byte "IHDR" type (offsets 16/20), the same layout the
    // encodePng tests above read — equal the generator's declared size.
    expect(u32(bytes, 16)).toBe(size.width);
    expect(u32(bytes, 20)).toBe(size.height);
  });
});
