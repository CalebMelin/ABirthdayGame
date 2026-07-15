// Palette-swap engine (PLAN-04 task 1). Base sprites (BootScene's
// tex-gabby-base / tex-bike-base) are drawn with pure, loud MARKER colors
// standing in for a recolorable region (hair, eyes, bike body, suit) —
// colors deliberately chosen to never appear in the game's real pastel
// PALETTE (constants.ts), so an exact (r,g,b) pixel match is always
// unambiguous. At load, a caller builds a ColorRemap (marker -> chosen
// color) and asks recolorTexture to generate/reuse a recolored texture
// variant via canvas pixel replacement.
//
// This module is the ENGINE only: MARKERS, the ColorRemap type, the pure
// remap helpers, and the canvas recolor call itself. Mapping a player's
// CharacterConfig (save.ts) + the swatch data to an actual ColorRemap and a
// stable variantKey is PLAN-04 task 2's job (buildCharacterTextures); the
// in-game wiring (retiring the raw tex-gabby/tex-bike render path) is task 4.
//
// IMPORTANT — this file must have NO RUNTIME import of 'phaser' (same
// contract as bike.ts / terrain.ts): Vitest runs in plain Node (no DOM/
// Canvas), so importing the real Phaser module here would crash it.
// `import type Phaser` below is erased entirely at compile time
// (verbatimModuleSyntax + tsconfig's erasableSyntaxOnly), which keeps
// remapColor/remapPixels safely importable from tests/palette.test.ts.
// `recolorTexture` only ever CALLS METHODS on a `scene` handle supplied at
// runtime by the real (browser-side) caller — it never imports or
// constructs Phaser itself.
import type Phaser from 'phaser';

// ---------------------------------------------------------------------------
// Marker colors.
// ---------------------------------------------------------------------------

/** Marker colors: pure, maximally-saturated primaries that stand in for a
 * recolorable region on a base sprite (see BootScene's tex-gabby-base /
 * tex-bike-base). Deliberately loud and NEVER present in the game's pastel
 * PALETTE (constants.ts) — enforced by a distinctness test in
 * tests/palette.test.ts — so `remapPixels`' exact-RGB match can never
 * accidentally recolor a pixel that wasn't meant to be a marker. This is
 * the one sanctioned color-literal exception to CLAUDE.md's "no magic
 * numbers live outside constants.ts" convention. */
export const MARKERS = {
  hair: 0xff00ff,
  eyes: 0x00ffff,
  bikeBody: 0x00ff00,
  suit: 0xff0000,
} as const;

// ---------------------------------------------------------------------------
// Pure types + helpers — no Phaser/DOM, unit-tested in tests/palette.test.ts.
// ---------------------------------------------------------------------------

/** One base-sprite marker color mapped to a chosen real color, both as
 * 0xRRGGBB. */
export interface ColorRemapEntry {
  /** A MARKERS.* value to match exactly (see remapColor / remapPixels). */
  from: number;
  /** The chosen replacement color, 0xRRGGBB. */
  to: number;
}

/** A full palette swap for one base sprite: which marker colors map to
 * which chosen colors. Built by PLAN-04 task 2 (buildCharacterTextures)
 * from a player's CharacterConfig + the swatch data; consumed by
 * recolorTexture. */
export type ColorRemap = ReadonlyArray<ColorRemapEntry>;

/** Exact-match color lookup: returns the mapped `to` color if `rgb`
 * exactly equals some entry's `from`, else returns `rgb` unchanged. Pure —
 * the core lookup both remapPixels and (indirectly) recolorTexture are
 * built on. The first matching entry wins if `remap` somehow contains more
 * than one mapping for the same `from` (shouldn't happen for a well-formed
 * remap, but keeps this total rather than picking an undefined "last
 * wins"). */
export function remapColor(rgb: number, remap: ColorRemap): number {
  for (const entry of remap) {
    if (entry.from === rgb) {
      return entry.to;
    }
  }
  return rgb;
}

