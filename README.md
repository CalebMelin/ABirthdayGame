# "Gabby is 22!!" — Development Kit

Everything needed to have AI agents build Gabby's birthday game.

## What's in here

| File | Purpose |
|---|---|
| `NORTH_STAR.md` | The single source of truth: vision, requirements, locked level map, exact personal content. Agents re-read this whenever confused. |
| `CLAUDE.md` | Operating rules for the coding agents (Claude Code reads this automatically from the repo root). |
| `plans/PLAN-00 … PLAN-11` | Twelve sequential build plans, each with prerequisites, tasks, acceptance criteria, and **👤 CALEB STEPS** (things only you can do, with detailed instructions). |

## How to use it

1. **Do 👤 CALEB STEP 0.1** (in `PLAN-00-setup.md`): install Node, git, Claude Code; create GitHub + Vercel accounts; make a project folder.
2. **Copy this entire kit into that folder** (NORTH_STAR.md, CLAUDE.md, plans/).
3. Open a terminal in the folder, run `claude`, and start each session with a prompt like:

   > Read NORTH_STAR.md and CLAUDE.md, check PROGRESS.md for where we left off, then execute the next plan in plans/. When you reach a 👤 CALEB STEP, stop and give me exact instructions.

4. Repeat one plan per session (or let it run several) until PLAN-11 ships. When the agent pauses for a 👤 CALEB STEP, follow its instructions, tell it "done", and it continues.

## Build order & your involvement

| Plan | What gets built | You needed? |
|---|---|---|
| 00 | Repo + Vite/Phaser scaffold + Vercel pipeline | ✅ accounts, repo, deploy clicks |
| 01 | Scene skeleton, save system, UI kit | — |
| 02 | Bike physics + terrain (the core feel) | — |
| 03 | Touch pedals, rotate prompt, keyboard | ✅ phone playtest |
| 04 | Character creation | — |
| 05 | All 22 data-driven levels (base) | — |
| 06 | Invisible-cars L7, Caleb pickup L12, police chase L15 | — |
| 07 | Tulip tricks + both easter eggs | — |
| 08 | Level-complete screens + notes/facts system | — |
| 09 | Party finale + credits | — |
| 10 | Real pixel art, audio, juice | — |
| 11 | Full QA + launch | ✅ final playthrough + delivery |

Total: roughly 12 agent sessions. Your hands-on time: ~1–2 hours across setup and playtests.

## Golden rule for every session

If the agent ever seems lost, paste this: **"Re-read NORTH_STAR.md. It wins over everything else."**
