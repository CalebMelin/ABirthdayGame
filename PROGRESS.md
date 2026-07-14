# PROGRESS

PLAN-00 ✅ 2026-07-14 — scaffold, boot placeholder, GitHub + Vercel pipeline live; Caleb confirmed the placeholder loads on his phone

## Known issues
- `npm run test` (vitest 4.1.10) crashes with `TypeError: Cannot read properties of undefined (reading 'config')` when run from a shell whose cwd uses a lowercase drive letter (`c:/...`, e.g. some Git Bash setups). Pre-existing tooling quirk, not a project bug — run from PowerShell/cmd (`C:/...`) and it passes.
