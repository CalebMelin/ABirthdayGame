// The committed-asset REGISTRY + a pure renderer for the PLAN-10 art pipeline —
// deliberately side-effect-free (NO top-level file I/O), so importing it never
// writes a PNG. Two consumers share it:
//   * src/art/build.mjs (`npm run art`) maps over ASSETS_TO_BUILD, calls
//     renderAssetBytes, and does ONLY the writeFileSync — the writer half.
//   * tests/art-png.test.ts regenerates each committed PNG's bytes with these
//     SAME generators and asserts byte-equality with the committed file, so a
//     drawX edit that forgot `npm run art` fails CI (the dimension test only
//     checks size, not pixels).
// Keep in sync with src/art/assets.d.mts (the typed view the .ts test imports).
import { Framebuffer } from './lib/framebuffer.mjs';
import { encodePng } from './lib/png.mjs';
import { MARKERS, PALETTE } from './palette.mjs';
import { drawBike, drawCaleb, drawRider, drawWheel, drawWheelieRider, SPRITE_SIZES } from './sprites.mjs';
import { drawBalloon, drawFlag, drawTulip, PROP_SIZES } from './props.mjs';
import { drawCar, drawPoliceCar, VEHICLE_SIZES } from './vehicles.mjs';
import { drawAppIcon, ICON_SIZE } from './icon.mjs';

/** Every committed asset: { file (path relative to public/assets), width, height, draw }. */
export const ASSETS_TO_BUILD = [
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
  // The two remaining committed TEXTURE_KEYS props (ST-4a): the sentimental
  // tulip (used as-is) and the party balloon (near-white body, TINTED at runtime).
  { file: 'props/tulip.png', ...PROP_SIZES.tulip, draw: (fb) => drawTulip(fb) },
  { file: 'props/balloon.png', ...PROP_SIZES.balloon, draw: (fb) => drawBalloon(fb) },
  // Vehicles (ST-3): the traffic car (tinted at runtime — painted near-white so
  // TRAFFIC.tints read as 5 pastel variants) and the friendly police car.
  { file: 'vehicles/car.png', ...VEHICLE_SIZES.car, draw: (fb) => drawCar(fb) },
  { file: 'vehicles/police-car.png', ...VEHICLE_SIZES.policeCar, draw: (fb) => drawPoliceCar(fb) },
];

/**
 * Assets written to the public/ ROOT (not public/assets/). Same {file, width,
 * height, draw} shape as ASSETS_TO_BUILD, but their `file` is relative to
 * public/ — build.mjs writes these to a different base dir. Right now this is
 * just the app icon: index.html references /apple-touch-icon.png at the site
 * root (an app-shell file, not a game texture BootScene loads), so it can't live
 * under public/assets/. It still flows through the SAME deterministic
 * renderAssetBytes path, so `npm run art` regenerates it byte-identically.
 */
export const ROOT_ASSETS_TO_BUILD = [
  { file: 'apple-touch-icon.png', width: ICON_SIZE, height: ICON_SIZE, draw: (fb) => drawAppIcon(fb) },
];

/**
 * Render one asset to its PNG bytes: build a Framebuffer at the asset's size,
 * run its `draw(fb)`, encodePng. Pure — no file I/O, no globals — so build.mjs
 * and the freshness guard get byte-identical output from the one code path.
 * @param {{ width: number, height: number, draw: (fb: Framebuffer) => void }} asset
 * @returns {Uint8Array}
 */
export function renderAssetBytes(asset) {
  const fb = new Framebuffer(asset.width, asset.height);
  asset.draw(fb);
  return encodePng(asset.width, asset.height, fb.bytes());
}
