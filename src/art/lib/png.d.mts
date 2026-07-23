// Type declarations for png.mjs. The runtime value is a Node Buffer, declared
// here as Uint8Array (Buffer extends Uint8Array) so TS consumers need no
// @types/node — the tsconfig limits `types` to vite/client. Keep in sync
// with the .mjs.

export declare function encodePng(
  width: number,
  height: number,
  rgba: Uint8ClampedArray | Uint8Array | readonly number[]
): Uint8Array;
