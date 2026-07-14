# PLAN-10 — Art, Audio & Juice Pass

**Read `NORTH_STAR.md` first (§2 pixel art, §3 art pipeline, §8 quality bar). If confused, re-read it.**

Goal: replace all placeholder art with cohesive generated pixel art, add sound, and add "juice" (particles, screen feel). The game must go from functional to GIFT-QUALITY.

## Prerequisites
- PLAN-04 through PLAN-09 complete (all content exists with placeholder art).

## Tasks

### 1. Art pipeline (`src/art/` scripts, `npm run art`)
- Node scripts that draw sprite sheets onto canvas (node-canvas) and write PNGs to `public/assets/`. Deterministic, re-runnable, committed output. Consistent constraints across ALL art: fixed palette (~32 colors, warm/pastel-leaning), consistent pixel density (16px-ish base tiles, characters ~24–32px tall pre-scale), 1px dark outlines, no anti-aliasing.
- Sprites to generate (with palette-swap marker colors where PLAN-04 needs them):
  - Gabby + bike (ride cycle 2–3 frames, air pose, crash pose) — marker colors for hair/eyes/bike/suit
  - Caleb passenger (seated pose, wave, run for pickup cutscene) — brown hair per DECISIONS.md
  - Cars (4–5 variants), police car with light-flash frames, yellow easter-egg bike + all-black wheelie rider
  - Party characters: Andrea, Allison (distinct), Dom, generic partygoer base with swap palettes; Dallas reuses the Gabby generator
  - Props: finish flag, ramps, signs, billboards (incl. sleepover text), Caleb's house + MELIN mailbox, balloons, streamers, banner, tulip + bouquet stages, pedals, UI panels/buttons, phone-rotate art, app icon/favicon
  - Backdrop layers per theme (skylines, hills, sunset gradients, party district)
- If canvas-generated quality for a sprite is not good enough after honest effort, embed hand-authored pixel data (2D arrays of palette indices) in the generator script — still code, still deterministic.

### 2. Audio (`src/systems/audio.ts`)
- Generate or source CC0 chiptune-style assets: title/menu loop, riding loop (2 variants), police-chase loop (tense but cute), party loop (celebratory), jingles (level complete, fail-womp — gentle, tulip pickup sparkle), sfx (engine rev pitch-shifted by speed, brake, jump/land, car whoosh, siren, balloon pop, button click).
- Options: generate with jsfxr/Web-Audio synthesis scripts committed to `src/art/audio/`, or vendor CC0 files (document source + license in `CREDITS-ASSETS.md`).
- Mute toggle persisted (`gabby22.muted`); audio only starts after first user gesture (mobile autoplay policy); game fully playable muted.

### 3. Juice pass
- Dust particles from rear wheel on acceleration; landing thump + tiny camera dip; speed lines at top speed; confetti systems shared by complete/party/credits; wheelie sparks when flipping; soft parallax cloud drift.
- Transitions: quick pixel-fade between scenes; HUD elements slide in.
- Keep it subtle — cute, not seizure-y. Performance budget respected (pooled particles).

## Acceptance criteria
- Zero placeholder rectangles remain anywhere.
- One consistent visual style across all 22 levels + menus + party (side-by-side screenshot review).
- `npm run art` regenerates all assets deterministically from a clean checkout.
- Sound behaves per mobile autoplay rules; mute persists; no license-unknown assets (CREDITS-ASSETS.md complete).
- 60fps on mid-range phone still holds after juice pass.
- `PROGRESS.md` updated.
