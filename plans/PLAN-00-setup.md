# PLAN-00 — Project Setup (repo, tooling, deploy pipeline)

**Read `NORTH_STAR.md` first. If confused at any point, re-read it.**

Goal: a running "hello Phaser" project, in git, auto-deploying to Vercel. Deploy pipeline works BEFORE any game code exists, so deployment is never a scary final step.

## Prerequisites
- 👤 CALEB STEP 0.1 (do this before the agent starts):
  1. Install **Node.js LTS** (v20+): download from https://nodejs.org, run installer, accept defaults. Verify in a terminal: `node -v` and `npm -v` print versions.
  2. Install **git**: https://git-scm.com/downloads, accept defaults. Verify: `git -v`.
  3. Install **Claude Code** per https://docs.claude.com/en/docs/claude-code (typically `npm install -g @anthropic-ai/claude-code`, then run `claude` once to log in).
  4. Create a free **GitHub** account if you don't have one (github.com).
  5. Create a free **Vercel** account at https://vercel.com — click "Sign up" and choose **Continue with GitHub** (this makes step 0.3 automatic). The free Hobby plan is enough.
  6. Make a folder for the project, e.g. `C:\dev\gabby-is-22`, open a terminal there, and start Claude Code with `claude`.

## Tasks (agent)
1. Scaffold: `npm create vite@latest . -- --template vanilla-ts`, then `npm i phaser`.
2. Add dev deps: `vitest`, `typescript` strict config. Scripts in `package.json`:
   - `dev`, `build`, `preview`, `test` (vitest run), `art` (placeholder: `node scripts/noop.js` for now — replaced in PLAN-10).
3. Create the repo skeleton from NORTH_STAR §9 (empty folders with `.gitkeep`, plus `DECISIONS.md`, `PROGRESS.md` headers). Copy `NORTH_STAR.md`, `CLAUDE.md`, and the `plans/` folder into the repo root if not already present.
4. Minimal Phaser boot: full-window canvas, pixelArt: true, scale mode `FIT`, a BootScene showing "Gabby is 22!! — coming soon" in a pixel font on a pastel background.
5. `index.html`: correct `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`, title "Gabby is 22!!", theme-color, disable double-tap zoom (`touch-action: manipulation`).
6. Git: `git init`, sensible `.gitignore` (node_modules, dist, .vercel), initial commit.
7. 👤 CALEB STEP 0.2 — create the GitHub repo and push:
   1. Go to https://github.com/new
   2. Repository name: `gabby-is-22`. Visibility: **Private** (it's a surprise!). Do NOT initialize with README (the local repo already has files). Click Create.
   3. Copy the two commands GitHub shows under "…or push an existing repository" and run them in your project terminal (they look like `git remote add origin https://github.com/<you>/gabby-is-22.git` then `git push -u origin main`). If git asks you to log in, follow the browser prompt.
8. 👤 CALEB STEP 0.3 — connect Vercel:
   1. Go to https://vercel.com/new
   2. Under "Import Git Repository", find `gabby-is-22` and click **Import**. (If it's not listed, click "Adjust GitHub App Permissions" and grant access to the repo.)
   3. Framework Preset: Vercel should auto-detect **Vite**. Leave Build Command `vite build` / `npm run build` and Output Directory `dist` as detected. No environment variables needed.
   4. Click **Deploy**. Wait ~1 minute. You get a URL like `gabby-is-22.vercel.app`.
   5. Note: a private repo on a free Vercel account still deploys a PUBLIC website — that's what we want (shareable link, no login), and the URL is unguessable enough for a surprise.
   6. Open the URL on your phone to confirm the placeholder loads.
9. Agent: verify `npm run build` succeeds and commit everything.

## Acceptance criteria
- `npm run dev` shows the placeholder scene; `npm run build` and `npm run test` pass.
- Repo on GitHub; every push to `main` auto-deploys to the Vercel URL.
- Placeholder visible on Caleb's phone at the Vercel URL.
- `PROGRESS.md` updated: `PLAN-00 ✅`.
