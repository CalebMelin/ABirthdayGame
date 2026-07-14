# NORTH STAR — "Gabby is 22!!"

> **THIS DOCUMENT IS THE SINGLE SOURCE OF TRUTH.**
> Every agent working on this project must read this file before starting any task.
> If a plan file, code comment, or prior implementation conflicts with this document, THIS DOCUMENT WINS.
> If something is ambiguous and not covered here, choose the simplest option that serves the vision, and log the decision in `DECISIONS.md` at the repo root.

---

## 1. The Vision (one paragraph)

A cute, easy, pixel-art side-scrolling motorcycle game made as a birthday gift. Gabby (the player) races across the city on her motorcycle to make it to her own 22nd birthday party, picking up her boyfriend Caleb along the way. Hill Climb Racing–style physics (gas + brake only), 22 short and forgiving levels, personal jokes and easter eggs throughout, ending at a party full of her friends. It must feel loving, funny, and polished — a gift, not a tech demo. The player should smile the whole time.

## 2. Non-negotiable facts

- Title: **"Gabby is 22!!"**
- Creator: Caleb Melin. Recipient: Gabriella "Gabby" Novelli. Occasion: her 22nd birthday.
- **22 levels**, all EASY. A non-gamer must be able to finish every level within 1–3 attempts. When in doubt, make it easier.
- Pixel art style throughout (crisp nearest-neighbor scaling, no anti-aliased "smooth" art).
- No login, no accounts, no backend, no analytics. Progress saved in `localStorage` only.
- Hosted on **Vercel** as a static site.
- Mobile-first landscape play: **gas pedal bottom-right, brake pedal bottom-left**. Portrait orientation shows a "rotate your phone" prompt. Desktop: arrow keys (Right/Up = gas, Left/Down = brake).

## 3. Tech stack (locked — do not change)

| Concern | Choice |
|---|---|
| Engine | Phaser 3 (latest stable) |
| Physics | Matter.js via Phaser's built-in Matter integration |
| Language | TypeScript |
| Bundler/dev server | Vite |
| Art | Programmatically generated pixel-art sprite sheets (see `plans/PLAN-10`), stored as PNG assets in `public/assets/` |
| Audio | Small OGG/MP3 files, generated/sourced per PLAN-10; game must work fine muted |
| Persistence | `localStorage` (key prefix `gabby22.`) |
| Hosting | Vercel static deploy of `dist/` |
| Testing | Vitest for pure logic (level configs, save system, fact rotation); manual playtest checklist for gameplay |

No React, no server code, no external state libraries. One Phaser game instance, scene-based architecture.

## 4. Game structure

### Scene flow
```
BootScene → TitleScene → CharacterCreationScene → LevelSelectScene
   → GameScene(level N) → LevelCompleteScene(fact/hint) → next level …
   → GameScene(level 22) → PartyScene → CreditsScene
```
- First launch goes Title → Character Creation. Later launches can skip to Level Select (character is saved, editable from title screen).
- Levels unlock sequentially. Replaying finished levels is allowed.

### Character creation
Player customizes Gabby before playing:
- **Hair color** (default blonde — Gabby is blonde; offer ~6 swatches)
- **Eye color** (~5 swatches)
- **Motorcycle color** (~8 swatches)
- **Outfit**: motorcycle racing suits, ~4–6 designs/colorways
Rendered as palette-swaps of one base sprite. Live preview of Gabby on her bike. Saved to `localStorage`.

### Core gameplay (every level)
- Side-scrolling, left→right, over rolling 2D terrain (smooth hills built from a heightmap polyline, Hill Climb Racing style).
- Bike is a Matter.js body: chassis + two wheel bodies on suspension constraints.
- **Gas** = rear-wheel torque forward; also rotates bike backward (nose up) in mid-air.
- **Brake** = wheel braking / reverse torque; rotates bike forward (nose down) in mid-air.
- Fail states: rider's head hits ground, or falling off the world. On fail: instant, friendly restart of the level ("Oops! Go again 💛") — no lives, no penalties.
- Finish: reach the flag/goal at the end of the terrain. Levels are SHORT: 20–45 seconds each.
- Fuel: **none**. (Easier than Hill Climb. Do not add fuel.)
- A small urgency framing exists in story text only — there is NO actual countdown failing the player. "Get there in time" is narrative flavor, never a mechanic.

### Tricks & tulips (persistent collectible)
- Doing a full backflip or frontflip off a jump (≥360° rotation while airborne, landed successfully) awards a **tulip**.
- Tulips accumulate into a bouquet icon top-right of the HUD; count persists across levels and sessions (`gabby22.tulips`).
- Tulips are purely cosmetic/sentimental. No shop, no spending.
- The party & credits screens acknowledge the bouquet ("You collected N tulips for the party!").

## 5. The 22-level map (locked)

Levels are data-driven configs (`src/levels/levelXX.ts` conforming to `LevelConfig`), varying terrain seed, theme/backdrop, obstacle density, jumps, and special events. Themes progress across the city: suburbs → downtown → highway → riverside → party district.

