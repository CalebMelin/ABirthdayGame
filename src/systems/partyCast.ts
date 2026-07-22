// The party CAST (PLAN-09 ST-1) — the people at Gabby's birthday party
// (NORTH_STAR §5's PartyScene): Gabby and Caleb centre-stage, the four NAMED
// guests (Andrea / Allison / Dallas / Dom) under floating pixel name tags, and a
// crowd of unnamed partygoers mingling behind them. This module owns ONLY the
// cast; the venue backdrop, banner, streamers, confetti, balloons, the bouquet
// toast and the "Credits ->" button belong to the later PLAN-09 subtasks that
// consume this handle.
//
// THE TWIN JOKE IS STRUCTURAL: Dallas renders with the *exact same texture key*
// as Gabby (NORTH_STAR §5 "sprite looks the same as the Gabby character"), built
// once through the one-source-of-truth path
// `buildCharacterTextures(scene, getSave().loadCharacter() ?? defaultCharacter())`
// that PartyScene.ts's/CreditsScene.ts's forward-notes mandate. She has no
// authored colors anywhere — data/finale.ts models her as a `mirrorsPlayer`
// appearance variant with no color fields at all — so "change your character,
// revisit the party, Dallas updates" cannot regress. She also stands
// IMMEDIATELY next to Gabby, because the joke only reads if they are adjacent.
//
// ZERO Matter bodies: every guest is a plain Container of Images/Rectangles and
// every name tag a Container of a Rectangle + Text, so the party never touches
// NORTH_STAR §8's <100-body budget — same discipline as passenger.ts /
// traffic.ts / pickup.ts / wheelieRider.ts. It never references scene.matter.
//
// Like bike.ts / terrain.ts / passenger.ts / traffic.ts / pickup.ts (and UNLIKE
// decorations.ts), this module has NO runtime Phaser import — `import type
// Phaser` is erased at compile time (verbatimModuleSyntax + erasableSyntaxOnly)
// — and it draws text through the import-safe `pixelText` helper rather than
// ui.ts (which DOES carry a runtime Phaser import). So the pure layout/bounce
// helpers below are unit-testable in plain Node (tests/finale.test.ts), and
// createPartyCast only ever CALLS METHODS on the runtime `scene` handle it is
// given (same contract as createBike).
//
// PLACEHOLDER ART (PLAN-10 replaces it): guests are palette swaps of the ONE
// marker-composite rider base texture, plus cheap overlay rectangles for the
// hair silhouettes. Every tunable NUMBER lives in constants.ts's PARTY block;
// every COLOR and every verbatim NAME lives in src/data/finale.ts.
import type Phaser from 'phaser';
import { PARTY, PALETTE, TEXTURE_KEYS } from './constants';
import { pixelText } from './pixelText';
import { recolorTexture } from './palette';
import { buildCharacterTextures } from './characterTextures';
import type { CharacterConfig } from './save';
import {
  GUEST_ALLISON,
  GUEST_ANDREA,
  GUEST_DALLAS,
  GUEST_DOM,
  crowdGuestAppearance,
  partyGuestRemap,
  partyGuestVariantKey,
} from '../data/finale';
import type { AuthoredGuestAppearance, NamedGuest } from '../data/finale';

// ---------------------------------------------------------------------------
// Pure layout model — no Phaser/Matter/DOM. Unit-tested in tests/finale.test.ts.
// ---------------------------------------------------------------------------

/** What a cast member IS. `'guest'` covers all four NAMED guests (they are the
 * only members that get a name tag); `'crowd'` is an unnamed background
 * partygoer. An `as const` union — this project forbids TS enums. */
export type PartyCastRole = 'gabby' | 'caleb' | 'guest' | 'crowd';

/** One laid-out cast member, fully described as plain data before any
 * GameObject exists. Deliberately serializable (no Phaser types), so the layout
 * can be asserted exactly in Node tests and read back by a browser harness. */
