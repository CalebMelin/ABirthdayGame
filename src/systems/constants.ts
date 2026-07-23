// Shared presentation constants and tunable gameplay numbers.
// See CLAUDE.md conventions: all gameplay tuning lives here or in level configs.

/** Design resolution — 16:9 landscape, scales cleanly for pixel art. */
export const DESIGN_WIDTH = 1280;
export const DESIGN_HEIGHT = 720;

/** Named pastel pixel-art colors as 0xRRGGBB values. */
export const PALETTE = {
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
  outline: 0x2a1820,
  /** Warm placeholder skin tone for Gabby's face on the PLAN-04
   * marker-composite rider base texture (see palette.ts / BootScene's
   * tex-gabby-base). Deliberately NOT a MARKERS.* value — the face must
   * never be recolored by a palette swap. */
  skin: 0xffcf9c,
  /** Warm mid brown — Caleb's hair (NORTH_STAR §5: he is BROWN-haired, to read
   * distinct from blonde Dom) + placeholder door/wood tone. Used by the level-12
   * pickup props (src/systems/pickup.ts). The 12-color pastel set had no true
   * brown; added alongside the theme tones below for the same "the art needs a
   * color the palette lacks" reason. Distinct from every MARKERS.* swap color. */
  brown: 0x6b4423,

  // ------------------------------------------------------- theme colors
  // Added for the PLAN-05 task-2 per-theme backdrop system
  // (src/systems/themes.ts) — extra pastel tones the original 12-color
  // palette didn't cover (greys, water/steel/brick tones, a dusk indigo),
  // needed so all 15 THEME_IDS read as visibly distinct across the city
  // arc. Reused across multiple themes where it fits, same as the
  // original colors above.
  /** Cool grey overcast sky (downtown, highway upper, construction, billboardRow). */
  overcast: 0xc9d3da,
  /** Mid-grey concrete/building silhouette (downtown, highway, bridge deck, billboardRow, boulevard ground). */
  slate: 0x8b96a3,
  /** Dusty construction tan-orange (also an old-town accent). */
  dustyTan: 0xd9a97c,
  /** Riverside blue-green water/bank tone. */
  riverTeal: 0x8fd8cc,
  /** Bridge structural blue. */
  steelBlue: 0x7fabd1,
  /** Old-town warm brick/terracotta. */
  brickRed: 0xcf8a70,
  /** Sunset horizon glow (orange-coral). */
  sunsetGlow: 0xffa877,
  /** Final-dusk deep indigo night sky/ground (the party arrival theme). */
  duskIndigo: 0x3d3170,
} as const;

/** Convert 0xRRGGBB hex color to CSS '#rrggbb' string.
 * Input is clamped to the low 24 bits so negative/out-of-range/float
 * values can't produce garbage strings. */
export function hexToCss(color: number): string {
  return `#${((color >>> 0) & 0xffffff).toString(16).padStart(6, '0')}`;
}

/** Pastel background used both in the Phaser canvas and the page chrome.
 * Manually kept in sync with TWO spots in index.html (HTML can't import
 * this constant): the inline <style> body background and the
 * <meta name="theme-color"> tag, so the letterbox bars (from
 * Scale.FIT) and the mobile browser UI match the game background. */
export const PASTEL_BG_COLOR = PALETTE.bgPink; // soft pink, a.k.a. #ffd6e8

/** Text color for placeholder/UI copy on the pastel background. */
export const TEXT_COLOR = hexToCss(PALETTE.plum); // '#4a2c40'

/** Matter.js world gravity-y (1 = Matter default, ~0.278 px/step^2 at the
 * fixed 60 Hz tick). The PLAN-02 task-6 feel pass TRIED 0.8 for floatier
 * jumps and rejected it (browser-measured): the ~25% longer hops chained
 * natural bumps into compounding suspension-rebound launches — one lip on
 * the test level kicked the chassis to ~90 degrees nose-up under gas-only
 * input, crashing a run that is rock-solid at 1.0. Flip airtime comes
 * from ramp GEOMETRY instead (see TEST_LEVEL's kicker note). More =
 * heavier/snappier falls, shorter airtime everywhere. */
export const GRAVITY_Y = 1;

/** Physics tuning for the bike rig (PLAN-02 task 2 — see
 * src/systems/bike.ts). First real pass; the dedicated feel-tuning task
 * (PLAN-02 task 6) iterates on these against actual terrain.
 *
 * UNITS: Matter.js linear velocity is px per physics step (one step =
 * 1/60 s at the fixed 60 Hz tick), angular velocity is radians per step.
 * bike.ts applies every "per step" quantity below on the Matter world's
 * once-per-engine-step 'beforeupdate' hook (NOT per render frame), so
 * these rates hold at any display refresh rate.
 *
 * NOTE: BootScene's placeholder texture sizes derive from chassisWidth /
 * chassisHeight / wheelRadius — keep those key names. */
export const BIKE_TUNING = {
  // -------------------------------------------------------------- geometry
  /** Bike body width, px. Longer chassis = more stable, harder to flip. */
  chassisWidth: 96,
  /** Bike body height, px. Taller = higher center of mass, tips easier. */
  chassisHeight: 28,
  /** Wheel radius, px. Bigger wheels roll over bumps more smoothly and
   * raise top speed (linear speed = wheel spin x radius). */
  wheelRadius: 18,
  /** Distance between wheel centers, px. Wider = more stable, harder to
   * wheelie or flip. */
  wheelbase: 74,
  /** How far wheel centers hang below the chassis CENTER at rest, px.
   * More = taller/tippier bike with more visible suspension travel. */
  wheelDropPx: 30,
  /** Extra air left under the wheels when spawning via bikeSpawnY(), px.
   * More = a longer settle "drop-in" on spawn; too little risks spawning
   * intersecting the (coarser-than-visual) physics ground — see the
   * terrain.ts collision-chain caveat on bikeSpawnY's doc comment. */
  spawnClearancePx: 10,

  // -------------------------------------------------- mass & wheel surface
  /** Matter density of the chassis rect. Heavier chassis = more momentum,
   * mushier suspension response, harder for air control to rotate. */
  chassisDensity: 0.0015,
  /** Matter friction of the chassis when it scrapes ground (bottoming out
   * is NOT a fail — only the head sensor is). Lower = slides off bumps
   * instead of sticking. */
  chassisFriction: 0.1,
  /** Matter density of each wheel. Heavier wheels = steadier ride,
   * slightly lazier acceleration response. */
  wheelDensity: 0.002,
  /** Matter friction of the wheels. Higher = more grip on slopes (drive
   * force comes entirely from this against TERRAIN.groundFriction);
   * too low and the rear wheel spins out on climbs. */
  wheelFriction: 0.95,
  /** Matter restitution (bounciness) of the wheels. More = springier
   * landings; keep near 0 so landings feel planted, not bouncy. */
  wheelRestitution: 0.05,

  // ------------------------------------------------------------ suspension
  /** Stiffness (0-1) of each wheel's vertical spring constraint. Higher =
   * firmer, less squat under load; lower = soft and bouncy. */
  suspensionStiffness: 0.12,
  /** Damping (0-1) of the vertical spring. Higher = oscillations die
   * faster after a landing (less pogo). */
  suspensionDamping: 0.1,
  /** Stiffness (0-1) of each wheel's diagonal anti-swing strut (wheel to
   * chassis center). Stiffer than the vertical spring on purpose: it keeps
   * the wheelbase from folding fore/aft while the softer vertical spring
   * provides the suspension travel. */
  strutStiffness: 0.5,
  /** Damping (0-1) of the diagonal strut. */
  strutDamping: 0.1,

  // --------------------------------------------------------------- driving
  /** Rear-wheel spin-up per step while holding gas, rad/step per step.
   * This IS the "torque limit": more = snappier acceleration (and more
   * wheelie tendency on climbs); the wheel only ever gains this much spin
   * per tick no matter what.
   * TUNING NOTE (PLAN-02 task 4 integration, browser-measured): the
   * original 0.012 stalled at ~3 px/step — the per-step drive impulse
   * (wheel inertia x excess spin / radius) has to outrun Matter's default
   * body frictionAir (0.01) drag on the whole rig, and 0.012 balanced it
   * at a tenth of the intended top speed, leaving ramps unclimbable.
   * 0.05 reaches the maxWheelAngularVelocity-capped top speed in ~2-3s.
   * Task 6's feel-tuning pass may prefer explicit frictionAir control on
   * the bodies + a gentler spin-up instead. */
  gasSpinUpPerStep: 0.05,
  /** Cap on driven rear-wheel spin, rad/step — the easygoing top speed.
   * Flat-ground top speed ~= this x wheelRadius px/step (0.6 x 18 = 10.8
   * px/step ~= 650 px/s). More = faster bike; NORTH_STAR wants easygoing,
   * not thrilling. (Coasting downhill may exceed it — gravity is allowed
   * to be fun — the cap only limits DRIVEN spin.) */
  maxWheelAngularVelocity: 0.6,
  /** Fraction (0-1) of REAR-wheel spin removed per step while braking.
   * Higher = more abrupt stops; 0.15 stops from top speed in under a
   * second. */
  brakeDampingFactor: 0.15,
  /** The front wheel brakes at this fraction of brakeDampingFactor.
   * Load-bearing anti-endo tuning (PLAN-02 task 6, browser-measured):
   * braking BOTH wheels at full strength from top speed decelerates near
   * the friction limit (~0.95g), which is past the geometric overturn
   * threshold (~0.77g for this wheelbase/COM height) — the bike pitched
   * to ~108 degrees nose-down and balanced on its front wheel. Front
   * braking is what makes endos; keep this low. More = shorter stops but
   * more nose-dive. */
  frontBrakeFraction: 0.25,
  /** Fraction (0-1) of chassis angular velocity bled off per physics step
   * while braking ON THE GROUND — the anti-endo stability assist.
   * Browser-measured: without it, a full-brake stop from top speed
   * converted forward momentum into a pitch-over (the bike vaulted its
   * front axle to 100-200 degrees nose-down) no matter how the per-wheel
   * brake strengths were balanced. Pure damping (no upright spring), so
   * it never fights the bike's natural attitude on slopes — it only makes
   * pitch CHANGES sluggish while the brake is held. More = flatter, more
   * planted stops; too high would make crossing dips under braking feel
   * glued. */
  brakeGroundStabilization: 0.35,
  /** Wheel spin (rad/step) below which held brake starts creeping the
   * rear wheel backward instead of damping ("when stopped, mild reverse").
   * More = reverse engages while still rolling forward a little. */
  reverseEngageThreshold: 0.05,
  /** Backward spin-up per step while reverse-creeping, rad/step per step.
   * More = reverse gets going quicker. Deliberately gentler than gas. */
  reverseSpinUpPerStep: 0.004,
  /** Cap on reverse-creep wheel spin, rad/step. More = faster backup speed
   * (0.15 x 18 ~= 160 px/s, about a quarter of forward top speed). */
  maxReverseWheelAngularVelocity: 0.15,

  // ------------------------------------------- air control & easy-mode assist
  /** Chassis pitch added per step while airborne holding a pedal at FULL
   * pitch authority, rad/step per step (gas = nose up / backflip, brake =
   * nose down). Scaled by airPitchAuthority() (see bike.ts): a pedal press
   * that BEGINS mid-air (or within trickPressBufferSteps of takeoff) gets
   * authority 1 immediately — the deliberate-trick input; a pedal merely
   * held since the ground only gains authority after heldPitchDelaySteps
   * (see below). More = twitchier air control, faster flip wind-up.
   * TUNING NOTE (PLAN-02 task 6, browser-measured): the REALIZED spin is
   * well below (this x steps): the sprung wheels act as orbital inertia
   * and Matter's constraint solver bleeds chassis spin ~10%/step, so spin
   * saturates near -0.3 rad/step. 0.04 makes a full 360 backflip complete
   * within the trick kicker's ~0.55-1.0s of air (32-59 steps measured)
   * with margin; at 0.03 marginal flights landed ~350 degrees. Raised
   * from the pre-trick-mechanic 0.0025, which existed only to keep
   * full-gas hill hops from tail-planting back when held gas got full
   * pitch — held-from-ground authority is ~0 now, so grandma runs are
   * unaffected by this knob. */
  airSpinStepPerStep: 0.04,
  /** Cap on pedal-driven chassis spin while airborne, rad/step. Rarely
   * binding in practice (the wheel-orbit bleed above saturates realized
   * spin near -0.3 first) — it exists to bound violent cases (bounces,
   * long falls). More = faster max flips; accidental flips stay
   * impossible regardless because grandma inputs never reach authority 1
   * (see heldPitchDelaySteps). */
  maxAirAngularVelocity: 0.3,
  /** Airborne steps (60 Hz) a pedal HELD SINCE THE GROUND must stay
   * airborne before it starts gaining pitch authority. Keeps NORTH_STAR
   * §4's "gas also rotates nose-up in mid-air" true on genuinely long
   * airtime while making it a no-op on the ~0.3-0.6s hops natural hills
   * produce. More = grandma-safer, less held-pedal attitude control on
   * long jumps. IMPORTANT — held authority is NOT always zero: the trick
   * kicker's longest gas-only flight (59 steps measured) exceeds this
   * delay, reaching partial authority ((59-42)/heldPitchRampSteps ≈ 0.57)
   * for its final ~17 steps. What actually keeps grandma safe there is
   * the ASSIST BLEND (bike.ts weighs the stabilization assist at
   * 1-authority), which browser-measured to +16° at landing. LEVEL
   * AUTHORS (PLAN-05): jumps giving much more than ~this many steps of
   * airtime start eroding the gas-only-survives guarantee, and past
   * delay+ramp (72 steps ≈ 1.2s) a held pedal has FULL authority —
   * re-validate gas-only survival per level; don't assume this constant
   * covers arbitrary ramps. */
  heldPitchDelaySteps: 42,
  /** Airborne steps over which held-from-ground pitch authority then
   * ramps 0 -> 1 after the delay. More = gentler onset. */
  heldPitchRampSteps: 30,
  /** Consecutive grounded steps before the trick-input "air phase" ends
   * (see bike.ts isTrickAirPhase). Cresting a ramp produces sub-100ms
   * wheel micro-touches on the coarse collision chords; without this
   * debounce, a mid-air pedal press landing in one of those gaps would
   * silently lose its full pitch authority — turning the flip recipe into
   * frame-perfect wizardry (browser-measured). More = a press shortly
   * AFTER a real landing still counts as a trick press (harmless: pitch
   * is only ever applied while actually airborne). */
  trickGroundDebounceSteps: 10,
  /** "Press buffering" for trick input: a pedal press that began at most
   * this many steps BEFORE takeoff still counts as a mid-air (full pitch
   * authority) press the moment the bike leaves the ground. Humans press
   * "right at the lip" — often a few frames early; without the buffer the
   * flip only works when the press lands strictly after takeoff
   * (browser-measured: that latency alone cost ~140 degrees of rotation).
   * A pedal held from way back (a non-gamer cruising on gas) is far older
   * than this window, so accidental flips stay impossible. More = more
   * forgiving flip timing. (12 steps = 0.2s.) */
  trickPressBufferSteps: 12,
  /** Auto-stabilization spring gain: chassis spin added per step per
   * radian of tilt away from upright, while airborne with NO pedal held
   * (the NORTH_STAR "easy" assist — makes jumps land themselves). More =
   * stronger self-righting; too strong would also fight deliberate flips
   * the moment the pedal is released mid-air. */
  stabilizationGain: 0.002,
  /** Fraction (0-1) of chassis spin bled off per step while the assist is
   * active. Higher = assist settles to upright with less wobble but also
   * kills flip momentum faster once pedals are released. */
  stabilizationDamping: 0.05,

  // ------------------------------------------------- rider & head sensor
  /** Rider (Gabby) sprite center relative to chassis center, px, in the
   * chassis' local frame (rotates with it). Visual only. */
  riderOffsetX: -4,
  /** See riderOffsetX. Negative = above the chassis. Gabby's placeholder
   * is 48px tall, so -38 seats her bottom near the chassis top edge. */
  riderOffsetY: -38,
  /** Radius of the head fail-sensor circle, px. Bigger = stricter crash
   * detection (head "touches" ground earlier); smaller = more forgiving. */
  headSensorRadius: 10,
  /** Head sensor center relative to chassis center, px (local frame).
   * Matches where the rider sprite's head is drawn. */
  headOffsetX: -4,
  /** See headOffsetX. -52 puts the sensor over the top ~20px of the
   * 48px-tall rider placeholder. */
  headOffsetY: -52,
  /** Density of the head sensor part. Near-zero ON PURPOSE: the sensor is
   * part of the chassis compound body and must not shift its center of
   * mass or add meaningful inertia — it exists only to report contact. */
  headSensorDensity: 0.00001,
} as const;

/** Terrain generation & rendering tuning (PLAN-02 task 1 — see
 * src/systems/terrain.ts). All distances are px at DESIGN_WIDTH/HEIGHT
 * scale. Keep every terrain magic number here, never inline in terrain.ts,
 * per CLAUDE.md conventions. */
