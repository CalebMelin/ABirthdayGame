# PLAN-11 — Final QA & Launch

**Read `NORTH_STAR.md` first (§10 definition of done). If confused, re-read it.**

Goal: verified, deployed, gift-ready.

## Prerequisites
- PLAN-00 … PLAN-10 all ✅ in `PROGRESS.md`.

## Tasks

### 1. Agent full-requirements audit
Walk NORTH_STAR §10 item by item and every row of the §5 level table, playing the actual game. Produce `QA-REPORT.md` with pass/fail per item, including:
- Full playthrough L1→22 → party → credits (desktop).
- The four verbatim notes appear at L6/L9/L13/L14 exactly.
- Easter eggs: wheelie rider (L11), sleepover billboard (L18), tulip system.
- Caleb passenger from L12 pickup onward; never before.
- Character creation changes visibly apply in-game + Dallas mirror.
- Fresh-profile test (cleared localStorage): first-run flow correct.
- Cross-browser: Chrome, Firefox, Safari (via responsive/device mode at minimum).
- Performance: no leaks after 10 restarts; bundle size sane (< ~5MB total assets).
- `npm run build && npm run test` green; zero console errors/warnings in a full playthrough.
Fix everything found; re-run until clean.

### 2. Production deploy
- Push to `main` → Vercel auto-deploys. Verify the production URL serves the latest build (check a version string in the credits corner, e.g. `v1.0`).
- Optional nicety: in Vercel → Project → Settings → Domains, rename to something cuter, e.g. `gabby-is-22.vercel.app` if available.

### 3. 👤 CALEB STEP 11.1 — The human playtest (the most important test)
1. Open the Vercel URL on YOUR phone (the model closest to Gabby's). Add to Home Screen for the nicest experience.
2. Play the ENTIRE game start to finish in one sitting, in landscape, sound on.
3. Check specifically, as the only person who can judge: do the jokes land? Are the four notes worded right? Wheelie rider look right? Party feel like a party? Is any level frustrating (even slightly — remember: EASY)?
4. Note every issue, hand the list to the agent. Repeat until you'd proudly hand her your phone.

### 4. 👤 CALEB STEP 11.2 — Gift delivery prep
- Decide delivery: text her the link, QR code on a birthday card (agent: generate `qr.png` for the URL on request), or hand her your phone with it open.
- Optional: keep the repo private forever; the site stays live free on Vercel's hobby tier. Don't push updates on her birthday (avoid mid-play deploys).

## Acceptance criteria
- `QA-REPORT.md` all green; production URL plays perfectly on Caleb's phone.
- Caleb has completed a full happy playthrough and signed off.
- `PROGRESS.md`: `PLAN-11 ✅ — SHIPPED 🎉`.
