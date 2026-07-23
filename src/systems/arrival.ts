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
// IT CAN NEVER FAIL THE PLAYER: it never calls ctx.softFail, it never touches
// the bike's bodies, and the one input it forces is GAS on flat ground (level
// 22's finish flat zone). The crawl only ever BRAKES while the bike is moving
// faster than the target, so it can't reverse-creep the bike back off the flag.
//
// ZERO Matter bodies — level 22 is the tightest level in the game (99/100, see
// PROGRESS.md), so this had to be free by construction: the venue, its doors,
// the light spill, the standing Caleb and the two full-screen washes are all
// plain Rectangles/Graphics/Images/Containers. It never touches scene.matter.
//
// SELF-DRIVING AFTER THE FLAG. GameScene stops calling handle.update() the
// instant the run ends (see EventContext.isEnded's doc), so every part of the
// finale runs on tweens + scene.time.delayedCall — exactly the discipline
// police.ts's onFinish finale follows.
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
// decorations.ts), this module has NO runtime Phaser import — its non-type
// imports are the pure constants, themes.ts's pure camera-oversize helper, and
// the equally import-safe character/save modules Gabby's texture comes from —
// so it stays import-safe in Node and the pure helpers below (the ride-in
// geometry, the crawl controller, the phase machine) are unit-tested directly in
// tests/arrival.test.ts. createArrival only ever CALLS METHODS on the runtime
// scene/ctx handles handed to it (same contract as createBike).
//
// FORWARD-NOTE (PLAN-10 owns ALL audio + art): the venue here is placeholder
// geometry built from PALETTE, deliberately echoing PartyScene's dusk venue
// (brown fence-brown structure, sunshine bulbs, a sunsetGlow light pool on a
// plum-dark ground) so the cut into the party never changes palette. The music
// swell / door SFX hook in at openVenue() and the wash.
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
  TEXTURE_KEYS,
} from './constants';
import { cameraFixedOversizePx } from './themes';
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
  /** The bike has reached the ride-in takeover point. */
  atRideIn: boolean;
  /** The bike has reached the point where the crawl starts. */
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
// Presentation-only local constants (PLACEHOLDER art). Following the
// decorations.ts / pickup.ts / police.ts / partyCast.ts precedent, the DRAWING
// dimensions of the throwaway placeholder venue + standing Caleb (no gameplay
// effect — PLAN-10 replaces the art wholesale) stay here rather than in
// constants.ts. The GEOMETRY/pacing tunables live in the ARRIVAL block. All
// lengths are px at the 1280x720 DESIGN scale.
// ---------------------------------------------------------------------------

// --- The venue: a warm-lit party house at dusk, standing just past the flag.
// Colours deliberately mirror PartyScene's backyard (PALETTE.brown structure,
// PALETTE.sunshine bulbs/windows, a PALETTE.sunsetGlow light pool) so riding in
// and cutting to the party reads as ONE place.
const VENUE_WIDTH_PX = 300;
const VENUE_HEIGHT_PX = 250;
const VENUE_OUTLINE_PX = 4;
/** The darker rail capping the venue — the same trick PartyScene's fence uses. */
const VENUE_ROOF_HEIGHT_PX = 16;
/** The lit doorway opening (both door panels together close over exactly this). */
const DOOR_WIDTH_PX = 108;
const DOOR_HEIGHT_PX = 150;
/** How far the door panels shrink toward their outer hinges when fully open, as
 * a fraction of their closed width — not 0, so a sliver of each panel still
 * reads as an open door rather than vanishing. */
const DOOR_OPEN_SCALE = 0.12;
/** Two warm lit windows flanking the doorway. */
const WINDOW_WIDTH_PX = 44;
const WINDOW_HEIGHT_PX = 40;
const WINDOW_INSET_X_PX = 100;
/** Window centre height above the ground. */
const WINDOW_ABOVE_GROUND_PX = 190;
/** A short strand of warm bulbs along the venue's roofline (PartyScene's string
 * lights, in miniature). */
const BULB_COUNT = 7;
const BULB_SIZE_PX = 8;
const BULB_ABOVE_ROOF_PX = 14;
/** The pool of light the open doors throw across the road: THREE nested
 * ellipses (widest/faintest first) on one Graphics, not one flat ellipse.
 * Screenshot-caught, and the same lesson PartyScene's floor pool records: a
 * single translucent ellipse of a saturated warm colour has a visible hard edge
 * and reads as a tan RUG lying on the road, where a falloff reads as light.
 * Listed widest to narrowest; the alphas compose where they overlap. */