export interface PartyCastSlot {
  /** Stable id: `'gabby'`, `'caleb'`, the guest's verbatim name, or
   * `'crowd-<index>'`. */
  readonly id: string;
  readonly role: PartyCastRole;
  /** The floating name-tag text — the four named guests ONLY. `null` for
   * Gabby, Caleb and the whole crowd (NORTH_STAR §5 tags only the four). */
  readonly nameTag: string | null;
  /** The palette swap this member renders with, or `null` when the member uses
   * a texture that is NOT authored here: Gabby AND Dallas (both the player's
   * live rider texture — the twin joke) and Caleb (the raw tex-caleb
   * placeholder + his brown hair band). */
  readonly appearance: AuthoredGuestAppearance | null;
  /** Member centre x, px (design space). */
  readonly x: number;
  /** Member FEET y, px — sprites are bottom-anchored, so this is where they
   * stand. The idle bounce is applied on top of it every frame. */
  readonly groundY: number;
  /** Uniform sprite scale. */
  readonly scale: number;
  /** Render depth. */
  readonly depth: number;
  /** This member's own phase in the 2-frame bounce cycle, as a fraction
   * (0..1) — so nobody moves in lockstep. */
  readonly phase01: number;
}

/** One front-row entry, left to right. Written as VALUES (not names or roster
 * indices) so "Dallas stands next to Gabby" is checked by the compiler and can
 * never be broken by a typo or a later reorder of NAMED_GUESTS. */
interface FrontRowEntry {
  readonly role: PartyCastRole;
  readonly guest: NamedGuest | null;
}

/**
 * The front row, left to right (see the PARTY block's LAYOUT MODEL):
 * Gabby + Caleb straddle the exact centre, DALLAS sits immediately to Gabby's
 * left (the twin joke needs them adjacent), and the other three named guests
 * flank the pair.
 */
const FRONT_ROW: readonly FrontRowEntry[] = [
  { role: 'guest', guest: GUEST_ANDREA },
  { role: 'guest', guest: GUEST_DALLAS },
  { role: 'gabby', guest: null },
  { role: 'caleb', guest: null },
  { role: 'guest', guest: GUEST_ALLISON },
  { role: 'guest', guest: GUEST_DOM },
];

/** Centre-x of member `index` in an evenly spaced row of `count` members
 * centred on `centerX`. Pure; the one place row spacing is computed. */
export function partyRowX(index: number, count: number, centerX: number, spacingPx: number): number {
  return centerX + (index - (count - 1) / 2) * spacingPx;
}

/**
 * The 2-frame idle bounce (pixel-art honest — a member is either DOWN or UP,
 * never smoothly interpolated): returns `0` on the down frame and
 * `-amplitudePx` on the up frame (screen y grows downward, so negative = up).
 * `phase01` staggers each member within the cycle. Pure and total — a
 * non-positive `periodMs` returns 0 rather than dividing by zero, and negative
 * `nowMs`/`phase01` wrap correctly via `Math.floor`.
 */
export function castBounceOffsetPx(
  nowMs: number,
  phase01: number,
  amplitudePx: number,
  periodMs: number
): number {
  if (!(periodMs > 0)) return 0;
  const raw = nowMs / periodMs + phase01;
  const frac = raw - Math.floor(raw);
  return frac < 0.5 ? 0 : -amplitudePx;
}

/**
 * Lays the whole cast out: the six front-row members first (so the named cast
 * takes the low global indices), then the unnamed crowd behind them. PURE and
 * fully DETERMINISTIC — a function of the member index and the PARTY constants
 * only, never Math.random — so the party looks identical on every visit and
 * both the unit tests and ST-3's browser harness can assert exact positions.
 *
 * NOBODY IS HIDDEN BEHIND ANYBODY: at the shipped constants the ODD crowd row
 * (9 members, 150px apart, centred on 640) lands at `40 + 150i` while the EVEN
 * front row lands at `265 + 150j` — exactly a HALF step apart, so every crowd
 * member stands in a gap between two front-row members and the two rows can
 * never coincide (`150(i-j) = 225` has no integer solution). That 75px
 * separation also clears the summed sprite half-widths, so a crowd head never
 * peeks out of a front-row head and reads as a hat. Both properties are guarded
 * by tests/finale.test.ts, so a future constant tweak can't silently undo them.
 */
