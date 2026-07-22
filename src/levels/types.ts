// Data-driven level configuration types (PLAN-05 task 1). Pure TypeScript
// only: NO Phaser import, no rendering, no level content yet — later
// PLAN-05 tasks build the per-theme backdrop/palette/prop system
// (src/systems/themes.ts), the 22 real src/levels/levelNN.ts configs, and
// GameScene's consumption of all of it. This file is the shape those tasks
// build against, plus two small pure helpers: the seam GameScene will build
// terrain through, and a config validator a later Vitest test runs against
// the real 22 configs once they exist.
//
// NOTE: src/scenes/types.ts's LevelSceneData/normalizeLevel is UNRELATED
// scene-transition init data (which level NUMBER a scene was launched
// with) — don't confuse it with LevelConfig (a level's actual CONTENT).

import type { JumpSpec, Range, TerrainSpec } from '../systems/terrain';
import { LEVEL, TOTAL_LEVELS } from '../systems/constants';

// ---------------------------------------------------------------------------
// Terrain — reuses terrain.ts's types directly so a LevelConfig's `terrain`
// sub-object is always structurally compatible with TerrainSpec (see
// getLevelTerrainSpec below, the seam GameScene will build terrain through).
// ---------------------------------------------------------------------------

/** A level's flat zones ARE terrain Ranges — alias, not a redefinition, so
 * the two can never silently drift apart. */
export type FlatZone = Range;

// ---------------------------------------------------------------------------
// Theme ids. tsconfig's `erasableSyntaxOnly` forbids TS enums, so this is
// the codebase's `as const` array + derived string-literal-union idiom.
// THEME_IDS is exported (not just the ThemeId type) so other modules can
// iterate/validate against the full set — e.g. the later `THEMES:
// Record<ThemeId, …>` table in src/systems/themes.ts, which TypeScript will
// then force to cover every id here.
// ---------------------------------------------------------------------------

/** The 15 city-arc backdrop themes (NORTH_STAR §5), covering all 22 levels
 * (several levels intentionally share a theme). Real per-theme parallax
 * layers/palette/props land in a later PLAN-05 task
 * (src/systems/themes.ts) — this is just the authoritative id set. */
export const THEME_IDS = [
  'suburbs',
  'park',
  'smallTown',
  'downtown',
  'construction',
  'highway',
  'riverside',
  'bridge',
  'boulevard',
  'oldTown',
  'hilly',
  'billboardRow',
  'sunset',
  'partyDistrict',
  'finalDusk',
] as const;

export type ThemeId = (typeof THEME_IDS)[number];

// ---------------------------------------------------------------------------
// Decorations — static AMBIENT scenery (signs, billboards, balloons,
// streamers). Distinct from LevelEvent below: a decoration never DOES
// anything, it just sits in the world. Rendered in a later PLAN-05 task.
// ---------------------------------------------------------------------------

/** The four kinds of placeable ambient scenery. */
export type DecorationKind = 'sign' | 'billboard' | 'balloon' | 'streamer';

/** One static decoration placed along the level. */
export interface DecorationSpec {
  /** Which kind of decoration to render. */
  kind: DecorationKind;
  /** Distance along the level, px — same coordinate space as
   * JumpSpec.x / FlatZone.start. */
  x: number;
  /** Optional label copy for signs/billboards (e.g. a tutorial callout).
   * Kinds that never render text (balloon, streamer) ignore it. */
  text?: string;
}

// ---------------------------------------------------------------------------
// LevelEvent — scripted, one-off gameplay moments (as opposed to the
// ambient DecorationSpecs above). A real discriminated union on `type`, so
// a `switch (event.type)` exhaustively narrows. Implementations (traffic
// spawning, the police chase, the pickup cutscene, the wheelie-rider easter
// egg, the billboard's actual rendering) land in PLAN-06/07 — these shapes
// are deliberately minimal-but-plausible so a loader can already dispatch
// on `type` today; fields may be refined once those plans land.
// ---------------------------------------------------------------------------

/** Level 7's "invisible cars" oncoming traffic (NORTH_STAR §5). All spawn/
 * density fields below are OPTIONAL config-tunables (the traffic system —
 * PLAN-06 task B — supplies a sensible default for any omitted field), so
 * existing configs keep compiling. The discriminant stays `type: 'traffic'`. */
