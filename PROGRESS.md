# PROGRESS

PLAN-00 ✅ 2026-07-14 — scaffold, boot placeholder, GitHub + Vercel pipeline live; Caleb confirmed the placeholder loads on his phone
PLAN-01 ✅ 2026-07-14 — engine foundation: 8-scene flow, save system (33 tests of 46 total), self-hosted Press Start 2P + pixel UI kit, BootScene loader, Title v1, 22-level LevelSelect grid. Verified via headless-browser click-through of the entire flow (Title→…→Credits incl. all 22 level loops): 0 console errors, progress survives reload, crisp at desktop 1280×720 and phone-landscape 844×390 w/ touch taps.

PLAN-02 🚧 in progress — task 1 (terrain generator) done 2026-07-14: `src/systems/terrain.ts` (`generateHeightmap` pure + `createTerrain` Matter/Graphics builder), `TERRAIN` tuning block in `constants.ts`, 21 new deterministic-heightmap tests (67 total, all green). Tasks 2–6 (bike rig, camera, GameScene v1, debug overlay, feel-tuning pass) remain — not started.

## Known issues
- `npm run test` (vitest 4.1.10) crashes with `TypeError: Cannot read properties of undefined (reading 'config')` when run from a shell whose cwd uses a lowercase drive letter (`c:/...`, e.g. some Git Bash setups). Pre-existing tooling quirk, not a project bug — run from PowerShell/cmd (`C:/...`) and it passes.
