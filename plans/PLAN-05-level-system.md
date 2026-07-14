# PLAN-05 — Data-Driven Level System (all 22 levels, base versions)

**Read `NORTH_STAR.md` first (§5 level map — it is LOCKED). If confused, re-read it.**

Goal: `LevelConfig` type + 22 config files + theming system, so every level is playable end-to-end (special events stubbed for PLAN-06/07).

## Prerequisites
- PLAN-02 and PLAN-03 complete.

## Tasks
1. **`LevelConfig` type** (`src/levels/types.ts`):
   ```ts
   interface LevelConfig {
     id: number;                    // 1..22
     name: string;                  // shown on level start, e.g. "Leaving Home"
     theme: ThemeId;                // backdrop + palette + props set
     terrain: { seed: number; length: number; hilliness: number;
                jumps: JumpSpec[]; flatZones?: FlatZone[] };
     decorations?: DecorationSpec[]; // signs, billboards, balloons…
     events?: LevelEvent[];          // scripted: traffic, police, pickup, wheelie-rider
     introText?: string;             // one-liner at level start ("The party starts at 8…")
   }
   ```
   `LevelEvent` is a discriminated union: `{type:'traffic',…} | {type:'police',…} | {type:'calebPickup',…} | {type:'wheelieRider',…} | {type:'billboard', text,…}` — implementations arrive in PLAN-06/07; the loader must already dispatch them.
2. **Theme system** (`src/systems/themes.ts`): per-theme parallax backdrop layers (2–3 layers: sky gradient, skyline/hills silhouette, near props), ground palette, prop set. Themes per NORTH_STAR §5: suburbs, park, small-town, downtown, construction, overpass/highway, riverside, bridge, boulevard, old-town, hilly, billboard-row, sunset, party-district, final-dusk. Placeholder art acceptable until PLAN-10, but layer plumbing must be real.
3. **Author all 22 configs** exactly following the NORTH_STAR §5 table:
   - Difficulty curve: hilliness ramps very gently 1→22; jumps sprinkled per table; level length keeps play time 20–45s.
   - Levels 6, 9, 13, 14 need nothing special in-config for notes (handled by notes system, PLAN-08), but add the decorations/events placeholders for 7, 11, 12, 15, 18, 20–22.
   - Intro one-liners: write all 22, telling the "get to the party" story arc (e.g. L1 "8:00 PM. The party's across the city. Let's go!!", L12 "Caleb's waiting outside…", L22 "You can hear the music from here!!"). Keep them short and cute.
4. **Level flow**: LevelSelect → GameScene(config) → finish flag → LevelCompleteScene(stub note) → "Next level" unlocks & launches. Completing 22 routes to PartyScene (stub).
5. **Balloons theming**: levels 20–22 include balloon/streamer decorations per NORTH_STAR §5.
6. **Auto-playtest harness** (cheap but valuable): dev-mode "ghost driver" that holds gas (with scripted brake taps at authored jump markers) to verify each level is finishable; a Vitest test asserts every config validates (ids 1–22 present exactly once, lengths within bounds, required events present on 7/11/12/15/18).

## Acceptance criteria
- All 22 levels selectable and beatable by a human with gas+brake; ghost driver finishes at least levels without events.
- Config validation test passes; special-event levels dispatch their (stub) events without errors.
- Visual theme visibly changes across the city arc, placeholder art is fine.
- Story intro one-liners show at level start.
- `PROGRESS.md` updated.
