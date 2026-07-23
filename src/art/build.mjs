// `npm run art` — the deterministic art build runner. Generates every committed
// PNG in public/assets/ from the zero-dep pixel toolkit (no node-canvas, no
// Chrome — see DECISIONS.md). Re-runnable: encoding is byte-deterministic
// (src/art/lib/png.mjs), so running this twice in a row leaves git clean.
//
// ST-1 ships the foundation + the first real proof assets (the recolorable
// rider/bike bases, their default-colored raw fallbacks, the wheel, and the
// finish flag). Later PLAN-10 subtasks add generators + entries here and matching
// rows in src/systems/artManifest.ts so BootScene loads them; anything without an
// entry keeps rendering BootScene's placeholder rectangle until then.
//
// Usage: node src/art/build.mjs  (via `npm run art`)
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Framebuffer } from './lib/framebuffer.mjs';
import { encodePng } from './lib/png.mjs';
import { MARKERS, PALETTE } from './palette.mjs';
import { drawBike, drawCaleb, drawRider, drawWheel, drawWheelieRider, SPRITE_SIZES } from './sprites.mjs';
import { drawFlag, PROP_SIZES } from './props.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, '..', '..');
const ASSETS = join(REPO_ROOT, 'public', 'assets');

/**
 * Render one asset via `draw(fb)` at the given size and return its PNG bytes.
 * @param {number} width
 * @param {number} height
 * @param {(fb: Framebuffer) => void} draw
 */
function render(width, height, draw) {
  const fb = new Framebuffer(width, height);
  draw(fb);
  return encodePng(width, height, fb.bytes());
}

/** Every committed asset: { path relative to public/assets, size, draw }. */
const ASSETS_TO_BUILD = [
  // Recolorable masters (painted in MARKERS.* — recolorTexture swaps them).
  {
    file: 'sprites/gabby-base.png',
    ...SPRITE_SIZES.rider,
    draw: (fb) => drawRider(fb), // defaults to MARKERS
  },
  {
    file: 'sprites/bike-base.png',
    ...SPRITE_SIZES.bike,
    draw: (fb) => drawBike(fb, MARKERS.bikeBody),
  },
  // Raw fallbacks in the default-character colors (no markers) so no character
  // /bike placeholder rectangle can flash before a scene recolors.
  {
    file: 'sprites/gabby.png',
    ...SPRITE_SIZES.rider,
    draw: (fb) =>
      drawRider(fb, {
        hair: PALETTE.hairBlonde,
        eyes: PALETTE.eyeBlue,
        suit: PALETTE.suitClassic,
      }),
  },
  {
    file: 'sprites/bike.png',
    ...SPRITE_SIZES.bike,
    draw: (fb) => drawBike(fb, PALETTE.bikePink),
  },
  // Never-recolored fixed-color characters (NO markers): Caleb (brown-haired,
  // NORTH_STAR §5) and the level-11 all-black wheelie-rider easter egg.
  { file: 'sprites/caleb.png', ...SPRITE_SIZES.caleb, draw: (fb) => drawCaleb(fb) },
  {
    file: 'sprites/wheelie-rider.png',
    ...SPRITE_SIZES.wheelieRider,
    draw: (fb) => drawWheelieRider(fb),
  },
  // Never-recolored.
  { file: 'sprites/wheel.png', ...SPRITE_SIZES.wheel, draw: (fb) => drawWheel(fb) },
  { file: 'props/flag.png', ...PROP_SIZES.flag, draw: (fb) => drawFlag(fb) },
];

function main() {
  for (const asset of ASSETS_TO_BUILD) {
    const outPath = join(ASSETS, asset.file);
    mkdirSync(dirname(outPath), { recursive: true });
    const png = render(asset.width, asset.height, asset.draw);
    writeFileSync(outPath, png);
    console.log(`wrote assets/${asset.file} (${asset.width}x${asset.height}, ${png.length} bytes)`);
  }
  console.log(`art: wrote ${ASSETS_TO_BUILD.length} PNG(s) to public/assets/`);
}

main();
