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
//      onFinish(). Caleb hops off the back and walks in, the light takes the
//      screen, and the hold expires into PartyScene.
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
// WHERE GABBY'S DISMOUNT WENT (a deliberate staging call — see DECISIONS.md
// 2026-07-22): BikeHandle does not expose its rider sprite (a PLAN-04 decision)
// and bike.ts is a byte-unchanged project invariant, so there is no way to take
// Gabby off the bike without shipping TWO visible Gabbys — one seated, one
// standing. So the beat is staged the other way round: CALEB's dismount is
// shown for real (his pillion sprite hides, a standing Caleb hops down beside
// the bike and walks into the doorway), Gabby stays with the bike she is
// parking, and the doors' light wash covers the rest of the transition into
// PartyScene, where the two of them are standing together. Exactly one Gabby and
// exactly one Caleb are visible at every instant — gated by
// scripts/playtest-arrival.mjs.
//
// Like bike.ts / terrain.ts / passenger.ts / pickup.ts / police.ts (and UNLIKE
// decorations.ts), this module has NO runtime Phaser import — its non-type
// imports are the pure constants plus themes.ts's pure camera-oversize helper —
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
  CAMERA,
  DEPTHS,
  DESIGN_HEIGHT,
  DESIGN_WIDTH,
  PALETTE,
  PASSENGER,
  TEXTURE_KEYS,
} from './constants';
import { cameraFixedOversizePx } from './themes';
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

// --- Standing Caleb, dismounted: the tex-caleb placeholder + a BROWN hair band
// overlay, the same convention pickup.ts's standing Caleb and partyCast.ts's
// party Caleb both use, so he reads brown-haired and is never confused with
// blonde Dom (NORTH_STAR §5 / DECISIONS.md 2026-07-15).
/** Matches BootScene's tex-caleb placeholder (24x48). */
const CALEB_SPRITE_WIDTH_PX = 24;
const CALEB_SPRITE_HEIGHT_PX = 48;
const CALEB_HAIR_BAND_HEIGHT_PX = 12;
/** Where he lands relative to the bike when he hops down, px. Positive = ahead
 * of the bike, on the doorway side (he steps off toward the party) and clear of
 * Gabby's own sprite, which sits at BIKE_TUNING.riderOffsetX. */
const CALEB_LANDING_X_OFFSET_PX = 34;
/** How far short of the doorway centre he walks before he is inside, px. */
const CALEB_DOOR_STOP_SHORT_PX = 14;

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
  /** True once the standing (dismounted) Caleb exists. */
  calebDismounted(): boolean;
  /** His live x, or null before he hops off / after teardown. */
  calebX(): number | null;
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
  let warmWash: Phaser.GameObjects.Rectangle | undefined;
  let duskWash: Phaser.GameObjects.Rectangle | undefined;

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

  /** Caleb comes off the back: his pillion sprite hides and a standing Caleb
   * hops down beside the bike, then walks into the doorway and fades inside.
   * Runs from a timed event during the finale hold (never from update()). */
  function hopOff(): void {
    if (tornDown) return;
    ctx.passenger.hide();

    const landX = ctx.bike.x + CALEB_LANDING_X_OFFSET_PX;
    const landY = ctx.terrain.heightAt(landX);
    const body = scene.add.image(0, 0, TEXTURE_KEYS.caleb).setOrigin(0.5, 1);
    const hair = scene.add.rectangle(
      0,
      -CALEB_SPRITE_HEIGHT_PX + CALEB_HAIR_BAND_HEIGHT_PX / 2,
      CALEB_SPRITE_WIDTH_PX,
      CALEB_HAIR_BAND_HEIGHT_PX,
      PALETTE.brown
    );
    // DEPTHS.rider + 1: he has stepped off onto the near side of the road, in
    // front of the bike and its rider.
    // He STARTS exactly where the pillion sprite just was — same chassis-local
    // offset, same depth — so hiding the pillion and revealing him is an
    // invisible swap, and the tween below is a genuine hop OFF THE BIKE rather
    // than a second Caleb popping into existence. (The container is
    // bottom-anchored while the pillion Image is centre-anchored, hence the half
    // sprite-height; the bike is upright on the flat finish zone here, so the
    // chassis-local offset needs no rotation.) PASSENGER.depth keeps him BEHIND
    // Gabby for the hop, which is what stops him from covering her on the frame
    // he appears — screenshot-caught: spawned in front of her and level with the
    // chassis, he hid her completely, and Gabby vanishing is the one thing this
    // screen cannot do.
    const caleb = track(
      scene.add
        .container(
          ctx.bike.x + PASSENGER.offsetX,
          ctx.bike.y + PASSENGER.offsetY + CALEB_SPRITE_HEIGHT_PX / 2,
          [body, hair]
        )
        .setDepth(PASSENGER.depth)
    );
    standingCaleb = caleb;

    scene.tweens.add({
      targets: caleb,
      x: landX,
      y: landY,
      duration: ARRIVAL.hopDownMs,
      ease: 'Quad.easeIn',
      onComplete: () => {
        if (tornDown) return;
        scene.tweens.add({
          targets: caleb,
          x: doorX - CALEB_DOOR_STOP_SHORT_PX,
          // BACK-LOADED fade (its own ease, steeper than the walk's): he stays
          // solid the whole way across and only dissolves as he actually reaches
          // the doorway. A linear fade ghosted him out halfway down the road,
          // which read as him vanishing rather than going inside
          // (screenshot-caught).
          alpha: { value: 0, ease: 'Quint.easeIn' },
          duration: ARRIVAL.walkInMs,
          ease: 'Sine.easeInOut',
        });
      },
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
    scene.time.delayedCall(ARRIVAL.hopOffDelayMs, hopOff);
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
      calebX: () => standingCaleb?.x ?? null,
      washAlpha: () => warmWash?.alpha ?? 0,
      duskAlpha: () => duskWash?.alpha ?? 0,
      finaleHoldMs: ARRIVAL.finaleHoldMs,
    };
  }

  function destroy(): void {
    tornDown = true;
    // Kill any in-flight tweens (doors, spill, Caleb's hop/walk, the washes —
    // all tracked in `objects`) BEFORE destroying their targets, so a shutdown
    // mid-finale can't leave a tween running against a destroyed GameObject.
    // Idempotent: a second destroy() sees an empty `objects` and
    // killTweensOf([]) is a harmless no-op.
    scene.tweens.killTweensOf(objects);
    for (const obj of objects) obj.destroy();
    objects.length = 0;
    standingCaleb = undefined;
    warmWash = undefined;
    duskWash = undefined;
    if (import.meta.env.DEV) delete devScene.__arrival;
  }

  return { update, destroy, onFinish };
}
