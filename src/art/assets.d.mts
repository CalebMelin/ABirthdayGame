// Types for assets.mjs (plain JS, excluded from the tsc program — same convention
// as lib/png.d.mts / lib/framebuffer.d.mts, so no @types/node is needed). The
// PNG bytes are a Node Buffer at runtime, declared as Uint8Array (Buffer extends
// it). Keep in sync with the .mjs.
import type { Framebuffer } from './lib/framebuffer.mjs';

/** One committed asset: its output path (relative to public/assets/), pixel size,
 * and the generator that paints it into a Framebuffer. */
export interface Asset {
  readonly file: string;
  readonly width: number;
  readonly height: number;
  readonly draw: (fb: Framebuffer) => void;
}

/** Every committed asset the build writes under public/assets/ — the single
 * registry build.mjs and the freshness guard both drive. */
export declare const ASSETS_TO_BUILD: readonly Asset[];

/** App-shell assets written to the public/ ROOT (their `file` is relative to
 * public/, not public/assets/) — currently just apple-touch-icon.png. */
export declare const ROOT_ASSETS_TO_BUILD: readonly Asset[];

/** Render one asset to its PNG bytes (pure — no file I/O), the same code path
 * build.mjs writes to disk. */
export declare function renderAssetBytes(asset: Asset): Uint8Array;
