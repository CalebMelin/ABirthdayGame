// Character customization option data (PLAN-04 task 2): PURE swatch data +
// pure helpers only — no Phaser import anywhere in this file, so it is safe
// to import from plain-Node Vitest (same import-safety contract as
// palette.ts / save.ts / bike.ts / terrain.ts). This is the single place
// CLAUDE.md's "no magic numbers buried in scene code" convention puts every
// swatch color for hair/eyes/bike/outfit.
//
// This module maps a player's saved CharacterConfig (save.ts — plain string
// swatch ids) to real display colors, and, via palette.ts's MARKERS/
// ColorRemap, to the ColorRemap + stable variant-key pairs that
// src/systems/characterTextures.ts (the Phaser-scene seam, PLAN-04 task 2's
// other half) hands to recolorTexture. Nothing here talks to a Scene or a
// canvas — that boundary starts in characterTextures.ts.
import { MARKERS } from '../systems/palette';
import type { ColorRemap } from '../systems/palette';
import type { CharacterConfig } from '../systems/save';

// ---------------------------------------------------------------------------
// Option shapes.
// ---------------------------------------------------------------------------

/** One hair/eye/bike-color swatch: a stable saved id, a human label for the
 * swatch button, and a color that is BOTH the swatch's own display color
 * AND the color its matching MARKERS region recolors to. Fields are
 * `readonly` on purpose: `resolveOption` hands back the LIVE array element
 * (via `.find()`), so a caller doing `resolveHair(id).color = X` would
 * otherwise corrupt the shared HAIR_OPTIONS entry for the page's lifetime. */
export interface SwatchOption {
  /** Stable id — the exact string persisted in CharacterConfig. Never
   * rename an existing id once saved games can contain it. */
  readonly id: string;
  /** Human-readable label for the swatch button (PLAN-04 task 3 UI). */
  readonly label: string;
  /** 0xRRGGBB — swatch-display color AND the palette-swap target. */
  readonly color: number;
}

/** One outfit (racing-suit) design. `id` IS the design id — PLAN-10 will
 * select real per-design art by it — and `suitColor` is that design's ONE
 * fixed base colorway: outfit choice is a DESIGN, not design x color.
 * Fields are `readonly` for the same reason as SwatchOption (resolveOutfit
 * returns the live OUTFIT_OPTIONS element). */
export interface OutfitOption {
  /** Stable id — the exact string persisted in CharacterConfig.outfit, and
   * (later, PLAN-10) the key selecting this design's real art. */
  readonly id: string;
  /** Human-readable label for the swatch button. */
  readonly label: string;
  /** 0xRRGGBB — this design's fixed base colorway; what MARKERS.suit
   * recolors to when this outfit is selected. */
  readonly suitColor: number;
}

// ---------------------------------------------------------------------------
// Option data. Every color below is deliberately distinct from every
// MARKERS.* value (tests/characters.test.ts enforces this) — a swatch/
// target must never equal a raw marker, or an exact-RGB recolor pass could
// mistake real art for a marker region on some later composite.
// ---------------------------------------------------------------------------

/** Hair swatches (6). `blonde` is DEFAULT — Gabby is blonde (NORTH_STAR §4) —
 * and must stay PRESENT regardless of future reordering (resolution is
 * by-id via `.find()`, never by array index, so its position is NOT a
 * code-enforced invariant — the leading slot is just UI-layout guidance for
 * Task 3's swatch row). */
export const HAIR_OPTIONS: readonly SwatchOption[] = [
  { id: 'blonde', label: 'Blonde', color: 0xf2d16b },
  { id: 'brown', label: 'Brown', color: 0x6b4423 },
  { id: 'black', label: 'Black', color: 0x2a2320 },
  { id: 'ginger', label: 'Ginger', color: 0xc65d2e },
  { id: 'pink', label: 'Pink', color: 0xff9ecb },
  { id: 'blue', label: 'Blue', color: 0x6fa8dc },
];

/** Eye-color swatches (5). */
export const EYE_OPTIONS: readonly SwatchOption[] = [
  { id: 'blue', label: 'Blue', color: 0x5b8fd6 },
  { id: 'green', label: 'Green', color: 0x5fa463 },
  { id: 'brown', label: 'Brown', color: 0x6b4a2b },
  { id: 'hazel', label: 'Hazel', color: 0xa07840 },
  { id: 'grey', label: 'Grey', color: 0x8a8f96 },
];

