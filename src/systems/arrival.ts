// Level 22 "The Party" ARRIVAL cutscene (PLAN-09 task 1 / ST-5) — the beat the
// whole game has been driving toward. NORTH_STAR §5 row 22: the final level
// "ends at the party venue -> transitions to PartyScene", and PLAN-09 task 1
// spells the beat out: "instead of the normal complete screen, bike auto-rides
// to the venue (short scripted ride-in), Gabby & Caleb hop off, doors open with
// light spilling out -> PartyScene".
//
// THE SHAPE OF THE BEAT (see the ARRIVAL constants block for every number):
//   1. approaching — the player is driving; the venue is already standing there
//      ahead of them, dark, with its doors shut.
//   2. ridingIn   — at finishX - rideInLeadPx the cutscene TAKES THE PEDALS
//      (ctx.setInputOverride, never a Matter force) and holds GAS. This is what
//      makes the arrival unconditional: a player at full speed and a player who
//      has STOPPED DEAD are both carried in.
//   3. crawling   — at finishX - crawlLeadPx it swaps to a bang-bang controller
//      holding ARRIVAL.crawlSpeedPxPerStep, so she rolls up to the doors at a
//      walking pace instead of blasting past them. The doors start opening here
//      and warm light begins spilling onto the road — the venue opens up AHEAD
//      of her, while the run is still live.
//   4. arrived    — she crosses the flag; GameScene ends the run and calls
//      onFinish(). Caleb hops off the back, Gabby gets off her own bike a beat
//      later, the two of them walk into the lit doorway together, the light
//      takes the screen, and the hold expires into PartyScene.
//
// IT CAN NEVER FAIL THE PLAYER: it never calls ctx.softFail and it never touches
// the bike's bodies. It forces GAS from the takeover — which begins on ORDINARY
// ROLLING TERRAIN, not flat ground; the finish flat zone only starts at
// crawlLeadPx-ish (see level22.ts) — and then GAS/BRAKE inside that flat zone
// while the crawl holds its approach speed. The crawl also only ever BRAKES
// while the bike is moving faster than the target, so it can never reverse-creep
// the bike back off the flag.
//
// WHY FORCED PEDALS ON ROLLING TERRAIN ARE STILL SAFE — and it is NOT because
// the ground is flat, which an earlier version of this comment wrongly claimed.
// Level 22's hilliness briefly launches the bike during the ride-in (browser-
// measured: a handful of short hops before the flat zone). What makes that
// harmless is bike.ts's airPitchAuthority: a pedal HELD SINCE THE GROUND has
// near-zero pitch authority on short hops, so held gas cannot flip anything. But
// the cutscene's pedals are not always held — `setInputOverride({gas:true})` is a
// FRESH press on the takeover frame, and the crawl's bang-bang law toggles BRAKE
// on and off every frame — and a fresh press that BEGINS mid-air gets FULL
// authority (it is the deliberate-trick input). So this module never writes an
// override while ctx.bike.airborne: the takeover and the crawl both wait for the
// wheels to be down (see update()). That makes the guarantee STRUCTURAL rather
// than merely measured; deferring a frame or two costs nothing.
//
// AND IT NEVER TAKES THE PEDALS FROM A STANDSTILL, for a second, different
// reason (browser-caught): forced gas from rest part-way up one of level 22's
// climbs can stall the bike or loop it out — and the override would then deny
// the player the exact recovery they'd otherwise use, rolling back for a run-up.
// So the takeover also waits for the bike to be moving at
// ARRIVAL.takeoverMinSpeedPxPerStep. If it never fires, nothing is lost: a
// player who crawls all the way to the flag under their own power still gets the
// whole finale, because onFinish() opens the venue itself.
//
// ZERO Matter bodies — level 22 is the tightest level in the game (99/100, see
// PROGRESS.md), so this had to be free by construction: the venue, its doors,
// the light spill, the two standing figures and the two full-screen washes are
// all plain Rectangles/Graphics/Images/Containers. It never touches scene.matter.
//
// SELF-DRIVING AFTER THE FLAG. GameScene stops calling handle.update() the
// instant the run ends (see EventContext.isEnded's doc), so every part of the
// finale animates itself — the same DISCIPLINE police.ts's onFinish finale
// follows, though not the same mechanism: police.ts is pure tweens, while this
// finale also schedules beats with scene.time.delayedCall (the first module in
// src/systems to do so). Phaser's Clock destroys pending events on scene
// shutdown, and every one of those callbacks re-checks `tornDown` anyway.
//
// THE DISMOUNT, AND THE ONE SEAM IT NEEDED (see DECISIONS.md 2026-07-22):
// BOTH of them get off the bike here, because "Gabby & Caleb arrive"
// (NORTH_STAR §5) is the emotional payload the whole 22-level ride builds
// toward. Caleb's half is easy — his pillion sprite is passenger.ts's, which
// grew an additive `hide()`. Gabby's needed more: bike.ts owns its rider sprite
// privately (a PLAN-04 decision), so it grew ONE additive, cosmetic
// `setRiderVisible` seam, used here to hide the SEATED rider on exactly the
// frame the standing one appears. Nothing else in that file changed — the
// invariant it carries protects the browser-measured FEEL tuning, not the
// sprite's visibility. Exactly one Gabby and exactly one Caleb are visible at
// every instant, sample-by-sample, gated by scripts/playtest-arrival.mjs.
//
// Like bike.ts / terrain.ts / passenger.ts / pickup.ts / police.ts (and UNLIKE
// ui.ts, the ONE module left in src/systems with a runtime `import Phaser` —
// decorations.ts stopped being the example here in PLAN-07 task 3, see its own
// doc), this module has NO runtime Phaser import — its non-type
// imports are the pure constants, themes.ts's pure camera-oversize helper, and
// the equally import-safe character/save modules Gabby's texture comes from —
// so it stays import-safe in Node and the pure helpers below (the ride-in
// geometry, the crawl controller, the phase machine) are unit-tested directly in
// tests/arrival.test.ts. createArrival only ever CALLS METHODS on the runtime
// scene/ctx handles handed to it (same contract as createBike).
//
// FORWARD-NOTE (PLAN-10 owns ALL audio; ART landed in ST-6): the venue is now a
// real cute pixel-art party building drawn from PALETTE (warm brickRed walls,
// cream trim, a plum pitched roof, sunshine-lit windows, a striped marquee
// awning, a swagged bulb garland, a coral heart sign, and a sunsetGlow light
// pool spilling from the doors), deliberately echoing PartyScene's warm dusk
// venue so the cut into the party never changes palette. Like PartyScene's
// backdrop it is runtime Phaser Graphics/Rectangles (NOT a committed PNG), ZERO
// Matter bodies. The music swell / door SFX still hook in at openVenue() and the
// wash. The DOORWAY GEOMETRY is unchanged from the placeholder, so the never-fail
// dismount choreography (ARRIVAL_DISMOUNT_OFFSETS) needed no re-tuning.
import type Phaser from 'phaser';
import {
  ARRIVAL,
  BIKE_TUNING,
  CAMERA,
  DEPTHS,
  DESIGN_HEIGHT,
  DESIGN_WIDTH,
  PALETTE,
  PASSENGER,
} from './constants';
import { cameraFixedOversizePx } from './themes';
import { calebFigureParts } from './calebFigure';
import { buildCharacterTextures } from './characterTextures';
import { getSave } from './save';
import { defaultCharacter } from '../data/characters';
import type { LevelEventHandle, EventContext } from '../levels/events';
import type { PartyArrivalEvent } from '../levels/types';