export function buildPartyCastSlots(): readonly PartyCastSlot[] {
  const slots: PartyCastSlot[] = [];

  const phaseFor = (globalIndex: number): number => {
    const raw = globalIndex * PARTY.bouncePhaseStep;
    return raw - Math.floor(raw);
  };

  FRONT_ROW.forEach((entry, i) => {
    const guest = entry.guest;
    slots.push({
      id: guest ? guest.name : entry.role,
      role: entry.role,
      nameTag: guest ? guest.name : null,
      appearance: guest && guest.appearance.kind === 'authored' ? guest.appearance : null,
      x: partyRowX(i, FRONT_ROW.length, PARTY.frontRowCenterX, PARTY.frontRowSpacingPx),
      groundY: PARTY.frontRowGroundY,
      scale: PARTY.frontRowScale,
      depth: PARTY.frontRowDepth,
      phase01: phaseFor(slots.length),
    });
  });

  for (let i = 0; i < PARTY.crowdCount; i++) {
    slots.push({
      id: `crowd-${i}`,
      role: 'crowd',
      nameTag: null,
      appearance: crowdGuestAppearance(i),
      x: partyRowX(i, PARTY.crowdCount, PARTY.crowdCenterX, PARTY.crowdSpacingPx),
      // Odd members stand a touch nearer, so the back row isn't a chorus line.
      groundY: PARTY.crowdGroundY + (i % 2 === 1 ? PARTY.crowdStaggerYPx : 0),
      // Scale cycles small / base / large by index so the crowd reads as
      // individuals rather than one sprite stamped 12 times.
      scale: PARTY.crowdScale * (1 + ((i % 3) - 1) * PARTY.crowdScaleStep),
      depth: PARTY.crowdDepth,
      phase01: phaseFor(slots.length),
    });
  }

  return slots;
}

// ---------------------------------------------------------------------------
// Presentation-only local constants (PLACEHOLDER art). Following the
// decorations.ts / pickup.ts / police.ts precedent, the DRAWING dimensions of
// the throwaway placeholder sprites stay here rather than in constants.ts —
// PLAN-10 replaces this art wholesale. The LAYOUT/FEEL tunables (positions,
// depths, scales, crowd count, bounce, name-tag geometry) live in the PARTY
// block in constants.ts. All lengths are SPRITE-LOCAL px (before a slot's
// scale is applied).
// ---------------------------------------------------------------------------

/** Matches BootScene's tex-gabby-base / tex-caleb placeholders (both 24x48). */
const SPRITE_WIDTH_PX = 24;
const SPRITE_HEIGHT_PX = 48;
/** Caleb's brown hair band across the top of his sprite — the SAME convention
 * the standing Caleb in pickup.ts uses, so he reads brown-haired and is never
 * confused with blonde Dom (NORTH_STAR §5). */
const CALEB_HAIR_BAND_HEIGHT_PX = 12;
/** Allison's ponytail: a small hair-colored rectangle hanging off the side of
 * her head, the cheap placeholder stand-in for "a different hairstyle than
 * Andrea" (NORTH_STAR §5). Offsets are from the sprite's centre x / top edge. */
const PONYTAIL_WIDTH_PX = 8;
const PONYTAIL_HEIGHT_PX = 18;
const PONYTAIL_OFFSET_X_PX = 15;
const PONYTAIL_TOP_INSET_PX = 4;

// ---------------------------------------------------------------------------
// Runtime factory (calls scene methods only — see module doc).
// ---------------------------------------------------------------------------

/** What the scene needs to know about one built cast member — the layout facts
 * plus the texture it actually rendered with, so a harness can prove e.g. that
 * Dallas's key IS Gabby's key. */
