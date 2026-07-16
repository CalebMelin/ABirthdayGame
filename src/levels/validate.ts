// Pure, total validators for the gas-only-safety authoring invariants
// (PLAN-05 ST-5/task 6) — guards jump geometry (width/height/placement/
// clearance/hilliness ceiling) and the spawn/finish flat-zone convention
// GameScene's arithmetic depends on (bike spawns at LEVEL.spawnXPx, finish
// flag sits at length - LEVEL.finishMarginPx). types.ts's validateLevels
// already checks id coverage/length bounds/required events; these two
// validators check GAMEPLAY-SAFETY invariants validateLevels does not, so a
// future level edit can't silently reintroduce an unsafe jump or break the
// spawn/finish flat-zone convention.
//
// Same "total function, never throws on malformed/short input" philosophy
// as validateLevels/save.ts/terrain.ts's normalizeSpec: a malformed config
// degrades to problem strings (or is silently skipped where terrain.ts's
// own applyJumps would also treat it as an inert no-op — see the jump-field
// guard below), never a crash.
import type { LevelConfig } from './types';
import { LEVEL, TERRAIN } from '../systems/constants';
import { TERRAIN_COLLISION_GRID_PX } from '../systems/terrain';

/** Extra px past LEVEL.spawnXPx the spawn flat zone must cover, so the bike
 * (which spawns exactly at spawnXPx) has a little room to accelerate before
 * any slope starts. Deliberately a loose FLOOR, not ST-3's actual authored
 * spawn zones (which all run to x=700, a 450px margin) — see this module's
 * header doc comment on why the floors stay looser than what was authored. */
const SPAWN_FLAT_ZONE_MARGIN_PX = 200;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Steepest slope (dy/dx) of a raised-cosine ramp of the given height/width —
 * reached a quarter of the way up, value height*pi/width (see terrain.ts's
 * applyJumps). A kicker whose peak slope exceeds TERRAIN.maxJumpSlope would be
 * AUTO-WIDENED by terrain.ts to hold that cap, knocking it off the collision
 * grid and destroying the clean-triangle launch — so the kicker guard rejects
 * it. Pure, total: a non-positive width yields Infinity (flagged). */
export function raisedCosinePeakSlope(height: number, width: number): number {
  return width > 0 ? (height * Math.PI) / width : Infinity;
}

/** True when a kicker's base `x` and `width` land its base/peak/end exactly on
 * Matter collision NODES (TERRAIN_COLLISION_GRID_PX apart): `x` a multiple of
 * the grid, `width` a multiple of TWICE the grid (so the peak at width/2 also
 * lands on a node). Only then does the coarse chain render the raised cosine
 * as a clean launch triangle (see terrain.ts). Pure, total. */
export function isCollisionGridAlignedKicker(x: number, width: number): boolean {
  const grid = TERRAIN_COLLISION_GRID_PX;
  if (grid <= 0) return false;
  return x % grid === 0 && width % (2 * grid) === 0;
}

/**
 * Validates every jump in every config against the LEVEL.jump* safety
 * floors (width/height/placement-fraction/clearance-from-spawn-and-finish),
 * plus the level-wide rule that any config authoring >=1 jump keeps
 * terrain.hilliness <= LEVEL.jumpLevelMaxHilliness. Returns a list of
 * human-readable problem strings — empty means everything checked out.
 *
 * A jump missing a finite x/width/height is silently skipped (not flagged)
 * — mirrors terrain.ts's applyJumps, which treats the exact same malformed
 * shape as an inert no-op rather than an unsafe hazard, so there is nothing
 * dangerous to report for it here.
 */