// ---------------------------------------------------------------------------
// Pure helpers — no Phaser/Matter/DOM. Unit-tested in tests/arrival.test.ts.
// ---------------------------------------------------------------------------

/** The cutscene's phases (`as const` string union — tsconfig's
 * `erasableSyntaxOnly` forbids TS enums). Progression is one-way:
 * approaching -> ridingIn -> crawling -> arrived, and never re-triggers. */
export type ArrivalPhase = 'approaching' | 'ridingIn' | 'crawling' | 'arrived';

/** Per-frame signals the phase machine transitions on. */
export interface ArrivalSignals {
  /** The bike has reached the ride-in takeover point, is on the ground, AND is
   * already moving forward at ARRIVAL.takeoverMinSpeedPxPerStep or better.
   * Entering this phase WRITES a forced pedal: mid-air that would be trick input
   * (full pitch authority), and from a standstill on a climb it can stall or
   * loop the bike out while denying the player their own recovery. Pure position
   * here would be both of those waiting to happen — see update(). */
  atRideIn: boolean;
  /** The bike has reached the point where the crawl starts AND is on the
   * ground — same reason as atRideIn. */
  atCrawl: boolean;
  /** The run has ENDED — i.e. the bike crossed the finish flag (or something
   * else finished the run). Terminal from any phase: whatever the cutscene was
   * doing, the arrival is now the finale. */
  finished: boolean;
}

/** The three world xs the whole beat is laid out on, all DERIVED from the
 * finish flag (the one landmark the cutscene straddles). Ordering invariant,
 * pinned by tests/arrival.test.ts: rideInX < crawlX < finishX < doorX. */
export interface ArrivalGeometry {
  /** Where the cutscene takes the pedals and holds gas. */
  rideInX: number;
  /** Where it swaps to holding the crawl speed. */
  crawlX: number;
  /** The venue doorway's centre — past the flag, so she coasts up to it. */
  doorX: number;
}

/** Lays the arrival out around `finishX`. Pure. */
export function arrivalGeometry(
  finishX: number,
  rideInLeadPx: number,
  crawlLeadPx: number,
  doorAheadOfFinishPx: number
): ArrivalGeometry {
  return {
    rideInX: finishX - rideInLeadPx,
    crawlX: finishX - crawlLeadPx,
    doorX: finishX + doorAheadOfFinishPx,
  };
}

/**
 * The crawl's bang-bang pedal controller: brake while the bike is running
 * FASTER than the target approach speed, gas otherwise.
 *
 * Two properties make this safe rather than merely simple. (1) It ALWAYS
 * crosses the flag: the moment the bike drops to (or below) the target — or
 * stops, or is rolling backwards — it gasses, so the cutscene can never strand a
 * player short of the finish. (2) It can never reverse-creep: brake is only ever
 * held while the bike is genuinely moving forward faster than the target, so the
 * held brake never reaches BIKE_TUNING.reverseEngageThreshold's backup mode.
 *
 * Takes SIGNED velocityX (not BikeHandle.speed, which is a magnitude) precisely
 * so a bike rolling backwards reads as "too slow" and gets gas. Pure.
 */
export function arrivalCrawlPedals(
  velocityXPxPerStep: number,
  crawlSpeedPxPerStep: number
): { gas: boolean; brake: boolean } {
  const tooFast = velocityXPxPerStep > crawlSpeedPxPerStep;
  return { gas: !tooFast, brake: tooFast };
}

/**
 * The phase machine's next phase (one transition per call). Pure and total — a
 * `never` guard makes adding a future ArrivalPhase a compile error. `finished`
 * jumps straight to the terminal 'arrived' from anywhere (onFinish drives it
 * that way), and 'arrived' never leaves, so the finale can only ever play once.
 */
export function nextArrivalPhase(phase: ArrivalPhase, signals: ArrivalSignals): ArrivalPhase {
  switch (phase) {
    case 'approaching':
      if (signals.finished) return 'arrived';
      return signals.atRideIn ? 'ridingIn' : 'approaching';
    case 'ridingIn':
      if (signals.finished) return 'arrived';
      return signals.atCrawl ? 'crawling' : 'ridingIn';
    case 'crawling':
      return signals.finished ? 'arrived' : 'crawling';
    case 'arrived':
      return 'arrived';
    default: {
      // Exhaustiveness guard: a new ArrivalPhase with no case above makes
      // `phase` no longer `never` here -> compile error. Unreachable at runtime.
      const _exhaustive: never = phase;
      return _exhaustive;
    }
  }
}

// ---------------------------------------------------------------------------
// Presentation-only local constants (the venue's + standing Caleb's DRAWING
// dimensions). Following the decorations.ts / pickup.ts / police.ts /
// partyCast.ts precedent, the drawing dimensions of runtime-Graphics art (no
// gameplay effect) stay here rather than in constants.ts; the GEOMETRY/pacing
// tunables that DO move the bike/figures live in the ARRIVAL block. Real art as
// of PLAN-10 ST-6, but still local because — like PartyScene's backdrop — the
// party/arrival venue is drawn with runtime Phaser Graphics, not a committed
// PNG. All lengths are px at the 1280x720 DESIGN scale.
// ---------------------------------------------------------------------------

// --- The venue: a cute, warm party building standing just past the flag, lit up
// against the dusk. Its palette echoes PartyScene's warm dusk backyard —
// PALETTE.sunshine windows/lights, a PALETTE.sunsetGlow spill from the doors,
// PALETTE.coral/bgPink festive trim over PALETTE.brickRed walls — so riding in
// and cutting to the party reads as ONE warm place.
//
// THE DOORWAY GEOMETRY IS LOAD-BEARING; THE REST IS DRESSING. doorX (derived
// from finishX + ARRIVAL.doorAheadOfFinishPx), DOOR_WIDTH_PX and DOOR_HEIGHT_PX
// are UNCHANGED from the placeholder: the scripted crawl rolls the bike up to
// doorX and both figures walk INTO the DOOR_WIDTH_PX opening centred on it (see
// ARRIVAL_DISMOUNT_OFFSETS, tuned against exactly these). Everything else here —
// the walls, roof, marquee awning, garland and heart sign — is art hung AROUND
// that fixed opening, so ST-6's new art left the never-fail choreography and the
// dismount offsets untouched.
/** EXPORTED (like ARRIVAL_DISMOUNT_OFFSETS, and for the same reason) so
 * tests/arrival.test.ts can check the REAL claim ARRIVAL.doorAheadOfFinishPx
 * makes — that the doorway PLUS half this facade fits inside the runway every
 * level has past its flag (LEVEL.finishMarginPx) — instead of the weaker
 * "the doorway alone fits", which would pass with the building hanging off the
 * end of the world. Kept at 300 so the runway check (340 + 150 <= 500) and the
 * dismount tuning both stand unchanged. */
