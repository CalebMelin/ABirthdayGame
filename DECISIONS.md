# DECISIONS — judgment-call log

## 2026-07-14 — Work happens directly on `main`
- **Choice:** No feature branches / PR workflow; commits land directly on `main`.
- **Why:** PLAN-00's deploy pipeline is push-to-main → Vercel auto-deploy; the repo was nearly empty at the start of work, so there's no risk of clobbering in-flight work.
- **How chosen:** Simplest option serving the plan (Rule 3, CLAUDE.md).

## 2026-07-14 — GitHub repo is named `ABirthdayGame`, not `gabby-is-22` as PLAN-00 suggested
- **Choice:** Keep the existing GitHub repo name `ABirthdayGame` rather than renaming to `gabby-is-22`.
- **Why:** Caleb created the repo before the agent started; the repo name doesn't affect gameplay, the package name, or the deploy URL slug requirements.
- **How chosen:** Simplest option serving the plan (Rule 3, CLAUDE.md).

## 2026-07-14 — Renamed `NORTH_STAR.MD` → `NORTH_STAR.md`
- **Choice:** Renamed the file to use a lowercase `.md` extension; contents untouched.
- **Why:** CLAUDE.md/README/plans all reference `NORTH_STAR.md` (lowercase). Windows is case-insensitive so this went unnoticed locally, but the mismatch would break resolution on case-sensitive systems (Linux CI, Vercel build).
- **How chosen:** Code-review fix; simplest option serving the plan (Rule 3, CLAUDE.md).

## 2026-07-14 — LevelSelect gets a "← back" button (not in PLAN-01's task text)
- **Choice:** Added a back-to-Title button to LevelSelectScene.
- **Why:** Without it, "Edit Character" on the title screen is unreachable once you're in level select except by refreshing the page. Small, obvious usability win; no personal content involved.
- **How chosen:** Simplest option serving the vision (Rule 3, CLAUDE.md).

## 2026-07-14 — LevelComplete stub marks levels complete already in PLAN-01
- **Choice:** `LevelCompleteScene.create()` calls `save.markLevelCompleted(level)` now, ahead of the real level-complete flow (tulips: PLAN-07, notes/UI: PLAN-08).
- **Why:** PLAN-01's acceptance criteria require "progress survives page reload" and a LevelSelect grid that "reads from save system" — something must write progress for either to be demonstrable. Two lines, idempotent, replaced naturally when the real flow lands.
- **How chosen:** Minimal wiring to satisfy the plan's own acceptance criteria (Rule 3, CLAUDE.md).

## 2026-07-14 — Terrain generator (PLAN-02 task 1) design choices
- **Choice:** `TerrainSpec.jumps` and `.flatZones` are both optional (default to `[]`), rather than `jumps` required as PLAN-05's draft `LevelConfig` snippet shows. `JumpSpec.x` means "the ramp's base/start x", not its center or takeoff edge. Jump ramps render as a symmetric raised-cosine hump (smooth rise to a peak at the midpoint, smooth descent back to baseline) rather than an asymmetric ski-jump wedge. The Matter collision chain uses coarser segments (`TERRAIN.segmentTargetPx = 160`) than the visual heightmap (`sampleSpacingPx = 24`) specifically to stay under NORTH_STAR §8's "<100 physics bodies per level" budget — this ratio is a placeholder guess since level lengths/bike speed aren't tuned yet (PLAN-02 tasks 2/6), and should be re-checked once they are.
- **Why:** PLAN-02's task text left the exact `TerrainSpec` field shapes, jump anchor semantics, and ramp silhouette to the implementer ("Exact naming/shape is yours — keep it simple and documented"); none of this touches personal content or the north star's WHAT/WHY, only HOW.
- **How chosen:** Simplest option that stays easy/gentle/deterministic and blends with zero height/slope discontinuities (Rule 3, CLAUDE.md) — a symmetric smootherstep-based hump is trivially C1-continuous at both ends with no extra bookkeeping, and optional fields with safe defaults match the rest of the codebase's "total function, never throws on missing/malformed input" style (see save.ts).

## 2026-07-14 — Pixel font is self-hosted Press Start 2P (TTF + OFL license in public/assets/fonts/)
- **Choice:** Downloaded PressStart2P-Regular.ttf from the google/fonts repo and self-host it with @font-face; OFL.txt shipped alongside; BootScene gates scene start on the CSS Font Loading API with a 3s never-failing timeout.
- **Why:** PLAN-01 named it as the example option; self-hosting satisfies the no-CDN-at-runtime rule; the font-gate prevents Phaser's rasterize-once text from rendering with a fallback font.
- **How chosen:** Plan's suggested option taken literally (Rule 3, CLAUDE.md).