export interface TrafficEvent {
  type: 'traffic';
  /** How many oncoming cars the encounter run spawns/pools. */
  carCount?: number;
  /** Leftward travel speed of each car, px per render frame. */
  carSpeedPxPerFrame?: number;
  /** World x of the first car spawn (later cars follow at `spacingPx`). */
  firstSpawnX?: number;
  /** Horizontal spacing between successive car spawns, px. */
  spacingPx?: number;
  /** How long a car is telegraphed in the far (harmless) lane before it
   * drifts down into the player's near lane, ms. */
  laneDropTelegraphMs?: number;
  /** Indices (into the encounter run) of encounters that are "punch-through":
   * a shorter trigger lead (TRAFFIC.punchTriggerLeadPx) lets a confident player
   * accelerate through the gap before the car drops, instead of braking to hang
   * back. Still avoidable by braking. Omitted/empty = every encounter is a
   * brake-to-dodge one. */
  punchThroughIndices?: number[];
}

/** Level 15's police chase (NORTH_STAR §5). All pursuit fields below are
 * OPTIONAL config-tunables (the police system — PLAN-06 task D — defaults any
 * omitted field); the discriminant stays `type: 'police'`. */
export interface PoliceEvent {
  type: 'police';
  /** How far behind the bike the cop starts, px. */
  startBehindPx?: number;
  /** Gap (px) within which the cop counts as "on" the bike (see catchTimeMs). */
  catchDistancePx?: number;
  /** Continuous time within catchDistancePx before the player is caught, ms. */
  catchTimeMs?: number;
  /** Cop hard-cap speed as a FRACTION of the bike's full-gas top speed —
   * MUST be < 1 so holding gas always pulls away (the EASY mandate). */
  copMaxSpeedFrac?: number;
  /** Small rubber-band bonus added to the cop's tracked player-speed target,
   * px per render frame, so a stopped/crashed player gets closed on. */
  catchupBonusPxPerFrame?: number;
}

/** Level 12's mid-level stop at Caleb's house (pickup cutscene; from here
 * on Caleb rides pillion — NORTH_STAR §5). */
export interface CalebPickupEvent {
  type: 'calebPickup';
  /** Distance along the level where the stop happens, px. Required:
   * position is the whole point of this event. */
  x: number;
  /** How near `x` (px) the bike must be for the pickup cutscene to trigger.
   * OPTIONAL — the pickup system (PLAN-06 task C) defaults it. */
  stopWindowPx?: number;
}

/** Level 11's guaranteed, non-interactive easter egg: an all-black rider
 * wheelies past on a yellow motorcycle (NORTH_STAR §5). */
export interface WheelieRiderEvent {
  type: 'wheelieRider';
  /** Distance along the level where the rider appears, px. Optional: a
   * level author may prefer a sensible default placement instead. */
  x?: number;
}

/** Level 18's easter-egg billboard, tucked among decoy billboards. */
export interface BillboardEvent {
  type: 'billboard';
  /** Distance along the level where the billboard is placed, px. */
  x: number;
  /** The sign copy — personal content, verbatim per NORTH_STAR §5/§7.
   * Never paraphrase this at the authoring site. */
  text: string;
}

/** Level 22's arrival at the party venue (NORTH_STAR §5 row 22: "Ends at
 * the party venue → transitions to PartyScene"). Placement is expressed
 * RELATIVE TO THE FINISH FLAG rather than as absolute world x, because the
 * whole beat straddles it: the scripted ride-in takes control before the
 * flag and the venue's doorway stands past it. Both fields are OPTIONAL
 * config-tunables (the arrival system defaults any omitted one from the
 * ARRIVAL constants block). */
export interface PartyArrivalEvent {
  type: 'partyArrival';
  /** How far BEFORE the finish flag (px) the scripted ride-in takes over
   * the pedals, carrying the player in whatever their speed. */
  rideInLeadPx?: number;
  /** How far PAST the finish flag (px) the venue's doorway centre sits. */
  doorAheadOfFinishPx?: number;
}

