// Types for committedArt.mjs (plain JS, excluded from the tsc program). The
// file bytes are a Node Buffer at runtime, declared here as Uint8Array so no
// @types/node is needed — same convention as src/art/lib/png.d.mts. Keep in
// sync with the .mjs.

export interface PixelSize {
  readonly width: number;
  readonly height: number;
}

/** Re-exported from src/art/sprites.mjs — the sizes
 * drawRider/drawCaleb/drawWheelieRider/drawBike/drawWheel render at, which the
 * committed sprite PNGs must match. */
export declare const SPRITE_SIZES: {
  readonly rider: PixelSize;
  readonly caleb: PixelSize;
  readonly wheelieRider: PixelSize;
  readonly bike: PixelSize;
  readonly wheel: PixelSize;
};

/** Re-exported from src/art/props.mjs — the sizes the committed prop PNGs must
 * match. */
export declare const PROP_SIZES: {
  readonly flag: PixelSize;
};

/** Re-exported from src/art/vehicles.mjs — the sizes the committed vehicle PNGs
 * (traffic car + police car, both 110x40) must match. */
export declare const VEHICLE_SIZES: {
  readonly car: PixelSize;
  readonly policeCar: PixelSize;
};

/** Re-exported from src/art/vehicles.mjs — the police roof-light lens geometry
 * baked into police-car.png, hand-mirrored from police.ts's LIGHT_SPREAD_PX /
 * LIGHT_WIDTH_PX. art-png.test.ts asserts it equals the police.ts source so the
 * baked lenses can't drift out from under the runtime flash rects. */
export declare const POLICE_LIGHT_MIRROR: {
  readonly spread: number;
  readonly width: number;
};

export declare function readCommittedAsset(relPath: string): Uint8Array;