/** Motorcycle-color swatches (8). `yellow` MUST stay present — it feeds the
 * level-11 easter egg being funnier if Gabby happens to also ride yellow
 * (the easter-egg rider's own bike is always yellow regardless of the
 * player's choice — NORTH_STAR §5). */
export const BIKE_OPTIONS: readonly SwatchOption[] = [
  { id: 'red', label: 'Red', color: 0xd94f4f },
  { id: 'blue', label: 'Blue', color: 0x4f7fd9 },
  { id: 'black', label: 'Black', color: 0x2f2a2f },
  { id: 'white', label: 'White', color: 0xf4f4f4 },
  { id: 'pink', label: 'Pink', color: 0xff8fc4 },
  { id: 'purple', label: 'Purple', color: 0x9a6fd0 },
  { id: 'teal', label: 'Teal', color: 0x3fb8a8 },
  { id: 'yellow', label: 'Yellow', color: 0xf5d23a },
];

/** Outfit (racing-suit) designs (5) — each a fixed base colorway, per the
 * plan's "design, not design x color" scope guard. Keep these 5 design
 * NAMES faithful; don't rename them. */
export const OUTFIT_OPTIONS: readonly OutfitOption[] = [
  { id: 'classic', label: 'Classic Stripes', suitColor: 0xf0efe8 },
  { id: 'twoTone', label: 'Two-Tone Sport', suitColor: 0xff8b6b },
  { id: 'stealth', label: 'Stealth Black', suitColor: 0x26232a },
  { id: 'cafe', label: 'Cafe Racer', suitColor: 0xb07a4a },
  { id: 'party', label: 'Pastel Party', suitColor: 0xdcb8f0 },
];

// ---------------------------------------------------------------------------
// Default character.
// ---------------------------------------------------------------------------

/** First-run defaults (PLAN-04 task 5 uses this when no `gabby22.character`
 * save exists yet). `hairColor: 'blonde'` is MANDATED — Gabby is blonde
 * (NORTH_STAR §4) — never change it. The rest are tasteful, on-theme picks:
 * `bikeColor: 'pink'` is the default even though `yellow` must also be in
 * the list (yellow feeds the level-11 easter egg but is deliberately NOT
 * the default). Every id here must exist in its matching options array —
 * enforced by tests/characters.test.ts.
 *
 * `Readonly` on purpose: this is a SHARED singleton. Callers that MUTATE a
 * working copy (Task 3 flips one field per swatch tap) must start from
 * `defaultCharacter()` (a fresh copy) — mutating this object directly would
 * silently corrupt the default for the page's lifetime and could leak into
 * a real save. Same hazard `save.ts`'s `defaultProgress()` factory guards
 * against for level progress. */
export const DEFAULT_CHARACTER: Readonly<CharacterConfig> = {
  hairColor: 'blonde',
  eyeColor: 'blue',
  bikeColor: 'pink',
  outfit: 'classic',
};

/** A FRESH, mutable copy of DEFAULT_CHARACTER — the safe starting point for
 * any caller that mutates its config in place (e.g. Task 3's
 * `this.character = save.loadCharacter() ?? defaultCharacter()`, then
 * flipping one field per swatch tap). Mirrors `save.ts`'s `defaultProgress()`
 * intent: never hand out the shared singleton to a mutator. */
export function defaultCharacter(): CharacterConfig {
  return { ...DEFAULT_CHARACTER };
}

// ---------------------------------------------------------------------------
// Total resolvers — a corrupt/unknown saved id must NEVER crash rendering.
// Modeled on save.ts's "every function is total, never throws" philosophy.
// ---------------------------------------------------------------------------

/** Generic total lookup: the option in `options` whose `id` matches `id`,
 * or (if none match — e.g. corrupt/legacy save data) the option whose `id`
 * matches `fallbackId`. If even `fallbackId` isn't found — which no real
 * call site below ever triggers, since each always passes a fallbackId
 * drawn from DEFAULT_CHARACTER (itself asserted present in every options
 * array by tests/characters.test.ts) — falls back to `options[0]` so this
 * stays total rather than returning `undefined`.
 *
 * PRECONDITION: `options` must be non-empty. The `options[0]` final
 * fallback is typed `T` but is actually `undefined` on an empty array; no
 * caller here passes an empty array (the four option arrays are all
 * hardcoded non-empty), so this is a documented contract, not a runtime
 * guard. */