export const VENUE_WIDTH_PX = 300;
const VENUE_HEIGHT_PX = 250;
const VENUE_OUTLINE_PX = 4;
/** A darker wainscot band along the base of the wall, px tall. */
const WAINSCOT_HEIGHT_PX = 30;
/** Cream corner pilasters framing the facade: face width px. */
const PILASTER_WIDTH_PX = 14;
/** The plum pitched roof sitting on the wall: eave overhang past each wall edge
 * (px, small so doorX + VENUE_WIDTH/2 + overhang stays inside the runway), how
 * far the flat ridge is inset from the eaves (px), roof height above the wall
 * (px), and the warm trim band under the eaves (px). */
const ROOF_EAVE_OVERHANG_PX = 6;
const ROOF_RIDGE_INSET_PX = 44;
const ROOF_HEIGHT_PX = 46;
const ROOF_TRIM_PX = 6;
/** The lit doorway opening (both door panels together close over exactly this).
 * EXPORTED so tests/arrival.test.ts can check that both dismounted figures come
 * to a stop INSIDE it rather than straddling a jamb. UNCHANGED by ST-6's art. */
export const DOOR_WIDTH_PX = 108;
const DOOR_HEIGHT_PX = 150;
/** How far the door panels shrink toward their outer hinges when fully open, as
 * a fraction of their closed width — not 0, so a sliver of each panel still
 * reads as an open door rather than vanishing. */
const DOOR_OPEN_SCALE = 0.12;
/** A cream frame around the doorway: how far it juts past each side + the top,
 * px. Purely visual trim around the fixed DOOR_WIDTH_PX opening. */
const DOOR_FRAME_PX = 10;
/** A cream threshold step at the foot of the door: px wider each side than the
 * opening, and px tall. */
const DOORSTEP_OVERHANG_PX = 12;
const DOORSTEP_HEIGHT_PX = 10;
/** Two warm lit windows flanking the doorway, each split into panes by a dark
 * muntin cross. */
const WINDOW_WIDTH_PX = 48;
const WINDOW_HEIGHT_PX = 52;
const WINDOW_INSET_X_PX = 104;
/** Window centre height above the ground. */
const WINDOW_ABOVE_GROUND_PX = 196;
/** Muntin bar thickness dividing each window into four panes, px. */
const WINDOW_MUNTIN_PX = 4;
/** The striped marquee awning over the doorway (the "party venue" flourish):
 * half-width (px, a little wider than the door), band height (px), the scallop
 * triangle depth along its bottom edge (px), the stripe/scallop count, and the
 * gap between the door opening's top and the awning's scallops (px). */
const AWNING_HALF_WIDTH_PX = 78;
const AWNING_HEIGHT_PX = 18;
const AWNING_SCALLOP_PX = 12;
const AWNING_STRIPES = 6;
const AWNING_ABOVE_DOOR_PX = 4;
/** A little heart "sign" plaque above the door — no text, just a warm welcome.
 * Cream plaque WxH px, gap above the awning px, and the coral heart's radius px. */
const SIGN_PLAQUE_WIDTH_PX = 42;
const SIGN_PLAQUE_HEIGHT_PX = 34;
const SIGN_ABOVE_AWNING_PX = 10;
const HEART_RADIUS_PX = 9;
/** A swagged strand of warm bulbs across the facade (PartyScene's string lights,
 * in miniature): bulb count, bulb square size px, inset from each wall edge px,
 * anchor height above the ground px, and how far it sags below the anchors at
 * centre px. */
const GARLAND_BULB_COUNT = 7;
const GARLAND_BULB_SIZE_PX = 9;
const GARLAND_INSET_X_PX = 28;
const GARLAND_ABOVE_GROUND_PX = 240;
const GARLAND_SAG_PX = 12;
const GARLAND_WIRE_PX = 3;
/** Festive multicolour bulbs cycled along the garland (warm party tones). */
const GARLAND_BULB_COLORS: readonly number[] = [PALETTE.sunshine, PALETTE.coral, PALETTE.bgPink];
/** The pool of light the open doors throw across the road: nested ellipses on
 * ONE Graphics, not one flat ellipse. Same lesson PartyScene's floor pool
 * records: a single translucent ellipse of a saturated warm colour has a visible
 * hard edge and reads as a tan RUG lying on the road, where a falloff reads as
 * light. Drawn widest to narrowest; the alphas compose where they overlap.
 *
 * MANY EQUAL-ALPHA RINGS, generated rather than listed. Screenshot-caught
 * THREE times: one flat ellipse read as a tan RUG on the road; three graded
 * rings read as three visible BANDS; six was better but each edge was still
 * legible as an arc. The fix each time is the same — more rings at a LOWER
 * uniform alpha, so every individual edge falls below the threshold the eye
 * picks out and only the composed ramp is visible. Generating them from a
 * count + a scale ramp (rather than hand-listing sizes) is what makes that
 * smoothness structural: raising SPILL_RING_COUNT smooths it further with no
 * other edit. Costs nothing either way — one Graphics, zero extra GameObjects,
 * drawn once at create() and never touched again. */
const SPILL_RING_COUNT = 12;
/** Per-ring alpha. Uniform, so the composed ramp is even; low, so each ring's
 * own edge is below the threshold where the eye reads it as a line. */
const SPILL_RING_ALPHA = 0.045;
/** The widest (outermost) ring; every other ring is a fraction of it. */
const SPILL_MAX_WIDTH_PX = 1500;
const SPILL_MAX_HEIGHT_PX = 210;
/** The innermost ring as a fraction of the widest — where the bright core of
 * the pool sits. */
const SPILL_MIN_SCALE = 0.2;
/** How far LEFT of the doorway the pool's centre sits, px — the light falls out
 * of the doors and back down the road she rode in on, so it reaches over
 * wherever she comes to rest (see ARRIVAL.crawlSpeedPxPerStep). */
const SPILL_CENTER_BEHIND_DOOR_PX = 130;
/** How far BELOW the road surface the pool's centre sits, px. Sunk on purpose:
 * centred exactly on the surface, the ellipse's upper half floats above the road
 * line and reads as a lit MOUND rather than as light lying on the ground
 * (screenshot-caught). */
const SPILL_CENTER_BELOW_GROUND_PX = 26;

// --- The two dismounted figures. Gabby is the player's OWN character (the
// riderTextureKey from buildCharacterTextures — the same one-source-of-truth
// path GameScene, CharacterCreationScene and partyCast.ts use, so she matches
// the look chosen at character creation); Caleb comes from the shared
// calebFigure.ts, which is the one home for his real brown-haired look (tex-caleb,
// real art as of PLAN-10 ST-2 — NORTH_STAR §5 / DECISIONS.md 2026-07-15).
/** Matches BootScene's tex-gabby-base / tex-caleb sprites (both 24x48).
 * The HEIGHT anchors a bottom-origin Container against the CENTRE-origin sprite
 * it replaces on the bike; the WIDTH is EXPORTED so tests/arrival.test.ts can
 * check both figures come to rest inside the doorway opening. */
