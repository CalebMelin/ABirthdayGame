// `npm run art` — the deterministic art build runner. Generates every committed
// PNG in public/assets/ from the zero-dep pixel toolkit (no node-canvas, no
// Chrome — see DECISIONS.md). Re-runnable: encoding is byte-deterministic
// (src/art/lib/png.mjs), so running this twice in a row leaves git clean.
//
// This file is the WRITER half only: the asset registry (ASSETS_TO_BUILD) and
// the pure PNG renderer (renderAssetBytes) live in the side-effect-free
// src/art/assets.mjs so tests/art-png.test.ts can regenerate and compare bytes
// WITHOUT importing this writer (which would clobber public/assets/ on import).
//
// ST-1 shipped the foundation + the first real proof assets (the recolorable
// rider/bike bases, their default-colored raw fallbacks, the wheel, and the
// finish flag). Later PLAN-10 subtasks add generators + entries to assets.mjs and
// matching rows in src/systems/artManifest.ts so BootScene loads them; anything
// without an entry keeps rendering BootScene's placeholder rectangle until then.
//
// Usage: node src/art/build.mjs  (via `npm run art`)
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ASSETS_TO_BUILD, renderAssetBytes } from './assets.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, '..', '..');
const ASSETS = join(REPO_ROOT, 'public', 'assets');

function main() {
  for (const asset of ASSETS_TO_BUILD) {
    const outPath = join(ASSETS, asset.file);
    mkdirSync(dirname(outPath), { recursive: true });
    const png = renderAssetBytes(asset);
    writeFileSync(outPath, png);
    console.log(`wrote assets/${asset.file} (${asset.width}x${asset.height}, ${png.length} bytes)`);
  }
  console.log(`art: wrote ${ASSETS_TO_BUILD.length} PNG(s) to public/assets/`);
}

main();
