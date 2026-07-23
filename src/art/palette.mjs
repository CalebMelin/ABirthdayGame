// =============================================================================
// PLAN-10 ART STYLE GUIDE + shared palette. The ONE palette every generator in
// src/art/ draws from — read this before authoring any new asset so all 22
// levels + menus + party read as a single hand, not 20 different artists.
//
// STYLE GUIDE (every generator MUST follow these):
//   * 1px DARK OUTLINES (PALETTE.outline, #2a1820) around every readable
//     silhouette. No lighter outlines, no double outlines.
//   * NO ANTI-ALIASING. Hard pixel edges only — the toolkit never blends. The
//     game renders nearest-neighbour (Phaser `pixelArt: true`); soft edges
//     would shimmer when scaled.
//   * CONSISTENT PIXEL DENSITY. Base/ground tiles ~16px; characters ~24-48px
//     tall to match the existing sprite sizes (rider 24x48, bike 96x28, wheel
//     36x36 — see BootScene's TEXTURE_SPECS, which downstream offset math in
//     BIKE_TUNING depends on; NEVER change an asset's committed size).
//   * LIMITED PALETTE. Draw only from the named colors below. Warm/pastel
//     leaning, harmonised with the runtime PALETTE in src/systems/constants.ts.
//   * MARKER COLORS ARE SACRED. On recolorable art (rider, bike) the
//     recolorable regions are painted in the four MARKERS below — pure,
//     maximally-saturated primaries that never appear in real pastel art — so
//     src/systems/palette.ts's recolorTexture can exact-RGB-swap them to the
//     player's chosen colors. Everything else (skin, outline, tyres) is a real
//     fixed color that must NOT collide with a marker.
//
// This file is plain Node ESM (no deps); TS types are in palette.d.mts.
// =============================================================================

/**
 * The four recolor markers. These MUST equal `MARKERS` in
 * src/systems/palette.ts byte-for-byte — the base PNGs are painted with THESE
 * values, and recolorTexture matches against THAT module's copy. Drift here
 * would silently break every character/bike recolor, so tests/art-png.test.ts
 * asserts the four values against src/systems/palette.ts.
 */
export const MARKERS = {
  hair: 0xff00ff, // magenta -> chosen hair color
  eyes: 0x00ffff, // cyan    -> chosen eye color
  bikeBody: 0x00ff00, // green   -> chosen bike color
  suit: 0xff0000, // red     -> chosen outfit colorway
};

/**
 * Named 0xRRGGBB colors. The pastel/theme tones mirror src/systems/constants.ts
 * PALETTE (kept in sync by hand — this file is plain JS and can't import the
 * TS constant) so generated art harmonises with the runtime backdrops/UI. The
 * default-look tones (hairBlonde/eyeBlue/suitClassic/bikePink) mirror the
 * resolved colors of DEFAULT_CHARACTER (src/data/characters.ts) so the raw
 * tex-gabby / tex-bike fallbacks show the game's default character.
 */
export const PALETTE = {
  // ---- recolor markers (mirror MARKERS above; included so a generator can
  // reference everything through one object) ----
  markerHair: MARKERS.hair,
  markerEyes: MARKERS.eyes,
  markerBike: MARKERS.bikeBody,
  markerSuit: MARKERS.suit,

  // ---- fixed character tones (never markers) ----
  outline: 0x2a1820, // PALETTE.outline — the one dark outline color
  skin: 0xffcf9c, // PALETTE.skin — Gabby's face/hands
  skinShadow: 0xe0a878, // slightly darker skin for a cheek/jaw shade
  brown: 0x6b4423, // PALETTE.brown — Caleb hair, wood, flag pole

  // ---- pastels (mirror constants.ts PALETTE) ----
  bgPink: 0xffd6e8,
  plum: 0x4a2c40,
  cream: 0xfef4e6,
  mint: 0xc8e6d7,
  sky: 0xd4e7f7,
  lavender: 0xe8d4f1,
  sunshine: 0xffeaa7,
  coral: 0xffb3a7,
  grass: 0xb8e6a0,
  white: 0xfbfbfb,

  // ---- theme tones (mirror constants.ts PALETTE) ----
  overcast: 0xc9d3da,
  slate: 0x8b96a3, // metal / rim grey
  dustyTan: 0xd9a97c,
  riverTeal: 0x8fd8cc,
  steelBlue: 0x7fabd1,
  brickRed: 0xcf8a70,
  sunsetGlow: 0xffa877,
  duskIndigo: 0x3d3170,

  // ---- default-character look (mirror DEFAULT_CHARACTER resolved colors in
  // src/data/characters.ts) for the raw tex-gabby / tex-bike fallbacks ----
  hairBlonde: 0xf2d16b, // HAIR_OPTIONS 'blonde'
  eyeBlue: 0x5b8fd6, // EYE_OPTIONS 'blue'
  suitClassic: 0xf0efe8, // OUTFIT_OPTIONS 'classic'
  bikePink: 0xff8fc4, // BIKE_OPTIONS 'pink' (DEFAULT_CHARACTER.bikeColor)
};
