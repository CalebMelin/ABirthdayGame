// Real committed-PNG art manifest (PLAN-10). Maps a TEXTURE_KEYS name to the
// public/assets path of its generated PNG (built by `npm run art` —
// src/art/build.mjs). BootScene loads every entry here in preload() and, in
// create(), generates a placeholder rectangle ONLY for keys NOT listed —
// so the game stays fully playable while PLAN-10 replaces art one category at a
// time. Call sites never change: they reference TEXTURE_KEYS names, which now
// resolve to loaded PNGs for manifested keys.
//
// To promote a texture from placeholder to real art: add its generator to
// src/art/, an entry to src/art/build.mjs, and one row here.
import { TEXTURE_KEYS } from './constants';

export type TextureName = keyof typeof TEXTURE_KEYS;

/**
 * TEXTURE_KEYS name -> PNG path under public/ (Vite serves public/ at the site
 * root; the leading-slash-free relative path resolves against the document
 * base, same origin the self-hosted font uses). Partial by design: only keys
 * with committed real art appear.
 *
 * ST-1 (foundation + proof): the recolorable rider/bike bases, their raw
 * default-colored fallbacks, the wheel, and the finish flag. Everything else
 * (caleb, car, policeCar, tulip, balloon, wheelieRider) still falls through to
 * BootScene's placeholder generation.
 */
export const ART_MANIFEST: Partial<Record<TextureName, string>> = {
  gabbyBase: 'assets/sprites/gabby-base.png',
  bikeBase: 'assets/sprites/bike-base.png',
  gabby: 'assets/sprites/gabby.png',
  bike: 'assets/sprites/bike.png',
  wheel: 'assets/sprites/wheel.png',
  flag: 'assets/props/flag.png',
};
