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
// Like bike.ts / terrain.ts / passenger.ts / traffic.ts / pickup.ts /
// decorations.ts (and UNLIKE ui.ts, the one module that still carries a runtime
// `import Phaser` — for createPixelButton's Phaser.Geom hit area), this module
// has NO runtime Phaser import: `import type Phaser` is erased at compile time
// (verbatimModuleSyntax + erasableSyntaxOnly). It therefore draws text through
// the import-safe `pixelText` helper rather than ui.ts. So the pure
// layout/bounce/texture-source helpers below are unit-testable in plain Node
// (tests/finale.test.ts), and createPartyCast only ever CALLS METHODS on the
// runtime `scene` handle it is given (same contract as createBike).
//
// GUEST ART: the named/crowd guests are palette swaps of the ONE (now real, PLAN-10
// ST-1) rider base texture — recolored hair/eyes/suit per guest — plus, for
// Allison, a multi-segment hair-coloured PONYTAIL overlay (ST-6) that reads as a
// distinct hairstyle from brown-haired Andrea at a glance (NORTH_STAR §5). Caleb
// is the exception — his tex-caleb is REAL brown-haired art (PLAN-10 ST-2), so he
// needs no overlay. Every tunable NUMBER lives in constants.ts's PARTY block; the
// small ponytail overlay DRAWING dims stay local here (the arrival.ts precedent);
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
   * live rider texture — the twin joke) and Caleb (the tex-caleb sprite, now
   * real brown-haired art). */
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
 * never be broken by a typo or a later reorder of NAMED_GUESTS. A DISCRIMINATED
 * UNION on `role`, so a nonsense entry like `{ role: 'gabby', guest: GUEST_DOM }`
 * (or a `'guest'` entry with nobody in it) is not even expressible. `'crowd'` is
 * absent by construction — the crowd is a separate generated row, never authored
 * into the front line. */
type FrontRowEntry =
  | { readonly role: 'guest'; readonly guest: NamedGuest }
  | { readonly role: 'gabby' | 'caleb' };

/**
 * The front row, left to right (see the PARTY block's LAYOUT MODEL):
 * Gabby + Caleb straddle the exact centre, DALLAS sits immediately to Gabby's
 * left (the twin joke needs them adjacent), and the other three named guests
 * flank the pair.
 */
