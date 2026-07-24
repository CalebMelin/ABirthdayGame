// Zero-dependency RGBA framebuffer — the "mini-canvas" every PLAN-10 art
// generator draws onto (src/art/*.mjs). Pure Node ESM, no npm deps, no DOM:
// this is deliberately NOT node-canvas (see DECISIONS.md — the pipeline must
// regenerate deterministically from a clean checkout with zero external
// requirements). Pixels live in a flat Uint8ClampedArray of width*height*4
// bytes (R,G,B,A), initialised all-zero == fully transparent. Colors are
// 0xRRGGBB ints plus a separate alpha byte; the toolkit never anti-aliases
// (hard pixel edges only — see src/art/palette.mjs's STYLE GUIDE), so every
// primitive writes whole opaque pixels.
//
// Companion encoder: src/art/lib/png.mjs turns bytes() into a committed PNG.
// Types for TS consumers (the vitest suite) live in framebuffer.d.mts.

export class Framebuffer {
  /**
   * @param {number} width
   * @param {number} height
   */
  constructor(width, height) {
    this.width = width;
    this.height = height;
    // All zero => every pixel starts fully transparent (alpha 0).
    this.data = new Uint8ClampedArray(width * height * 4);
  }

  /** Byte offset of pixel (x,y)'s red channel. */
  _index(x, y) {
    return (y * this.width + x) * 4;
  }

  /**
   * Write one pixel. `color` is 0xRRGGBB; `alpha` defaults to fully opaque.
   * Out-of-bounds writes are ignored (so shapes can safely spill past the
   * edge). An explicit alpha of 0 is a no-op — the pixel stays whatever it
   * was — so a "transparent" draw never stomps existing art.
   * @param {number} x
   * @param {number} y
   * @param {number} color
   * @param {number} [alpha]
   */
  setPixel(x, y, color, alpha = 255) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    if (alpha <= 0) return;
    const i = this._index(x, y);
    this.data[i] = (color >> 16) & 0xff;
    this.data[i + 1] = (color >> 8) & 0xff;
    this.data[i + 2] = color & 0xff;
    this.data[i + 3] = alpha;
  }

  /**
   * Fill an axis-aligned rectangle. Off-canvas parts are clipped by setPixel.
   * @param {number} x
   * @param {number} y
   * @param {number} w
   * @param {number} h
   * @param {number} color
   * @param {number} [alpha]
   */
  fillRect(x, y, w, h, color, alpha = 255) {
    for (let yy = y; yy < y + h; yy++) {
      for (let xx = x; xx < x + w; xx++) {
        this.setPixel(xx, yy, color, alpha);
      }
    }
  }

  /** Horizontal 1px line of length `len` starting at (x,y). */
  hLine(x, y, len, color, alpha = 255) {
    for (let i = 0; i < len; i++) this.setPixel(x + i, y, color, alpha);
  }

  /** Vertical 1px line of length `len` starting at (x,y). */
  vLine(x, y, len, color, alpha = 255) {
    for (let i = 0; i < len; i++) this.setPixel(x, y + i, color, alpha);
  }

  /** 1px rectangle border (the standard STYLE-GUIDE dark outline). */
  outlineRect(x, y, w, h, color, alpha = 255) {
    this.hLine(x, y, w, color, alpha);
    this.hLine(x, y + h - 1, w, color, alpha);
    this.vLine(x, y, h, color, alpha);
    this.vLine(x + w - 1, y, h, color, alpha);
  }

  /**
   * Filled disc, no anti-aliasing: a pixel is inside when its CENTRE
   * ((x+0.5),(y+0.5)) is within `r` of (cx,cy). Passing a fractional centre
   * (e.g. 18 for a 36px wheel) keeps the disc symmetric.
   * @param {number} cx
   * @param {number} cy
   * @param {number} r
   * @param {number} color
   * @param {number} [alpha]
   */
  fillCircle(cx, cy, r, color, alpha = 255) {
    const r2 = r * r;
    const minY = Math.max(0, Math.floor(cy - r));
    const maxY = Math.min(this.height - 1, Math.ceil(cy + r));
    const minX = Math.max(0, Math.floor(cx - r));
    const maxX = Math.min(this.width - 1, Math.ceil(cx + r));
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const dx = x + 0.5 - cx;
        const dy = y + 0.5 - cy;
        if (dx * dx + dy * dy <= r2) this.setPixel(x, y, color, alpha);
      }
    }
  }

  /**
   * Stamp hand-authored pixel art at (originX, originY). `grid` is an array of
   * equal-length row strings; each character indexes `palette` (char ->
   * 0xRRGGBB). A character mapped to null/undefined (or absent from the
   * palette) is TRANSPARENT and left untouched — this is how the sentinel
   * '.' skips a cell. NOTE the null/undefined check is explicit, never a
   * truthiness test, because 0x000000 (black) is a legitimate, falsy color.
   * @param {number} originX
   * @param {number} originY
   * @param {readonly string[]} grid
   * @param {Record<string, number | null | undefined>} palette
   */
  drawPixels(originX, originY, grid, palette) {
    for (let row = 0; row < grid.length; row++) {
      const line = grid[row];
      for (let col = 0; col < line.length; col++) {
        const color = palette[line[col]];
        if (color === null || color === undefined) continue;
        this.setPixel(originX + col, originY + row, color);
      }
    }
  }

  /**
   * Alpha byte at (x,y). Out-of-bounds reads as 0 (fully transparent), so a
   * silhouette scan can safely probe past the edge without a bounds check at
   * every call site.
   * @param {number} x
   * @param {number} y
   * @returns {number}
   */
  alphaAt(x, y) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return 0;
    return this.data[(y * this.width + x) * 4 + 3];
  }

  /**
   * Lay a clean 1px dark outline around whatever opaque silhouette has been
   * painted: every TRANSPARENT pixel 4-adjacent to an opaque one becomes
   * `color`. 4-neighbour (x±1,y / x,y±1 — not 8) keeps it a true 1px band with
   * no diagonal thickening. Targets are collected BEFORE any write so the
   * freshly-added outline never re-outlines itself (the two-pass is
   * load-bearing). Deterministic (pure function of the current pixels).
   * @param {number} color
   * @param {number} [alpha]
   */
  outlineSilhouette(color, alpha = 255) {
    const targets = [];
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (this.alphaAt(x, y) !== 0) continue;
        if (
          this.alphaAt(x - 1, y) ||
          this.alphaAt(x + 1, y) ||
          this.alphaAt(x, y - 1) ||
          this.alphaAt(x, y + 1)
        ) {
          targets.push([x, y]);
        }
      }
    }
    for (const [x, y] of targets) this.setPixel(x, y, color, alpha);
  }

  /** The raw RGBA byte buffer, ready for encodePng(width,height,bytes). */
  bytes() {
    return this.data;
  }
}