export const TERRAIN = {
  /** Horizontal distance between adjacent heightmap sample points, px.
   * Controls both the visual smoothness of the drawn ground and the
   * resolution `heightAt()` interpolates between. */
  sampleSpacingPx: 24,

  /** Ground surface Y (screen space) when elevation is exactly 0 — the
   * "sea level" the rolling hills oscillate above/below. Leaves headroom
   * above for sky/backdrop and below for the dirt fill down to the world
   * bottom. */
  baseGroundYPx: Math.round(DESIGN_HEIGHT * 0.72), // 518 at 720px design height

  /** Max rolling-hill amplitude (px, up AND down from baseGroundYPx) at
   * hilliness = 1 — i.e. the hilliest any of the 22 levels should ever get.
   * Kept tame so the steepest slope produced stays climbable by a bike
   * holding full gas (NORTH_STAR "easy" mandate); most levels use hilliness
   * well under 1 (difficulty ramps gently per PLAN-05). */
  maxAmplitudePx: 60,

  /** Number of stacked sine-wave octaves composing the rolling-hill shape. */
  octaves: 3,

  /** Wavelength (px) of the lowest/broadest sine octave; each subsequent
   * octave halves it (doubles the frequency), like simple fractal noise. */
  baseWavelengthPx: 900,

  /** Amplitude falloff applied to each successive (higher-frequency) sine
   * octave — e.g. 0.5 means each octave contributes half the previous
   * one's weight to the final shape. */
  persistence: 0.5,

  /** Fraction (0..1) of the amplitude budget given to the fine value-noise
   * layer vs. the broad sine octaves. Adds organic irregularity on top of
   * the rolling-hill shape so it doesn't read as a pure sine wave. */
  noiseWeight: 0.3,

  /** Horizontal spacing (px) between the value-noise layer's random control
   * points; the curve is smootherstep-interpolated between them. */
  noiseControlSpacingPx: 260,

  /** Box-blur smoothing passes applied to the combined sine+noise elevation
   * before jumps/flat-zones are layered on (per PLAN-02: "layered sine/
   * noise, smoothed"). */
  smoothingPasses: 2,

  /** Half-window size, in SAMPLES (not px), for each smoothing pass — 1
   * averages each sample with its immediate left/right neighbor (a 3-point
   * moving average). */
  smoothingHalfWindow: 1,

  /** Horizontal blend margin (px) used to ease terrain smoothly into and
   * out of a flat zone, so scripted-event ground never has a height
   * discontinuity (or slope kink) at its edges. */
  flatBlendPx: 160,

  /** Hard cap on authored jump-ramp height (px), regardless of what a level
   * config requests — keeps every jump landable/climbable at "grandma
   * difficulty" even if a level author fat-fingers a huge value. */
  maxJumpHeightPx: 140,

  /** Minimum jump-ramp width (px) — guards against a degenerate zero/near-
   * zero width producing a divide-by-zero or a razor-thin, unrideable spike. */
  minJumpWidthPx: 60,

  /** Hard cap on a jump ramp's steepest slope (dy/dx; 1 = 45 degrees).
   * A tall-but-narrow ramp request (e.g. maxJumpHeightPx over
   * minJumpWidthPx) would otherwise produce a near-vertical wall — the
   * raised-cosine ramp's steepest point has slope = height*pi/width, so
   * terrain.ts widens the ramp's effective width (never shrinks its
   * height) until this bound holds. Deliberately steeper than the ~30
   * degree max rolling-hill slope at hilliness 1 (a launch ramp is
   * SUPPOSED to feel like a ramp) but nowhere near unclimbable/vertical.
   * NOTE: bounds the ramp's OWN contribution only — jumps add on top of
   * the rolling hills, so a jump placed where hilliness-1 terrain is
   * already near its own steepest point can combine to somewhat more.
   * Real levels shouldn't stack maxed-out hilliness under a maxed-out
   * jump; re-verify against real bike climbing capability in the PLAN-02
   * task 6 feel-tuning pass, once the bike rig exists. */
  maxJumpSlope: 1, // 45 degrees

  /** Thickness (px) of each static Matter rectangle in the ground collision
   * chain, measured perpendicular to the local slope. */
  bodyThicknessPx: 24,

  /** Target length (px) of each Matter collision segment along the ground.
   * Deliberately coarser than sampleSpacingPx: NORTH_STAR §8 budgets fewer
   * than 100 physics bodies per level, so the collision chain is built from
   * far fewer, longer segments than the (denser) visual heightmap. */
  segmentTargetPx: 160,

  /** Matter friction for every ground body. High-ish so the rear wheel
   * grips rather than slides on hills; revisited when the bike rig
   * (PLAN-02 task 2) is tuned against real terrain. */
  groundFriction: 0.9,

  /** Thickness (px) of the rendered dirt/asphalt top-edge stroke. */
  edgeThicknessPx: 6,

  /** Absolute Y (screen space) the ground fill polygon is drawn down to.
   * Generous and fixed (not derived from amplitude) so it comfortably
   * covers camera zoom-out (PLAN-02 task 3) and any dip without ever
   * showing a gap under the ground. */
  groundFillBottomYPx: 2400,
} as const;

/** Camera behavior tuning (PLAN-02 task 3 — see GameScene's updateCamera).
 * The camera is driven manually every render frame (not startFollow) so the
 * lookahead offset, vertical softness, and speed-zoom can each have their
 * own smoothing rate. All lerp factors are per-render-frame fractions
 * (0..1): higher = snappier, lower = floatier. */
export const CAMERA = {
  /** Max horizontal lookahead ahead of the bike in its travel direction,
   * px, reached at full speed. More = you see further down the road but
   * the bike sits further off-center. */
  lookaheadMaxPx: 240,
  /** Smoothing (0-1, per frame) of the lookahead offset itself, so
   * flipping travel direction swings the camera over gradually instead of
   * snapping ~2x lookaheadMaxPx sideways. */
  lookaheadLerp: 0.04,
  /** Horizontal follow lerp (0-1, per frame) toward bike x + lookahead.
   * Snappier than vertical so the bike never outruns the view. */
  followLerpX: 0.15,
  /** Vertical follow lerp (0-1, per frame). Deliberately soft — rolling
   * hills bob the bike constantly and the camera must not bob with it
   * ("soft vertical damping, no jarring vertical snaps"). */
  followLerpY: 0.06,
  /** Camera center offset from the bike, px, negative = camera sits above
   * the bike so more sky/upcoming terrain is visible than dirt below. */
  verticalOffsetPx: -48,
  /** Zoom while stationary (1 = native design scale). */
  zoomMax: 1.0,
  /** Zoom at full speed — the "slight zoom-out at speed" (shows ~18% more
   * world). Keep subtle; big swings read as motion sickness. */
  zoomMin: 0.85,
  /** Zoom smoothing (0-1, per frame). Low on purpose: zoom changes should
   * be barely noticeable as they happen. */
  zoomLerp: 0.02,
  /** Speed (px/step, matching BikeHandle.speed units) treated as "full
   * speed" for lookahead/zoom normalization — the bike's driven top speed,
   * maxWheelAngularVelocity x wheelRadius (see that constant's doc). */
  fullSpeedPxPerStep: BIKE_TUNING.maxWheelAngularVelocity * BIKE_TUNING.wheelRadius,
  /** Top of the camera bounds rect, px (negative = above "sea level").
   * Generous headroom so big jump airtime never clamps the view; the
   * bottom bound is TERRAIN.groundFillBottomYPx so the camera can never
   * show below the drawn ground fill. */
  boundsTopPx: -1600,
} as const;

/** Soft-fail tuning (PLAN-02 task 4 / PLAN-08 task 3 — GameScene's crash /
 * fell-off-world handling). Restart MODEL (PLAN-08 task 3): the friendly
 * overlay shows the fail message + a "Try again" BUTTON. Tapping the button is
 * the INSTANT restart path — a tapping player still restarts well under the old
 * PLAN-02 "< 500ms" budget, which now applies to the BUTTON path (not the auto
 * path). If the player doesn't tap, a gentle no-input AUTO-restart fires after
 * autoRestartMs, giving a non-gamer time to read the friendly message and see
 * the clear tap-to-retry. Both routes funnel through ONE idempotent restart in
 * GameScene.failLevel so a restart can never fire twice. */
export const FAIL = {
  /** How far below the LOWEST terrain surface point the bike may fall
   * before it counts as "fell off the world", px. */
  worldBottomMarginPx: 500,
  /** No-input AUTO-restart delay after the fail overlay appears, ms — the
   * gentle fallback for a player who doesn't tap "Try again" (the button is the
   * instant path). Long enough to read the message; PLAN-08 task 3's
   * reconciliation of the plan's "auto-restart after 2.5s" with NORTH_STAR §4's
   * "instant restart" (the button IS the instant path, this is the courtesy
   * fallback). Replaces the old 350ms overlayDurationMs restart timing. */
  autoRestartMs: 2500,
  /** Vertical gap between the overlay message's bottom edge and the "Try again"
   * button's center, px (so the button sits a comfortable distance below the
   * message regardless of how many lines the message wraps to). */
  overlayButtonGapPx: 48,

  // ------------------------------------------------ overlay text sizing
  // The soft-fail overlay shows a message that is usually the short default
  // ("Oops! Go again 💛") but can be a much LONGER custom toast passed by a
  // PLAN-06 event's softFail — e.g. level 15's verbatim
  // "They got us!! ...let's pretend that didn't happen 🚔" (~50 chars). At the
  // fixed 40px pixel font a string that long overflows DESIGN_WIDTH, so the
  // overlay both word-wraps AND drops to a smaller size for long messages.
  // (The text is scrollFactor-0 and scales with camera zoom; the tightest fit
  // is at CAMERA.zoomMax = 1.0 — a fail at speed is zoomed OUT, giving more
  // room — so the wrap width is sized against DESIGN_WIDTH, the zoom-1 case.)
  /** Overlay font size for a SHORT message, px (the pre-PLAN-06 default —
   * the short default toast keeps rendering exactly as before). */
  overlayFontSizePx: 40,
  /** Overlay font size for a LONG message (length > overlayLongThresholdChars),
   * px — smaller so wrapped lines stay legible and fully on-screen. */
  overlayLongFontSizePx: 24,
  /** Message length (chars) above which the smaller overlay font is used.
   * The short default ("Oops! Go again 💛") sits under this; the L7/L15
   * custom toasts sit above it. */
  overlayLongThresholdChars: 24,
  /** Horizontal margin (each side) between the overlay text's word-wrap box
   * and the DESIGN_WIDTH edges, px. Wrap width = DESIGN_WIDTH - 2*this. */
  overlayWrapMarginPx: 100,
} as const;

/** Overlay font size for a soft-fail message — the smaller size once the
 * message is long enough to risk overflow, else the default. Pure (no Phaser),
 * exported so it's unit-testable in Node and GameScene has no inline magic. */
export function failOverlayFontSizePx(message: string): number {
  return message.length > FAIL.overlayLongThresholdChars
    ? FAIL.overlayLongFontSizePx
    : FAIL.overlayFontSizePx;
}

/** Generic soft-fail message POOL (PLAN-08 task 3). Shown for a GENERIC fail —
 * a head crash or falling off the world (GameScene.failLevel called with NO
 * message). A SPECIAL fail (level-7 traffic / level-15 police) passes its own
 * verbatim message through failLevel and never draws from this pool.
 *
 * "Oops! Go again 💛" is quoted VERBATIM in NORTH_STAR §4, so it is locked-in
 * personal content (CLAUDE.md Rule 4) and MUST stay in the pool; the other two
 * are free copy. The yellow-heart emoji is the \u{1F49B} code-point escape so
 * this file stays ASCII — matching traffic.ts / police.ts's message discipline
 * and byte-guarded in tests/constants.test.ts. */
export const FAIL_MESSAGES = [
  'Oops! Go again \u{1F49B}',
  'So close!! One more time',
  'Even MotoGP riders crash sometimes \u{1F49B}',
] as const;

/** Pick a random generic soft-fail message from FAIL_MESSAGES. Pure — inject a
 * deterministic `rng` (0 ≤ rng() < 1) in tests; defaults to Math.random. The
 * index is clamped to the last element so an injected rng returning exactly 1
 * can never overflow the array (Math.random itself never returns 1). Used by
 * GameScene.failLevel for a GENERIC fail. */
export function pickFailMessage(rng: () => number = Math.random): string {
  const index = Math.min(FAIL_MESSAGES.length - 1, Math.floor(rng() * FAIL_MESSAGES.length));
  return FAIL_MESSAGES[index];
}

/** Debug overlay tuning (PLAN-02 task 5 — GameScene's dev-only debug
 * overlay, toggled with the backtick/tilde key; it moved off D in PLAN-03
 * task 1 when D became a gas key). The overlay itself is stripped from
 * production bundles via `import.meta.env.DEV` (same pattern as the
 * `__gabbyGame` exposure in main.ts) — these are just its presentation
 * knobs, kept here per CLAUDE.md's "no magic numbers in scene code". */
export const DEBUG_OVERLAY = {
  /** Pixel-font size, snapped to the 8px grid (see snapFontSize). Small on
   * purpose — a corner readout, not a HUD. */
  fontSizePx: 8,
  /** Distance from the top-left screen corner, px (both axes). */
  marginPx: 8,
  /** Matter's fixed physics tick rate, Hz — converts BikeHandle.speed (px
   * per physics STEP, see bike.ts) to px per SECOND for a human-readable
   * readout. Matches bike.ts's BEFORE_UPDATE_EVENT doc: Phaser's Matter
   * world always steps at a fixed 1000/60 ms regardless of display refresh
   * rate, so this is a true constant, not a tuning knob. */
  physicsStepsPerSecond: 60,
} as const;

/** Touch-pedal HUD tuning (PLAN-03 task 2 — see src/systems/pedals.ts). The
 * pedals are the on-screen gas/brake control shown ONLY on touch-capable
 * devices (see device.ts isTouchDevice — maxTouchPoints AND a coarse
 * pointer); a pure-desktop build creates none.
 *
 * ART NOTE: the faces here are PLACEHOLDER primitives in the repo's chunky
 * pixel style (cream face + dark outline + drop shadow, exactly like ui.ts's
 * buttons) with a directional glyph — a right-pointing triangle for GAS
 * (forward) and a solid square "stop" for BRAKE. Real pixel-art pedals land
 * in PLAN-10; swap the drawing in pedals.ts, not these layout knobs.
 *
 * All lengths are px at the 1280x720 DESIGN scale AND are the FIXED
 * on-screen geometry: because the play camera ZOOMS (CAMERA.zoomMin..zoomMax)
 * and the pedals are screen-anchored (scrollFactor 0), pedals.ts counter-
 * positions and counter-scales them every frame (see PedalsHandle.layout +
 * zoomCompensatedPosition) so they hold this exact size/position on screen
 * regardless of zoom. */
export const PEDALS = {
  /** Visible pedal face size (a square), px. The plan mandates >= 120 px
   * visible; 144 is chunky-thumb-friendly and sits on the 8px pixel grid.
   * Bigger = easier to hit but more screen real-estate eaten. */
  visibleSizePx: 144,
  /** Gap from the pedal face to the two screen edges it hugs (the bottom
   * edge and its near side), px. */
  marginPx: 36,
  /** Invisible hit-Zone width, px — the "whole bottom corner" region, far
   * wider than the visible face so a stray thumb still registers a press.
   * Kept under half the design width (640) so the two corners never overlap
   * in the middle (a mid-screen touch belongs to neither pedal). */
  hitRegionWidthPx: 480,
  /** Invisible hit-Zone height, px — the bottom band each pedal responds in
   * (generous, taller than the visible face). */
  hitRegionHeightPx: 300,
  /** Downward travel of the face + glyph while pressed, px — the tactile
   * "pushed down onto its shadow" shift (mirrors ui.ts's button press). */
  pressOffsetPx: 6,
  /** Drop-shadow offset beneath the face, px (the chunky pixel depth). Equal
   * to pressOffsetPx on purpose, so a pressed face lands flush on its
   * shadow, reading as fully depressed. */
  shadowOffsetPx: 6,
  /** Face outline stroke width, px (matches the chunky ui.ts look). */
  outlineWidthPx: 4,
  /** Directional glyph bounding-box size, px (triangle for gas / square for
   * brake), drawn centered on the face. */
  glyphSizePx: 72,
} as const;

/** Z-depth layers for rendering order. */
export const DEPTHS = {
  background: 0,
  terrain: 10,
  props: 20,
  pickups: 30,
  bike: 40,
  rider: 50,
  fx: 60,
  hud: 100,
  ui: 110,
  overlay: 120,
} as const;

/** Persistent passenger (Caleb) tuning (PLAN-06 Task A — see
 * src/systems/passenger.ts). Caleb rides pillion BEHIND Gabby once picked up
 * (level 12) and thereafter (13-22, derived from save progress). He is a
 * PURELY COSMETIC sprite — ZERO Matter bodies, no mass/handling change
 * (NORTH_STAR §8 body budget + PLAN-06 "handling must not get harder"). Each
 * frame the sprite is pinned to a chassis-local offset rotated into world
 * space (mirroring bike.ts syncSprites' rider block) plus a small independent
 * vertical bob. Offsets are px in the chassis' LOCAL frame (rotate with it).
 *
 * `offsetX` is more negative than BIKE_TUNING.riderOffsetX (-4) so Caleb sits
 * FURTHER BACK than Gabby; `depth` is DEPTHS.rider - 1 so Gabby (on
 * DEPTHS.rider) overlaps/draws in front of him — she's the one driving. */
export const PASSENGER = {
  /** Caleb sprite center x relative to chassis center, px (local frame).
   * Behind Gabby (more negative than riderOffsetX). */
  offsetX: -24,
  /** Caleb sprite center y relative to chassis center, px (local frame).
   * Negative = above the chassis; slightly lower than Gabby's -38 so her
   * head reads above his. */
  offsetY: -34,
  /** Vertical bob amplitude, px — a subtle independent sway so the pillion
   * reads as alive, not welded on. Small on purpose. */
  bobAmplitudePx: 2,
  /** Full bob cycle period, ms. */
  bobPeriodMs: 900,
  /** Render depth: just behind the rider so Gabby overlaps Caleb. */
  depth: DEPTHS.rider - 1,
} as const;

/** Level 7 "invisible cars" traffic tuning (PLAN-06 Task 1 — see
 * src/systems/traffic.ts). The FEEL/geometry of the hazard lives here; the
 * per-encounter LAYOUT (how many cars, how fast, where the encounters sit,
 * telegraph time) is authored per-level in level07.ts's TrafficEvent so the
 * one traffic level can be tuned without touching this block.
 *
 * MODEL (see traffic.ts / PLAN06 design brief): cars are pooled plain Images
 * with ZERO Matter bodies. Each car is assigned a fixed world "encounter
 * centre"; it travels LEFT toward Gabby, harmless in the FAR (oncoming) lane
 * until it nears the centre, DRIFTS DOWN into the player's NEAR lane across a
 * window, then drifts back OUT and continues past. Collision is a MANUAL JS
 * overlap: only while the car is descended into the near lane (lane fraction
 * >= collisionLaneThreshold) AND horizontally within collisionHalfWidthPx of
 * the bike. The danger is therefore anchored to a fixed stretch of road, so
 * the player can ALWAYS hang back (brake) left of it and let the car sweep
 * through, or punch through before it drops — every encounter is avoidable.
 * All lengths px at the 1280x720 DESIGN scale; per-frame speeds are px per
 * render frame (the config's carSpeedPxPerFrame). */