/** Every scripted event a level can schedule. */
export type LevelEvent =
  | TrafficEvent
  | PoliceEvent
  | CalebPickupEvent
  | WheelieRiderEvent
  | BillboardEvent
  | PartyArrivalEvent;

// ---------------------------------------------------------------------------
// LevelConfig — one level's complete data.
// ---------------------------------------------------------------------------

/** A level's terrain-generation input. Structurally compatible with
 * terrain.ts's `TerrainSpec` on purpose (see getLevelTerrainSpec, which
 * spreads this straight into one) — `jumps` is required here (a level
 * always authors its jump list explicitly, even if empty `[]`), a
 * compatible narrowing of TerrainSpec's optional `jumps`. Named (rather
 * than left inline on LevelConfig.terrain) so getLevelTerrainSpec's mapping
 * has a documentable source type and later PLAN-05 tasks can reference it. */
export interface LevelTerrainConfig {
  /** Seeds the deterministic terrain PRNG — see terrain.ts. */
  seed: number;
  /** Total horizontal length of the level, px. Must be within
   * [LEVEL.lengthMinPx, LEVEL.lengthMaxPx] — see validateLevels. */
  length: number;
  /** Rolling-hill amplitude, 0 (flat) .. 1 (hilliest). */
  hilliness: number;
  /** Authored jump ramps. */
  jumps: JumpSpec[];
  /** Flat stretches reserved for scripted events/the finish flag. */
  flatZones?: FlatZone[];
}

/** One of the 22 levels (NORTH_STAR §5 — the map is locked). Pure data; a
 * later PLAN-05 task builds terrain via getLevelTerrainSpec and consumes
 * decorations/events/introText to construct the actual GameScene. */
export interface LevelConfig {
  /** 1..22, unique across the full level set (see validateLevels). */
  id: number;
  /** Shown on level start, e.g. "Leaving Home". */
  name: string;
  /** Backdrop + palette + props set (src/systems/themes.ts, later task). */
  theme: ThemeId;
  /** Terrain generation input (see getLevelTerrainSpec, which maps this to
   * a terrain.ts TerrainSpec). */
  terrain: LevelTerrainConfig;
  /** Ambient static scenery: signs, billboards, balloons, streamers. */
  decorations?: DecorationSpec[];
  /** Scripted one-off events: traffic, police, pickup, wheelie-rider,
   * billboard. */
  events?: LevelEvent[];
  /** One-liner shown at level start, e.g. "The party starts at 8…". */
  introText?: string;
}

// ---------------------------------------------------------------------------
// getLevelTerrainSpec — the seam GameScene builds terrain through, so
// terrain-building code never has to reach into LevelConfig's shape
// directly.
// ---------------------------------------------------------------------------

/** Maps a level's `terrain` sub-object to a `TerrainSpec` for
 * `createTerrain`/`generateHeightmap` (terrain.ts). Since the two shapes
 * are structurally compatible by construction, this is nearly an identity
 * — it exists as an explicit seam so callers always go
 * `createTerrain(scene, getLevelTerrainSpec(config))` rather than reading
 * `config.terrain` directly, keeping terrain-building decoupled from
 * LevelConfig's exact shape. */
export function getLevelTerrainSpec(config: LevelConfig): TerrainSpec {
  // Shallow copy, NOT a field-by-field rebuild: LevelTerrainConfig is
  // structurally assignable to TerrainSpec, so spreading forwards every
  // field automatically — including any field a later plan adds to BOTH
  // types — instead of silently dropping it the way a hand-listed literal
  // would (the same drift the `FlatZone = Range` alias exists to avoid).
  // Still a FRESH object, which is the seam's whole point: callers get a
  // TerrainSpec to hand to createTerrain, never config.terrain itself.
  return { ...config.terrain };
}

// ---------------------------------------------------------------------------
// validateLevels — a pure, total validator. Never throws on malformed/short
// input (same "total function" spirit as save.ts / terrain.ts's
// normalizeSpec) — an authoring bug should surface as a readable problem
// string, not a crash. Run by a later Vitest test against the real 22
// level configs once they exist (PLAN-05 task 3).
// ---------------------------------------------------------------------------

