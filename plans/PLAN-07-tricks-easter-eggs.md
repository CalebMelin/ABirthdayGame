# PLAN-07 — Tricks, Tulips & Easter Eggs

**Read `NORTH_STAR.md` first (§4 tricks, §5 rows 11 & 18). If confused, re-read it.**

Goal: the tulip trick system and the two visual easter eggs, exactly as specified.

## Prerequisites
- PLAN-05 complete (PLAN-06 recommended first so passenger sprite exists for post-12 trick visuals).

## Tasks

### 1. Trick detection + tulips (`src/systems/tricks.ts`)
- Track cumulative chassis rotation while airborne (reset on takeoff). On landing (both wheels grounded, not crashed): if |rotation| ≥ 330° (forgiving threshold for 360° flips), award 1 tulip per full flip.
- Feedback on award: "Backflip!! 🌷" / "Frontflip!! 🌷" pixel toast + a tulip sprite arcing up to the bouquet in the **top-right HUD corner**.
- **Bouquet HUD**: top-right corner; starts as a single tulip icon, visually grows (1 → small bunch → full bouquet at ~10+) with the count next to it. Persists via `gabby22.tulips` across levels AND sessions. Failing a level keeps tulips already awarded (kind, per the easy mandate) — but tulips from the failed attempt's unlanded trick are simply never awarded.
- No spending, no shop. Purely sentimental.

### 2. Easter egg A — the yellow-bike wheelie rider (level 11)
- Implements `LevelEvent {type:'wheelieRider'}` from PLAN-05.
- Trigger: once, guaranteed, roughly mid-level when the player is grounded and moving.
- Visual: rider dressed ALL BLACK with a BLACK helmet, on a YELLOW motorcycle, front wheel up in a wheelie, overtaking Gabby from behind at higher speed and riding off ahead (off-screen). Small dust particles; NO collision (decorative layer, no physics interaction with player).
- The rider never appears in any other level. Do not explain it anywhere in-game — it's an inside joke.

### 3. Easter egg B — the sleepover billboard (level 18)
- Implements `LevelEvent {type:'billboard'}` decoration.
- Level 18 (billboard row) has 5–7 background billboards with generic pixel ads (fake products, "22 FM radio", etc.). ONE of them, mid-level, reads exactly: **"Sleepovers aren't breaking the rules right??"**
- Style it like the decoys (same billboard frame) so it's discoverable, not highlighted — subtle per NORTH_STAR. Parallax background layer, no interaction needed.

### 4. Jump/ramp pass for tulip farming
- Audit levels 2, 4, 9, 17 (jump-heavy per NORTH_STAR §5): each must have ≥ 2 ramps where a full flip is comfortably achievable (enough air time at easy speeds). Level 2 gets a tutorial sign: "Big jump ahead — try holding GAS in the air to flip! 🌷".

## Acceptance criteria
- Flips reliably detected (no false positives from rolling over hills — airborne-only accumulation verified).
- Tulip count persists across levels/sessions; bouquet renders top-right and grows.
- Wheelie rider appears exactly once in level 11, matching the description, zero physics interference.
- Sleepover billboard present in level 18 among decoys, text exact.
- Unit tests: rotation-accumulator logic; tulip persistence.
- `PROGRESS.md` updated.