| Lvl | Theme/Backdrop | Special content |
|---|---|---|
| 1 | Gabby's street, sunrise | Tutorial: signs teach gas/brake/flips. Very flat. |
| 2 | Suburbs | Gentle hills, first jump (tulip opportunity taught here) |
| 3 | Suburbs/park | — |
| 4 | Park, tulip field backdrop | Extra jumps |
| 5 | Small-town main street | — |
| 6 | Edge of downtown | **Hint after completion** (see §6): "cars can't see motorcycles" |
| 7 | Downtown traffic | **INVISIBLE-CARS LEVEL**: oncoming cars drift into Gabby's lane and must be dodged (speed control + small jumps/gaps). Cars telegraph clearly; collisions = soft fail/restart. |
| 8 | Downtown | — |
| 9 | Construction zone | Ramps, jumps. Fixed note after completion: "Caleb is most definitely a tease" |
| 10 | Overpass | — |
| 11 | Highway on-ramp | **EASTER EGG (guaranteed, non-interactive)**: rider all in black, black helmet, wheelies past on a **yellow motorcycle**. |
| 12 | Caleb's neighborhood | **CALEB PICKUP LEVEL**: mid-level stop at Caleb's house; short pickup cutscene (he waves, hops on). From here through level 22 and all cutscenes, **Caleb rides on the back of the bike** (visible passenger sprite; handling change negligible). |
| 13 | Riverside road | First level riding two-up. Fixed note after completion (see §6). |
| 14 | River bridge | **Hint after completion**: "cops like to pull over motorcycles…" |
| 15 | City boulevard | **POLICE CHASE LEVEL**: police car pursues from behind; player must keep moving (falling too far behind = soft fail/restart with a friendly "They got us! …let's pretend that didn't happen"). Still easy — cop speed tuned below achievable player speed. |
| 16 | Old town | — |
| 17 | Hilly district | Big jumps (tulip farming) |
| 18 | Billboard row | **EASTER EGG**: background sign reading **"Sleepovers aren't breaking the rules right??"** — subtle, among decoy billboards. |
| 19 | Sunset streets | — |
| 20 | Party district outskirts | Balloons start appearing in backgrounds |
| 21 | Almost there | Streamers, more balloons |
| 22 | Final stretch, dusk | Ends at the party venue → transitions to PartyScene |

**PartyScene (after level 22):** Gabby & Caleb arrive; lots of balloons, confetti, banner "HAPPY 22nd GABBY!!". Named characters with floating name tags:
- **Andrea** — girl, brown hair
- **Allison** — girl, brown hair (visually distinct from Andrea: different outfit/hairstyle)
- **Dallas** — girl, blonde, sprite looks the same as the Gabby character (intentional twin joke)
- **Dom** — boy, blonde hair
- Plus 8–15 unnamed background partygoers dancing/mingling.
A "Credits →" button appears after a few seconds.

**CreditsScene:** exactly this text, centered, with confetti:
```
Created by Caleb Melin
Created for Gabriella Novelli
Happy 22nd!!!
```
Plus (allowed, below a divider): tulip count, "Play again?" button.

## 6. Level-complete screens (facts & notes system)

Every level completion shows: "Level N complete! 🎉", tulips earned, and **one note**. Notes come from `src/data/notes.ts`:

- **Fixed, level-bound notes (must appear exactly at these points, never randomized):**
  - After level 6: `"Believe it or not, cars can't actually see motorcycles on the road"` (hint for level 7)
  - After level 9: `"Caleb is most definitely a tease"`
  - After level 13: `"When a guy is riding with a girl behind him, feeling down his chest and stomach might make him go crazy"`
  - After level 14: `"Cops really like to pull over motorcycles... but we don't have time for that"` (hint for level 15)
- **All other levels:** draw without repetition from a pool of ~20 fun, real motorcycle facts (defined in PLAN-08; light and true, e.g. "The first motorcycle was built in 1885 and had a wooden frame").

## 7. Tone & content rules

- Warm, playful, flirty-inside-joke tone is intended and fine (this is a gift between partners). Keep everything PG-13.
- Never mock the player for failing. Failure messages are gentle and funny.
- Personal content (names, the fixed notes, easter eggs) must appear EXACTLY as specified in §5–§6 — do not paraphrase.

## 8. Quality bar

- 60fps target on a mid-range phone; keep physics bodies per level < 100, use object pooling for cars/props.
- No console errors. Touch targets ≥ 88px. Pedals must respond to multitouch (both pressable at once).
- Every level beatable by the dev agent's own playthrough before marking a plan complete.

## 9. Where things live

```
repo root
├── NORTH_STAR.md          ← this file (copied into the repo)
├── CLAUDE.md              ← agent operating instructions
├── DECISIONS.md           ← running log of judgment calls
├── plans/                 ← PLAN-00 … PLAN-11 (execute in order)
├── src/
│   ├── main.ts
│   ├── scenes/            (Boot, Title, CharacterCreation, LevelSelect, Game, LevelComplete, Party, Credits)
│   ├── systems/           (physics, input, save, tricks, traffic, police, spawner)
│   ├── levels/            (types.ts, level01.ts … level22.ts, index.ts)
│   ├── data/              (notes.ts, palettes.ts, characters.ts)
│   └── art/               (sprite generation scripts → output to public/assets/)
├── public/assets/
└── tests/
```

## 10. Definition of done (whole project)

1. All 22 levels playable start→finish on phone (touch) and desktop (arrows).
2. Character creation works and choices visibly apply in-game.
3. All special levels (7, 12, 15), all easter eggs (11, 18, tulips), party scene with the four named characters, and credits exist exactly as specified.
4. Fixed notes appear at their exact levels; the fact pool never repeats within a playthrough.
5. Rotate-phone prompt works; multitouch pedals work.
6. Deployed on Vercel at a shareable URL; loads in < 5s on 4G.
7. Caleb has personally played it through on his phone.