export interface PartyCastMemberInfo {
  readonly id: string;
  readonly role: PartyCastRole;
  readonly nameTag: string | null;
  readonly textureKey: string;
  readonly x: number;
  readonly groundY: number;
  readonly scale: number;
  readonly depth: number;
}

/** The handle PartyScene holds: create-once (createPartyCast) /
 * update()-per-frame / destroy()-on-teardown, mirroring the passenger/traffic
 * handles. */
export interface PartyCastHandle {
  /** Advances every member's 2-frame idle bounce and every name tag's bob.
   * Call once per PartyScene.update(). Allocates nothing. */
  update(): void;
  /** The rider texture key Gabby AND Dallas both render with — the twin joke,
   * exposed so a scene/harness can assert the two really are identical. */
  readonly riderTextureKey: string;
  /** Every built member, in creation order (front row, then crowd). */
  readonly members: readonly PartyCastMemberInfo[];
  /** Destroys every GameObject this module created. Call on scene shutdown. */
  destroy(): void;
}

export interface PartyCastOptions {
  /** The player's CURRENT character — the scene reads it once
   * (`getSave().loadCharacter() ?? defaultCharacter()`) and passes it in. It
   * drives BOTH Gabby's look and (verbatim twin joke) Dallas's. */
  readonly character: CharacterConfig;
}

/** One built member: its slot plus the live GameObjects to move each frame. */
interface BuiltMember {
  readonly slot: PartyCastSlot;
  readonly figure: Phaser.GameObjects.Container;
  readonly tag: Phaser.GameObjects.Container | null;
  /** The tag's resting centre y, before this frame's bounce/bob. */
  readonly tagBaseY: number;
}

/**
 * Builds the whole party cast and returns its handle. `scene` is a runtime
 * handle only (same contract as createBike) — NO Matter body is created.
 *
 * Textures: Gabby's (and therefore Dallas's) come from the one-source-of-truth
 * `buildCharacterTextures`, never from recolorTexture/riderRemap directly. Every
 * other guest is a `recolorTexture` palette swap of TEXTURE_KEYS.gabbyBase under
 * data/finale.ts's own `tex-party|...` variant-key namespace, so party guests
 * can never collide with (or wastefully duplicate) a player-character variant
 * and identical looks share one cached texture.
 */
