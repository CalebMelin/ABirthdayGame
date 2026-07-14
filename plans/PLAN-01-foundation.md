# PLAN-01 — Engine Foundation (scenes, save system, constants)

**Read `NORTH_STAR.md` first (§3, §4, §9). If confused, re-read it.**

Goal: the scene skeleton, save system, and shared plumbing that every later plan builds on. No gameplay yet.

## Prerequisites
- PLAN-00 complete (build + deploy pipeline green).

## Tasks
1. **Scene skeleton.** Create empty-but-navigable scenes: `BootScene`, `TitleScene`, `CharacterCreationScene`, `LevelSelectScene`, `GameScene`, `LevelCompleteScene`, `PartyScene`, `CreditsScene`. Each shows its name + a temp "next" button so the whole flow (NORTH_STAR §4) can be clicked through end to end.
2. **BootScene**: asset loading with a pixel progress bar; registers generated textures (placeholder colored rectangles for now).
3. **Save system** (`src/systems/save.ts`): typed wrapper over `localStorage` with keys:
   - `gabby22.character` (hair, eyes, bikeColor, outfit)
   - `gabby22.progress` (highest unlocked level, per-level completed flags)
   - `gabby22.tulips` (number)
   - `gabby22.notesSeen` (fact-pool indices already shown this playthrough)
   Include versioned schema (`gabby22.saveVersion`) + migration stub, `resetAll()`, and graceful behavior when localStorage is unavailable (in-memory fallback). Unit-test it with Vitest.
4. **Constants** (`src/systems/constants.ts`): canvas logical size (1280×720 logical, FIT-scaled), gravity, bike tuning placeholders, color palette (pastel + pixel vibes), z-depth layers, font keys.
5. **Pixel font & UI kit**: load a bitmap/webfont pixel font (e.g. self-hosted "Press Start 2P" or a generated bitmap font — no external CDN at runtime). Tiny helper for pixel buttons/panels used by all menus.
6. **TitleScene v1**: game logo text "Gabby is 22!!", "Play" (→ CharacterCreation on first run, else LevelSelect), "Edit Character", muted-music toggle placeholder.
7. **LevelSelectScene v1**: 22 numbered pixel buttons in a grid; locked levels greyed with a lock; completed levels get a tiny tulip/check. Reads from save system.

## Acceptance criteria
- Can click through Title → CharacterCreation → LevelSelect → Game(stub) → LevelComplete(stub) → … → Party(stub) → Credits(stub) with no console errors.
- Save system unit tests pass; progress survives page reload.
- Everything renders crisp (no blurry scaling) at phone-landscape and desktop sizes.
- `PROGRESS.md` updated.
