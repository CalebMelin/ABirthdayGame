# PLAN-06 — Special Levels: Invisible Cars (7), Caleb Pickup (12), Police Chase (15)

**Read `NORTH_STAR.md` first (§5 rows 7/12/15 + §2 "EASY" mandate). If confused, re-read it.**

Goal: the three scripted levels. Each must stay EASY — these are highlights, not difficulty spikes.

## Prerequisites
- PLAN-05 complete.

## Tasks

### 1. Level 7 — "invisible cars" traffic system (`src/systems/traffic.ts`)
- Oncoming pixel cars spawn ahead (object-pooled, 4–5 car sprites/colors) driving toward Gabby in her lane sections.
- **Telegraphing is mandatory**: cars visible ≥ 3 seconds before reaching the player at expected speed; optional "!" indicator at screen edge.
- Dodging mechanics: terrain includes small ramps and lane-bulges so the player dodges by braking (car passes while you hang back), accelerating through gaps, or hopping via mini-ramps. 6–8 encounters total, spaced with breathers.
- Collision = soft fail with message "They really don't see us!! Go again 💛" and instant restart.
- Cars must never spawn unavoidably (validate: at max and min reasonable speeds, every encounter has a dodge).

### 2. Level 12 — Caleb pickup (`src/systems/passenger.ts` + event)
- Mid-level flat zone with Caleb's house (distinct cute pixel house, front door, mailbox reading "MELIN").
- Caleb (blonde? no — Caleb's look: brown-haired boy sprite; keep consistent with party scene… **decision**: give Caleb brown hair to distinguish from blonde Dom; log in DECISIONS.md) stands outside waving. Approaching triggers auto-brake cutscene: bike stops, Caleb runs over, hops on behind Gabby, tiny ♥ particle, "Caleb hopped on!!" toast, then control returns.
- **Passenger system**: from the moment of pickup PERSISTENTLY (levels 12b–22, party scene, all subsequent replays of levels ≥ 12): Caleb sprite seated behind Gabby, arms around her, with slight independent bobbing. Physics: at most a cosmetic mass tweak — handling must not get harder. Store `gabby22.calebPickedUp` derived from progress (picked up iff level 12 completed OR currently past pickup point in level 12).
- Replaying levels < 12 shows Gabby solo (story consistency).

### 3. Level 15 — police chase (`src/systems/police.ts`)
- Police car with flashing red/blue pixel lights + siren audio (PLAN-10) chases from behind for the whole level.
- Rubber-banding: cop speed = min(playerRecentAvg + small catchup, hardCap BELOW easy full-gas speed) → holding gas basically always escapes; only stopping/crashing long gets you caught.
- Caught (cop overlaps bike for >1.5s) = soft fail: "They got us!! …let's pretend that didn't happen 🚔" + instant restart.
- Escape finale: crossing the finish flag plays cop spinning-out puff + "WOOHOO!" toast.
- Caleb IS on the back during this level (it's after 12) — sprite must show both riders fleeing.

### Shared
- All three get event-type implementations wired into the PLAN-05 `LevelEvent` dispatcher, config-tunable (spawn distances, speeds, counts).
- Difficulty check for each: agent must beat each level ≥ 3 times in a row without a fail before calling it done; if the agent fails more than 1 in 4 attempts, make it easier.

## Acceptance criteria
- Levels 7, 12, 15 fully playable per above; all fail states soft & friendly.
- Caleb visibly rides passenger on 13–22 and on replays of ≥ 12, never before 12.
- No unavoidable car encounters; police never catch a player holding gas.
- `PROGRESS.md` + `DECISIONS.md` (Caleb hair color etc.) updated.