const SPILL_RINGS: ReadonlyArray<{ widthPx: number; heightPx: number; alpha: number }> = [
  { widthPx: 1400, heightPx: 190, alpha: 0.1 },
  { widthPx: 900, heightPx: 130, alpha: 0.16 },
  { widthPx: 520, heightPx: 84, alpha: 0.16 },
];
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
// the look chosen at character creation), and Caleb is the tex-caleb
// placeholder + a BROWN hair band overlay, the same convention pickup.ts's
// standing Caleb and partyCast.ts's party Caleb use so he reads brown-haired
// and is never confused with blonde Dom (NORTH_STAR §5 / DECISIONS.md
// 2026-07-15).
/** Matches BootScene's tex-gabby-base / tex-caleb placeholders (both 24x48). */
const FIGURE_SPRITE_WIDTH_PX = 24;
const FIGURE_SPRITE_HEIGHT_PX = 48;
const CALEB_HAIR_BAND_HEIGHT_PX = 12;
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
  gabby: { landAheadPx: 74, doorStopShortPx: 8 },
  caleb: { landAheadPx: 40, doorStopShortPx: 42 },
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

  // --- the venue (non-Matter placeholder) ---------------------------------
  track(
    scene.add
      .rectangle(doorX, groundY, VENUE_WIDTH_PX, VENUE_HEIGHT_PX, PALETTE.brown)
      .setOrigin(0.5, 1)
      .setStrokeStyle(VENUE_OUTLINE_PX, PALETTE.outline)
      .setDepth(DEPTHS.props)
  );
  const roofY = groundY - VENUE_HEIGHT_PX;
  track(
    scene.add
      .rectangle(doorX, roofY, VENUE_WIDTH_PX, VENUE_ROOF_HEIGHT_PX, PALETTE.outline)
      .setOrigin(0.5, 0)
      .setDepth(DEPTHS.props + 1)
  );
  for (const side of [-1, 1]) {
    track(
      scene.add
        .rectangle(
          doorX + side * WINDOW_INSET_X_PX,
          groundY - WINDOW_ABOVE_GROUND_PX,
          WINDOW_WIDTH_PX,
          WINDOW_HEIGHT_PX,
          PALETTE.sunshine
        )
        .setStrokeStyle(VENUE_OUTLINE_PX, PALETTE.outline)
        .setDepth(DEPTHS.props + 1)
    );
  }
  // Warm bulbs along the roofline — PartyScene's string lights, in miniature.
  const bulbSpan = VENUE_WIDTH_PX - BULB_SIZE_PX * 2;
  // Math.max(1, …) guards a hypothetical single-bulb strand against a
  // divide-by-zero — the same shape PartyScene.drawStringLights uses.
  const bulbSpans = Math.max(1, BULB_COUNT - 1);
  for (let i = 0; i < BULB_COUNT; i++) {
    const t = i / bulbSpans;
    track(
      scene.add
        .rectangle(
          doorX - bulbSpan / 2 + t * bulbSpan,
          roofY - BULB_ABOVE_ROOF_PX,
          BULB_SIZE_PX,
          BULB_SIZE_PX,
          PALETTE.sunshine
        )
        .setDepth(DEPTHS.props + 2)
    );
  }
  // The lit interior behind the doors — revealed as the panels swing open.
  track(
    scene.add
      .rectangle(doorX, groundY, DOOR_WIDTH_PX, DOOR_HEIGHT_PX, PALETTE.sunshine)
      .setOrigin(0.5, 1)
      .setDepth(DEPTHS.props + 2)
  );
  // The two door panels, each anchored on its OUTER edge so shrinking its
  // scaleX reads as that panel swinging open against the jamb.
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
  // The pool of warm light the open doors throw across the road. Depth sits just
  // ABOVE the ground layer but BELOW every prop and the bike, so it lights the
  // ROAD — Gabby, the finish flag and the venue all stand IN the light rather
  // than under a shape painted over them.
  const spill = track(scene.add.graphics().setDepth(DEPTHS.terrain + 5));
  for (const ring of SPILL_RINGS) {
    spill.fillStyle(PALETTE.sunsetGlow, ring.alpha);
    spill.fillEllipse(0, 0, ring.widthPx, ring.heightPx);
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
    // The pool's own falloff is baked into SPILL_RINGS' composed alphas, so this
    // tween just blooms the whole Graphics from nothing to full strength.
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
    ctx.passenger.hide();
    standingCaleb = stepOff({
      parts: [
        scene.add.image(0, 0, TEXTURE_KEYS.caleb).setOrigin(0.5, 1),
        scene.add.rectangle(
          0,
          -FIGURE_SPRITE_HEIGHT_PX + CALEB_HAIR_BAND_HEIGHT_PX / 2,
          FIGURE_SPRITE_WIDTH_PX,
          CALEB_HAIR_BAND_HEIGHT_PX,
          PALETTE.brown
        ),
      ],
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

    const next = nextArrivalPhase(phase, {
      atRideIn: ctx.bike.x >= rideInX,
      atCrawl: ctx.bike.x >= crawlX,
      finished: false,
    });
    if (next !== phase) {
      phase = next;
      onEnterPhase(phase);
    }

    // The crawl is a controller, not a one-shot: re-evaluate the pedals every
    // frame so the bike settles onto the target approach speed.
    if (phase === 'crawling') {
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
