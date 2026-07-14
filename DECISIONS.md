# DECISIONS — judgment-call log

## 2026-07-14 — Work happens directly on `main`
- **Choice:** No feature branches / PR workflow; commits land directly on `main`.
- **Why:** PLAN-00's deploy pipeline is push-to-main → Vercel auto-deploy; the repo was nearly empty at the start of work, so there's no risk of clobbering in-flight work.
- **How chosen:** Simplest option serving the plan (Rule 3, CLAUDE.md).

## 2026-07-14 — GitHub repo is named `ABirthdayGame`, not `gabby-is-22` as PLAN-00 suggested
- **Choice:** Keep the existing GitHub repo name `ABirthdayGame` rather than renaming to `gabby-is-22`.
- **Why:** Caleb created the repo before the agent started; the repo name doesn't affect gameplay, the package name, or the deploy URL slug requirements.
- **How chosen:** Simplest option serving the plan (Rule 3, CLAUDE.md).