export const TRAFFIC = {
  /** Half-width (px) of a car's near-lane window around its encounter centre:
   * the car is (partly) in the near lane while within this of the centre. */
  zoneHalfPx: 260,
  /** Drift band width (px) at each edge of the window over which a car eases
   * between the far and near lane (lane fraction ramps 0->1 across it). A car
   * within zoneHalfPx - driftPx of the centre is FULLY in the near lane. */
  driftPx: 130,
  /** Manual-collision half-width (px): a hit needs |car.x - bike.x| within
   * this. Deliberately narrower than the summed sprite half-widths (car 55 +
   * bike 48 = 103) so a near miss doesn't kill — the EASY mandate. */
  collisionHalfWidthPx: 70,
  /** Minimum lane fraction (0 far .. 1 near) at which a car can hit. 0.5 =
   * only once it's at least halfway down into the near lane, so a car merely
   * grazing the fringe of the drift band is harmless. */
  collisionLaneThreshold: 0.5,
  /** How far before an encounter centre (px) the bike must reach for that
   * encounter's car to spawn. Chosen with carSpeed/telegraph so a constant
   * full-gas player CROSSES the near lane while the car is in it (level 7 is
   * the one level gas-only doesn't clear — you brake to dodge), while a player
   * who hangs back always clears it. Used by DEFAULT (brake-to-dodge) encounters. */
  triggerLeadPx: 2100,
  /** Shorter trigger lead for encounters listed in the config's
   * `punchThroughIndices`: the car spawns when the bike is already close, so a
   * confident player at speed can ACCELERATE THROUGH the gap before the car
   * drops into the near lane (the plan's second dodge mechanic). These stay
   * avoidable by braking too — just no longer force it. Adds pacing/variety and
   * keeps confident play inside NORTH_STAR's 20-45s window. Kept >= a cautious
   * player's braking distance (~900px) so these stay safely brakeable too, and
   * short enough that a punch is safe from a modest ~6.5 px/step arrival. */
  punchTriggerLeadPx: 1000,
  /** Extra px added past the telegraph distance when spawning a car to the
   * right of its encounter, so it comfortably starts fully off in the far
   * lane before the >=3s telegraph begins. */
  spawnBufferPx: 100,
  /** A car is recycled (returned to the pool, hidden) once it has travelled
   * this far LEFT past the bike, px — well off the left of the screen. */
  recycleBehindPx: 1300,
  /** Fixed sprite pool size. Cars recycle through it; sized comfortably above
   * the worst-case simultaneously-active count (~3 near an encounter with the
   * level07 spacing) so a spawn never has to be dropped. */
  poolSize: 5,
  /** Near-lane car-centre height above the ground surface, px (down on the
   * road, in the bike's path). */
  nearLaneOffsetPx: 34,
  /** Far-lane (oncoming/telegraph) car-centre height above the surface, px —
   * higher up / further back so the two lanes read as distinct. */
  farLaneOffsetPx: 150,
  /** Sprite alpha in the far lane (dimmed = "further away", the telegraph). */
  farLaneAlpha: 0.55,
  /** Sprite alpha once fully in the near lane (solid = in your lane). */
  nearLaneAlpha: 1,
  /** Physics/render frame rate used to convert the config's telegraph time
   * (ms) into a spawn distance at carSpeedPxPerFrame. Matches the fixed 60 Hz
   * tick (see DEBUG_OVERLAY.physicsStepsPerSecond). */
  fps: 60,
  /** 5 tints cycled across the pooled car sprites for variety (the tex-car
   * placeholder is a solid mint block). Cosmetic only. */
  tints: [PALETTE.coral, PALETTE.sky, PALETTE.sunshine, PALETTE.lavender, PALETTE.riverTeal],
} as const;

/** Level 12 "Picking Up Caleb" pickup-cutscene tuning (PLAN-06 Task 2 — see
 * src/systems/pickup.ts). Level 12 stops mid-level at Caleb's house: as the bike
 * reaches the pickup x it AUTO-BRAKES to a stop (via EventContext.setInputOverride
 * — NOT a Matter force), Caleb runs over and hops on, then control returns and he
 * rides pillion for the rest of the game. The whole beat is a GIFT, never a fail:
 * the cutscene can never crash/soft-fail the player.
 *
 * The house/mailbox/standing-Caleb are plain non-Matter GameObjects (ZERO Matter
 * bodies — NORTH_STAR §8 budget), with their placeholder DRAWING dimensions kept
 * as local documented consts in pickup.ts (decorations.ts precedent); the GAMEPLAY
 * tunables — trigger window, stop threshold, cutscene/particle/toast timing — live
 * here. `stopWindowPx` is the DEFAULT; level12.ts's CalebPickupEvent may override it. */
export const PICKUP = {
  /** How near (px, to the LEFT of) the pickup x the bike must reach for the
   * cutscene to begin auto-braking. Chosen so braking starts INSIDE level 12's
   * {5750,6750} pickup flat zone (trigger at pickupX - this = 6250-380 = 5870)
   * and the bike stops comfortably within it. */
  stopWindowPx: 380,
  /** Bike speed (px per physics STEP — matches BikeHandle.speed units) at/below
   * which the auto-braked bike counts as "stopped" and the hop beat begins.
   * Above the brake's tiny reverse-creep so the near-zero crossing is caught. */
  stopSpeedPxPerStep: 2,
  /** How long Caleb takes to run/slide to the bike and hop on, ms — the core of
   * the ~1.5-2.5s beat. Control returns (passenger activated) when it elapses. */
  hopDurationMs: 1800,
  /** Tiny heart particle: how long it floats up + fades, ms. */
  heartRiseMs: 900,
  /** Tiny heart particle: how far it floats up, px. */
  heartRisePx: 64,
  /** "Caleb hopped on!!" toast: fully-visible hold before it fades, ms. Kept
   * longer than hopDurationMs so the toast is still up when control returns. */
  toastHoldMs: 2400,
  /** "Caleb hopped on!!" toast: fade-out duration after the hold, ms. */
  toastFadeMs: 600,
} as const;

/** Level 15 "City Boulevard" police-chase tuning (PLAN-06 Task 3 — see
 * src/systems/police.ts). A single plain Image cop (ZERO Matter bodies —
 * NORTH_STAR §8 budget) pursues from behind with a RUBBER-BAND speed law: each
 * fixed 60 Hz step the cop advances toward the bike at
 * min(recent-player-forward-speed + catchupBonus, hardCap), where
 * hardCap = copMaxSpeedFrac x the bike's full-gas FLAT top speed
 * (BIKE_TUNING.maxWheelAngularVelocity x wheelRadius = 10.8 px/step). For the
 * EASY mandate ("the cop can NEVER catch a gas-holding player") the hard cap must
 * sit below the level's *sustained gas-only cruise on its actual rolling terrain*
 * — which is well under the flat top speed (browser-measured ~7.9 px/step on
 * level 15, dipping to ~5.9 on climbs) — so copMaxSpeedFrac is tuned per level
 * accordingly (0.45 here), NOT merely < 1. Then HOLDING GAS always out-runs the
 * cop even mid-climb; only stopping/crashing/long-slow lets it close. Caught =
 * within catchDistancePx CONTINUOUSLY for > catchTimeMs → a friendly verbatim
 * soft-fail + instant restart.
 *
 * This block holds the FEEL/timing knobs shared across any police level; the
 * per-chase PURSUIT tunables (startBehindPx, catchDistancePx, catchTimeMs,
 * copMaxSpeedFrac, catchupBonusPxPerFrame) are authored per-level in
 * level15.ts's PoliceEvent (police.ts supplies a default for any omitted one).
 * The cop/lights/puff placeholder DRAWING dimensions stay as local documented
 * consts in police.ts (decorations.ts / pickup.ts precedent). Speeds are px per
 * fixed 60 Hz step; times are ms. */
export const POLICE = {
  /** Fixed physics/step rate used to convert the rolling-average WINDOW and the
   * per-step cop displacement to/from wall-clock time. Matches the 60 Hz tick
   * (see DEBUG_OVERLAY.physicsStepsPerSecond) so cop motion is refresh-
   * independent — identical wall-clock behavior at 30/60/120 Hz. */
  fps: 60,
  /** Window (ms) of the rolling average the rubber-band tracks the player's
   * forward speed over. ~0.5s smooths gentle-hill/bump speed ripple without
   * lagging so far that a genuine stop is ignored. */
  speedAvgWindowMs: 500,
  /** Alternating red/blue light-bar flash half-period, ms (~250 → the two
   * lights swap ~4x/s, a classic siren blink). Cosmetic only. */
  lightFlashPeriodMs: 250,
  /** Escape finale (onFinish): ms GameScene holds AFTER the bike crosses the
   * finish before the LevelComplete hand-off, so the spin-out + "WOOHOO!" toast
   * are visible. Comfortably longer than every finale animation below. */
  finaleHoldMs: 1200,
  /** Cop spin-out tween duration, ms — the cop rotates + drifts as it loses
   * you. Self-driving (a tween): update() is NOT called after finish. */
  finaleSpinMs: 700,
  /** "WOOHOO!" toast: fully-visible hold before it fades, ms. */
  finaleToastHoldMs: 700,
  /** "WOOHOO!" toast: fade-out duration after the hold, ms. */
  finaleToastFadeMs: 400,
  /** Spin-out puff burst: how long it expands + fades, ms. */
  finalePuffMs: 800,
} as const;

/** Level 22 "The Party" ARRIVAL tuning (PLAN-09 task 1 / ST-5 — see
 * src/systems/arrival.ts). NORTH_STAR §5 row 22: the final level "ends at the
 * party venue -> transitions to PartyScene". Instead of the normal complete
 * screen, the last stretch is a scripted beat: as Gabby nears the venue the
 * cutscene TAKES THE PEDALS (EventContext.setInputOverride — never a Matter
 * force), rides her in whatever her speed, slows her to a walking pace so she
 * rolls up to the doors, and then — once she crosses the finish flag — the
 * doors open, warm light spills out, Gabby and Caleb get off the bike and walk
 * into the doorway together, and the light takes the screen and hands off to
 * PartyScene.
 *
 * THE WHOLE BEAT IS A GIFT AND CAN NEVER FAIL THE PLAYER: it never calls
 * softFail, and because it drives the pedals itself it carries in a player who
 * has STOPPED DEAD as readily as one arriving flat out.
 *
 * ZERO Matter bodies (level 22 is the tightest level in the game at 99/100 —
 * see PROGRESS.md): the venue, doors, light spill, the two standing figures and
 * the two wash rectangles are all plain GameObjects. The placeholder DRAWING
 * dimensions of the venue/figures stay as local documented consts in arrival.ts
 * (decorations.ts / pickup.ts / police.ts precedent); what lives here is the
 * GEOMETRY relative to the finish flag, the approach speed, and the finale
 * pacing. Distances are px at the 1280x720 DESIGN scale (world px for the
 * geometry); speeds are px per fixed 60 Hz physics STEP (BikeHandle units);
 * times are ms.
 *
 * ONE SPLIT WORTH KNOWING ABOUT: the dismount CHOREOGRAPHY is deliberately in
 * two homes. Its TIMING (hopOffDelayMs / gabbyOffDelayMs / hopDownMs /
 * walkInDelayMs / walkInMs) is here, because pacing is feel; its GEOMETRY —
 * where the two figures land and stop, arrival.ts's ARRIVAL_DISMOUNT_OFFSETS —
 * is not, because those px are tuned against the 24x48 PLACEHOLDER sprite
 * widths and the placeholder doorway they stand in, and they move with that art
 * when PLAN-10 replaces it. Same rule the venue's own drawing dimensions follow.
 *
 * GEOMETRY, left to right (arrivalGeometry() derives all three from finishX;
 * tests/arrival.test.ts pins the ordering):
 *   finishX - rideInLeadPx  -> the cutscene takes the pedals and holds GAS
 *   finishX - crawlLeadPx   -> it starts holding crawlSpeedPxPerStep instead
 *   finishX                 -> the flag; GameScene ends the run, onFinish plays
 *   finishX + doorAheadOfFinishPx -> the venue doorway she coasts up to
 * `rideInLeadPx` and `doorAheadOfFinishPx` are DEFAULTS; level22.ts's
 * PartyArrivalEvent authors both explicitly and may override them. */
export const ARRIVAL = {
  /** How far BEFORE the finish flag the scripted ride-in takes control, px.
   * ~1.2s at the browser-measured gas-only cruise of ~9.5 px/step (~570 px/s).
   *
   * BOUNDED AT THE TOP BY WHAT IS ON SCREEN, not by feel: the camera leads the
   * bike by roughly half the viewport, so at 900 (the first value) the pedals
   * were taken while the venue was still ~200px off the right edge — the player
   * lost control looking at empty road, and the module's own "the venue is
   * already standing there ahead of them" was aspirational. Trimmed so the venue
   * is IN FRAME at the takeover. Bounded at the bottom by the gift guarantee: it
   * is also the window in which a player who has rolled to a stop still gets
   * carried in, so shorter is not free. */
  rideInLeadPx: 660,
  /** How far before the finish flag the ride-in stops accelerating and starts
   * holding `crawlSpeedPxPerStep`, px. Comfortably longer than the bike's
   * braking distance from its gas-only cruise (BIKE_TUNING.brakeDampingFactor
   * stops it from full speed in under a second), so she is already at walking
   * pace when she crosses the flag. */
  crawlLeadPx: 360,
  /** The approach speed the crawl holds, px per physics STEP (BikeHandle.speed
   * units; the bike's full-gas top speed is 10.8 — see
   * BIKE_TUNING.maxWheelAngularVelocity). This is the ONE number that decides
   * where she comes to rest, and it is only tunable EMPIRICALLY: past the flag
   * GameScene forces both pedals false (the run has ended), so she free-coasts
   * and nothing can steer where she stops — only the speed she crosses at. At
   * this value she crosses at roughly this speed and coasts on past the flag
   * before stopping (browser-measured; a run reports its actual crossing speed
   * and `restX` — see scripts/playtest-arrival.mjs). Do NOT reason about that
   * distance from frictionAir alone: rolling resistance and the suspension bleed
   * it far faster than air drag would.
   *
   * RAISED from 1.8 for COMPOSITION, not for pace: at 1.8 she coasted only
   * ~70px past the flag, which parked the race-finish FLAG right in the middle
   * of the arrival tableau — a checkered marker standing beside the bike through
   * every dismount and walk frame. Coasting further leaves the flag behind her
   * at the edge of frame where it belongs. Higher still would run her into (and
   * eventually past) the doors, and shortens the walk. */
  crawlSpeedPxPerStep: 3,
  /** Minimum FORWARD speed (px per physics step) the bike must already have for
   * the ride-in to take the pedals at all — the same "grounded and actually
   * moving" trigger shape wheelieRider.ts uses.
   *
   * IT EXISTS TO AVOID MAKING THINGS WORSE. Slamming forced GAS on from a dead
   * stop part-way up one of level 22's climbs can stall the bike or loop it out,
   * and — the part that matters — the override then denies the player the very
   * recovery they would otherwise use, rolling back for a run-up. So below this
   * the cutscene simply does not engage: the player keeps full control, gets
   * themselves going as they would anywhere else in the game, and the takeover
   * fires the moment they are moving at least as fast as the ride-in itself
   * intends to travel. Set to crawlSpeedPxPerStep for exactly that reason.
   *
   * NOTHING IS LOST IF IT NEVER FIRES: a player who crawls all the way to the
   * flag under their own power still gets the whole finale, because onFinish()
   * opens the venue itself if the crawl never did. The ride-in is a flourish on
   * the way in, not a prerequisite for the party. */
  takeoverMinSpeedPxPerStep: 3,
  /** How far PAST the finish flag the venue's doorway centre sits, px. Bounded
   * by the runway the level actually has: LEVEL.finishMarginPx of ground exists
   * past the flag, and the venue facade is drawn AROUND this point, so this plus
   * half of arrival.ts's VENUE_WIDTH_PX must stay inside it — asserted against
   * both real values in tests/arrival.test.ts rather than checked by eye. */
  doorAheadOfFinishPx: 340,

  // ------------------------------------------------------------ the ride-in
  /** Door-opening tween duration, ms — both panels swing outward together.
   * Kicked off when the CRAWL begins (before the flag), so the venue opens up
   * ahead of her as she rolls in rather than only after the run ends. */
  doorsOpenMs: 900,
  /** The warm pool of light spilling out of the open doors: how long it takes
   * to bloom from nothing to full, ms (runs with the doors). Its SHAPE — three
   * nested translucent ellipses whose composed falloff is what makes it read as
   * light rather than as a rug — is placeholder art and lives in arrival.ts. */
  lightSpillMs: 1100,

  // --------------------------------------------------------------- the finale
  // Everything below runs AFTER the finish flag, so it must be SELF-DRIVING
  // (tweens + timed events): GameScene stops calling handle.update() the instant
  // the run ends — see EventContext.isEnded's doc.
  /** Delay after the finish before CALEB hops off the back, ms. He goes first —
   * the pillion always gets off before the rider does. */
  hopOffDelayMs: 300,
  /** Delay after the finish before GABBY gets off her own bike, ms. Late enough
   * that Caleb has already LANDED and stepped clear (hopOffDelayMs + hopDownMs),
   * so the two dismounts read as a sequence instead of two sprites tangled
   * together over the bike. Pinned against that sum by tests/arrival.test.ts. */
  gabbyOffDelayMs: 700,
  /** How long each hop from the bike down to the road takes, ms (shared — they
   * dismount identically, just a beat apart). */
  hopDownMs: 340,
  /** Delay after the finish before they BOTH set off for the doorway, ms — one
   * shared beat rather than each walking the moment they land.
   *
   * THAT SHARED START IS THE WHOLE POINT: they land the same distance from the
   * door and walk for the same duration, so starting together is what actually
   * makes them cross the forecourt side by side. Chaining each walk onto its own
   * landing instead (the first attempt) let Caleb — who lands first — overtake
   * Gabby and lead her in for most of the way, which screenshot-caught as the
   * two of them straggling rather than arriving together. Must be at least
   * gabbyOffDelayMs + hopDownMs so nobody sets off before they have landed;
   * pinned by tests/arrival.test.ts. */
  walkInDelayMs: 1120,
  /** How long that walk into the doorway takes (fading out as they step
   * inside), ms. */
  walkInMs: 950,
  /** Delay after the finish before the warm light wash starts taking the
   * screen, ms. Long enough that BOTH of them are all the way inside first —
   * the light swells after they arrive, it does not cover their arrival
   * (pinned by tests/arrival.test.ts against the end of the shared walk). */
  washDelayMs: 2150,
  /** Warm light-wash fade-in duration, ms — the doors' light filling the frame. */
  washFadeMs: 700,
  /** After the warm wash peaks, a second wash in PartyScene's own night sky
   * (PALETTE.duskIndigo) fades in over this, ms, so the cut into the party is a
   * match on colour instead of a flash. */
  duskFadeMs: 320,
  /** ms GameScene holds the PartyScene hand-off after the finish (the value
   * onFinish returns), so the whole finale is visible. MUST exceed
   * washDelayMs + washFadeMs + duskFadeMs — pinned by tests/arrival.test.ts
   * rather than restated as arithmetic here — with room to spare, so the screen
   * SETTLES on PartyScene's own night sky for a breath before the party appears
   * rather than cutting on the last frame of the fade. */
  finaleHoldMs: 3450,
} as const;

