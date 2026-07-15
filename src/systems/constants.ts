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

/** Soft-fail tuning (PLAN-02 task 4 — GameScene's crash / fell-off-world
 * handling). Restart flow: fail detected -> friendly overlay -> scene
 * restart; overlayDurationMs + the restart itself must stay well under the
 * 500ms budget (PLAN-02: "restarts are < 500ms"). */
export const FAIL = {
  /** How far below the LOWEST terrain surface point the bike may fall
   * before it counts as "fell off the world", px. */
  worldBottomMarginPx: 500,
  /** How long the "Oops! Go again 💛" overlay stays up before the level
   * restarts, ms. */
  overlayDurationMs: 350,
} as const;

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

/** Total number of levels in the game. A locked fact from NORTH_STAR.md —
 * never make this configurable or derive it from level data. */
export const TOTAL_LEVELS = 22;

/** Centralized scene keys — all scenes and transitions reference these
 * instead of string literals. See NORTH_STAR.md §4 for the scene flow. */
export const SCENE_KEYS = {
  boot: 'BootScene',
  title: 'TitleScene',
  characterCreation: 'CharacterCreationScene',
  levelSelect: 'LevelSelectScene',
  game: 'GameScene',
  levelComplete: 'LevelCompleteScene',
  party: 'PartyScene',
  credits: 'CreditsScene',
} as const;

/** Centralized texture keys for generated (placeholder, then real pixel-art)
 * textures. BootScene registers these; every later plan references them by
 * key instead of string literals, so swapping placeholder rectangles for
 * real art in PLAN-10 touches only the generator, not call sites. */
export const TEXTURE_KEYS = {
  bike: 'tex-bike',
  wheel: 'tex-wheel',
  gabby: 'tex-gabby',
  caleb: 'tex-caleb',
  car: 'tex-car',
  policeCar: 'tex-police-car',
  flag: 'tex-flag',
  tulip: 'tex-tulip',
  balloon: 'tex-balloon',
} as const;