export function createPartyCast(scene: Phaser.Scene, opts: PartyCastOptions): PartyCastHandle {
  // The one-source-of-truth path (PartyScene.ts's forward-note). It also builds
  // the bike variant, which the party never renders — a negligible one-off cost
  // that is worth NOT having a second, subtly-different way to build Gabby.
  const { riderTextureKey } = buildCharacterTextures(scene, opts.character);

  /** The texture a member renders with. Gabby and Dallas deliberately share
   * ONE key (the twin joke); Caleb uses the raw placeholder. */
  function textureKeyFor(slot: PartyCastSlot): string {
    if (slot.role === 'caleb') return TEXTURE_KEYS.caleb;
    if (slot.appearance === null) return riderTextureKey;
    return recolorTexture(
      scene,
      TEXTURE_KEYS.gabbyBase,
      partyGuestVariantKey(slot.appearance),
      partyGuestRemap(slot.appearance)
    );
  }

  /** A member's figure: the bottom-anchored sprite plus any hair-silhouette
   * overlay, in ONE Container so a single setPosition/setScale moves it all
   * (and one destroy() takes the children with it). */
  function buildFigure(slot: PartyCastSlot, textureKey: string): Phaser.GameObjects.Container {
    const parts: Phaser.GameObjects.GameObject[] = [
      scene.add.image(0, 0, textureKey).setOrigin(0.5, 1),
    ];

    if (slot.role === 'caleb') {
      parts.push(
        scene.add.rectangle(
          0,
          -SPRITE_HEIGHT_PX + CALEB_HAIR_BAND_HEIGHT_PX / 2,
          SPRITE_WIDTH_PX,
          CALEB_HAIR_BAND_HEIGHT_PX,
          PALETTE.brown
        )
      );
    } else if (slot.appearance !== null && slot.appearance.hairStyle === 'ponytail') {
      parts.push(
        scene.add.rectangle(
          PONYTAIL_OFFSET_X_PX,
          -SPRITE_HEIGHT_PX + PONYTAIL_TOP_INSET_PX + PONYTAIL_HEIGHT_PX / 2,
          PONYTAIL_WIDTH_PX,
          PONYTAIL_HEIGHT_PX,
          slot.appearance.hairColor
        )
      );
    }

    return scene.add
      .container(slot.x, slot.groundY, parts)
      .setScale(slot.scale)
      .setDepth(slot.depth);
  }

  /** A floating name tag: plum pixel text on a cream panel (the same
   * cream-panel-behind-text convention LEVEL_INTRO's banner and pickup.ts's
   * toast use), so a name stays legible over a dusk venue. Built text-first so
   * the panel can be sized to the measured label. */
  function buildNameTag(name: string, x: number, y: number): Phaser.GameObjects.Container {
    const label = pixelText(scene, 0, 0, name, PARTY.nameTagFontSizePx);
    const panel = scene.add
      .rectangle(
        0,
        0,
        label.width + PARTY.nameTagPadXPx * 2,
        label.height + PARTY.nameTagPadYPx * 2,
        PALETTE.cream
      )
      .setStrokeStyle(PARTY.nameTagOutlinePx, PALETTE.outline);
    // panel first, label second -> the label always draws over its own panel.
    return scene.add.container(x, y, [panel, label]).setDepth(PARTY.nameTagDepth);
  }

  const built: BuiltMember[] = [];
  const members: PartyCastMemberInfo[] = [];

  for (const slot of buildPartyCastSlots()) {
    const textureKey = textureKeyFor(slot);
    const figure = buildFigure(slot, textureKey);

    // Head top in world px == feet y minus the scaled sprite height; the tag
    // floats nameTagGapPx above that. Tags are NOT scaled with their owner —
    // all four read at the same size.
    const tagBaseY = slot.groundY - SPRITE_HEIGHT_PX * slot.scale - PARTY.nameTagGapPx;
    const tag = slot.nameTag === null ? null : buildNameTag(slot.nameTag, slot.x, tagBaseY);

    built.push({ slot, figure, tag, tagBaseY });
    members.push({
      id: slot.id,
      role: slot.role,
      nameTag: slot.nameTag,
      textureKey,
      x: slot.x,
      groundY: slot.groundY,
      scale: slot.scale,
      depth: slot.depth,
    });
  }

  function update(): void {
    const now = scene.time.now;
    for (const member of built) {
      const bounce = castBounceOffsetPx(
        now,
        member.slot.phase01,
        PARTY.bounceAmplitudePx,
        PARTY.bouncePeriodMs
      );
      member.figure.setY(member.slot.groundY + bounce);
      if (member.tag !== null) {
        const bob = castBounceOffsetPx(
          now,
          member.slot.phase01 + PARTY.nameTagBobPhaseOffset,
          PARTY.nameTagBobAmplitudePx,
          PARTY.nameTagBobPeriodMs
        );
        member.tag.setY(member.tagBaseY + bounce + bob);
      }
    }
  }

  function destroy(): void {
    // Containers destroy their children, so this covers every Image/Rectangle/
    // Text created above. The recolored TEXTURES are deliberately NOT removed:
    // they live in recolorTexture's per-variantKey cache and are meant to be
    // reused by the next visit to the party (same lifetime as the player's own
    // rider/bike variants).
    for (const member of built) {
      member.figure.destroy();
      if (member.tag !== null) member.tag.destroy();
    }
    // `built` is emptied so a second destroy() is a no-op; `members` is left
    // intact on purpose — it is inert description, not a live resource, and a
    // scene may still want to read what it built after teardown.
    built.length = 0;
  }

  return { update, riderTextureKey, members, destroy };
}