/** Pixel font family (to be loaded in a later plan). */
export const FONT_FAMILY_PIXEL = 'Press Start 2P';

/** Full CSS font-family stack with fallbacks. */
export const FONT_STACK_PIXEL = "'Press Start 2P', 'Courier New', monospace";

/** Press Start 2P is drawn on an 8px grid; sizes off that grid blur/shimmer
 * at non-integer sub-pixel scales. */
export const FONT_PIXEL_GRID_PX = 8;

/** Snaps a requested font size to the pixel font's 8px design grid:
 * rounds to the nearest multiple of FONT_PIXEL_GRID_PX, minimum one grid
 * step (8px). Pure function — unit-tested in tests/ui.test.ts. Lives here
 * (not ui.ts) so tests can import it without pulling Phaser into node. */
export function snapFontSize(sizePx: number): number {
  return Math.max(
    FONT_PIXEL_GRID_PX,
    Math.round(sizePx / FONT_PIXEL_GRID_PX) * FONT_PIXEL_GRID_PX
  );
}

/** Minimum touch-target size in pixels per project quality bar. */
export const UI_MIN_TOUCH_PX = 88;

/** Pause menu + HUD pause-button tuning (PLAN-03 task 5 — see
 * src/scenes/PauseScene.ts and GameScene's ⏸ button). All lengths are px at
 * the 1280x720 DESIGN scale.
 *
 * The ⏸ button is a screen-anchored HUD control (scrollFactor 0) that must
 * hold a FIXED on-screen spot while the play camera zooms
 * (CAMERA.zoomMin..zoomMax); GameScene counter-positions/-scales it every
 * frame with the SAME zoomCompensated* helpers the touch pedals use (a
 * scrollFactor-0 object otherwise drifts inward/shrinks as the camera zooms
 * out). Keep the FACE small (a corner glyph, not a pedal) but the invisible
 * hit target >= UI_MIN_TOUCH_PX so it's still a genuine tap target.
 *
 * The pause MENU itself lives on a separate PauseScene whose camera is plain
 * zoom-1, so its title/buttons use design coords directly (no compensation). */
export const PAUSE = {
  /** Visible ⏸ button face size (a square), px. Small on purpose. */
  buttonSizePx: 64,
  /** Gap from the top-left screen corner to the button face's near edges, px.
   * The dev-only debug overlay also anchors top-left (DEBUG_OVERLAY.marginPx)
   * but is stripped from production, so a minor dev-build overlap is fine. */
  buttonMarginPx: 16,
  /** Invisible interactive hit-target size (a square), px — concentric with
   * the smaller face so the corner control stays a full-size tap target. */
  hitSizePx: UI_MIN_TOUCH_PX,
  /** ⏸ glyph: width of each of the two vertical bars, px. */
  glyphBarWidthPx: 10,
  /** ⏸ glyph: height of each bar, px. */
  glyphBarHeightPx: 34,
  /** ⏸ glyph: gap between the two bars, px. */
  glyphBarGapPx: 12,
  /** Face outline stroke width, px (chunky pixel look, matches ui.ts/pedals). */
  outlineWidthPx: 4,
  /** Drop-shadow offset beneath the face AND the downward travel of the face+
   * glyph while pressed, px — equal so a pressed face lands flush on its
   * shadow (mirrors ui.ts's button press). */
  shadowOffsetPx: 4,
  /** Alpha (0-1) of the full-screen dim rectangle drawn over the frozen game
   * behind the pause menu, so the paused scene still shows through. */
  dimAlpha: 0.6,
  /** Pause-menu title center Y, px (design space). */
  titleY: 200,
  /** Top (first) menu-button center Y, px; the three stack downward. */
  firstButtonY: 348,
  /** Vertical spacing between stacked menu-button centers, px. */
  buttonSpacingY: 112,
  /** Menu-button minimum face width, px, so the three read as a tidy stack. */
  buttonMinWidth: 320,
} as const;

/** Trick/tulip system tuning (PLAN-07 task 1 — see src/systems/tricks.ts).
 * Landing a full airborne flip awards a tulip (NORTH_STAR §4 "Tricks &
 * tulips"): the bike rig (bike.ts) already accumulates signed chassis
 * rotation per air phase (BikeHandle.airborneRotation, reset at TAKEOFF),
 * and tricks.ts reads it on the landing step — an award needs |rotation| >=
 * flipThresholdDeg, n flips at n*fullFlipDeg - (fullFlipDeg -
 * flipThresholdDeg). Tulips persist via save.ts (gabby22.tulips) and render
 * as a bouquet HUD in the TOP-RIGHT corner that grows with the count
 * (single tulip -> small bunch -> full bouquet). Purely sentimental — no
 * spending, no shop, ZERO Matter bodies.
 *
 * The bouquet HUD is screen-anchored (scrollFactor 0) and, like the touch
 * pedals and the ⏸ button, zoom-counter-transformed every render frame
 * (zoomCompensated* helpers) so it holds its on-screen corner as the play
 * camera zooms. The placeholder DRAWING dimensions (tulip cluster fan
 * offsets, toast/count font sizes, arc start point) stay as local
 * documented consts in tricks.ts (decorations.ts / pickup.ts / police.ts
 * precedent — PLAN-10 replaces the art); the FEEL/timing/threshold knobs
 * live here. Times are ms; angles are degrees. */
export const TRICKS = {
  /** Minimum |airborne rotation| (degrees) that lands ONE flip. Forgiving on
   * purpose (330, not 360): the auto-stabilization assist settles the last
   * few degrees after touchdown, so a human-landed 360 typically reads
   * ~330-380 at the landing step (PLAN-02 measured real backflips at
   * -376/-508). Also sets the per-extra-flip grace: n flips need
   * n*fullFlipDeg - (fullFlipDeg - this) — e.g. 330 -> 1, 690 -> 2. */
  flipThresholdDeg: 330,
  /** Degrees in one full flip. A true constant (never tune this one) — named
   * so the award rule reads as geometry, not magic. */
  fullFlipDeg: 360,
  /** "Backflip!! 🌷" / "Frontflip!! 🌷" toast: fully-visible hold before it
   * fades, ms. Short — a flip is a mid-drive beat, not a cutscene. */
  toastHoldMs: 1200,
  /** Toast fade-out duration after the hold, ms. */
  toastFadeMs: 500,
  /** Tulip arc: how long one awarded tulip sprite takes to fly from the
   * screen center up to the bouquet corner, ms. */
  arcDurationMs: 700,
  /** Extra launch delay per additional tulip when one landing awards several
   * (a multi-flip), ms — they chase each other to the corner instead of
   * stacking into one sprite. */
  arcStaggerMs: 140,
  /** Gap from the top-right screen corner to the bouquet HUD's bounding
   * edges, px. The SAME margin as the ⏸ button's top-left corner gap, so the
   * two corner HUD controls read as one system. */
  hudMarginPx: PAUSE.buttonMarginPx,
  /** Tulip count at which the single-tulip icon grows into the small bunch. */
  bunchAtCount: 3,
  /** Tulip count at which the bunch grows into the full bouquet ("~10+"). */
  bouquetAtCount: 10,
  /** Bouquet "pop" when an arced tulip arrives: peak scale of the cluster. */
  popScale: 1.25,
  /** Bouquet pop: how long the scale settles back to 1, ms. */
  popMs: 220,
} as const;

/** Level 11 "Highway On-Ramp" wheelie-rider easter egg (PLAN-07 task 2 — see
 * src/systems/wheelieRider.ts). NORTH_STAR §5 row 11: a guaranteed,
 * NON-INTERACTIVE cameo — an all-black rider in a black helmet wheelies past
 * on a yellow motorcycle, then rides off ahead. Never explained in-game, never
 * appears on any other level (src/levels/types.ts's REQUIRED_EVENTS locks the
 * `wheelieRider` event to level 11 only).
 *
 * MODEL (see wheelieRider.ts): the egg fires ONCE per run, armed the instant
 * the bike is at/past the event's trigger x AND grounded AND moving (never
 * mid-air, never while stationary). On trigger it spawns OFF-SCREEN behind the
 * camera's current left edge, integrates a CONSTANT rightward speed on the
 * fixed 60 Hz step (same discipline as police.ts/traffic.ts — refresh-
 * independent), follows the road surface with a damped vertical glide (no
 * jitter on rolling hills), and holds a constant nose-up wheelie pitch on the
 * whole visual container (wheels + recolored chassis + bespoke rider, so one
 * rotation sells the "front wheel up" look). Once safely off both the camera's
 * right edge AND a lead distance ahead of the bike, its GameObjects are
 * destroyed and it never reappears (freezes in place instead if the run ends
 * first — e.g. a crash elsewhere — same "hazards stop the instant
 * ctx.isEnded()" discipline every event system follows).
 *
 * ZERO Matter bodies — wheels/chassis/rider are plain Images in one
 * Container, dust puffs are plain Graphics — so the egg never touches
 * NORTH_STAR §8's <100-body budget. The motorcycle reuses the real
 * bike-base texture recolored to characters.ts's dedicated 'yellow' bike
 * swatch (palette.ts's recolorTexture); the rider is a bespoke all-black +
 * black-helmet committed PNG (src/art/sprites.mjs drawWheelieRider) that
 * BootScene loads from artManifest.ts (PLAN-10 ST-2).
 *
 * Speeds are px per fixed 60 Hz step (BikeHandle.speed units); times are ms;
 * margins/offsets are px at the 1280x720 DESIGN scale. */
export const WHEELIE_RIDER = {
  /** Fixed physics/step rate the rider's motion + dust timer are integrated
   * at. Matches the 60 Hz tick (see DEBUG_OVERLAY.physicsStepsPerSecond) so
   * the pass plays out identically at any display refresh rate. */
  fps: 60,
  /** Bike speed (px per physics STEP — BikeHandle.speed units) at/above which
   * the trigger counts as "moving". Small and lenient on purpose — the real
   * gating is position + grounded; this only rules out a parked/stationary
   * edge case at the trigger x. */
  triggerMinSpeedPxPerStep: 1,
  /** The rider's own constant travel speed, as a multiple of the BIKE's
   * full-gas FLAT top speed (BIKE_TUNING.maxWheelAngularVelocity x
   * wheelRadius = 10.8 px/step ~= 648 px/s) — comfortably above ANY
   * achievable player speed (NORTH_STAR "overtaking... at higher speed"),
   * per the PLAN-07 brief's "~1.25-1.4x" guidance. Unlike POLICE's
   * copMaxSpeedFrac, this is never a fairness-critical floor (the egg can
   * never fail the player) — 1.3 is simply the middle of the suggested
   * range. */
  speedMultiplier: 1.3,
  /** How far behind the camera's LEFT edge (px, read live from
   * scene.cameras.main.worldView at trigger time) the rider spawns, so he is
   * guaranteed off-screen the instant he appears. */
  spawnBehindCameraMarginPx: 150,
  /** How far past the camera's CURRENT right edge (px) the rider must clear
   * before he's eligible to despawn. */
  despawnAheadCameraMarginPx: 150,
  /** How far past the BIKE itself (not the camera, px) the rider must ALSO
   * clear before despawning — a second, camera-independent guard so a later
   * camera lookahead/zoom-out swing (the player speeding back up) can never
   * bring an about-to-be-culled rider back on screen right before he's
   * destroyed. */
  despawnAheadOfBikeLeadPx: 900,
  /** Exponential smoothing factor (0-1 applied per FIXED STEP) the rider's y
   * follows terrain.heightAt(x) with — damps rolling-hill sampling into a
   * smooth glide instead of snapping to every step's height. Higher =
   * snappier/more jitter, lower = floatier/more lag. */
  groundFollowLerp: 0.15,
  /** Constant nose-up wheelie pitch, degrees. NEGATIVE in bike.ts's own angle
   * convention (see BikeHandle.angle's doc: positive = clockwise = nose-DOWN
   * facing right) — applied once to the whole visual container (never
   * slope-blended), so the wheelie always reads clearly regardless of level
   * 11's gentle rolling terrain (hilliness 0.28). */
  pitchDeg: -25,
  /** How often (ms) a dust puff spawns behind the rear wheel while the rider
   * is on screen and moving. */
  dustIntervalMs: 90,
  /** One dust puff's rise-and-fade lifetime, ms. */
  dustLifetimeMs: 380,
  /** How far a dust puff rises before it's fully faded, px. */
  dustRisePx: 14,
  /** Dust puff radius at spawn, px — small on purpose ("subtle, not a smoke
   * screen"). */
  dustRadiusPx: 5,
  /** Dust puff peak alpha (fades linearly to 0 over dustLifetimeMs). */
  dustAlpha: 0.5,
  /** How far behind the rear wheel's ground-contact point (px, world space —
   * NOT rotated with the wheelie pitch) each dust puff spawns. */
  dustTrailBehindPx: 14,
} as const;

/** Level 18 "Billboard Row" shared billboard sizing + word-wrap tunables
 * (PLAN-07 task 3 — see src/systems/decorations.ts's exported `drawBillboard`,
 * shared by BOTH `createDecorations`' decoy billboards and
 * src/systems/billboard.ts's level-18 easter egg). NORTH_STAR §5 row 18's egg
 * text (~44 chars — the locked literal lives in level18.ts's event entry,
 * NEVER copied here per CLAUDE.md Rule 4) is far
 * longer than any decoy's ad copy — rendered on ONE line at
 * BILLBOARD_TEXT_SIZE_PX (decorations.ts) it would grow the board to roughly
 * 4x a decoy's width, defeating "subtle, among decoy billboards" (NORTH_STAR)
 * by SIZE alone, regardless of the text itself. Word-wrap (a simple greedy
 * CHARACTER-budget wrap — Press Start 2P is a fixed-width pixel font, so a
 * character count is a simple, Node-testable stand-in for a real, browser-only
 * pixel-width measurement) keeps every billboard's board within a comparable
 * footprint no matter how long its copy is, so the egg is discoverable only by
 * READING it, never by its size or motion (see DECISIONS.md).
 *
 * Board sizing follows the SAME "min OR content, whichever is bigger" rule on
 * BOTH axes — width already worked this way pre-wrap; height is new here.
 * `boardBaseHeightPx` is exactly the pre-wrap fixed height, so every existing
 * single-line decoy renders unchanged (its measured label height sits well
 * under the floor, same as its width already did at the min). */
export const BILLBOARD = {
  /** Greedy word-wrap budget, in CHARACTERS per line (see
   * decorations.ts's `wrapBillboardText`). A single word longer than this is
   * kept whole, unsplit, on its own line — never broken mid-word. Tuned so
   * the egg's ~44-char line wraps to a board comparable in size to the
   * level's longest decoy (level18.ts's "PARKER AND PARKER..." decoy is
   * authored to wrap identically at this width — see DECISIONS.md). */
  wrapMaxChars: 18,
  /** Minimum board width, px (grown to fit the WIDEST wrapped line, not the
   * whole string). */
  boardMinWidthPx: 220,
  /** Minimum board height, px — the EXACT pre-wrap fixed height (grown to fit
   * a multi-line label's real measured height, same "min OR content" rule as
   * width). */
  boardBaseHeightPx: 110,
  /** Padding, each side, between the (possibly multi-line) label and the
   * board edge, px — applied on BOTH axes. */
  textPadPx: 24,
  /** Phaser Text style `lineSpacing`, px — extra vertical gap between wrapped
   * lines within one multi-line Text object (see drawBillboard: the wrapped
   * copy renders as ONE Text GameObject with embedded '\n's, not several
   * stacked ones, so Phaser's own multi-line layout/centering does the work). */
  lineSpacingPx: 10,
} as const;

/** Total number of levels in the game. A locked fact from NORTH_STAR.md —
 * never make this configurable or derive it from level data. */
export const TOTAL_LEVELS = 22;

/** Min/max level length (px), authored per level in src/levels/*.ts and
 * checked by src/levels/types.ts's validateLevels. Bounds keep play time
 * inside NORTH_STAR's 20-45s window AND the ground collision chain under
 * NORTH_STAR §8's <100-physics-bodies budget.
 *
 * Why 16000 specifically: terrain.ts's buildGroundBodies chains one
 * collision body per stride = round(TERRAIN.segmentTargetPx /
 * TERRAIN.sampleSpacingPx) = round(160/24) = 7 heightmap samples, i.e. one
 * body per 7*24 = 168px of level length. At lengthMaxPx (16000) that works
 * out to 96 ground bodies + 3 bike bodies (chassis compound + 2 wheels) =
 * 99, just under the <100 budget. (Sanity check against a real measured
 * number: the same formula at the PLAN-02 TEST_LEVEL's 15000px gives 90
 * ground + 3 bike = 93 — exactly the body count PROGRESS.md recorded from
 * an actual browser run.) lengthMinPx (8000) keeps the shortest level long
 * enough for a gas-only run to reach real speed while still comfortably
 * finishing inside the 45s ceiling. */
