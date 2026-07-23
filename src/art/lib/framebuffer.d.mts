// Type declarations for the zero-dep pixel toolkit (framebuffer.mjs). Hand
// written (the .mjs is plain JS, excluded from the tsc program) so the vitest
// suite and any TS consumer type-check the import. Keep in sync with the .mjs.

export declare class Framebuffer {
  readonly width: number;
  readonly height: number;
  /** Flat RGBA byte buffer, width*height*4, row-major. */
  readonly data: Uint8ClampedArray;
  constructor(width: number, height: number);
  setPixel(x: number, y: number, color: number, alpha?: number): void;
  fillRect(x: number, y: number, w: number, h: number, color: number, alpha?: number): void;
  hLine(x: number, y: number, len: number, color: number, alpha?: number): void;
  vLine(x: number, y: number, len: number, color: number, alpha?: number): void;
  outlineRect(x: number, y: number, w: number, h: number, color: number, alpha?: number): void;
  fillCircle(cx: number, cy: number, r: number, color: number, alpha?: number): void;
  drawPixels(
    originX: number,
    originY: number,
    grid: readonly string[],
    palette: Record<string, number | null | undefined>
  ): void;
  bytes(): Uint8ClampedArray;
}
