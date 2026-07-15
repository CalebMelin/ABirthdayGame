// The one-source-of-truth scene seam for character/bike texture generation
// (PLAN-04 task 2). Every scene that needs to render Gabby and/or her bike —
// CharacterCreationScene's live preview (task 3), GameScene (task 4), and
// later the Party/Credits scenes (task 4 note: Dallas copies the player's
// current look) — calls buildCharacterTextures instead of touching
// palette.ts's recolorTexture or src/data/characters.ts's remap builders
// directly, so there is exactly one place that decides what a chosen
// CharacterConfig actually looks like.
//
// IMPORTANT — like palette.ts, this file must have NO RUNTIME import of
// 'phaser' (same contract as bike.ts / terrain.ts / palette.ts): Vitest
// runs in plain Node (no DOM/Canvas), so importing the real Phaser module
// here would risk dragging a browser-only dependency into any future
// node-context import of this file. `import type Phaser` is erased
// entirely at compile time (verbatimModuleSyntax + tsconfig's
// erasableSyntaxOnly). This module is intentionally NOT unit-tested here —
// same untestable-in-node boundary as recolorTexture's canvas path — it is
// exercised by the browser-driven playtest scripts once a scene calls it.
import type Phaser from 'phaser';
import { recolorTexture } from './palette';
import { TEXTURE_KEYS } from './constants';
import type { CharacterConfig } from './save';
import { bikeRemap, bikeVariantKey, riderRemap, riderVariantKey } from '../data/characters';

/**
 * Builds (or reuses, via recolorTexture's per-variantKey cache) the
 * recolored rider and bike textures for `config`, and returns their
 * texture keys ready to hand to a Sprite/Image. Pure pass-through of the
 * variant keys + remaps computed in src/data/characters.ts onto
 * palette.ts's recolorTexture — kept tiny and dependency-light on purpose
 * so it stays a trivial, obviously-correct seam rather than a second place
 * with its own logic to keep in sync.
 */
export function buildCharacterTextures(
  scene: Phaser.Scene,
  config: CharacterConfig
): { riderTextureKey: string; bikeTextureKey: string } {
  const riderTextureKey = recolorTexture(
    scene,
    TEXTURE_KEYS.gabbyBase,
    riderVariantKey(config),
    riderRemap(config)
  );
  const bikeTextureKey = recolorTexture(
    scene,
    TEXTURE_KEYS.bikeBase,
    bikeVariantKey(config),
    bikeRemap(config)
  );
  return { riderTextureKey, bikeTextureKey };
}
