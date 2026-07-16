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
 * black-helmet texture wheelieRider.ts generates lazily (guarded, like
 * recolorTexture's own cache) the first time level 11 actually needs it.
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
 * 2) is level 11's bespoke all-black + black-helmet rider texture — unlike
 * every key above, BootScene never generates it; src/systems/wheelieRider.ts
 * generates it lazily (guarded, like a recolorTexture variant) the first time
 * level 11 actually needs it, since it's the one entity confined to a single
 * level. */
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