export const LEVEL = {
  lengthMinPx: 8000,
  lengthMaxPx: 16000,
  /** Bike spawn x (px). Inside every level's {0, 700} spawn flat zone, with
   * room behind for the camera's world-start bounds clamp to settle. Was
   * GameScene's module-local SPAWN_X before PLAN-05 ST-4 made terrain
   * config-driven; promoted here since it's now shared level-flow tuning
   * (every level spawns here), not one test level's data. */
  spawnXPx: 250,
  /** How far back from the terrain's far end the finish flag sits (px):
   * finishX = terrain.worldLength - this. Lands inside every level's
   * {length - 900, length} finish flat zone, leaving runway past it so
   * crossing at speed never runs out of world before the LevelComplete
   * hand-off. Was GameScene's module-local FINISH_X (14500 = 15000 - 500). */
  finishMarginPx: 500,

  // ---------------------------------------------------------- jump-safety
  // floors. Added for PLAN-05 ST-5/task 6 (src/levels/validate.ts's
  // validateJumpSafety + scripts/playtest-levels.mjs, the ghost-driver
  // harness that proves every level is gas-only-beatable). These are SAFETY
  // FLOORS, not the tighter values ST-3 actually authored the real 22
  // configs to (widths 480-680px, heights 50-95px, jump `x` at ~35-64% of
  // level length, hilliness <=0.30 on every jump-bearing level — see
  // DECISIONS.md's ST-3 entry) — deliberately looser so a minor future
  // level-config tweak doesn't false-fail this guard, while a genuinely
  // unsafe jump (too narrow/tall, too close to spawn/finish, or stacked on
  // overly hilly terrain) still gets caught.
  /** Minimum authored jump-ramp width, px. A narrower ramp steepens the
   * raised-cosine slope (terrain.ts's applyJumps widens for maxJumpSlope,
   * but only up to a point) toward an unrideable wall. */
  jumpMinWidthPx: 400,
  /** Maximum authored jump-ramp height, px. A taller ramp eats more of the
   * bike's speed budget climbing it and risks a harder landing. */
  jumpMaxHeightPx: 100,
  /** Minimum fraction of level length a jump's `x` (the ramp's base — see
   * JumpSpec.x) may sit at. */
  jumpPlacementMinFrac: 0.25,
  /** Maximum fraction of level length a jump's `x` may sit at. */
  jumpPlacementMaxFrac: 0.75,
  /** Minimum clearance, px, a jump's `x` must keep from both the spawn
   * point (spawnXPx) and the finish flag (length - finishMarginPx) — guards
   * against reaching ramp speed before the spawn flat zone ends, or a jump
   * landing spilling past the finish. */
  jumpClearancePx: 1500,
  /** Maximum terrain.hilliness allowed on any level that authors >=1 jump —
   * keeps a jump's launch/landing predictable instead of stacked on top of
   * already-steep rolling-hill terrain. */
  jumpLevelMaxHilliness: 0.3,

  // ---------------------------------------------------------- KICKER bounds
  // A jump authored `kind: 'kicker'` (terrain.ts's JumpSpec) is a flip-capable
  // launch ramp (PLAN-07 task 4) — deliberately NARROWER + TALLER than the
  // gentle humps above, and GRID-ALIGNED so the coarse Matter collision chain
  // renders it as a clean launch triangle (see TERRAIN_COLLISION_GRID_PX). It
  // therefore CANNOT pass the hump width-floor/height-ceiling above, so kickers
  // get their OWN validated bounds here (validate.ts branches on `kind`). These
  // are tuned around PLAN-02's browser-PROVEN flip kicker (336px wide × 106px
  // tall, ~0.55-1.0s airtime): a deliberate mid-air gas tap backflips off it
  // while a gas-only hold clears it upright (the held-pedal assist). The bounds
  // still catch genuinely dangerous kicker geometry — too tall/steep (crashes a
  // gas-only hold, or auto-widens off the grid and stops launching) or too
  // narrow — while admitting the proven size. Placement/clearance/hilliness
  // (the rules above) apply to kickers too. All lengths px.
  /** Minimum kicker ramp width, px (the proven kicker is 336 = 2 grid cells). */
  kickerMinWidthPx: 336,
  /** Maximum kicker ramp width, px (4 grid cells — wider reads as a hump, not
   * a snappy launch). */
  kickerMaxWidthPx: 672,
  /** Minimum kicker ramp height, px — below this it barely leaves the ground,
   * so a full flip isn't comfortably achievable. */
  kickerMinHeightPx: 90,
  /** Maximum kicker ramp height, px. Above the proven 106 the gas-only hold's
   * airtime grows past where the held-pedal assist reliably lands it upright
   * (BIKE_TUNING.heldPitchDelaySteps caveat) — keep kickers modest. NOTE: this
   * 112 ceiling is only reachable at a WIDER kicker (>= 672px); at the minimum
   * 336px width the no-auto-widen slope cap (height*pi/width <= maxJumpSlope)
   * binds height to <= ~106px, which is exactly the proven size. */
  kickerMaxHeightPx: 112,
} as const;

/** Level-start intro banner tuning (PLAN-05 ST-4 — GameScene.showIntroBanner).
 * The banner shows the level name + optional one-liner (config.introText),
 * screen-anchored (scrollFactor 0) at DEPTHS.overlay over a cream backing
 * panel, holds briefly, then fades out and destroys itself — non-blocking
 * (gameplay runs the whole time). Suppressed on a fail-restart so a crash
 * doesn't re-show it every attempt. All lengths are px at the 1280x720 DESIGN
 * scale; the camera sits at CAMERA.zoomMax (1.0) at level start while the bike
 * is stationary, so a scrollFactor-0 banner needs no zoom compensation. */
export const LEVEL_INTRO = {
  /** Fully-visible hold before the fade begins, ms — long enough to read at a
   * glance, short enough not to make an eager player wait. */
  holdMs: 1800,
  /** Fade-out tween duration, ms. */
  fadeMs: 600,
  /** Title (level name) font size, px (snapped to the 8px pixel grid). */
  titleFontSizePx: 40,
  /** Subtitle (introText one-liner) font size, px. */
  subtitleFontSizePx: 16,
  /** Title center Y (design space), px — upper third, clear of the bike/road
   * at level start. */
  titleY: 200,
  /** Subtitle center Y offset below the title, px. */
  subtitleGapPx: 56,
  /** Cream backing-panel padding around the text, each side, px — the panel
   * keeps the plum pixel-text legible over ANY theme backdrop (light or dark),
   * matching the game's cream-face/plum-text dialog look. */
  paddingXPx: 44,
  paddingYPx: 28,
} as const;

/** Level-complete screen tuning (PLAN-08 task 1 — see
 * src/scenes/LevelCompleteScene.ts). The congratulations screen shown after
 * every finished level 1..21 (level 22 SKIPS it for PartyScene): a
 * "Level N complete!! 🎉" header, a confetti burst, the tulips earned this
 * level + the bouquet total, a pixel-postcard "note card" whose text reveals
 * with a typewriter effect, then Next / Replay / Level-select buttons.
 *
 * A plain (non-Matter) menu scene at camera zoom 1 like TitleScene/
 * LevelSelectScene — so NO zoom compensation and ZERO Matter bodies by
 * construction; every length below is a straight px at the 1280x720 DESIGN
 * scale (design == screen at zoom 1) and every time is ms. Per CLAUDE.md's
 * "no magic numbers in scene code", EVERY Y position, font size, spacing, the
 * note-card geometry, the typewriter speed, and all the confetti-burst knobs
 * live here; only the two card-title literals stay as local consts in the scene
 * (presentation content, not tunable numbers — the decorations.ts / tricks.ts
 * precedent).
 *
 * The confetti* knobs below stayed HERE (rather than moving into a shared
 * CONFETTI block) when PLAN-09 ST-2 extracted the integrator into
 * src/systems/confetti.ts: they are this screen's own FEEL, tuned to pop up past
 * its 40px header on a pastel menu, and nothing else wants the same numbers.
 * The shared module takes them as options; the party's balloon-pop puff and the
 * finale scenes' ambient rain carry their own values in the PARTY block. One
 * number, one home — see confetti.ts's module doc and DECISIONS.md. */
export const LEVEL_COMPLETE = {
  // ------------------------------------------------------------- header
  /** "Level N complete!! 🎉" header center Y, px (near the top). */
  headerY: 72,
  /** Header font size, px (snapped to the 8px pixel grid by createPixelText). */
  headerFontSizePx: 40,

  // -------------------------------------------------------- tulip tally
  /** "earned this level" row center Y, px. */
  tulipEarnedY: 140,
  /** Bouquet-TOTAL row center Y, px (just below the earned row). */
  tulipTotalY: 186,
  /** Both tulip-tally rows' font size, px. */
  tulipFontSizePx: 24,
  /** Uniform scale applied to the tex-tulip icon sprite shown beside each
   * tally row (the 16x24 placeholder tulip reads a touch large at native size
   * next to 24px text). */
  tulipIconScale: 0.7,
  /** Gap between a tally row's tulip icon and its text, px. */
  tulipIconGapPx: 12,

  // ---------------------------------------------------------- note card
  /** Note-card center Y, px — the visual centerpiece "below" the tulip tally
   * (PLAN-08). The card GROWS symmetrically around this center as its wrapped
   * note gets taller, so it stays vertically centered here regardless of note
   * length. */
  noteCardCenterY: 352,
  /** Word-wrap width of the note BODY text inside the card, px. The card face
   * is this + 2*notePaddingXPx wide. */
  noteWrapWidthPx: 760,
  /** Note-body font size, px — smaller than the tally so a long fact wraps to
   * only a few lines and the card stays compact. */
  noteBodyFontSizePx: 16,
  /** Note-card title ("Did you know?" / "Psst… 💡") font size, px. */
  noteTitleFontSizePx: 24,
  /** Padding between the card content (title + wrapped body) and the card face
   * edges, each side, px. */
  notePaddingXPx: 32,
  notePaddingYPx: 28,
  /** Vertical gap between the card title and the body text below it, px. */
  noteTitleGapPx: 16,
  /** Extra vertical gap between wrapped body lines (Phaser Text lineSpacing),
   * px — keeps a multi-line note from crowding. */
  noteLineSpacingPx: 8,
  /** Typewriter reveal speed: ms held per revealed CHARACTER (code point, so
   * an emoji reveals as one unit). Gentle by default (NORTH_STAR easy/cute); a
   * tap/click anywhere skips straight to the full text (LevelCompleteScene). */
  typewriterMsPerChar: 32,

  // ------------------------------------------------------------ buttons
  // Two rows: the big primary alone, then the two secondaries. Button faces are
  // UI_MIN_TOUCH_PX (88) tall, so the row centers are kept >= 88px apart (here
  // 116: 548 -> 664) to leave a clean gap between rows; the secondary row still
  // clears the bottom screen edge (664 + 44 = 708 < 720).
  /** Primary "Next level →" button center Y, px — alone on its row so it reads
   * as the big primary action. */
  primaryButtonY: 548,
  /** Primary button minimum face width, px (big/prominent). */
  primaryButtonMinWidthPx: 380,
  /** Secondary (Replay / Level select) row center Y, px — one full button
   * height + a gap below the primary so the rows never overlap. */
  secondaryButtonY: 664,
  /** Horizontal offset of each secondary button's center from screen center,
   * px (Replay to the left, Level select to the right). 2*this must stay >=
   * secondaryButtonMinWidthPx so the two never overlap. */
  secondaryButtonOffsetXPx: 210,
  /** Secondary button minimum face width, px. */
  secondaryButtonMinWidthPx: 300,

  // ----------------------------------------------------------- confetti
  // A cheerful one-shot burst that pops UP from near the header, then rains
  // down under gravity and fades, each piece destroying itself once its life
  // elapses — no leftover tweens/objects (this scene is entered many times).
  // Integrated per-frame in update(delta), so the fall is frame-rate
  // independent.
  /** Number of confetti pieces spawned in the burst. */
  confettiCount: 54,
  /** Burst origin center Y, px (near the header). */
  confettiOriginY: 96,
  /** Half-width, px, of the random horizontal band the pieces spawn across
   * (centered on screen center). */
  confettiOriginSpreadXPx: 220,
  /** Min/max initial launch speed, px/sec. */
  confettiSpeedMinPxPerSec: 320,
  confettiSpeedMaxPxPerSec: 640,
  /** Launch direction is straight UP (-90 degrees) plus/minus this spread,
   * radians — a fan-shaped upward pop. */
  confettiLaunchSpreadRad: 1.15,
  /** Downward acceleration applied every frame, px/sec^2 — the "gravity" that
   * turns the upward pop into a settling rain. */
  confettiGravityPxPerSec2: 900,
  /** Max absolute tumble spin, rad/sec (each piece gets a random spin in
   * +/- this). */
  confettiSpinMaxRadPerSec: 6,
  /** Min/max piece lifetime, ms — a piece is destroyed when its age reaches
   * its life. */
  confettiLifetimeMinMs: 1500,
  confettiLifetimeMaxMs: 2700,
  /** Min/max piece edge size, px (small squares). */
  confettiSizeMinPx: 8,
  confettiSizeMaxPx: 16,
  /** Life fraction (0..1) after which a piece fades its alpha 1 -> 0, so it
   * settles out rather than vanishing abruptly. */
  confettiFadeStartFrac: 0.6,
} as const;

/** Party finale tuning (PLAN-09 — see src/systems/partyCast.ts for ST-1's cast,
 * and later src/systems/partyBalloons.ts + src/scenes/PartyScene.ts). NORTH_STAR
 * §5's PartyScene: Gabby & Caleb arrive at the venue, the four NAMED guests
 * (Andrea / Allison / Dallas / Dom) stand with them under floating name tags,
 * and 8-15 unnamed partygoers mingle BEHIND them.
 *
 * PartyScene is a plain (non-Matter) scene at camera zoom 1, exactly like
 * LevelCompleteScene / TitleScene — so ZERO Matter bodies by construction, NO
 * zoom compensation anywhere, and every length below is a straight px at the
 * 1280x720 DESIGN scale (design == screen at zoom 1). Times are ms.
 *
 * LAYOUT MODEL (systems/partyCast.ts's buildPartyCastSlots — a PURE function of
 * the member index and these constants, never Math.random, so the scene looks
 * identical on every visit and the tests/harnesses can assert exact positions):
 * TWO rows, each evenly spaced and centered on screen center.
 *   - FRONT row (6): Andrea, Dallas, Gabby, Caleb, Allison, Dom — left to
 *     right. Gabby+Caleb straddle the exact center; Dallas sits immediately to
 *     Gabby's left so the twin joke actually lands (they must be adjacent), and
 *     the other three named guests flank the pair.
 *   - BACK row: the unnamed crowd, drawn at a lower depth, higher on screen,
 *     and smaller — the three cues that read as "further away". No name tags
 *     (NORTH_STAR §5 gives tags only to the four named guests). It is laid out
 *     over crowdSlotCount grid slots but the MIDDLE one is left EMPTY, so the
 *     dead centre of the screen belongs to Gabby and Caleb rather than to a
 *     stranger — see crowdCount.
 * Idle motion is a 2-frame bounce (each member is either DOWN or UP — pixel-art
 * honest, and explicitly what the plan asks for), phase-staggered per member by
 * bouncePhaseStep so nobody moves in lockstep.
 *
 * As with decorations.ts / pickup.ts / police.ts / tricks.ts, the throwaway
 * placeholder DRAWING dimensions (the 24x48 base-sprite size, Allison's ponytail
 * rect) stay as local documented consts in partyCast.ts —
 * PLAN-10 replaces that art wholesale. Everything TUNABLE (positions, depths,
 * scales, counts, bounce, name-tag geometry) lives here; the guests' COLORS and
 * all verbatim copy live in src/data/finale.ts.
 *
 * ROOM RESERVED: ST-2 has now added its balloon knobs, its balloon-pop confetti
 * burst, and the ambient falling-confetti knobs BOTH finale scenes share (the
 * three sub-sections at the bottom of the block); ST-3 adds its remaining
 * scene-layout knobs (venue backdrop, banner, streamers, bouquet toast,
 * "Credits ->" button) to THIS SAME BLOCK — keep them in their own commented
 * sub-sections below. */