const FRONT_ROW: readonly FrontRowEntry[] = [
  { role: 'guest', guest: GUEST_ANDREA },
  { role: 'guest', guest: GUEST_DALLAS },
  { role: 'gabby' },
  { role: 'caleb' },
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
 * NOBODY IS HIDDEN BEHIND ANYBODY: at the shipped constants the ODD crowd GRID
 * (9 slots, 150px apart, centred on 640) lands at `40 + 150i` while the EVEN
 * front row lands at `265 + 150j` — exactly a HALF step apart, so every crowd
 * member stands in a gap between two front-row members and the two rows can
 * never coincide (`150(i-j) = 225` has no integer solution). That 75px
 * separation also clears the summed sprite half-widths, so a crowd head never
 * peeks out of a front-row head and reads as a hat. Leaving the CENTRE slot
 * empty (below) removes a member without touching either property, since both
 * hold slot by slot. All of it is guarded by tests/finale.test.ts, so a future
 * constant tweak can't silently undo them.
 */
export function buildPartyCastSlots(): readonly PartyCastSlot[] {
  const slots: PartyCastSlot[] = [];

  const phaseFor = (globalIndex: number): number => {
    const raw = globalIndex * PARTY.bouncePhaseStep;
    return raw - Math.floor(raw);
  };

  FRONT_ROW.forEach((entry, i) => {
    const guest = entry.role === 'guest' ? entry.guest : null;
    slots.push({
      id: guest ? guest.name : entry.role,
      role: entry.role,
      nameTag: guest ? guest.name : null,
      appearance: guest && guest.appearance.kind === 'authored' ? guest.appearance : null,
      x: partyRowX(i, FRONT_ROW.length, PARTY.frontRowCenterX, PARTY.frontRowSpacingPx),
      groundY: PARTY.frontRowGroundY,
      scale: PARTY.frontRowScale,
      depth: PARTY.frontRowDepth,
      // Global (whole-cast) index, so a front-row member and a crowd member can
      // never share a phase.
      phase01: phaseFor(i),
    });
  });

  // The crowd is positioned over crowdSlotCount GRID SLOTS but the MIDDLE slot
  // is deliberately left EMPTY: at an odd slot count it lands exactly on
  // crowdCenterX, i.e. exactly between Gabby and Caleb, and the geometric
  // centre of this screen belongs to the couple (NORTH_STAR §5), not to an
  // unnamed partygoer. Dropping the SLOT rather than re-centring the row is
  // what preserves the half-step interleave — see crowdCount / crowdSpacingPx.
  //
  // Two indices, on purpose: `slot` drives POSITION (so the interleave is a
  // property of the grid, unchanged by the gap), while the compacted `member`
  // index drives IDENTITY — id, look, stagger, scale and bounce phase — so the
  // built crowd is a contiguous crowd-0..crowd-(crowdCount-1) with no hole in
  // its numbering and no gap in crowdGuestAppearance's colour cycles.
  const emptySlot = Math.floor((PARTY.crowdSlotCount - 1) / 2);
  let member = 0;
  for (let slot = 0; slot < PARTY.crowdSlotCount; slot++) {
    if (slot === emptySlot) continue;
    slots.push({
      id: `crowd-${member}`,
      role: 'crowd',
      nameTag: null,
      appearance: crowdGuestAppearance(member),
      x: partyRowX(slot, PARTY.crowdSlotCount, PARTY.crowdCenterX, PARTY.crowdSpacingPx),
      // Odd members stand a touch nearer, so the back row isn't a chorus line.
      groundY: PARTY.crowdGroundY + (member % 2 === 1 ? PARTY.crowdStaggerYPx : 0),
      // Scale cycles small / base / large by index so the crowd reads as
      // individuals rather than one sprite stamped N times.
      scale: PARTY.crowdScale * (1 + ((member % 3) - 1) * PARTY.crowdScaleStep),
      depth: PARTY.crowdDepth,
      phase01: phaseFor(FRONT_ROW.length + member),
    });
    member++;
  }

  return slots;
}

/** Where a cast member's texture comes from. `'player'` is THE TWIN JOKE: both
 * Gabby and Dallas resolve to it, so they render with the very same
 * `buildCharacterTextures` rider key. `'authored'` means a `tex-party|` palette
 * swap built from the member's own colors; `'caleb'` is the real tex-caleb
 * sprite. An `as const` union — this project forbids TS enums. */
export type CastTextureSource = 'caleb' | 'player' | 'authored';

/**
 * The PURE texture-sourcing decision, extracted out of createPartyCast's
 * closure precisely so the twin invariant is unit-testable rather than only
 * observable in a browser: `castTextureSource(dallasSlot) ===
 * castTextureSource(gabbySlot) === 'player'` is the real, load-bearing
 * assertion (tests/finale.test.ts), one step closer to what matters than
 * "Dallas's appearance is null". createPartyCast's `textureKeyFor` is nothing
 * but a switch over this.
 */
export function castTextureSource(slot: PartyCastSlot): CastTextureSource {
  if (slot.role === 'caleb') return 'caleb';
  return slot.appearance === null ? 'player' : 'authored';
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

/** The 24x48 rider/Caleb sprite height. Only the HEIGHT is needed here now — it
 * seats the floating name tags. (Caleb's brown hair band used to need the width
 * too, but tex-caleb bakes his hair in as of PLAN-10 ST-2, so the band is gone —
 * see calebFigure.ts.) */
const SPRITE_HEIGHT_PX = 48;
/** Allison's side PONYTAIL — the hairstyle silhouette that keeps her distinct
 * from brown-haired Andrea at a glance (NORTH_STAR §5). Refined in ST-6 from one
 * lump into a real ponytail: a hair-tie knot at the head's upper-right side, a
 * full upper tail, and a tapering tip that flicks down and out. Each segment is
 * {dx, dy, w, h} in SPRITE-LOCAL px measured from the sprite's centre-x and FEET
 * (dy negative = up), so the whole strand scales and bounces WITH its owner;
 * every segment is drawn in the guest's own hairColor. Only Allison ever carries
 * hairStyle 'ponytail' — the crowd never does (guarded by tests/finale.test.ts). */
const PONYTAIL_SEGMENTS: readonly { dx: number; dy: number; w: number; h: number }[] = [
  { dx: 6, dy: -40, w: 6, h: 5 }, // hair-tie knot at the head's upper side
  { dx: 9, dy: -33, w: 8, h: 10 }, // the full upper tail
  { dx: 12, dy: -22, w: 5, h: 11 }, // the tapering, out-flicking tip
];

// ---------------------------------------------------------------------------
// Runtime factory (calls scene methods only — see module doc).
// ---------------------------------------------------------------------------

/** What the scene needs to know about one built cast member: EVERY layout fact
 * from its slot (including `phase01`, so a consumer can sync its own decoration
 * to a member's bounce — ST-3 anchors Gabby's tulip bouquet to hers — without
 * re-deriving the layout) plus the texture it actually rendered with, so a
 * harness can prove e.g. that Dallas's key IS Gabby's key.
 *
 * Derived from PartyCastSlot rather than restated, so the field list can never
 * drift out of sync. Only `appearance` is dropped: it is the internal
 * texture-authoring input, and `textureKey` is the resolved answer a consumer
 * actually wants. */
export interface PartyCastMemberInfo extends Omit<PartyCastSlot, 'appearance'> {
  readonly textureKey: string;
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

  /** The texture a member renders with — a plain switch over the pure
   * `castTextureSource` decision (which is where the Gabby/Dallas twin
   * invariant is defined and unit-tested). */
  function textureKeyFor(slot: PartyCastSlot): string {
    const source = castTextureSource(slot);
    switch (source) {
      case 'caleb':
        return TEXTURE_KEYS.caleb;
      case 'player':
        return riderTextureKey;
      case 'authored': {
        // castTextureSource only answers 'authored' when appearance is
        // non-null; re-reading it here is what lets TS narrow the union (and
        // costs nothing). The fallback keeps this total rather than throwing
        // over a cosmetic texture — same spirit as recolorTexture's own guards.
        const appearance = slot.appearance;
        if (appearance === null) return TEXTURE_KEYS.gabbyBase;
        return recolorTexture(
          scene,
          TEXTURE_KEYS.gabbyBase,
          partyGuestVariantKey(appearance),
          partyGuestRemap(appearance)
        );
      }
      default: {
        // Exhaustiveness guard: a new CastTextureSource with no case above
        // makes `source` no longer `never` here -> compile error. Unreachable
        // at runtime.
        const _exhaustive: never = source;
        return _exhaustive;
      }
    }
  }

  /** A member's figure: the bottom-anchored sprite plus any hair-silhouette
   * overlay, in ONE Container so a single setPosition/setScale moves it all
   * (and one destroy() takes the children with it). Caleb needs no overlay —
   * tex-caleb bakes in his brown hair (PLAN-10 ST-2). */
  function buildFigure(slot: PartyCastSlot, textureKey: string): Phaser.GameObjects.Container {
    const parts: Phaser.GameObjects.GameObject[] = [
      scene.add.image(0, 0, textureKey).setOrigin(0.5, 1),
    ];

    if (slot.appearance !== null && slot.appearance.hairStyle === 'ponytail') {
      for (const seg of PONYTAIL_SEGMENTS) {
        parts.push(
          scene.add.rectangle(seg.dx, seg.dy, seg.w, seg.h, slot.appearance.hairColor)
        );
      }
    }

    return scene.add
      .container(slot.x, slot.groundY, parts)
      .setScale(slot.scale)
      .setDepth(slot.depth);
  }

  /** A floating name tag: plum pixel text on a cream panel (the same
   * cream-panel-behind-text convention LEVEL_INTRO's banner uses), so a name
   * stays legible over a dusk venue. Built text-first so the panel can be sized
   * to the MEASURED label rather than a guessed font metric. */
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
    // Spread the slot minus `appearance` (see PartyCastMemberInfo) so adding a
    // layout field to PartyCastSlot never needs a second edit here. No `void
    // appearance` is needed to satisfy `noUnusedLocals`: TypeScript deliberately
    // exempts a binding that exists only to be omitted by a rest sibling — this
    // IS the sanctioned "drop one property" idiom.
    const { appearance, ...slotInfo } = slot;
    members.push({ ...slotInfo, textureKey });
  }

  function update(): void {
    const now = scene.time.now;
    // Indexed loop, NOT for...of: this runs every render frame, and for...of
    // would allocate a fresh iterator each time. Nothing here allocates.
    for (let i = 0; i < built.length; i++) {
      const member = built[i];
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