/** Walks an RGBA pixel buffer (as returned by CanvasRenderingContext2D's
 * `ImageData.data`) IN PLACE, recoloring every fully/partly opaque pixel
 * (alpha > 0) whose (r,g,b) exactly matches a marker in `remap` to that
 * marker's replacement color. Fully transparent pixels (alpha === 0) are
 * left completely untouched — both color AND alpha — so empty/antialiased
 * edges of a base sprite never pick up a stray recolor. The alpha channel
 * itself is NEVER modified, even on a pixel that gets recolored. Pure (no
 * Phaser/DOM): this is the core of the canvas swap `recolorTexture`
 * performs, factored out so it's unit-testable against a hand-built
 * Uint8ClampedArray without a real canvas. A zero-length buffer is a safe
 * no-op. */
export function remapPixels(data: Uint8ClampedArray, remap: ColorRemap): void {
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue; // fully transparent: never touched

    const rgb = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
    const mapped = remapColor(rgb, remap);
    if (mapped === rgb) continue;

    data[i] = (mapped >> 16) & 0xff;
    data[i + 1] = (mapped >> 8) & 0xff;
    data[i + 2] = mapped & 0xff;
    // data[i + 3] (alpha) intentionally left untouched.
  }
}

// ---------------------------------------------------------------------------
// Canvas recolor engine (never imports Phaser at runtime — see module doc).
// ---------------------------------------------------------------------------

/**
 * Returns a texture key whose pixels are `baseKey`'s art with every marker
 * color in `remap` exact-RGB-replaced — the canvas recolor engine PLAN-04
 * task 2's buildCharacterTextures calls once per chosen rider/bike
 * combination.
 *
 * `variantKey` IS the per-combination cache: the caller derives it from the
 * chosen combo (e.g. a swatch-id string), so the SAME combo across scenes/
 * reloads reuses the already-generated texture instead of re-drawing it,
 * and the full hair x eyes x bike x outfit cartesian product is never
 * pre-generated — only combinations a player actually picks ever get drawn.
 *
 * `scene` is used purely as a runtime handle to Phaser's TextureManager
 * (same contract as bike.ts's createBike / terrain.ts's createTerrain) —
 * this module never imports Phaser itself (see module doc comment).
 */
export function recolorTexture(
  scene: Phaser.Scene,
  baseKey: string,
  variantKey: string,
  remap: ColorRemap
): string {
  if (scene.textures.exists(variantKey)) {
    return variantKey;
  }

  const baseTexture = scene.textures.get(baseKey);
  const { width, height } = baseTexture.source[0];

  const canvasTexture = scene.textures.createCanvas(variantKey, width, height);
  if (!canvasTexture) {
    // Defensive fallback (task spec): canvas creation can theoretically
    // fail — a render must never hard-crash over a cosmetic recolor, so
    // fall back to the raw marker-colored base rather than throwing.
    return baseKey;
  }

  // Base textures are always either a Graphics-generated canvas
  // (BootScene's placeholder era) or a loaded PNG image (real art,
  // PLAN-10) — never a Phaser RenderTexture — so narrowing
  // getSourceImage()'s declared return type to what
  // CanvasRenderingContext2D.drawImage actually accepts is safe. Phaser's
  // type includes RenderTexture only because the same TextureManager API
  // also backs dynamic textures.
  const drawable = baseTexture.getSourceImage() as HTMLImageElement | HTMLCanvasElement;

  // No smoothing is set here on purpose: the game config's `pixelArt: true`
  // governs nearest-neighbor crispness for every canvas texture, and this
  // is a 1:1, non-scaled copy (same width/height, integer origin) where
  // smoothing has no effect anyway — see task notes on keeping crispness.
  canvasTexture.context.drawImage(drawable, 0, 0);

  const imageData = canvasTexture.context.getImageData(0, 0, width, height);
  remapPixels(imageData.data, remap);
  canvasTexture.context.putImageData(imageData, 0, 0);
  canvasTexture.refresh();

  return variantKey;
}