const FIGURE_SPRITE_HEIGHT_PX = 48;
export const FIGURE_SPRITE_WIDTH_PX = 24;
// WHERE THEY LAND AND WHERE THEY STOP — landings as offsets ahead of the
// dismount anchor, stops as offsets short of the doorway centre. Gabby leads (it
// is her party) and Caleb trails half a body behind her.
//
// THE LOAD-BEARING PROPERTY IS AN EQUALITY, NOT A DISTANCE. Each figure walks
// `doorX - anchor - (landOffset + doorStopShort)`, so as long as those two SUMS
// match, both walks are the same length and the pair crosses the forecourt in
// step instead of one drifting away from the other. Stated as the rule rather
// than as a px figure on purpose: an earlier draft quoted the arithmetic result
// and went stale the moment a screenshot pass moved the landings.
/**
 * EXPORTED, unlike every other placeholder-art const in this file, for exactly
 * one reason: so tests/arrival.test.ts can PIN the equal-walk property above
 * instead of this comment merely asserting it. That is the fix for the failure
 * mode this plan kept hitting — a number restated in prose drifts the moment the
 * change moves it, where a number the test derives from cannot.
 *
 * `landAheadPx` is px ahead of the dismount anchor; `doorStopShortPx` is px
 * short of the doorway centre.
 *
 * Caleb lands far enough forward to clear the SEATED rider's spot
 * (BIKE_TUNING.riderOffsetX, ~0), because that is exactly where Gabby
 * materialises a beat later. In practice they end up about one sprite width
 * apart at that instant — touching, not overlapping — because the anchor is
 * sampled a little before the bike has fully stopped (see `dismountAnchor`).
 * Any less and they genuinely overlap (screenshot-caught).
 */
export const ARRIVAL_DISMOUNT_OFFSETS = {
  // Gabby walks to the doorway CENTRE (stop 0) and Caleb to a body's width
  // left of it, so both finish INSIDE the opening rather than straddling a
  // jamb — his old 42 put his outer edge flush with the frame
  // (screenshot-caught). Moving his stop meant moving his landing by the same
  // amount to keep the two sums equal, which is exactly the coupling the
  // exported constant + its test now protect.
  gabby: { landAheadPx: 74, doorStopShortPx: 0 },
  caleb: { landAheadPx: 40, doorStopShortPx: 34 },
} as const;

// ---------------------------------------------------------------------------
// Runtime factory (calls scene/ctx methods only — see module doc).
// ---------------------------------------------------------------------------

/** DEV-only live snapshot the browser playtest harness
 * (scripts/playtest-arrival.mjs) reads off the scene to script + assert the
 * arrival (stripped from prod builds via import.meta.env.DEV, exactly like
 * __pickup / __police / __wheelieRider). */
interface ArrivalDebug {
  phase(): ArrivalPhase;
  /** The derived layout (see ArrivalGeometry) — fixed for the run. */
  rideInX: number;
  crawlX: number;
  doorX: number;
  finishX: number;
  /** True once the cutscene has taken the pedals at least once this run. */
  tookControl(): boolean;
  /** True once it has handed them back (onFinish releases the override). */
  releasedControl(): boolean;
  /** Door-panel open progress, 0 (shut) .. 1 (fully open) — read off the LIVE
   * panel scale, so it evidences the tween rather than a flag. */
  doorsOpen01(): number;
  /** Current alpha of the light pool spilling out of the doorway. */
  spillAlpha(): number;
  /** True once each standing (dismounted) figure exists. */
  calebDismounted(): boolean;
  gabbyDismounted(): boolean;
  /** Their live x, or null before they step off / after teardown. */
  calebX(): number | null;
  gabbyX(): number | null;
  /** The dismount anchor both landings are placed from — the bike's x sampled
   * once at the first dismount (NOT its final resting x; see dismountAnchor).
   * null before that first read. */
  dismountAnchorX(): number | null;
  /** The texture key the standing Gabby renders with — the one-source-of-truth
   * rider key, exposed so a harness can prove she is the player's character and
   * not some second sprite. */
  riderTextureKey: string;
  /** Alpha of the warm light wash + the dusk wash behind the hand-off. */
  washAlpha(): number;
  duskAlpha(): number;
  /** The hold (ms) onFinish returns to GameScene. */
  finaleHoldMs: number;
  /** When (ms after the finish) the shared walk begins — so a harness can
   * measure the WALK alone rather than folding in each figure's hop down off
   * the bike, which starts from a different spot for each of them. */
  walkInDelayMs: number;
}

/**
 * Builds level 22's arrival cutscene and returns a {@link LevelEventHandle}
 * GameScene drives. `scene`/`ctx` are runtime handles only (same contract as
 * createBike). NO Matter body is created, and no force is ever applied to the
 * bike — the ride-in drives the real pedals through ctx.setInputOverride, so the
 * actual motion runs on the bike's own fixed 60 Hz step and this module's logic
 * (position triggers + a speed threshold + wall-clock tweens) is naturally
 * refresh-independent, needing no beforeupdate hook of its own.
 */
