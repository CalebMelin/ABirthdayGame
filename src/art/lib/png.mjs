// Zero-dependency, byte-deterministic PNG encoder for the PLAN-10 art
// pipeline. 8-bit RGBA (color type 6), one None-filter byte per scanline,
// a single IDAT deflated by Node's built-in zlib at a FIXED level so the
// same pixels always encode to the same bytes (the `npm run art` determinism
// gate — a second run must leave git clean). No color chunks are written
// (no gAMA/sRGB/iCCP/cHRM): an untagged PNG is treated as sRGB and a browser
// draws it to a 2D canvas with NO color conversion, so getImageData() hands
// back the exact bytes encoded here. That round-trip fidelity is load-bearing
// for the palette-swap engine (src/systems/palette.ts) — the marker colors
// baked into tex-gabby-base / tex-bike-base must survive load->canvas->
// getImageData exactly for recolorTexture's exact-RGB match to fire.
//
// Types for TS consumers live in png.d.mts.
import { deflateSync } from 'node:zlib';

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// Fixed deflate level -> deterministic IDAT for identical input on a given
// Node/zlib. 9 = maximum compression (asset sizes are tiny; time is moot).
const DEFLATE_LEVEL = 9;

/** Standard CRC-32 (IEEE 802.3, polynomial 0xEDB88320) lookup table. */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

/**
 * CRC-32 over a byte buffer, per the PNG spec (init 0xFFFFFFFF, final XOR).
 * @param {Buffer} buf
 * @returns {number} unsigned 32-bit CRC
 */
function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Build one PNG chunk: length(4 BE) + type(4 ASCII) + data + CRC(4 BE), where
 * the CRC covers type+data.
 * @param {string} type
 * @param {Buffer} data
 * @returns {Buffer}
 */
function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([length, typeBuf, data, crc]);
}

/**
 * Encode raw RGBA pixels to a complete, valid PNG.
 * @param {number} width
 * @param {number} height
 * @param {Uint8ClampedArray | Uint8Array | number[] | Buffer} rgba
 *   width*height*4 bytes, row-major, R,G,B,A order.
 * @returns {Buffer} the PNG file bytes (deterministic for identical input)
 */
export function encodePng(width, height, rgba) {
  if (rgba.length !== width * height * 4) {
    throw new Error(
      `encodePng: expected ${width * height * 4} bytes, got ${rgba.length}`
    );
  }
  const src = Buffer.from(rgba); // copies from any TypedArray/array into a Buffer

  // IHDR: width, height, bit depth 8, color type 6 (RGBA), default
  // compression/filter/interlace.
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: truecolor + alpha
  ihdr[10] = 0; // compression method
  ihdr[11] = 0; // filter method
  ihdr[12] = 0; // interlace: none

  // Raw scanlines: each prefixed with filter-type byte 0 (None).
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: None
    src.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }

  const idat = deflateSync(raw, { level: DEFLATE_LEVEL });

  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
