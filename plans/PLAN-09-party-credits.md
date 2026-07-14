# PLAN-09 — Party Finale & Credits

**Read `NORTH_STAR.md` first (§5 PartyScene/CreditsScene — names and credits text are VERBATIM). If confused, re-read it.**

Goal: the emotional payoff. This is the scene Gabby will remember — spend polish here.

## Prerequisites
- PLAN-05 complete; PLAN-06 (Caleb passenger) and PLAN-04 (character look) strongly recommended first.

## Tasks

### 1. Arrival transition
- Finishing level 22: instead of the normal complete screen, bike auto-rides to the venue (short scripted ride-in), Gabby & Caleb hop off, doors open with light spilling out → PartyScene.

### 2. PartyScene
- Venue: warm-lit pixel interior/backyard at dusk. **Lots of balloons** (floating, bobbing, varied colors — at least 20), streamers, confetti falling continuously, big banner: "HAPPY 22nd GABBY!!".
- **Named characters with floating name tags above their heads** (small pixel labels with a subtle bob):
  - **Andrea** — girl, brown hair
  - **Allison** — girl, brown hair (different hairstyle + outfit color than Andrea so they're clearly distinct)
  - **Dallas** — girl, blonde — her sprite is a COPY OF THE PLAYER'S CURRENT GABBY (same hair/eye/outfit choices; she stands near Gabby for the twin effect)
  - **Dom** — boy, blonde hair
- Gabby (player's customized look) + Caleb stand center; everyone does simple idle/dance loops (2-frame bounces are fine).
- **8–15 unnamed background partygoers** (varied palette-swapped sprites) dancing/mingling behind the named group. No name tags on them.
- Bouquet payoff: if tulips > 0, Gabby holds the bouquet; toast "You brought N tulips to the party!! 🌷".
- Party music (PLAN-10), balloon-pop sfx when tapping balloons (tiny interactive delight — balloons are tappable/clickable and pop with confetti; endless supply floats in).
- After ~4 seconds, a **"Credits →"** button fades in (bottom-right). The scene stays alive — no forced exit.

### 3. CreditsScene
- Dark background, confetti still falling, centered pixel text revealed line by line, EXACTLY:
  ```
  Created by Caleb Melin
  Created for Gabriella Novelli
  Happy 22nd!!!
  ```
- Below a divider: "🌷 × N collected", then "Play again?" (→ Title; progress kept, offer "Fresh start" secondary option that calls `resetAll()` after a confirm).
- A tiny heart somewhere. Tasteful.

### 4. Post-game state
- Title screen after beating the game gains a "Party 🎈" button to revisit PartyScene/Credits anytime.

## Acceptance criteria
- Level 22 finish flows: ride-in → party → credits with no dead ends.
- All four named characters present with exact names; Dallas mirrors the player's current character choices (change character, revisit party → Dallas updates).
- ≥ 20 balloons + background crowd present; balloons poppable; 60fps maintained.
- Credits text verbatim, line breaks as specified.
- `PROGRESS.md` updated.