export function createArrival(
  scene: Phaser.Scene,
  event: PartyArrivalEvent,
  ctx: EventContext
): LevelEventHandle {
  // `crawlLeadPx` is deliberately NOT a per-level knob: where the ride-in TAKES
  // OVER and where the VENUE STANDS are placement (a level author's call), but
  // how far out she slows down is a property of the bike's braking distance and
  // belongs with the system.
  const { rideInX, crawlX, doorX } = arrivalGeometry(
    ctx.finishX,
    event.rideInLeadPx ?? ARRIVAL.rideInLeadPx,
    ARRIVAL.crawlLeadPx,
    event.doorAheadOfFinishPx ?? ARRIVAL.doorAheadOfFinishPx
  );
  const groundY = ctx.terrain.heightAt(doorX);

  // Every created GameObject is tracked so destroy() tears them all down on
  // level teardown/restart (double-destroy is safe — Phaser guards it). The
  // finale's objects are tracked too, so a shutdown DURING the hold cleans up.
  const objects: Phaser.GameObjects.GameObject[] = [];
  function track<T extends Phaser.GameObjects.GameObject>(obj: T): T {
    objects.push(obj);
    return obj;
  }

  // --- the venue (body-free party building, drawn AROUND the fixed doorway) --
  const halfW = VENUE_WIDTH_PX / 2;
  const roofY = groundY - VENUE_HEIGHT_PX;
  const doorTop = groundY - DOOR_HEIGHT_PX;

  // The warm terracotta wall.
  track(
    scene.add
      .rectangle(doorX, groundY, VENUE_WIDTH_PX, VENUE_HEIGHT_PX, PALETTE.brickRed)
      .setOrigin(0.5, 1)
      .setStrokeStyle(VENUE_OUTLINE_PX, PALETTE.outline)
      .setDepth(DEPTHS.props)
  );
  // A darker wainscot band along the base, and cream corner pilasters — enough
  // trim that the wall never reads as a flat block (DECISIONS' complaint).
  track(
    scene.add
      .rectangle(doorX, groundY, VENUE_WIDTH_PX, WAINSCOT_HEIGHT_PX, PALETTE.brown)
      .setOrigin(0.5, 1)
      .setDepth(DEPTHS.props + 1)
  );
  for (const side of [-1, 1]) {
    track(
      scene.add
        .rectangle(
          doorX + side * (halfW - PILASTER_WIDTH_PX / 2),
          groundY,
          PILASTER_WIDTH_PX,
          VENUE_HEIGHT_PX,
          PALETTE.cream
        )
        .setOrigin(0.5, 1)
        .setDepth(DEPTHS.props + 1)
    );
  }

  // The plum pitched roof — a filled+stroked trapezoid (wider eaves, flat ridge)
  // on ONE Graphics, kept inside the runway by ROOF_EAVE_OVERHANG_PX.
  const eaveL = doorX - halfW - ROOF_EAVE_OVERHANG_PX;
  const eaveR = doorX + halfW + ROOF_EAVE_OVERHANG_PX;
  const ridgeY = roofY - ROOF_HEIGHT_PX;
  const roofPoints = [
    { x: eaveL, y: roofY },
    { x: doorX - ROOF_RIDGE_INSET_PX, y: ridgeY },
    { x: doorX + ROOF_RIDGE_INSET_PX, y: ridgeY },
    { x: eaveR, y: roofY },
  ];
  const roof = track(scene.add.graphics().setDepth(DEPTHS.props + 1));
  roof.fillStyle(PALETTE.plum, 1);
  roof.fillPoints(roofPoints, true);
  roof.lineStyle(VENUE_OUTLINE_PX, PALETTE.outline, 1);
  roof.strokePoints(roofPoints, true);
  // A warm trim band under the eaves.
  track(
    scene.add
      .rectangle(doorX, roofY, VENUE_WIDTH_PX, ROOF_TRIM_PX, PALETTE.sunsetGlow)
      .setOrigin(0.5, 0)
      .setDepth(DEPTHS.props + 1)
  );

  // Two warm lit windows, dark-framed and split into four panes by a muntin
  // cross so they read as real windows rather than yellow squares.
  for (const side of [-1, 1]) {
    const wx = doorX + side * WINDOW_INSET_X_PX;
    const wy = groundY - WINDOW_ABOVE_GROUND_PX;
    track(
      scene.add
        .rectangle(wx, wy, WINDOW_WIDTH_PX, WINDOW_HEIGHT_PX, PALETTE.sunshine)
        .setStrokeStyle(VENUE_OUTLINE_PX, PALETTE.outline)
        .setDepth(DEPTHS.props + 1)
    );
    track(
      scene.add
        .rectangle(wx, wy, WINDOW_MUNTIN_PX, WINDOW_HEIGHT_PX, PALETTE.outline)
        .setDepth(DEPTHS.props + 2)
    );
    track(
      scene.add
        .rectangle(wx, wy, WINDOW_WIDTH_PX, WINDOW_MUNTIN_PX, PALETTE.outline)
        .setDepth(DEPTHS.props + 2)
    );
  }

  // A cream frame + threshold step around the fixed doorway opening.
  track(
    scene.add
      .rectangle(
        doorX,
        groundY,
        DOOR_WIDTH_PX + DOOR_FRAME_PX * 2,
        DOOR_HEIGHT_PX + DOOR_FRAME_PX,
        PALETTE.cream
      )
      .setOrigin(0.5, 1)
      .setStrokeStyle(VENUE_OUTLINE_PX, PALETTE.outline)
      .setDepth(DEPTHS.props + 1)
  );
  track(
    scene.add
      .rectangle(
        doorX,
        groundY,
        DOOR_WIDTH_PX + DOORSTEP_OVERHANG_PX * 2,
        DOORSTEP_HEIGHT_PX,
        PALETTE.cream
      )
      .setOrigin(0.5, 1)
      .setDepth(DEPTHS.props + 2)
  );
  // The lit interior behind the doors — revealed as the panels swing open.
  track(
    scene.add
      .rectangle(doorX, groundY, DOOR_WIDTH_PX, DOOR_HEIGHT_PX, PALETTE.sunshine)
      .setOrigin(0.5, 1)
      .setDepth(DEPTHS.props + 2)
  );
  // The two door panels, each anchored on its OUTER edge so shrinking its
  // scaleX reads as that panel swinging open against the jamb. GEOMETRY UNCHANGED
  // (DOOR_WIDTH_PX/DOOR_HEIGHT_PX): the dismount offsets are tuned against it.
  const doorPanels = [-1, 1].map((side) =>
    track(
      scene.add
        .rectangle(
          doorX + (side * DOOR_WIDTH_PX) / 2,
          groundY,
          DOOR_WIDTH_PX / 2,
          DOOR_HEIGHT_PX,
          PALETTE.plum
        )
        .setOrigin(side < 0 ? 0 : 1, 1)
        .setStrokeStyle(VENUE_OUTLINE_PX, PALETTE.outline)
        .setDepth(DEPTHS.props + 3)
    )
  );

  // A striped marquee awning over the doorway — the flourish that says "party
  // venue". Alternating coral/cream stripes with a scalloped bottom edge, on ONE
  // Graphics sitting just above the door opening so it never covers the light.
  const awningBottomY = doorTop - AWNING_ABOVE_DOOR_PX;
  const awningTopY = awningBottomY - AWNING_HEIGHT_PX;
  const awningLeft = doorX - AWNING_HALF_WIDTH_PX;
  const stripeW = (AWNING_HALF_WIDTH_PX * 2) / AWNING_STRIPES;
  const awning = track(scene.add.graphics().setDepth(DEPTHS.props + 3));
  for (let i = 0; i < AWNING_STRIPES; i++) {
    const sx = awningLeft + i * stripeW;
    awning.fillStyle(i % 2 === 0 ? PALETTE.coral : PALETTE.cream, 1);
    awning.fillRect(sx, awningTopY, stripeW, AWNING_HEIGHT_PX);
    awning.fillTriangle(
      sx,
      awningBottomY,
      sx + stripeW,
      awningBottomY,
      sx + stripeW / 2,
      awningBottomY + AWNING_SCALLOP_PX
    );
  }
  awning.lineStyle(VENUE_OUTLINE_PX, PALETTE.outline, 1);
  awning.strokeRect(awningLeft, awningTopY, AWNING_HALF_WIDTH_PX * 2, AWNING_HEIGHT_PX);

  // A little coral heart "sign" over the door — a warm, wordless welcome.
  const signCy = awningTopY - SIGN_ABOVE_AWNING_PX - SIGN_PLAQUE_HEIGHT_PX / 2;
  track(
    scene.add
      .rectangle(doorX, signCy, SIGN_PLAQUE_WIDTH_PX, SIGN_PLAQUE_HEIGHT_PX, PALETTE.cream)
      .setStrokeStyle(VENUE_OUTLINE_PX, PALETTE.outline)
      .setDepth(DEPTHS.props + 2)
  );
  const heart = track(scene.add.graphics().setDepth(DEPTHS.props + 3));
  const hr = HEART_RADIUS_PX;
  const heartCy = signCy - hr / 3;
  heart.fillStyle(PALETTE.coral, 1);
  heart.fillCircle(doorX - hr * 0.5, heartCy, hr * 0.6);
  heart.fillCircle(doorX + hr * 0.5, heartCy, hr * 0.6);
  heart.fillTriangle(
    doorX - hr,
    heartCy + hr * 0.05,
    doorX + hr,
    heartCy + hr * 0.05,
    doorX,
    heartCy + hr * 1.35
  );

  // A swagged strand of warm multicolour bulbs across the facade — PartyScene's
  // string lights in miniature (a parabola sagging GARLAND_SAG_PX at centre).
  const garland = track(scene.add.graphics().setDepth(DEPTHS.props + 2));
  const gLeft = doorX - halfW + GARLAND_INSET_X_PX;
  const gRight = doorX + halfW - GARLAND_INSET_X_PX;
  const gAnchorY = groundY - GARLAND_ABOVE_GROUND_PX;
  const gSpans = Math.max(1, GARLAND_BULB_COUNT - 1);
  const garlandY = (t: number): number => gAnchorY + GARLAND_SAG_PX * 4 * t * (1 - t);
  garland.lineStyle(GARLAND_WIRE_PX, PALETTE.outline, 1);
  garland.beginPath();
  for (let i = 0; i < GARLAND_BULB_COUNT; i++) {
    const t = i / gSpans;
    const gx = gLeft + (gRight - gLeft) * t;
    if (i === 0) garland.moveTo(gx, garlandY(t));
    else garland.lineTo(gx, garlandY(t));
  }
  garland.strokePath();
  for (let i = 0; i < GARLAND_BULB_COUNT; i++) {
    const t = i / gSpans;
    const gx = gLeft + (gRight - gLeft) * t;
    track(
      scene.add
        .rectangle(
          gx,
          garlandY(t) + GARLAND_BULB_SIZE_PX / 2,
          GARLAND_BULB_SIZE_PX,
          GARLAND_BULB_SIZE_PX,
          GARLAND_BULB_COLORS[i % GARLAND_BULB_COLORS.length]
        )
        .setDepth(DEPTHS.props + 3)
    );
  }
  // The pool of warm light the open doors throw across the road. Depth sits just
  // ABOVE the ground layer but BELOW every prop and the bike, so it lights the
  // ROAD — Gabby, the finish flag and the venue all stand IN the light rather
  // than under a shape painted over them.
  const spill = track(scene.add.graphics().setDepth(DEPTHS.terrain + 5));
  // Math.max(1, …) guards a hypothetical single-ring pool against a
  // divide-by-zero — same shape as the roof-bulb strand above.
  const spillSpans = Math.max(1, SPILL_RING_COUNT - 1);
  for (let i = 0; i < SPILL_RING_COUNT; i++) {
    // t: 0 at the widest ring, 1 at the narrowest core.
    const t = i / spillSpans;
    const scale = 1 - t * (1 - SPILL_MIN_SCALE);
    spill.fillStyle(PALETTE.sunsetGlow, SPILL_RING_ALPHA);
    spill.fillEllipse(0, 0, SPILL_MAX_WIDTH_PX * scale, SPILL_MAX_HEIGHT_PX * scale);
  }
  spill.setPosition(
    doorX - SPILL_CENTER_BEHIND_DOOR_PX,
    groundY + SPILL_CENTER_BELOW_GROUND_PX
  );
  spill.setAlpha(0);

  // --- cutscene state ------------------------------------------------------
  let phase: ArrivalPhase = 'approaching';
  let tookControl = false;
  let releasedControl = false;
  let venueOpened = false;
  let finaleStarted = false;
  let tornDown = false;
  let standingCaleb: Phaser.GameObjects.Container | undefined;
  let standingGabby: Phaser.GameObjects.Container | undefined;
  let warmWash: Phaser.GameObjects.Rectangle | undefined;
  let duskWash: Phaser.GameObjects.Rectangle | undefined;

  // Gabby's dismounted sprite comes from THE one-source-of-truth character path
  // — the same `buildCharacterTextures(scene, saved-or-default)` call GameScene
  // builds the SEATED rider with, and that CharacterCreationScene's preview and
  // partyCast.ts's Gabby/Dallas use. Resolved here at create() (never at module
  // scope), so she is always the look the player actually chose, and it is a
  // cheap cache hit: recolorTexture already built this exact variant key for the
  // bike a few lines earlier in GameScene.create().
  const { riderTextureKey } = buildCharacterTextures(
    scene,
    getSave().loadCharacter() ?? defaultCharacter()
  );

  /** Swings the doors open and blooms the light pool. Idempotent — the crawl
   * phase kicks it off before the flag, and onFinish re-calls it defensively in
   * case a run somehow reached the flag without ever crawling. */
  function openVenue(): void {
    if (venueOpened || tornDown) return;
    venueOpened = true;
    // TODO(PLAN-10): door-creak + music-swell SFX hook in here.
    scene.tweens.add({
      targets: doorPanels,
      scaleX: DOOR_OPEN_SCALE,
      duration: ARRIVAL.doorsOpenMs,
      ease: 'Quad.easeOut',
    });
    // The pool's own falloff is baked into the nested rings' composed alphas, so
    // this tween just blooms the whole Graphics from nothing to full strength.
    scene.tweens.add({
      targets: spill,
      alpha: 1,
      duration: ARRIVAL.lightSpillMs,
      ease: 'Quad.easeOut',
    });
  }

  /**
   * The DISMOUNT ANCHOR: the bike's x sampled ONCE, at the first dismount, and
   * reused for both figures' landings.
   *
   * Deliberately NOT called the bike's "resting" x, because it is not one — it
   * is read at ARRIVAL.hopOffDelayMs, while the bike is still creeping the last
   * few tens of px to a halt (browser-measured ~35px short of where it finally
   * settles). Sampling once anyway is the right trade and the reason this
   * function exists: the two step off a beat apart
   * (ARRIVAL.gabbyOffDelayMs - hopOffDelayMs), so reading the bike twice would
   * quietly stretch the gap between them and desynchronise their walk. One
   * slightly-early anchor keeps their spacing exact; a "more accurate" second
   * read would not.
   *
   * It has to be measured rather than derived either way: past the flag
   * GameScene forces the pedals false, so the bike free-coasts and where it ends
   * up is a property of the physics, not of any constant (see
   * ARRIVAL.crawlSpeedPxPerStep).
   */
  let dismountAnchorX: number | null = null;
  function dismountAnchor(): number {
    if (dismountAnchorX === null) dismountAnchorX = ctx.bike.x;
    return dismountAnchorX;
  }

  /**
   * Builds one dismounted figure and plays the FIRST beat of its exit: the hop
   * down off the bike onto the road. (The second beat — the walk in — is a
   * separate, SHARED event so the two of them set off together; see walkIn.)
   * Shared by Gabby and Caleb: the only differences are the sprite they are
   * drawn from, the spot ON THE BIKE they start at, and where they land.
   *
   * `startX`/`startY` are the LIVE position of the sprite being replaced, so
   * the swap is invisible on the frame it happens; the landing spot comes off
   * `dismountAnchor()` so both figures share one anchor.
   *
   * Runs from a timed event during the finale hold, never from update() —
   * GameScene has stopped calling that by now.
   */
  function stepOff(opts: {
    parts: Phaser.GameObjects.GameObject[];
    startX: number;
    startY: number;
    depth: number;
    landOffsetPx: number;
  }): Phaser.GameObjects.Container {
    const landX = dismountAnchor() + opts.landOffsetPx;
    const figure = track(
      scene.add.container(opts.startX, opts.startY, opts.parts).setDepth(opts.depth)
    );
    scene.tweens.add({
      targets: figure,
      x: landX,
      y: ctx.terrain.heightAt(landX),
      duration: ARRIVAL.hopDownMs,
      ease: 'Quad.easeIn',
    });
    return figure;
  }

  /** Both of them set off for the doorway TOGETHER and fade as they step
   * inside. One shared beat, not one chained onto each landing: they land the
   * same distance from the door and walk for the same duration, so a shared
   * start is what actually makes them arrive side by side (see
   * ARRIVAL.walkInDelayMs for the screenshot that forced this). */
  function walkIn(): void {
    if (tornDown) return;
    const walk = (
      figure: Phaser.GameObjects.Container | undefined,
      doorStopShortPx: number
    ): void => {
      if (figure === undefined) return;
      scene.tweens.add({
        targets: figure,
        x: doorX - doorStopShortPx,
        // BACK-LOADED fade (its own ease, steeper than the walk's): they stay
        // solid the whole way across and only dissolve as they actually reach
        // the doorway. A linear fade ghosted them out halfway down the road,
        // which read as vanishing rather than as going inside
        // (screenshot-caught).
        alpha: { value: 0, ease: 'Quint.easeIn' },
        duration: ARRIVAL.walkInMs,
        ease: 'Sine.easeInOut',
      });
    };
    walk(standingGabby, ARRIVAL_DISMOUNT_OFFSETS.gabby.doorStopShortPx);
    walk(standingCaleb, ARRIVAL_DISMOUNT_OFFSETS.caleb.doorStopShortPx);
  }

  /** Caleb comes off the back FIRST (the pillion always dismounts first): his
   * pillion sprite hides and a standing Caleb hops down just behind Gabby's
   * landing spot.
   *
   * He STARTS exactly where the pillion sprite just was — same chassis-local
   * offset, same depth — so hiding the pillion and revealing him is an invisible
   * swap. (The container is bottom-anchored while the pillion Image is
   * centre-anchored, hence the half sprite-height; the bike is upright on the
   * flat finish zone here, so the chassis-local offset needs no rotation.)
   * PASSENGER.depth also keeps him BEHIND Gabby, which is what stops him from
   * covering her on the frame he appears — screenshot-caught: spawned in front
   * of her and level with the chassis, he hid her completely. */
  function calebStepsOff(): void {
    if (tornDown) return;
    // ONLY IF HE IS ACTUALLY ABOARD. ctx.passenger.hide() is a harmless no-op
    // when he is not, but the standing figure is not: on a save where
    // deriveCalebPickedUp is false (level 12 never completed) he would
    // MATERIALISE beside the bike and walk into the party having never been
    // picked up. Unreachable in normal play — level 22 is only unlocked by
    // finishing 21 levels — but reachable through the dev/harness direct-entry
    // path, and "who is that" is not a bug worth shipping to be found later.
    if (!ctx.passenger.active) return;
    ctx.passenger.hide();
    standingCaleb = stepOff({
      parts: calebFigureParts(scene),
      startX: ctx.bike.x + PASSENGER.offsetX,
      startY: ctx.bike.y + PASSENGER.offsetY + FIGURE_SPRITE_HEIGHT_PX / 2,
      depth: PASSENGER.depth,
      landOffsetPx: ARRIVAL_DISMOUNT_OFFSETS.caleb.landAheadPx,
    });
  }

  /** Then GABBY gets off her own bike — the beat this whole ride has been
   * building toward (NORTH_STAR §5 "Gabby & Caleb arrive"), and the reason
   * BikeHandle grew its one cosmetic `setRiderVisible` seam.
   *
   * The SEATED rider is hidden on exactly the frame the standing one is created,
   * from exactly the seated sprite's own chassis-local offset and depth, so the
   * swap is invisible and there is never a frame with two Gabbys on screen
   * (gated sample-by-sample by scripts/playtest-arrival.mjs). She lands AHEAD of
   * Caleb and leads him in. */
  function gabbyStepsOff(): void {
    if (tornDown) return;
    ctx.bike.setRiderVisible(false);
    standingGabby = stepOff({
      parts: [scene.add.image(0, 0, riderTextureKey).setOrigin(0.5, 1)],
      startX: ctx.bike.x + BIKE_TUNING.riderOffsetX,
      startY: ctx.bike.y + BIKE_TUNING.riderOffsetY + FIGURE_SPRITE_HEIGHT_PX / 2,
      depth: DEPTHS.rider,
      landOffsetPx: ARRIVAL_DISMOUNT_OFFSETS.gabby.landAheadPx,
    });
  }

  /** The doors' light takes the screen, then settles into PartyScene's own night
   * sky so the hand-off is a match on colour rather than a flash. Both washes are
   * screen-anchored (scrollFactor 0); a scrollFactor-0 rectangle still SCALES
   * with camera zoom about the screen centre, so each is oversized by
   * cameraFixedOversizePx to cover the viewport at any zoom — the same technique
   * GameScene.failLevel's dim rect uses. */
  function startWash(): void {
    if (tornDown) return;
    const oversize = cameraFixedOversizePx(CAMERA.zoomMin);
    const makeWash = (color: number, depth: number): Phaser.GameObjects.Rectangle =>
      track(
        scene.add
          .rectangle(DESIGN_WIDTH / 2, DESIGN_HEIGHT / 2, oversize.width, oversize.height, color)
          .setScrollFactor(0)
          .setAlpha(0)
          .setDepth(depth)
      );

    const warm = makeWash(PALETTE.sunshine, DEPTHS.overlay);
    warmWash = warm;
    scene.tweens.add({ targets: warm, alpha: 1, duration: ARRIVAL.washFadeMs });

    const dusk = makeWash(PALETTE.duskIndigo, DEPTHS.overlay + 1);
    duskWash = dusk;
    scene.tweens.add({
      targets: dusk,
      alpha: 1,
      delay: ARRIVAL.washFadeMs,
      duration: ARRIVAL.duskFadeMs,
    });
  }

  function onEnterPhase(entered: ArrivalPhase): void {
    switch (entered) {
      case 'ridingIn':
        // Take the pedals and hold gas — the whole point of the ride-in: it
        // carries in a player who is flat out AND one who has stopped dead.
        tookControl = true;
        ctx.setInputOverride({ gas: true, brake: false });
        break;
      case 'crawling':
        // The venue opens up ahead of her while the run is still live; the crawl
        // pedals themselves are re-applied every frame in update().
        openVenue();
        break;
      case 'arrived':
        startFinale();
        break;
      case 'approaching':
        break;
      default: {
        const _exhaustive: never = entered;
        void _exhaustive;
        break;
      }
    }
  }

  /** The finale (crossing the flag). SELF-DRIVING via tweens + timed events:
   * GameScene stops calling update() once the run ends, so nothing here may rely
   * on per-frame ticks (see EventContext.isEnded's doc). Idempotent. */
  function startFinale(): void {
    if (finaleStarted || tornDown) return;
    finaleStarted = true;
    // Hand the pedals back. GameScene already forces both false now that the run
    // has ended, so this changes no motion — it releases the cutscene's claim on
    // the input so nothing is left overridden behind the hand-off.
    ctx.setInputOverride(null);
    releasedControl = true;
    openVenue(); // no-op if the crawl already opened them
    scene.time.delayedCall(ARRIVAL.hopOffDelayMs, calebStepsOff);
    scene.time.delayedCall(ARRIVAL.gabbyOffDelayMs, gabbyStepsOff);
    scene.time.delayedCall(ARRIVAL.walkInDelayMs, walkIn);
    scene.time.delayedCall(ARRIVAL.washDelayMs, startWash);
  }

  function update(): void {
    // Defensive: never drive the cutscene once the run has ended (GameScene stops
    // calling update() then anyway). Terminal 'arrived' is a no-op too, so the
    // finale can never re-trigger. `finished` is therefore always false HERE —
    // the ONLY way into 'arrived' is onFinish(), which fires exclusively on a
    // real finish-flag crossing, so a fail can never start the party finale.
    if (ctx.isEnded() || phase === 'arrived') return;

    // NEVER WRITE AN OVERRIDE WHILE AIRBORNE (see the module doc's never-fail
    // note). A pedal press that BEGINS mid-air is the deliberate-trick input and
    // gets FULL pitch authority from bike.ts's airPitchAuthority; the takeover's
    // forced GAS is a fresh press, and the crawl's bang-bang law toggles BRAKE
    // every frame, so either landing on an airborne frame could spin the bike.
    // Level 22's rolling terrain really does hop the bike during the ride-in, so
    // this is a live case, not a hypothetical. Gating BOTH the phase entries
    // (which write the override once) and the per-frame crawl on `grounded` is
    // what makes the never-fail guarantee structural instead of measured. The
    // bike is never airborne for long, so this only ever defers by a frame or
    // two — the takeover/crawl simply engages the moment the wheels are down.
    const grounded = !ctx.bike.airborne;

    const next = nextArrivalPhase(phase, {
      // Also require the bike to be ALREADY MOVING before taking the pedals —
      // see ARRIVAL.takeoverMinSpeedPxPerStep. Forcing gas on from a standstill
      // part-way up a climb can stall or loop out the bike, and worse, the
      // override would then deny the player the roll-back run-up they'd
      // otherwise recover with. Once the ride-in HAS the pedals it holds gas, so
      // the crawl transition needs no speed gate of its own.
      atRideIn:
        grounded &&
        ctx.bike.x >= rideInX &&
        ctx.bike.velocityX >= ARRIVAL.takeoverMinSpeedPxPerStep,
      atCrawl: grounded && ctx.bike.x >= crawlX,
      finished: false,
    });
    if (next !== phase) {
      phase = next;
      onEnterPhase(phase);
    }

    // The crawl is a controller, not a one-shot: re-evaluate the pedals every
    // GROUNDED frame so the bike settles onto the target approach speed. While
    // airborne the last override simply stays held — and a HELD pedal has
    // near-zero pitch authority, which is exactly the safe case.
    if (phase === 'crawling' && grounded) {
      ctx.setInputOverride(arrivalCrawlPedals(ctx.bike.velocityX, ARRIVAL.crawlSpeedPxPerStep));
    }
  }

  /** GameScene consults this when the bike crosses the finish flag, BEFORE the
   * PartyScene hand-off. Starts the finale and holds the hand-off long enough for
   * it to play. */
  function onFinish(): number {
    if (phase !== 'arrived') {
      phase = nextArrivalPhase(phase, { atRideIn: true, atCrawl: true, finished: true });
      onEnterPhase(phase);
    }
    return ARRIVAL.finaleHoldMs;
  }

  // DEV-only: expose live state for scripts/playtest-arrival.mjs (stashed on the
  // scene, which persists across scene.restart()). Prod builds skip this whole
  // branch (Vite dead-code-eliminates `import.meta.env.DEV`).
  const devScene = scene as unknown as { __arrival?: ArrivalDebug };
  if (import.meta.env.DEV) {
    devScene.__arrival = {
      phase: () => phase,
      rideInX,
      crawlX,
      doorX,
      finishX: ctx.finishX,
      tookControl: () => tookControl,
      releasedControl: () => releasedControl,
      // 1 - scaleX maps the panel's live scale back to "how open", so a stuck
      // tween reads as 0 rather than as a lie told by a boolean.
      doorsOpen01: () => (1 - doorPanels[0].scaleX) / (1 - DOOR_OPEN_SCALE),
      spillAlpha: () => spill.alpha,
      calebDismounted: () => standingCaleb !== undefined,
      gabbyDismounted: () => standingGabby !== undefined,
      calebX: () => standingCaleb?.x ?? null,
      gabbyX: () => standingGabby?.x ?? null,
      dismountAnchorX: () => dismountAnchorX,
      riderTextureKey,
      washAlpha: () => warmWash?.alpha ?? 0,
      duskAlpha: () => duskWash?.alpha ?? 0,
      finaleHoldMs: ARRIVAL.finaleHoldMs,
      walkInDelayMs: ARRIVAL.walkInDelayMs,
    };
  }

  function destroy(): void {
    tornDown = true;
    // Put the SEATED rider back before anything else. Belt-and-braces rather
    // than load-bearing — every create() builds a fresh bike whose rider starts
    // visible, so a fail-restart cannot inherit a hidden one either way — but it
    // means the seam this module borrows is always handed back the way it was
    // found, and setRiderVisible is a documented no-op on an already-destroyed
    // rig, so teardown ORDER cannot make this unsafe.
    ctx.bike.setRiderVisible(true);
    // Kill any in-flight tweens (doors, spill, the two dismount hops/walks, the
    // washes — all tracked in `objects`) BEFORE destroying their targets, so a
    // shutdown mid-finale can't leave a tween running against a destroyed
    // GameObject. Idempotent: a second destroy() sees an empty `objects` and
    // killTweensOf([]) is a harmless no-op.
    //
    // The finale's four scene.time.delayedCall beats need no equivalent sweep:
    // Phaser's Clock destroys pending events on scene shutdown, and every one of
    // those callbacks re-checks the `tornDown` flag set above before it touches
    // anything — belt and braces, since teardown ORDER is not ours to assume.
    scene.tweens.killTweensOf(objects);
    for (const obj of objects) obj.destroy();
    objects.length = 0;
    standingCaleb = undefined;
    standingGabby = undefined;
    warmWash = undefined;
    duskWash = undefined;
    if (import.meta.env.DEV) delete devScene.__arrival;
  }

  return { update, destroy, onFinish };
}