export const PARTY = {
  // ------------------------------------------------------------ front row
  /** Front-row center x, px — the row is laid out symmetrically about this. */
  frontRowCenterX: DESIGN_WIDTH / 2,
  /** Front-row FEET y, px (sprites are bottom-anchored). ST-1 parked this at
   * 500 pending ST-3's real venue; the finished scene moved it DOWN to 570
   * because the first full-scene screenshot showed the cast crowded into the
   * upper-middle with ~220px of empty floor under them — the party read as
   * happening at the back of an empty room. At 570 the front row stands in the
   * lower-middle of the frame and still clears the bottom-right "Credits ->"
   * button (whose face top edge is at 604); tests/finale.test.ts guards that
   * gap. */
  frontRowGroundY: 570,
  /** Center-to-center spacing between adjacent front-row members, px.
   * Comfortably wider than a scaled sprite (24 x frontRowScale = 72) so the six
   * never overlap. */
  frontRowSpacingPx: 150,
  /** Uniform scale of the front-row sprites. The 24x48 placeholder rider would
   * read tiny at native size; 3x makes the named cast the clear focus. */
  frontRowScale: 3,

  // ---------------------------------------------------------------- crowd
  /** Number of GRID SLOTS the crowd row is laid out over. ODD on purpose — that
   * is what makes the half-step interleave below work out exactly (see
   * crowdSpacingPx), and it is why this stays 9 even though only 8 partygoers
   * are built. */
  crowdSlotCount: 9,
  /** Number of unnamed background partygoers actually built: every grid slot
   * except the MIDDLE one, which is deliberately left EMPTY. MUST stay within
   * NORTH_STAR §5's 8-15 range (guarded by tests/finale.test.ts).
   *
   * WHY THE CENTRE SLOT IS EMPTY: at an odd crowdSlotCount the middle slot sits
   * exactly on crowdCenterX — i.e. exactly between Gabby (565) and Caleb (715),
   * which put an unnamed stranger's head at the geometric centre of the
   * emotional-climax screen, the one spot NORTH_STAR §5 reserves for the couple
   * ("Gabby + Caleb stand center"). Dropping the SLOT is what fixes it without
   * touching the interleave: shifting crowdCenterX by a half step instead would
   * align EVERY crowd member with a front-row member and re-create the
   * "crowd heads read as hats" problem ST-1 fixed. With the 6 front-row members
   * the venue still holds 14 people across the full screen width. */
  crowdCount: 8,
  /** Crowd-row center x, px. */
  crowdCenterX: DESIGN_WIDTH / 2,
  /** Crowd FEET y, px — higher on screen than the front row (further away).
   * Moved 400 -> 470 with frontRowGroundY (see its doc), keeping the same
   * 100px front/back separation while the whole party sits lower in frame. */
  crowdGroundY: 470,
  /** Center-to-center spacing between adjacent crowd SLOTS, px. EQUAL to
   * frontRowSpacingPx on purpose: an ODD crowdSlotCount centered on the same x
   * as an EVEN front row lands every crowd slot exactly HALF a step (75px) from
   * its nearest front-row neighbour — i.e. squarely in the gaps, like the back
   * row of a group photo. That 75px clears the summed sprite half-widths
   * (36 + 26.4 = 62.4), so no partygoer is ever hidden behind (or mistaken for
   * a hat on) somebody in front. Leaving the centre slot empty (see crowdCount)
   * removes a member but cannot disturb this: the property holds slot by slot.
   * Guarded by tests/finale.test.ts. */
  crowdSpacingPx: 150,
  /** Base crowd sprite scale — smaller than frontRowScale (further away). */
  crowdScale: 2,
  /** Per-member scale variation, as a fraction of crowdScale, cycling
   * -1/0/+1 by index so the crowd reads as individuals rather than clones. */
  crowdScaleStep: 0.1,
  /** Extra px added to the FEET y of every odd-indexed crowd member — a slight
   * front/back stagger so the back row isn't a straight chorus line. Stays well
   * above frontRowGroundY, so the crowd never invades the front row. */
  crowdStaggerYPx: 18,

  // --------------------------------------------------------------- depths
  /** Crowd render depth — BEHIND everything the front row draws. */
  crowdDepth: DEPTHS.props,
  /** Front-row (named cast + Gabby + Caleb) render depth. */
  frontRowDepth: DEPTHS.rider,
  /** Name-tag render depth — above every cast sprite so a tag is never clipped
   * by the person in front. Kept below DEPTHS.fx (60) so the ambient confetti
   * rain still has its own layer above the cast. (The BALLOONS moved BELOW the
   * cast in ST-3 — see balloonDepth — precisely because at the original
   * above-everything depth they made two of these four tags unreadable.) */
  nameTagDepth: DEPTHS.rider + 5,

  // ---------------------------------------------------------- idle bounce
  /** 2-frame bounce: how far a member rises on its UP frame, px. Subtle — an
   * idle/dance tell, not a jump. */
  bounceAmplitudePx: 6,
  /** Full down-up cycle period, ms (half down, half up). */
  bouncePeriodMs: 900,
  /** Per-member phase offset, as a FRACTION of one bounce cycle (0..1),
   * multiplied by the member's global index and wrapped. 0.37 is coprime with
   * 100, so the first 100 members all get distinct phases — far more than the
   * ~18 the cast ever builds — and nobody bounces in lockstep. */
  bouncePhaseStep: 0.37,

  // ------------------------------------------------------------ name tags
  /** Name-tag font size, px (snapped to the 8px pixel grid by pixelText). */
  nameTagFontSizePx: 16,
  /** How far ABOVE the top of a guest's head the name tag's CENTER sits, px.
   * Must exceed HALF THE PANEL HEIGHT or the tag would overlap the head — and
   * partyCast.ts sizes that panel from the label's MEASURED height, not from
   * this font size, so the margin is really
   * `(lineHeight * nameTagFontSizePx + 2 * nameTagPadYPx) / 2`. Browser-measured
   * (Press Start 2P, single line, sizes 8-40): Phaser reports a Text height of
   * EXACTLY 1.0 x the font size, so today that is (16 + 16)/2 = 16 and the tag's
   * panel clears the head by 10px. The 26 here keeps clearance even at a
   * conservative 1.5x line height (a font-load failure falling back through
   * FONT_STACK_PIXEL to Courier New) -> (24 + 16)/2 = 20 < 26. Guarded against
   * that 1.5x bound in tests/finale.test.ts. Bigger = the tag floats higher. */
  nameTagGapPx: 26,
  /** Cream backing-panel padding around the tag text, each side, px. The panel
   * keeps the plum pixel text legible over a dusk venue backdrop — the same
   * cream-panel-behind-text convention LEVEL_INTRO's banner uses. */
  nameTagPadXPx: 12,
  nameTagPadYPx: 8,
  /** Name-tag panel outline stroke width, px (the chunky pixel look). */
  nameTagOutlinePx: 3,
  /** The tag's OWN subtle bob (on top of its owner's bounce), px. */
  nameTagBobAmplitudePx: 3,
  /** The tag's own bob period, ms — deliberately NOT a multiple of
   * bouncePeriodMs so the tag drifts against its owner instead of locking. */
  nameTagBobPeriodMs: 1300,
  /** Phase offset (fraction of a cycle) applied to the tag's bob relative to
   * its owner's bounce — it starts the tag on the opposite half of the cycle so
   * the tag drifts against its owner from the very first frame, rather than the
   * two beginning locked and only separating as the differing periods pull them
   * apart. */
  nameTagBobPhaseOffset: 0.5,

  // ------------------------------------------------------------- balloons
  // PLAN-09 task 2's "Lots of balloons (floating, bobbing, varied colors — at
  // least 20)" + "balloons are tappable/clickable and pop with confetti; endless
  // supply floats in" (see src/systems/partyBalloons.ts). MODEL: a fixed pool,
  // allocated once, of balloons that drift UP while swaying, re-enter at the
  // bottom edge the instant they finish sliding off the top, and pop (with a
  // radial confetti burst) on a tap/click — then re-enter the same way after a
  // short beat, so the supply never runs dry. ZERO Matter bodies; every balloon is a
  // Container of a tinted Image + a string Rectangle, over its own invisible
  // interactive Zone. The placeholder DRAWING dimensions (the 24x32 tex-balloon
  // size, its scale, the string rect) stay as local documented consts in
  // partyBalloons.ts, exactly as the cast's sprite dimensions do.
  /** How many balloons live on screen at once — and, since the pool is
   * allocated once and recycled forever, also the POOL size. MUST stay >= 20
   * (PLAN-09's acceptance criterion), guarded by tests/partyBalloons.test.ts.
   *
   * THE >= 20 VISIBLE GUARANTEE IS STRUCTURAL, NOT STATISTICAL. A rising
   * balloon is NEVER alive-but-off-screen: partyBalloons.ts derives both flight
   * endpoints from the drawn body height (BALLOON_ENTRY_KNOT_Y /
   * BALLOON_RECYCLE_KNOT_Y) so the invisible band is exactly ZERO px long — a
   * balloon enters the instant it becomes visible and recycles the instant it
   * stops being. The ONLY balloons out of view are therefore ones the player
   * just popped, which is bounded by balloonWorstCasePopsPerSec against
   * (balloonRespawnDelayMs + balloonWorstCaseFrameMs). 32 - 6 = 26 >= 20 even
   * while a player mashes balloons in 12-per-second bursts;
   * tests/partyBalloons.test.ts asserts that WORST-CASE LOWER BOUND, not an
   * average. 32 rather than 30 so that bound keeps real slack over the test's
   * own >= 24 headroom guard once the frame allowance is counted — and "lots of
   * balloons" is what the plan asked for anyway. Browser-measured floor while a
   * harness popped 58 balloons in 12.3s (4.7/sec): 28 visible, 4 out of view at
   * once (see DECISIONS.md — all three citations of this run agree). */
  balloonCount: 32,
  /** Left/right margin, px, the random spawn x stays inside, so a balloon never
   * straddles a screen edge. Comfortably wider than half a drawn balloon. */
  balloonSpawnMarginPx: 70,
  /** Min/max upward drift speed, px/sec. Each balloon draws its own, so the
   * flock never rises as one sheet — this is the main thing that keeps a
   * recycled pool from re-forming into rows. */
  balloonRiseMinPxPerSec: 26,
  balloonRiseMaxPxPerSec: 58,
  /** Min/max horizontal sway amplitude, px (the "bobbing"). */
  balloonSwayMinPx: 6,
  balloonSwayMaxPx: 22,
  /** Min/max full sway cycle period, ms. Wide range so no two balloons sway
   * in step for long. */
  balloonSwayMinPeriodMs: 2200,
  balloonSwayMaxPeriodMs: 4200,
  // NOTE — where a balloon ENTERS and RECYCLES is deliberately NOT tunable
  // here. Both endpoints are derived from the drawn body height inside
  // partyBalloons.ts (BALLOON_ENTRY_KNOT_Y / BALLOON_RECYCLE_KNOT_Y), because
  // the >= 20-visible criterion depends on them being EXACTLY the art geometry:
  // any "tuned" value reopens a window in which balloons are alive but
  // off-screen and turns the guarantee back into a statistical one. See that
  // module and balloonCount's doc above.
  /** Invisible square hit area per balloon, px — decoupled from the (smaller)
   * drawn balloon exactly like pedals.ts's visible-face-vs-hit-Zone split and
   * CHARACTER_CREATE.swatchHitSizePx. MUST equal UI_MIN_TOUCH_PX (NORTH_STAR
   * §8) — a drawn balloon is only ~58x77, so without this a thumb would miss.
   * Overlapping hit areas are expected at this density and are handled by
   * partyBalloons.ts's per-pointer-press dedupe, not by spacing. */
  balloonHitSizePx: UI_MIN_TOUCH_PX,
  /** Beat between a pop and that balloon floating back in, ms. This is the ONLY
   * time a balloon is ever out of view (see balloonCount), so it is one of the
   * two terms in the >= 20-visible worst-case bound — which is why it is short.
   * There is no "blinking back" risk to buy off with a longer beat: a
   * replacement always re-enters at the BOTTOM EDGE, nowhere near where the
   * popped one was, so it reads as a different balloon however quickly it
   * arrives. (Was 700ms; shortened to 400 — 0.57x — after the browser harness
   * measured 8 balloons simultaneously out of view under bursty tapping; see
   * balloonWorstCasePopsPerSec.) */
  balloonRespawnDelayMs: 400,
  /** The BURST tap rate the >= 20-visible guarantee is proven against,
   * pops/sec. Not a behavior knob — nothing rate-limits popping — but the
   * explicit worst-case assumption tests/partyBalloons.test.ts derives its bound
   * from, so the number is written down instead of imagined.
   *
   * It is deliberately an INSTANTANEOUS BURST rate, not an average, because
   * that is what the browser harness caught: taps arrive in clusters, and a
   * 4.2 pops/sec AVERAGE put 8 balloons out of view at once (two clusters
   * inside one respawn window) — an average-rate bound would have quietly
   * understated the real dip by 2x. 12/sec is a genuine two-thumb mash burst;
   * at it, at most ceil(12 x 0.434) = 6 balloons are simultaneously popped,
   * leaving 26 visible. It also sizes the pop-confetti pool below, so one
   * assumption drives both. */
  balloonWorstCasePopsPerSec: 12,
  /** The slowest frame the >= 20-visible bound is proven against, ms — the
   * SECOND half of a popped balloon's out-of-view window. partyBalloons.ts
   * checks `now >= respawnAtMs` once per update(), so a balloon actually stays
   * out for the respawn delay PLUS up to one frame; modelling the window as the
   * delay alone would understate the worst case by a frame per pop. 34ms is a
   * ~29fps floor, comfortably worse than the 60fps this scene measures at, so
   * the bound holds even on a struggling phone. Like
   * balloonWorstCasePopsPerSec this changes no behavior — it is the assumption
   * written down, so tests/partyBalloons.test.ts can derive against it. */
  balloonWorstCaseFrameMs: 34,
  /** Balloon layer depth: ABOVE the crowd (DEPTHS.props) so the flock weaves
   * through the room, but BELOW the front row (DEPTHS.rider) and the name tags.
   *
   * ST-2 originally put this at DEPTHS.fx + 1, in FRONT of everybody. The first
   * full-scene screenshot (ST-3) killed that: 32 balloons at 58x77px drawn over
   * the cast hid most of the party and left two of the four name tags
   * unreadable — and "all four named characters present with exact names" is a
   * literal PLAN-09 acceptance criterion, so the balloons were losing an
   * argument they were never meant to have. Behind the people is also the more
   * natural read (balloons drift around a room, they do not fly at the camera).
   *
   * WHAT THE MOVE ACTUALLY COSTS (an earlier draft of this comment claimed
   * "nothing", which was wrong): TAPPABILITY is unchanged — no cast object is
   * interactive, so every balloon still takes a press wherever it is. But a
   * balloon drifting through the front row's ~432x144px band is now HIDDEN
   * behind a cast member, so a press there pops a balloon the player cannot
   * see. That band is ~7% of the screen and it is exactly where the eye goes.
   * The POP PUFF is therefore what has to make the pop legible, which is why
   * popConfettiDepth below sits ABOVE the cast and its name tags rather than
   * one step above the balloons. See DECISIONS.md 2026-07-22 (ST-3). */
  balloonDepth: DEPTHS.props + 5,

  // --------------------------------------------- balloon-pop confetti burst
  // The tiny radial puff a popped balloon leaves behind (systems/confetti.ts's
  // createConfettiBurst at launchSpreadRad = PI). Small and quick on purpose —
  // it is a tap's worth of delight, not LevelComplete's celebration burst.
  // FORWARD-NOTE (PLAN-10 owns ALL audio): the balloon-pop SFX hooks in at the
  // single `pop()` call site in partyBalloons.ts, right beside this burst.
  /** Pieces per pop. */
  popConfettiCount: 14,
  /** Min/max initial speed, px/sec (gentler than LevelComplete's burst). */
  popConfettiSpeedMinPxPerSec: 140,
  popConfettiSpeedMaxPxPerSec: 320,
  /** Downward acceleration on the puff, px/sec^2. */
  popConfettiGravityPxPerSec2: 700,
  /** Max absolute tumble spin, rad/sec. */
  popConfettiSpinMaxRadPerSec: 8,
  /** Min/max piece lifetime, ms — short, so a pop is a blink not a shower. */
  popConfettiLifetimeMinMs: 500,
  popConfettiLifetimeMaxMs: 1000,
  /** Min/max piece edge size, px (smaller than LevelComplete's burst). */
  popConfettiSizeMinPx: 6,
  popConfettiSizeMaxPx: 12,
  /** Life fraction (0..1) after which a piece fades 1 -> 0. */
  popConfettiFadeStartFrac: 0.5,
  /** How many simultaneous pops the shared burst pool covers. Derived from the
   * SAME worst case as the visible-count bound: balloonWorstCasePopsPerSec (12)
   * x popConfettiLifetimeMaxMs (1.0s) = 12 bursts can overlap, so the pool holds
   * 12 x popConfettiCount = 168 pieces and even a mashing player never sees a
   * thinned puff. Past this the burst simply draws fewer pieces rather than
   * allocating (see ConfettiBurstOptions.concurrentBursts). */
  popConfettiConcurrentBursts: 12,
  /** Pop-confetti layer depth — above the balloons (so a puff draws over the
   * flock still floating behind it) AND above the whole cast INCLUDING
   * nameTagDepth, which is the load-bearing half.
   *
   * THE PUFF IS THE POP'S ONLY GUARANTEED FEEDBACK. Once the balloons moved
   * behind the cast (see balloonDepth), a press landing on one of the six
   * front-row figures pops a balloon hidden behind them; if the puff were also
   * behind them — as it was at the first attempt's DEPTHS.props + 6 — the
   * player would get NOTHING on screen for that press, over ~7% of the screen
   * and precisely where they are looking. (PLAN-10's pop SFX would then fire
   * with nothing visible at all.) Puffs are 14 small, ~0.5-1.0s pieces, so
   * unlike the balloons they cannot re-create the name-tag occlusion that
   * motivated the move — screenshot-verified over the cast, not assumed.
   *
   * Sits just BELOW confettiFallDepth so the ambient rain stays the frontmost
   * layer; tests/partyBalloons.test.ts pins the whole ladder. */
  popConfettiDepth: DEPTHS.fx - 1,

  // ------------------------------------------ ambient falling confetti
  // PLAN-09's "confetti falling continuously" (task 2, PartyScene) and "confetti
  // still falling" (task 3, CreditsScene) — systems/confetti.ts's
  // createConfettiFall. The knobs live here, in the PARTY block, because both
  // finale scenes share one look; ST-3/ST-4 are the consumers.
  /** Pieces in the air at once — also the pool size (the rain recycles them
   * forever and never grows). */
  confettiFallCount: 60,
  /** Height of the band ABOVE the top edge that pieces enter from, px, so the
   * rain drifts in rather than popping into existence at y = 0. */
  confettiFallSpawnAbovePx: 200,
  /** Min/max downward speed, px/sec. Slow — this is ambient decor behind a
   * scene people are reading, not a celebration burst. */
  confettiFallSpeedMinPxPerSec: 60,
  confettiFallSpeedMaxPxPerSec: 150,
  /** Max absolute sideways drift, px/sec (a piece that drifts off one edge
   * wraps back in the other side). */
  confettiFallDriftMaxPxPerSec: 40,
  /** Max absolute tumble spin, rad/sec. */
  confettiFallSpinMaxRadPerSec: 4,
  /** Min/max piece edge size, px. */
  confettiFallSizeMinPx: 6,
  confettiFallSizeMaxPx: 14,
  /** Ambient-rain layer depth: on DEPTHS.fx — the FRONTMOST layer of the party
   * (above the cast, above nameTagDepth, above the balloons and above their pop
   * puffs), which is what ST-1's "keep nameTagDepth strictly below DEPTHS.fx"
   * invariant exists to guarantee. Small tumbling squares read as depth in
   * front of everything; the large balloons, which do not, sit far below at
   * balloonDepth. (This comment used to say the rain was BELOW the balloons and
   * puffs — true only before ST-3 moved that pair down the ladder.) */
  confettiFallDepth: DEPTHS.fx,

  // ------------------------------------------------------- venue backdrop
  // ST-3's warm-lit BACKYARD AT DUSK (PLAN-09 task 2's "Venue"). PLACEHOLDER-ERA
  // art, built entirely from scene.add.rectangle/graphics out of the existing
  // PALETTE — PLAN-10 replaces it wholesale, so these are LAYOUT numbers (where
  // the bands sit), not art. Every value is a screen y/px at the 1280x720 design
  // scale (design == screen at zoom 1), listed TOP-DOWN.
  //
  // CONTINUITY WITH LEVEL 22: the same duskIndigo -> plum -> sunsetGlow dusk ramp
  // and the same warm `sunshine` lights as themes.ts's `finalDusk` (level 22's
  // theme), so riding out of the final level and into the venue never changes
  // palette. The patio is deliberately DARK (plum) with warm sunsetGlow light
  // pools washed over it: a dark ground under warm pools is what actually reads
  // as "warm-lit at dusk", and it keeps the pastel cast and the cream text panels
  // popping instead of fighting the floor.
  /** Top of the MID dusk sky band (plum); everything above it is duskIndigo.
   * Sits at the string lights' own level: the strand's anchors (240) and most
   * of its span hang against clean duskIndigo night sky, and only the lowest
   * ~6px of the centre bulbs (which bottom out at 306) cross into the plum
   * band. */
  venueSkyMidY: 300,
  /** The last of the sunset behind the yard: TWO nested translucent sunsetGlow
   * ellipses centred on the fence top, brightest in the middle and fading to
   * the corners. It is an ellipse and not a BAND for the same reason the floor
   * pool is (screenshot-caught, twice): a full-width band of a saturated warm
   * color reads as a painted ledge or a countertop, whatever height it is — at
   * 22px and again at 42px — where a glow that falls off toward the edges reads
   * as light. Both layers use venueHorizonGlowAlpha and simply compose where
   * they overlap, which is what gives the falloff its middle step. */
  venueHorizonGlowCenterY: 400,
  venueHorizonGlowWidthPx: 1700,
  venueHorizonGlowHeightPx: 170,
  venueHorizonGlowCoreWidthPx: 1100,
  venueHorizonGlowCoreHeightPx: 110,
  venueHorizonGlowAlpha: 0.22,
  /** THE GROUND LINE: patio below, sky/fence above. MUST stay above
   * crowdGroundY or the back row would stand in mid-air; guarded by
   * tests/finale.test.ts. */
  venueGroundY: 450,
  /** Top of the back-yard fence (which runs down to venueGroundY). */
  venueFenceTopY: 392,
  /** Center-to-center spacing of the fence's darker plank seams, px. */
  venueFenceSeamPitchPx: 64,
  /** Width of one plank seam, px. */
  venueFenceSeamWidthPx: 6,
  /** Height of the darker rail capping the top of the fence, px. */
  venueFenceRailHeightPx: 6,
  /** The warm light pool washed over the venue — the "warm-lit" cue, and the
   * one piece of it that is an ELLIPSE rather than a band: a full-width
   * translucent RECTANGLE just lightens the whole floor uniformly and reads as
   * a different floor color, where an ellipse reads as light falling on it
   * (screenshot-caught). THREE nested rings (faint halo, then wide+dim, then
   * narrow+brighter) fake the falloff cheaply; two alone left a crisp visible
   * curve sweeping across the patio that read as a hard-edged oval rug, so the
   * outermost ring exists purely to soften that edge. Centre y sits between the
   * crowd's feet and the front row's, so the pool is centred on the people.
   *
   * IT IS NOT FLOOR-ONLY, AND THAT IS DELIBERATE: the pool's top reaches above
   * venueGroundY (540 - 340/2 = 370), so ~80px of it washes up the fence and it
   * is still ~967px wide at the ground line. Light falling on a yard does hit
   * the fence behind it, and the spill is what keeps the fence from reading as
   * a flat cut-out band — so this is kept rather than clipped. The test only
   * pins the pool's CENTRE (which is genuinely on the floor), never its
   * extent. */
  venueGlowPoolCenterY: 540,
  /** The faint outermost halo — the ring that softens the pool's outer edge. */
  venueGlowHaloWidthPx: 1460,
  venueGlowHaloHeightPx: 430,
  venueGlowHaloAlpha: 0.08,
  venueGlowPoolWidthPx: 1140,
  venueGlowPoolHeightPx: 340,
  venueGlowPoolAlpha: 0.22,
  /** The narrower, brighter core of the same pool. */
  venueGlowCoreWidthPx: 680,
  venueGlowCoreHeightPx: 200,
  venueGlowCoreAlpha: 0.16,

  // -------------------------------------------------------- string lights
  // A sagging strand of warm bulbs across the yard — the second "warm-lit" cue,
  // and the one that most says "party" at a glance. Sits BELOW the bouquet toast
  // and ABOVE the crowd's heads (the highest head top is ~364: crowdGroundY 470
  // minus a 48px sprite at the tallest crowdScale), so it crosses nothing. The
  // strand bottoms out at 306, and tests/finale.test.ts derives the head top
  // from the REAL cast slots rather than trusting this number.
  /** Y the strand is pinned to at both screen edges, px. */
  lightStringAnchorY: 240,
  /** How far the strand sags below its anchors at screen centre, px (a simple
   * parabola, 0 at the edges). */
  lightStringSagPx: 56,
  /** Bulbs along the strand, evenly spaced across the full screen width. */
  lightStringBulbCount: 21,
  /** Bulb square edge length, px. */
  lightStringBulbSizePx: 10,
  /** Wire thickness, px. */
  lightStringWireWidthPx: 3,

  // ------------------------------------------------------------ streamers
  // PLAN-09 task 2's "streamers": short zigzag ribbons hanging from the TOP
  // EDGE. Screen-space, so they do NOT reuse decorations.ts's world-anchored
  // drawStreamer — see the comment at PartyScene.drawStreamers.
  /** Screen x of each hanging streamer, px. Clustered at the LEFT and RIGHT
   * edges on purpose so the ribbons FRAME the banner (whose panel spans roughly
   * 252..1028 at bannerFontSizePx 40) instead of crossing it. */
  streamerXsPx: [40, 120, 200, 1080, 1160, 1240],
  /** How far a streamer hangs from the top edge, px. Kept above the bouquet
   * toast's panel so a ribbon never crosses the toast. */
  streamerLengthPx: 120,
  /** Zigzag segments per streamer (more = tighter zigzag). */
  streamerSegments: 5,
  /** Half-width of the zigzag, px. */
  streamerAmplitudePx: 16,
  /** Ribbon stroke thickness, px. */
  streamerThicknessPx: 6,

  // --------------------------------------------------------------- banner
  // The big "HAPPY 22nd GABBY!!" banner (the string itself is VERBATIM personal
  // content and lives in src/data/finale.ts — never re-typed here). Cream
  // pixel-panel behind plum pixel text, the same legibility convention the name
  // tags and LEVEL_INTRO's banner use, so it reads over the dusk sky.
  /** Banner panel centre Y, px. */
  bannerCenterY: 72,
  /** Banner font size, px (snapped to the 8px grid by pixelText). Big — this is
   * the headline of the whole game. */
  bannerFontSizePx: 40,
  /** Cream panel padding around the banner text, each side, px. */
  bannerPadXPx: 28,
  bannerPadYPx: 20,
  /** Thickness, px, of the two "strings" the banner hangs from — drawn straight
   * up from the panel's top corners to the top edge of the screen. */
  bannerHangerWidthPx: 3,

  // -------------------------------------------------------- bouquet payoff
  // PLAN-09 task 2: "if tulips > 0, Gabby holds the bouquet; toast 'You brought
  // N tulips to the party!! <tulip>'". BOTH are gated on tulips > 0 — at zero
  // there is no bouquet and no toast at all (never a zero-count toast).
  /** Bouquet toast panel centre Y, px — directly under the banner, and well
   * above the crowd's head tops (the highest is ~364; this panel bottoms out at
   * ~195). */
  toastCenterY: 168,
  toastFontSizePx: 20,
  toastPadXPx: 24,
  toastPadYPx: 12,
  /** The bouquet Gabby HOLDS: offsets from her cast slot's centre x and FEET y,
   * px. Negative x puts it on her far side from Caleb (he stands immediately to
   * her right); negative y sets the height of her GRIP. Re-applied every frame
   * on top of her 2-frame idle bounce (castBounceOffsetPx + her phase01) so it
   * can never detach from her as she bobs.
   *
   * SHE IS THE POINT OF THIS SCREEN, so the bunch is carried AT HER SIDE, not
   * painted across her. The first pass used -30/-50 at scale 1.6, which put the
   * bouquet's centre INSIDE her 36px half-width and its top at her chin: a
   * pale-green mass over her whole left half, obscuring the one character this
   * gift is about (screenshot-caught). It is now smaller, lower and further
   * out — overlapping her silhouette enough to read as held, with its centre
   * outside her sprite and its blossoms clear of the face band that
   * GABBY_BASE_LAYOUT defines. tests/finale.test.ts pins all three properties
   * against that layout rather than against a copied number. */
  bouquetOffsetXPx: -50,
  bouquetOffsetYPx: -28,
  /** Uniform scale of the 16x24 tex-tulip placeholder used per bouquet stem. */
  bouquetScale: 1.2,
  /** Stems in the bouquet. It is a BOUQUET, not one flower — screenshot-caught
   * twice: a SINGLE placeholder tulip beside Gabby read as a stray green box,
   * and three stems packed 13px apart merged into one flat green slab that was
   * indistinguishable from the pale-green BALLOONS drifting past (PALETTE.grass
   * is in BALLOON_TINTS). The three below are spread wider than they are packed
   * and stepped in height, over a brown wrap — a silhouette no balloon has. */
  bouquetStemCount: 3,
  /** Centre-to-centre fan spacing between stems, px. Deliberately more than
   * HALF a scaled tulip (16 x bouquetScale / 2), so the outer blossoms clear the
   * middle one instead of hiding inside it. */
  bouquetSpreadXPx: 14,
  /** How much higher the MIDDLE stem sits than the outer ones, px (the outer
   * stems taper down to 0), so the bunch has a stepped silhouette instead of a
   * flat top. */
  bouquetLiftYPx: 8,
  /** The dark STEM BUNDLE she grips, drawn hanging below the blossoms — the
   * second "these are flowers in a hand, not a balloon" cue. Drawn in
   * PALETTE.outline rather than PALETTE.brown, which was the first attempt and
   * vanished against the brown-lit patio, and rather than a cream "paper wrap",
   * which vanished against Gabby's default off-white racing suit. A chunky
   * block cannot be confused with a balloon's 3x40 string. */
  bouquetGripWidthPx: 12,
  bouquetGripHeightPx: 12,
  /** Bouquet render depth — one above the front row so it draws IN FRONT of
   * Gabby (she is holding it), still below nameTagDepth. */
  bouquetDepth: DEPTHS.rider + 1,

  // ----------------------------------------------------- "Credits" button
  // PLAN-09 task 2: "After ~4 seconds, a 'Credits ->' button fades in
  // (bottom-right). The scene stays alive — no forced exit." Nothing here ever
  // advances the scene on its own; this only reveals the way out.
  /** How long after entering the party the button appears, ms. */
  creditsButtonDelayMs: 4000,
  /** Fade-in duration once revealed, ms. */
  creditsButtonFadeMs: 600,
  /** Minimum face width, px. At bannerFontSizePx's sibling default label size
   * (24) the label "Credits ->" measures 9 x 24 = 216px in Press Start 2P, and
   * ui.ts adds 32px of padding each side — so 280 IS the natural width and the
   * button's footprint is deterministic, which is what lets the bottom-right
   * anchor below be computed rather than eyeballed. */
  creditsButtonMinWidthPx: 280,
  /** Gap from the right/bottom screen edges to the button FACE, px. The scene
   * derives the button centre from these + creditsButtonMinWidthPx +
   * UI_MIN_TOUCH_PX (the face height), so the corner anchor stays honest if any
   * of them is retuned. */
  creditsButtonMarginXPx: 32,
  creditsButtonMarginYPx: 28,
} as const;

