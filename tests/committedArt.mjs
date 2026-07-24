// Test-only helper for asserting facts about the COMMITTED art PNGs under
// public/assets/ (built by `npm run art` — src/art/build.mjs). Lives in a
// .mjs — excluded from the tsc program, exactly like src/art/lib/*.mjs — so it
// can use node:fs without pulling in @types/node (the tsconfig limits `types`
// to vite/client; see png.d.mts's note). It reads a committed PNG's raw bytes
// AND re-exports the generator SPRITE_SIZES/PROP_SIZES, so a .ts test can
// decode a committed PNG's real IHDR dimensions and compare them against the
// sizes its generator claims through ONE typed import (see committedArt.d.mts).
// Keep in sync with committedArt.d.mts.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SPRITE_SIZES } from '../src/art/sprites.mjs';
import { PROP_SIZES } from '../src/art/props.mjs';
import { POLICE_LIGHT_MIRROR, VEHICLE_SIZES } from '../src/art/vehicles.mjs';

export { SPRITE_SIZES, PROP_SIZES, VEHICLE_SIZES, POLICE_LIGHT_MIRROR };

const PUBLIC_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const ASSETS_DIR = join(PUBLIC_DIR, 'assets');

/**
 * Read a committed asset PNG (path relative to public/assets/) as raw bytes.
 * Throws a clear, actionable error if the file is missing/unreadable so a CI
 * failure points straight at the fix rather than a bare ENOENT.
 * @param {string} relPath e.g. 'sprites/gabby-base.png'
 * @returns {Uint8Array}
 */
export function readCommittedAsset(relPath) {
  try {
    return new Uint8Array(readFileSync(join(ASSETS_DIR, relPath)));
  } catch {
    throw new Error(
      `committed asset public/assets/${relPath} is missing or unreadable — run \`npm run art\` to (re)generate the committed PNGs`
    );
  }
}

/**
 * Read a committed app-shell PNG (path relative to the public/ ROOT — e.g. the
 * app icon apple-touch-icon.png, which lives at the site root, not under
 * public/assets/) as raw bytes. Same actionable error as readCommittedAsset.
 * @param {string} relPath e.g. 'apple-touch-icon.png'
 * @returns {Uint8Array}
 */
export function readCommittedRootAsset(relPath) {
  try {
    return new Uint8Array(readFileSync(join(PUBLIC_DIR, relPath)));
  } catch {
    throw new Error(
      `committed asset public/${relPath} is missing or unreadable — run \`npm run art\` to (re)generate the committed PNGs`
    );
  }
}
