# PLAN-03 — Controls & Mobile UX (pedals, rotation prompt, input unification)

**Read `NORTH_STAR.md` first (§2 mobile requirements). If confused, re-read it.**

Goal: the game is a first-class phone experience in landscape, and still perfect with arrow keys on desktop.

## Prerequisites
- PLAN-02 complete (bike drivable via keyboard).

## Tasks
1. **Input system** (`src/systems/input.ts`): single abstraction exposing `{ gas: boolean, brake: boolean }` per frame, fed by keyboard AND touch simultaneously (either works at any time, no mode switch).
   - Keyboard: Right/Up arrow = gas; Left/Down arrow = brake. Also W/D = gas, S/A = brake (free bonus, cheap).
2. **Touch pedals** (HUD layer, fixed to camera):
   - GAS pedal bottom-RIGHT, BRAKE pedal bottom-LEFT. Big pixel-art pedal buttons ≥ 120px, with pressed/unpressed states.
   - Must use Phaser multi-pointer input (`this.input.addPointer(2)`) so both pedals can be held at once and swapping mid-press works.
   - Generous hit areas (whole bottom corner regions, larger than the visible art).
   - Pedals hidden automatically when a keyboard is used? NO — keep them visible on touch-capable devices only (`navigator.maxTouchPoints > 0`), always hidden on pure desktop.
3. **Orientation handling**:
   - Portrait on a phone → full-screen overlay (DOM, outside the canvas): cute pixel art of a rotating phone + "Flip your phone sideways to ride! 🏍️". Game auto-pauses under it.
   - Implement via `matchMedia('(orientation: portrait)')` listener + resize events; overlay removed instantly on rotate. Test iOS Safari quirks (the 100vh problem — use `100dvh`).
   - Try `screen.orientation.lock('landscape')` where supported (Android fullscreen); fail silently elsewhere (iOS doesn't allow it).
4. **Mobile page hygiene**: prevent pull-to-refresh and overscroll (`overscroll-behavior: none`), prevent text selection/callouts on hold, `user-scalable=no`, iOS `apple-mobile-web-app-capable` meta + icon so "Add to Home Screen" looks nice (icon comes from PLAN-10; use placeholder now).
5. **Pause**: tapping a small ⏸ top-left (and `Esc`/`P` on desktop) pauses with Resume/Restart/Level Select options.

## Acceptance criteria
- On a phone (or Chrome DevTools device emulation w/ touch): both pedals work, simultaneously pressable, game fully playable one-handed-per-thumb.
- Rotating to portrait pauses + shows prompt; rotating back resumes seamlessly.
- Desktop arrows still work; no pedals shown on non-touch desktop.
- 👤 CALEB STEP 3.1: play the test level on your actual phone via the Vercel URL (push first). Check: pedals comfortable for your thumbs? Any lag? Report anything that feels off to the agent, which must tune sizes/positions from your feedback.
- `PROGRESS.md` updated.