/** CreditsScene tuning (PLAN-09 task 3 / ST-4 — see src/scenes/CreditsScene.ts).
 * NORTH_STAR §5's closing screen, and the LAST THING THE RECIPIENT OF THIS GIFT
 * EVER SEES: the three VERBATIM credit lines centred on a DARK field with the
 * confetti still falling, revealed LINE BY LINE, then — below a divider — the
 * tulip count, "Play again?" (progress kept) and a clearly secondary
 * "Fresh start" that wipes the save behind an in-scene confirmation.
 *
 * Like LevelCompleteScene / PartyScene this is a plain (non-Matter) scene at
 * camera zoom 1 — ZERO Matter bodies, NO zoom compensation — so every length
 * below is a straight px at the 1280x720 DESIGN scale (design == screen at
 * zoom 1) and every time is ms.
 *
 * WHAT IS *NOT* HERE, on purpose: every rendered STRING lives in
 * src/data/finale.ts — CREDITS_LINES, tulipTallyText, and the CREDITS_* chrome
 * (the button labels + the fresh-start confirmation's wording) — and none of
 * them is re-typed here, not even in a comment. The ambient rain reuses the
 * PARTY.confettiFall* knobs that block already documents as shared by BOTH
 * finale scenes. What lives here is only this screen's own geometry and pacing,
 * and tests/finale.test.ts measures the REAL strings against these numbers.
 *
 * VERTICAL STACK, top-down (each value's doc carries its own arithmetic):
 *   line 1 -> line 2 -> line 3 -> a tiny heart -> the divider -> the tulip
 *   line -> "Play again?" -> "Fresh start".
 * tests/finale.test.ts pins the whole stack for overlap, on-screen fit and
 * touch-target size, so a retune fails loudly instead of only in a screenshot. */