export function resolveOption<T extends { id: string }>(
  options: readonly T[],
  id: string,
  fallbackId: string
): T {
  const exact = options.find((option) => option.id === id);
  if (exact) return exact;
  const fallback = options.find((option) => option.id === fallbackId);
  if (fallback) return fallback;
  return options[0];
}

/** Total hair-swatch resolver: unknown ids fall back to
 * DEFAULT_CHARACTER.hairColor ('blonde'). */
export function resolveHair(id: string): SwatchOption {
  return resolveOption(HAIR_OPTIONS, id, DEFAULT_CHARACTER.hairColor);
}

/** Total eye-swatch resolver: unknown ids fall back to
 * DEFAULT_CHARACTER.eyeColor. */
export function resolveEyes(id: string): SwatchOption {
  return resolveOption(EYE_OPTIONS, id, DEFAULT_CHARACTER.eyeColor);
}

/** Total bike-color resolver: unknown ids fall back to
 * DEFAULT_CHARACTER.bikeColor. */
export function resolveBike(id: string): SwatchOption {
  return resolveOption(BIKE_OPTIONS, id, DEFAULT_CHARACTER.bikeColor);
}

/** Total outfit resolver: unknown ids fall back to
 * DEFAULT_CHARACTER.outfit. */
export function resolveOutfit(id: string): OutfitOption {
  return resolveOption(OUTFIT_OPTIONS, id, DEFAULT_CHARACTER.outfit);
}

// ---------------------------------------------------------------------------
// Pure remap builders + variant keys. Consumed by
// src/systems/characterTextures.ts's buildCharacterTextures — the only
// place these should be called from a real scene.
// ---------------------------------------------------------------------------

/** Builds the rider's ColorRemap for `config`: hair/eyes/suit markers to
 * their resolved colors. Deliberately never touches MARKERS.bikeBody — the
 * rider texture is bike-color-independent (see riderVariantKey). Unknown
 * ids resolve to DEFAULT_CHARACTER's colors rather than throwing. */
export function riderRemap(config: CharacterConfig): ColorRemap {
  const hair = resolveHair(config.hairColor);
  const eyes = resolveEyes(config.eyeColor);
  const outfit = resolveOutfit(config.outfit);
  return [
    { from: MARKERS.hair, to: hair.color },
    { from: MARKERS.eyes, to: eyes.color },
    { from: MARKERS.suit, to: outfit.suitColor },
  ];
}

/** Builds the bike's ColorRemap for `config`: just the bikeBody marker to
 * the resolved bike color. Unknown ids resolve to
 * DEFAULT_CHARACTER.bikeColor rather than throwing. */
export function bikeRemap(config: CharacterConfig): ColorRemap {
  const bike = resolveBike(config.bikeColor);
  return [{ from: MARKERS.bikeBody, to: bike.color }];
}

/** Stable cache key for the rider texture variant, depending ONLY on
 * hair + eyes + outfit — NOT bikeColor, so picking a different bike with
 * the same look never invalidates/regenerates the rider texture. Built
 * from the RESOLVED ids (not the raw config strings), so an unknown id and
 * its fallback share exactly one cache entry instead of each generating
 * (and permanently caching, per recolorTexture's per-variantKey cache) a
 * redundant identical texture. */
export function riderVariantKey(config: CharacterConfig): string {
  const hair = resolveHair(config.hairColor);
  const eyes = resolveEyes(config.eyeColor);
  const outfit = resolveOutfit(config.outfit);
  return `tex-gabby|${hair.id}|${eyes.id}|${outfit.id}`;
}

/** Stable cache key for the bike texture variant, depending ONLY on
 * bikeColor — NOT hair/eyes/outfit, so the same bike color across
 * different rider looks reuses one cached texture. Built from the
 * RESOLVED bike id (see riderVariantKey doc for why). The `tex-bike|`
 * prefix keeps this key space disjoint from riderVariantKey's `tex-gabby|`
 * prefix (and from the raw TEXTURE_KEYS.bikeBase/gabbyBase base keys). */
export function bikeVariantKey(config: CharacterConfig): string {
  const bike = resolveBike(config.bikeColor);
  return `tex-bike|${bike.id}`;
}
