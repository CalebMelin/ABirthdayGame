# PLAN-02 — Bike Physics & Terrain (the heart of the game)

**Read `NORTH_STAR.md` first (§4 core gameplay). If confused, re-read it.**

Goal: a motorcycle that FEELS GOOD driving over procedurally-built hills with gas/brake only. This is the plan worth iterating on the longest — everything else is content on top of this.

## Prerequisites
- PLAN-01 complete.

## Tasks
1. **Terrain generator** (`src/systems/terrain.ts`):
   - Input: `{ seed, length, hilliness, jumps: JumpSpec[], flatZones: Range[] }` (part of `LevelConfig`).
   - Output: smooth heightmap polyline (seeded RNG + layered sine/noise, smoothed), converted into Matter static bodies (chain of small convex fixtures or edge segments) + a rendered ground: pixel-art dirt/asphalt top edge with theme-colored fill.
   - Jumps: authored ramp shapes inserted at specified distances (used for tulip tricks). Flat zones reserved for scripted events (Caleb's house, finish flag).
   - Deterministic: same seed → same terrain (needed for tuning + tests).
2. **Bike rig** (`src/systems/bike.ts`):
   - Matter composite: chassis rect + 2 circular wheels attached with stiff spring constraints (suspension). Rider (Gabby) is a visual sprite pinned to chassis with a small head sensor body for fail detection.
   - **Gas**: angular velocity applied to rear wheel (torque-limited, capped top speed ~ easygoing). In air: apply backward chassis torque (nose up).
   - **Brake**: strong wheel angular damping; when stopped, mild reverse. In air: forward chassis torque (nose down).
   - Auto-stabilization assist: small corrective torque toward upright when airborne and NO pedal held (keeps the game easy, NORTH_STAR "easy" mandate).
   - Fail: head sensor touches terrain → soft fail (friendly overlay + instant restart). Also fail if y > world bottom.
   - All tuning numbers in `constants.ts` under `BIKE_TUNING` with comments.
3. **Camera**: follow bike with lookahead in travel direction, soft vertical damping, slight zoom-out at speed.
4. **GameScene v1**: loads a hardcoded test level config, spawns terrain + bike, keyboard input only (temporary: arrows). Finish flag entity at end → transitions to LevelCompleteScene stub.
5. **Debug overlay** (dev-only, toggle with `D`): FPS, speed, airborne state, rotation accumulator — needed for trick detection later.
6. **Feel-tuning pass** (do not skip): iterate until — bike never loops out uncontrollably on gentle hills, a full-gas run over the test level never faceplants without player error, flips off big ramps are achievable but optional, restarts are < 500ms.

## Acceptance criteria
- Test level drivable start→finish with keyboard at "grandma difficulty": holding only gas the whole way should succeed on gentle terrain.
- Backflip achievable off a ramp and recoverable.
- Deterministic terrain (unit test: same seed → same heights).
- 60fps with debug overlay showing no physics body leaks after 3 restarts.
- `PROGRESS.md` updated.