export const CREDITS = {
  // ----------------------------------------------------------------- canvas
  /** The dark field the credits sit on. duskIndigo rather than a near-black:
   * it is level 22's and the party's OWN night sky (themes.ts's `finalDusk`,
   * PARTY.venueSkyMidY's upper band), so walking out of the party into the
   * credits never changes palette — and the pastel confetti reads far better
   * falling through a deep indigo than through black. */
  backgroundColor: PALETTE.duskIndigo,
  /** Fill colour for every string drawn straight ONTO THE DARK FIELD above —
   * the credit lines and the tulip tally. Deliberately NOT pixelText's default
   * TEXT_COLOR (plum #4a2c40), which is tuned for the pastel-pink menus and is
   * effectively illegible here; cream on duskIndigo measures ~10.3:1 contrast
   * (WCAG AAA is 7:1). createPixelText takes no colour, so CreditsScene applies
   * this through one `creditsText()` helper.
   *
   * IT IS NOT "every string on the screen", and the difference matters. SIX
   * strings sit on a CREAM surface and keep the plum default on purpose (the
   * same convention the party's name tags and banner use): the two bottom button
   * labels and the confirmation's two button labels, all four inside ui.ts's
   * cream faces, plus the confirmation's title and body on its cream panel.
   * Repainting any of them in this colour would render cream on cream. */
  textColor: PALETTE.cream,

  // ------------------------------------------------------- the three lines
  /** Centre y of each credit line, px — ONE ENTRY PER data/finale.ts
   * CREDITS_LINES entry, in the same order (tests/finale.test.ts pins the count
   * and that they run top-down). The gap before the third is deliberately
   * larger than the gap between the first two: the LAST line is the punchline,
   * so it gets air and its own bigger font instead of reading as the third item
   * in a list. (The lines themselves are in data/finale.ts — deliberately not
   * re-typed here, so this comment cannot drift from them.) */
  lineCenterYsPx: [156, 220, 300],
  /** Font size of the first two credit lines, px (snapped to the 8px pixel grid
   * by pixelText). Press Start 2P advances exactly one font size per character,
   * so the longest of them (29 chars) measures 29 x 32 = 928px, comfortably
   * inside DESIGN_WIDTH — tests/finale.test.ts re-derives that from the real
   * CREDITS_LINES rather than trusting this number. */
  lineFontSizePx: 32,
  /** Font size of the LAST credit line, px. Bigger, because it is the one
   * sentence the whole game exists to say. 13 chars x 40 = 520px. */
  finalLineFontSizePx: 40,

  // ------------------------------------------------------------ the reveal
  // PLAN-09 task 3: "revealed line by line" — a whole line at a time, NOT
  // LevelCompleteScene's per-character typewriter. A tap/click ANYWHERE skips
  // straight to the finished screen, the same courtesy that scene's note card
  // offers, so an impatient player is never stuck watching.
  /** Beat before the FIRST line appears, ms — lets the dark field and the
   * falling confetti register before any words do. */
  revealFirstLineDelayMs: 400,
  /** Gap between consecutive lines appearing, ms. */
  revealLineIntervalMs: 900,
  /** How long ONE line fades from invisible to full, ms. Kept well under
   * revealLineIntervalMs so a line has settled before the next one starts. */
  revealLineFadeMs: 350,
  /** Beat AFTER the last line before anything below the divider appears, ms —
   * the pause that lets the final line land on its own. */
  revealTailDelayMs: 600,
  /** Fade duration of the below-the-divider content (heart, divider, tulip
   * line), ms. The two buttons are built when this fade FINISHES.
   *
   * WHAT EACH OF THE TWO MECHANISMS ACTUALLY BUYS. An earlier version of this
   * doc claimed late construction made a stray activation impossible; the ST-4
   * code review disproved that in the browser, so state it accurately:
   *   - ui.ts's per-pointer PRESS LATCH is the safety mechanism. `onClick` now
   *     requires a pointerdown on that same button first, so a press that began
   *     on empty space and merely ENDED over a button cannot fire it. Before
   *     that landed, a hold longer than this fade both skipped the reveal AND
   *     activated whichever button appeared under the finger — measured: a 300ms
   *     hold did nothing, a 420ms hold routed to the Title. Late construction
   *     only BOUNDED that window at ~400ms; it never closed it.
   *   - Late construction is now a COMPOSITION choice (nothing competes with the
   *     three lines while they land) plus belt-and-braces: an alpha-0 Phaser
   *     Container is still fully interactive, so fading a pre-built button in
   *     would leave a live-but-invisible target — the same hazard
   *     PARTY.creditsButtonDelayMs's doc describes. */
  tailFadeMs: 400,

  // -------------------------------------------------------------- the heart
  // PLAN-09 task 3's "A tiny heart somewhere. Tasteful." Centred directly under
  // the LAST credit line and above the divider, so it reads as a signature ON
  // the message rather than as decoration floating in a corner.
  /** Heart centre y, px. */
  heartCenterY: 364,
  /** Heart bounding-box size, px. TINY is the brief — smaller than the smallest
   * text on the credits FIELD (the tulip tally, at tulipLineFontSizePx). The
   * fresh-start confirmation's body is smaller still, but that lives on a modal
   * panel rather than in this screen's own vertical stack. */
  heartSizePx: 22,

  // ------------------------------------------------------------ the divider
  // "Below a divider: ..." — the rule that separates the message from the
  // housekeeping under it.
  /** Divider centre y, px. */
  dividerY: 410,
  /** Divider width, px. Wider than the final line (520) and much narrower than
   * the longest credit line (928), so it reads as a rule UNDER the message
   * rather than as a box around it. */
  dividerWidthPx: 560,
  /** Divider thickness, px. */
  dividerThicknessPx: 4,
  /** Divider alpha — the same cream as the text, dimmed, so it separates
   * without competing with the words above it. */
  dividerAlpha: 0.45,

  // --------------------------------------------------------- the tulip line
  // PLAN-09 task 3's "<tulip> x N collected", reading the REAL persisted total
  // (save.ts's getTulips()). Shown at EVERY count including zero: unlike the
  // party's bouquet TOAST (which congratulates, so it is gated on tulips > 0),
  // this is a factual tally, and hiding it would leave the divider with nothing
  // under it but buttons. The string is data/finale.ts's tulipTallyText, where
  // both non-ASCII characters are written as \u{...} escapes and pinned by a
  // code-point oracle; both were screenshot-verified to render as real glyphs
  // rather than tofu (DECISIONS.md, 2026-07-22).
  /** Tulip-line centre y, px. */
  tulipLineCenterY: 456,
  /** Tulip-line font size, px — a quiet tally, well under the credit lines. */
  tulipLineFontSizePx: 24,

  // ----------------------------------------------------------------- buttons
  // Two STACKED rows, primary above secondary: "Play again?" keeps everything,
  // "Fresh start" wipes it. ui.ts gives every face a UI_MIN_TOUCH_PX (88) tall
  // face, so the row centres are kept well clear of that — 124 apart here, which
  // is deliberately WIDER than LEVEL_COMPLETE's 116 (548 -> 664), because those
  // two rows are peers and these two are a primary and its secondary. The lower
  // row still clears the bottom screen edge (660 + 44 = 704 < 720).
  /** "Play again?" centre y, px — the PRIMARY action. Routes to the Title with
   * every gabby22.* key untouched. */
  playAgainButtonY: 536,
  /** Its face width, px. MUST stay >= the label's natural width so the face
   * width is deterministic and the geometry tests are exact (the same
   * discipline PARTY.creditsButtonMinWidthPx documents): "Play again?" is 11
   * chars, which at ui.ts's default 24px label size measures 11 x 24 = 264px,
   * plus 32px of padding each side = 328 natural. 480 is therefore the real
   * width — and being far wider than the secondary below IS the hierarchy. */
  playAgainButtonMinWidthPx: 480,
  /** "Fresh start" centre y, px — the SECONDARY action, which wipes the save
   * behind the confirmation below. Pushed down from 648 so the gap between the
   * two faces grows from 24px to 36px: with the alpha above, the extra air is
   * what makes it read as a separate, quieter option rather than as the second
   * half of a button pair. */
  freshStartButtonY: 660,
  /** Its face width, px. Same natural-width arithmetic ("Fresh start" is also
   * 11 chars = 328 natural), so 340 is the real width — deliberately much
   * narrower than the primary, and still >= UI_MIN_TOUCH_PX.
   * tests/finale.test.ts now derives that natural width from the REAL label in
   * data/finale.ts rather than trusting the arithmetic in this sentence. */
  freshStartButtonMinWidthPx: 340,
  /** Alpha of the SECONDARY button. WIDTH ALONE DID NOT CARRY THE HIERARCHY:
   * with identical cream faces, outlines, plum labels and font size, 480 vs 340
   * still read as two peers rather than as a primary and its secondary
   * (screenshot-caught by the ST-4 code review). ui.ts offers no styling hook
   * short of a whole button variant, and alpha is the cheapest honest lever that
   * does not touch the shared kit — it dims face, outline, shadow and label
   * together. Kept high enough to stay comfortably legible and obviously
   * pressable: this is a real option, not a disabled one (ui.ts renders
   * `disabled` at 0.55). */
  freshStartButtonAlpha: 0.8,

  // ------------------------------------------------- the fresh-start confirm
  // "Fresh start" calls save.ts's resetAll(), which deletes EVERY gabby22.* key
  // — her levels, her tulips, and the Gabby she built. So it never fires
  // directly: it opens an IN-SCENE confirmation (never window.confirm) over a
  // full-screen dim, and while that is open the two buttons underneath are
  // input-DISABLED, so no press can leak through to them. Cancel is the wide
  // left-hand button and changes nothing at all.
  /** Alpha of the full-screen dim drawn behind the panel (in PALETTE.outline) —
   * high enough that the credits behind it clearly recede. */
  confirmDimAlpha: 0.78,
  /** Confirm panel centre y + size, px. Centred in the viewport (360 == half of
   * DESIGN_HEIGHT), 180..540 vertically and 140..1140 horizontally. */
  confirmPanelCenterY: 360,
  confirmPanelWidthPx: 1000,
  confirmPanelHeightPx: 360,
  /** Panel title ("Start over?") centre y + font size, px. */
  confirmTitleY: 246,
  confirmTitleFontSizePx: 32,
  /** Body copy centre y + font size + extra gap between its lines, px. The body
   * is THREE pre-broken lines (never word-wrapped), so the geometry here is
   * exact: 3 x 16 + 2 x 12 = 72px tall, and the longest line is 36 chars x 16 =
   * 576px — inside the panel's 1000 - 2 x 32 of usable width. */
  confirmBodyY: 322,
  confirmBodyFontSizePx: 16,
  confirmBodyLineSpacingPx: 12,
  /** Both confirm buttons' centre y, px — one row inside the panel, clearing
   * its bottom edge by 44px. */
  confirmButtonY: 452,
  /** CANCEL ("Keep my progress"): centre-x offset from screen centre + face
   * width, px. On the LEFT and the WIDER of the two on purpose — it is the
   * easy, obvious out. 16 chars x 24 + 2 x 32 = 448 natural, so 460 is the real
   * width. */
  confirmCancelOffsetXPx: -220,
  confirmCancelMinWidthPx: 460,
  /** CONFIRM ("Erase it all"): centre-x offset + face width, px. On the right
   * and visibly narrower. 12 chars x 24 + 2 x 32 = 352 natural, so 360 is the
   * real width. The two offsets are ASYMMETRIC because the two faces are: they
   * are chosen so the PAIR is centred as a group (190..1090, centre 640) with
   * an 80px gap between them and 50px of panel padding either side. */
  confirmConfirmOffsetXPx: 270,
  confirmConfirmMinWidthPx: 360,
} as const;

/** Centralized scene keys — all scenes and transitions reference these
 * instead of string literals. See NORTH_STAR.md §4 for the scene flow. */
export const SCENE_KEYS = {
  boot: 'BootScene',
  title: 'TitleScene',
  characterCreation: 'CharacterCreationScene',
  levelSelect: 'LevelSelectScene',
  game: 'GameScene',
  pause: 'PauseScene',
  levelComplete: 'LevelCompleteScene',
  party: 'PartyScene',
  credits: 'CreditsScene',
} as const;

/** Centralized texture keys for generated (placeholder, then real pixel-art)
 * textures. BootScene registers these; every later plan references them by
 * key instead of string literals, so swapping placeholder rectangles for
 * real art in PLAN-10 touches only the generator, not call sites.
 *
 * `gabbyBase` / `bikeBase` (PLAN-04 task 1) are the marker-composite BASE
 * textures the palette-swap engine (src/systems/palette.ts) recolors —
 * separate from the solid-color `gabby` / `bike` placeholders above. Those
 * raw placeholders are deliberately KEPT (not retired): they are createBike's
 * DEFAULT texture fallback (bike.ts BikeOptions.textures), so a
 * non-character-aware caller stays behavior-identical, while GameScene
 * (PLAN-04 task 4) overrides them per-instance with the palette-swapped
 * character variants recolored from `gabbyBase` / `bikeBase`. `wheel` is
 * always used raw (wheels are never recolored). `wheelieRider` (PLAN-07 task
 * 2) is level 11's bespoke all-black + black-helmet rider texture — REAL
 * committed art as of PLAN-10 ST-2 (src/art/sprites.mjs drawWheelieRider),
 * loaded by BootScene from ART_MANIFEST like every other real sprite. */
export const TEXTURE_KEYS = {
  bike: 'tex-bike',
  bikeBase: 'tex-bike-base',
  wheel: 'tex-wheel',
  gabby: 'tex-gabby',
  gabbyBase: 'tex-gabby-base',
  caleb: 'tex-caleb',
  car: 'tex-car',
  policeCar: 'tex-police-car',
  flag: 'tex-flag',
  tulip: 'tex-tulip',
  balloon: 'tex-balloon',
  wheelieRider: 'tex-wheelie-rider',
} as const;

/** Region layout for the PLAN-04 marker-composite rider base texture
 * (BootScene's generateGabbyBaseTexture draws tex-gabby-base — 24x48,
 * matching TEXTURE_SPECS.gabby there): a hairHeight-tall MARKERS.hair
 * band, then a faceHeight-tall skin-toned face band (with two MARKERS.eyes
 * squares inset), then MARKERS.suit fills the remainder (torso/legs).
 * Lives here (not BootScene-local) because CharacterCreationScene's
 * live-preview blink overlay (PLAN-04 task 3) also needs the exact eye
 * position for its eyelid rect — sharing one definition means the two can
 * never silently drift apart the way two independently-hardcoded copies
 * could. PLACEHOLDER ONLY — PLAN-10 replaces the actual art, not
 * necessarily this shape. */
export const GABBY_BASE_LAYOUT = {
  hairHeight: 10,
  faceHeight: 12,
  eyeSize: 3,
  leftEyeX: 6,
  rightEyeX: 15,
  eyeInsetY: 5,
} as const;

/** Character-creation live-preview + swatch-row layout & idle-animation
 * tuning (PLAN-04 task 3 — see src/scenes/CharacterCreationScene.ts). All
 * lengths are px at the 1280x720 DESIGN scale. This is a static menu scene
 * at camera zoom 1 (like Title/LevelSelect), so — unlike GameScene's HUD —
 * NONE of this needs zoom-compensation.
 *
 * THUMB-FRIENDLY BUDGET (NORTH_STAR §8: touch targets >= 88px): the BIKE
 * row (8 swatches) is the tightest fit. swatchHitSizePx is decoupled from
 * swatchVisibleSizePx exactly like pedals.ts's visible-face-vs-hit-Zone
 * pattern: a small visible swatch face keeps the row from looking
 * crowded, while the (much bigger, invisible) hit area stays >=
 * UI_MIN_TOUCH_PX and hit areas never overlap (centers spaced
 * swatchCenterSpacingPx apart). Budget check for the 8-swatch BIKE row:
 * rowStartX + 7*swatchCenterSpacingPx + swatchHitSizePx/2
 * = 590 + 630 + 44 = 1264, inside DESIGN_WIDTH (1280). */
export const CHARACTER_CREATE = {
  // ------------------------------------------------------------ preview
  /** Preview bike-chassis anchor x, px — rider/wheels are positioned
   * relative to it using the SAME BIKE_TUNING offsets the real in-game rig
   * uses (bike.ts), scaled by previewScale, so the preview is faithful to
   * actual gameplay geometry, just blown up to read as a large preview. */
  previewCenterX: 220,
  /** Preview bike-chassis anchor y, px. */
  previewCenterY: 380,
  /** Uniform scale applied to the bike/wheel/rider sprites AND their
   * BIKE_TUNING-derived offsets in the preview. The placeholder art (bike
   * 96x28, rider 24x48) would read tiny at native size; this blows the
   * whole rig up into a large preview while keeping every part's relative
   * position identical to bike.ts's real rig. */
  previewScale: 3.5,

  // -------------------------------------------------------- swatch rows
  /** Visible swatch face size (a square), px. Deliberately smaller than
   * swatchHitSizePx — see the block doc comment's thumb-friendly budget. */
  swatchVisibleSizePx: 56,
  /** Extra px (each side) the selection-highlight halo extends past the
   * visible face. */
  swatchHighlightPadPx: 8,
  /** Swatch face outline stroke width, px. */
  swatchOutlineWidthPx: 3,
  /** Invisible interactive hit-area size (a square), px. MUST equal
   * UI_MIN_TOUCH_PX (NORTH_STAR §8) — kept as its own named field (rather
   * than inlining UI_MIN_TOUCH_PX at each call site) so every "why 88"
   * reference lives in one obvious spot. */
  swatchHitSizePx: UI_MIN_TOUCH_PX,
  /** Center-to-center spacing between adjacent swatches in a row, px.
   * > swatchHitSizePx so adjacent 88px hit areas never touch/overlap (a
   * ~2px gutter at 90). */
  swatchCenterSpacingPx: 90,
  /** Row label center x, px — shared by all four row labels (HAIR / EYES
   * / BIKE / SUIT — all <= 4 characters). */
  rowLabelX: 480,
  /** Row label font size, px (snapped to the 8px pixel-font grid by
   * createPixelText's snapFontSize). */
  rowLabelFontSizePx: 24,
  /** First (leftmost) swatch's center x, px — shared by all four rows.
   * See the block doc comment above for the 8-swatch BIKE-row budget this
   * value was chosen to satisfy. */
  rowStartX: 590,
  /** HAIR row center y, px. */
  hairRowY: 185,
  /** EYES row center y, px. */
  eyesRowY: 300,
  /** BIKE row center y, px. */
  bikeRowY: 415,
  /** SUIT row center y, px (row label for CharacterConfig.outfit — "SUIT"
   * reads better as a 4-letter row label alongside HAIR/EYES/BIKE). */
  suitRowY: 530,

  // ----------------------------------------------------- action buttons
  /** "Randomize" button center x, px. */
  randomizeButtonX: 460,
  /** "Let's ride!" button center x, px. */
  letsRideButtonX: 820,
  /** Shared center y, px, for both action buttons. */
  actionButtonY: 660,

  // ------------------------------------------------ idle animation: bounce
  /** Vertical bounce amplitude, px — how far the preview container rises
   * on each yoyo half-cycle. Subtle on purpose: an idle tell, not
   * attention-grabbing motion. */
  bounceAmplitudePx: 6,
  /** Duration, ms, of ONE half of the bounce (up OR down) — with
   * `yoyo: true` a full up-down cycle takes 2x this. Gentle/slow on
   * purpose. */
  bouncePeriodMs: 1400,

  // ---------------------------------------------------- idle animation: blink
  /** Minimum time, ms, between the start of one blink and the next. */
  blinkMinIntervalMs: 2500,
  /** Maximum time, ms, between the start of one blink and the next (the
   * actual gap is randomized in [blinkMinIntervalMs, blinkMaxIntervalMs)). */
  blinkMaxIntervalMs: 3500,
  /** How long the eyelid stays down (visible) per blink, ms. */
  blinkDurationMs: 120,
  /** Rider-sprite-LOCAL (unscaled, relative to the rider Image's own
   * center — default origin 0.5/0.5) vertical offset of the eye band the
   * blink eyelid rect sits over, px. Derived from GABBY_BASE_LAYOUT (the
   * actual marker positions baked into tex-gabby-base) plus the rider base
   * texture's documented 48px height (see BIKE_TUNING.riderOffsetY's doc
   * comment for the same "48px tall" fact — not promoted to a shared
   * constant since the rider has no physics body, so nothing besides this
   * cosmetic overlay needs it): the eye squares span y
   * [hairHeight+eyeInsetY, +eyeSize] in TEXTURE space (y=0 at top), and the
   * sprite's own vertical center sits at height/2 = 24. */
  eyeBandOffsetY:
    GABBY_BASE_LAYOUT.hairHeight + GABBY_BASE_LAYOUT.eyeInsetY + GABBY_BASE_LAYOUT.eyeSize / 2 - 24,
  /** Rider-sprite-LOCAL horizontal offset of the eye band, px. Exactly 0:
   * GABBY_BASE_LAYOUT's two eye squares (leftEyeX..rightEyeX+eyeSize =
   * 6..18) are symmetric about the 24px-wide sprite's own center (12), by
   * construction. */
  eyeBandOffsetX: 0,
  /** Eyelid rect size, rider-sprite-LOCAL unscaled px — a little larger
   * than the raw 12x3 span covering both eye marker squares + the gap
   * between them, so it fully covers both with a small margin. */
  eyeBandWidthPx: 16,
  eyeBandHeightPx: 6,
} as const;