/** The (level id, required event type) pairs NORTH_STAR §5 locks in: 7 =
 * invisible-cars traffic, 11 = the wheelie-rider easter egg, 12 = Caleb's
 * pickup, 15 = the police chase, 18 = the billboard easter egg, 22 = the
 * arrival at the party venue (the game's finale — the ride-in that hands
 * off to PartyScene). */
const REQUIRED_EVENTS: ReadonlyArray<{ id: number; type: LevelEvent['type'] }> = [
  { id: 7, type: 'traffic' },
  { id: 11, type: 'wheelieRider' },
  { id: 12, type: 'calebPickup' },
  { id: 15, type: 'police' },
  { id: 18, type: 'billboard' },
  { id: 22, type: 'partyArrival' },
];

/** Validates a full level set. Returns a list of human-readable problem
 * strings — an empty array means everything checked out. Checks:
 * (1) every id is an integer, and ids 1..TOTAL_LEVELS are each present
 *     exactly once,
 * (2) every `terrain.length` is within [LEVEL.lengthMinPx, LEVEL.lengthMaxPx],
 * (3) every REQUIRED_EVENTS pair (the NORTH_STAR §5 scripted events) is
 *     present on its required level id.
 * Defensive throughout — a malformed/short `configs` array (or malformed
 * entries within it) degrades to problem strings rather than throwing. */
export function validateLevels(configs: readonly LevelConfig[]): string[] {
  const problems: string[] = [];
  const safeConfigs: readonly LevelConfig[] = Array.isArray(configs) ? configs : [];

  // --- (1) id integrity + coverage: every 1..TOTAL_LEVELS present exactly
  // once, each an integer ---
  const idCounts = new Map<number, number>();
  const nonIntegerIds: number[] = [];
  for (const config of safeConfigs) {
    const id = config?.id;
    if (typeof id !== 'number') continue; // no numeric id at all → shows up as a missing id below
    // A fractional (or NaN/Infinity) id is its own authoring defect, not a
    // silent miss — surface it directly instead of letting `id: 7.5` show
    // up only as a confusing "Missing level id(s): 7". Matches the
    // Number.isInteger gate save.ts's markLevelCompleted and
    // scenes/types.ts's normalizeLevel already use for level numbers.
    if (!Number.isInteger(id)) {
      nonIntegerIds.push(id);
      continue;
    }
    idCounts.set(id, (idCounts.get(id) ?? 0) + 1);
  }

  if (nonIntegerIds.length > 0) {
    const unique = [...new Set(nonIntegerIds)].sort((a, b) => a - b);
    problems.push(`Non-integer level id(s): ${unique.join(', ')}`);
  }

  const missingIds: number[] = [];
  for (let id = 1; id <= TOTAL_LEVELS; id++) {
    if (!idCounts.has(id)) missingIds.push(id);
  }
  if (missingIds.length > 0) {
    problems.push(`Missing level id(s): ${missingIds.join(', ')}`);
  }

  const duplicateIds = [...idCounts.entries()]
    .filter(([, count]) => count > 1)
    .map(([id]) => id)
    .sort((a, b) => a - b);
  if (duplicateIds.length > 0) {
    problems.push(`Duplicate level id(s): ${duplicateIds.join(', ')}`);
  }

  // --- (2) length bounds ---
  for (const config of safeConfigs) {
    const length = config?.terrain?.length;
    const inBounds =
      typeof length === 'number' &&
      Number.isFinite(length) &&
      length >= LEVEL.lengthMinPx &&
      length <= LEVEL.lengthMaxPx;
    if (!inBounds) {
      const id = config?.id ?? '?';
      const shownLength = typeof length === 'number' ? length : '?';
      problems.push(`Level ${id} length ${shownLength} is outside [${LEVEL.lengthMinPx}, ${LEVEL.lengthMaxPx}]`);
    }
  }

  // --- (3) required scripted events ---
  for (const required of REQUIRED_EVENTS) {
    const config = safeConfigs.find((c) => c?.id === required.id);
    const events = config?.events;
    const hasEvent = Array.isArray(events) && events.some((event) => event?.type === required.type);
    if (!hasEvent) {
      problems.push(`Level ${required.id} is missing its required '${required.type}' event`);
    }
  }

  return problems;
}