export function validateJumpSafety(configs: readonly LevelConfig[]): string[] {
  const problems: string[] = [];
  const safeConfigs: readonly LevelConfig[] = Array.isArray(configs) ? configs : [];

  for (const config of safeConfigs) {
    const id = config?.id ?? '?';
    const terrain = config?.terrain;
    const jumps = Array.isArray(terrain?.jumps) ? terrain.jumps : [];
    const hilliness = terrain?.hilliness;
    const length = terrain?.length;
    const lengthValid = isFiniteNumber(length) && length > 0;

    if (jumps.length > 0) {
      const hillinessOk = isFiniteNumber(hilliness) && hilliness <= LEVEL.jumpLevelMaxHilliness;
      if (!hillinessOk) {
        problems.push(
          `Level ${id} has ${jumps.length} jump(s) but hilliness ${hilliness ?? '?'} exceeds LEVEL.jumpLevelMaxHilliness (${LEVEL.jumpLevelMaxHilliness})`
        );
      }
    }

    for (const jump of jumps) {
      const x = jump?.x;
      const width = jump?.width;
      const height = jump?.height;
      if (!isFiniteNumber(x) || !isFiniteNumber(width) || !isFiniteNumber(height)) continue;

      const isKicker = jump?.kind === 'kicker';
      const label = `Level ${id} ${isKicker ? 'kicker' : 'jump'} at x=${x}`;

      if (isKicker) {
        // Flip-capable launch ramp (PLAN-07 task 4): its own width/height
        // envelope, plus grid alignment + a no-auto-widen slope cap, so it
        // stays a clean-triangle kicker that flips yet survives gas-only.
        if (width < LEVEL.kickerMinWidthPx || width > LEVEL.kickerMaxWidthPx) {
          problems.push(
            `${label}: width ${width} is outside kicker range [${LEVEL.kickerMinWidthPx}, ${LEVEL.kickerMaxWidthPx}]`
          );
        }
        if (height < LEVEL.kickerMinHeightPx || height > LEVEL.kickerMaxHeightPx) {
          problems.push(
            `${label}: height ${height} is outside kicker range [${LEVEL.kickerMinHeightPx}, ${LEVEL.kickerMaxHeightPx}]`
          );
        }
        if (!isCollisionGridAlignedKicker(x, width)) {
          problems.push(
            `${label}: not aligned to the ${TERRAIN_COLLISION_GRID_PX}px collision grid (x must be a multiple of ${TERRAIN_COLLISION_GRID_PX}, width a multiple of ${2 * TERRAIN_COLLISION_GRID_PX})`
          );
        }
        if (raisedCosinePeakSlope(height, width) > TERRAIN.maxJumpSlope) {
          problems.push(
            `${label}: peak slope ${raisedCosinePeakSlope(height, width).toFixed(3)} exceeds TERRAIN.maxJumpSlope (${TERRAIN.maxJumpSlope}) — terrain.ts would auto-widen it off the grid`
          );
        }
      } else {
        if (width < LEVEL.jumpMinWidthPx) {
          problems.push(`${label}: width ${width} is below LEVEL.jumpMinWidthPx (${LEVEL.jumpMinWidthPx})`);
        }
        if (height > LEVEL.jumpMaxHeightPx) {
          problems.push(`${label}: height ${height} exceeds LEVEL.jumpMaxHeightPx (${LEVEL.jumpMaxHeightPx})`);
        }
      }

      // Placement-fraction and spawn/finish clearance both need a usable
      // level length; skip them (not the width/height checks above) when
      // it's missing/invalid rather than reporting on unusable numbers.
      if (lengthValid) {
        const frac = x / length;
        if (frac < LEVEL.jumpPlacementMinFrac || frac > LEVEL.jumpPlacementMaxFrac) {
          problems.push(
            `${label}: placement fraction ${frac} is outside [${LEVEL.jumpPlacementMinFrac}, ${LEVEL.jumpPlacementMaxFrac}]`
          );
        }

        const spawnClearance = x - LEVEL.spawnXPx;
        if (spawnClearance < LEVEL.jumpClearancePx) {
          problems.push(
            `${label}: only ${spawnClearance}px clear of spawn, need >= LEVEL.jumpClearancePx (${LEVEL.jumpClearancePx})`
          );
        }

        // Measured from the ramp BASE x (not x+width): the ramp footprint
        // is deliberately not subtracted on the finish side, so this floor is
        // effectively a little looser there — harmless, since overshooting
        // the finish only completes the level (never a crash), and authored
        // placement sits far from this limit anyway.
        const finishX = length - LEVEL.finishMarginPx;
        const finishClearance = finishX - x;
        if (finishClearance < LEVEL.jumpClearancePx) {
          problems.push(
            `${label}: only ${finishClearance}px clear of finish, need >= LEVEL.jumpClearancePx (${LEVEL.jumpClearancePx})`
          );
        }
      }
    }
  }

  return problems;
}

/**
 * Validates that every config has a flat zone covering the spawn runway
 * ([0, LEVEL.spawnXPx + a small margin]) AND a flat zone covering the
 * finish flag through the level's end ([length - LEVEL.finishMarginPx,
 * length]) — the arithmetic GameScene depends on (bike spawns at
 * LEVEL.spawnXPx, the finish flag sits at length - LEVEL.finishMarginPx).
 * Returns a list of human-readable problem strings — empty means everything
 * checked out.
 */
export function validateFlatZones(configs: readonly LevelConfig[]): string[] {
  const problems: string[] = [];
  const safeConfigs: readonly LevelConfig[] = Array.isArray(configs) ? configs : [];

  for (const config of safeConfigs) {
    const id = config?.id ?? '?';
    const terrain = config?.terrain;
    const length = terrain?.length;
    const flatZones = Array.isArray(terrain?.flatZones) ? terrain.flatZones : [];

    if (!isFiniteNumber(length) || length <= 0) {
      // Can't check zone coverage against an unusable length; validateLevels
      // already flags an out-of-bounds/non-numeric length on its own terms.
      continue;
    }

    const spawnCoverTo = LEVEL.spawnXPx + SPAWN_FLAT_ZONE_MARGIN_PX;
    const hasSpawnZone = flatZones.some(
      (zone) =>
        isFiniteNumber(zone?.start) &&
        isFiniteNumber(zone?.end) &&
        zone.start <= 0 &&
        zone.end >= spawnCoverTo
    );
    if (!hasSpawnZone) {
      problems.push(
        `Level ${id} has no flat zone covering the spawn runway [0, ${spawnCoverTo}] (LEVEL.spawnXPx ${LEVEL.spawnXPx} + ${SPAWN_FLAT_ZONE_MARGIN_PX}px margin)`
      );
    }

    const finishX = length - LEVEL.finishMarginPx;
    const hasFinishZone = flatZones.some(
      (zone) =>
        isFiniteNumber(zone?.start) &&
        isFiniteNumber(zone?.end) &&
        zone.start <= finishX &&
        zone.end >= length
    );
    if (!hasFinishZone) {
      problems.push(
        `Level ${id} has no flat zone covering the finish flag [${finishX}, ${length}] (length - LEVEL.finishMarginPx through length)`
      );
    }
  }

  return problems;
}
