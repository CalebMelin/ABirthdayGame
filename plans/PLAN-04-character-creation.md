# PLAN-04 — Character Creation Screen

**Read `NORTH_STAR.md` first (§4 character creation). If confused, re-read it.**

Goal: a delightful screen where the player customizes Gabby's hair color, eye color, motorcycle color, and racing-suit outfit, with a live preview.

## Prerequisites
- PLAN-01 complete. (Can run in parallel with PLAN-02/03; only depends on the scene skeleton + save system. Sprite art will be placeholder-quality until PLAN-10.)

## Tasks
1. **Palette-swap system** (`src/systems/palette.ts`): base sprites are drawn with marker colors (e.g. pure magenta = hair, pure cyan = eyes, pure green = bike body, pure red = suit primary). At load, generate recolored texture variants via canvas pixel replacement. Cache per combination actually chosen (don't pre-generate the full cartesian product).
2. **Options data** (`src/data/characters.ts`):
   - Hair: blonde (DEFAULT — Gabby is blonde), brown, black, red/ginger, pink, blue.
   - Eyes: blue, green, brown, hazel, grey.
   - Bike: red, blue, black, white, pink, purple, teal, **yellow** (yes, yellow must be in the list — it makes the level-11 easter egg funnier if she happens to pick it, but the easter-egg rider's bike is always yellow regardless).
   - Outfits (racing suits): 5 designs — classic racing stripes, two-tone sport, all-black stealth, retro 70s cafe-racer, pastel party suit. Each in its base colorway (keep scope sane: outfit choice = design, not design × color).
3. **UI**: left half = large live preview of Gabby on her bike (idle animation: slight bounce, blinking). Right half = four labeled rows of swatch buttons (HAIR / EYES / BIKE / SUIT) with the selected swatch highlighted. Buttons: "Randomize 🎲", "Let's ride! →". All thumb-friendly.
4. **Persistence & application**: selection saved via save system on every change; GameScene reads it and builds the actual in-game bike+rider textures through the same palette-swap path (one source of truth). Party/credits scenes must also use the chosen look. NOTE for later plans: the **Dallas** party character must copy whatever the player's current Gabby look is (NORTH_STAR §5).
5. **First-run flow**: Title "Play" goes here if no `gabby22.character` exists; otherwise straight to LevelSelect. "Edit Character" on Title always returns here.

## Acceptance criteria
- Every combination renders correctly in preview AND in-game (spot-check ≥ 6 random combos).
- Choices persist across reload; changing character mid-progress doesn't reset level progress.
- Defaults on first open: blonde hair (it's Gabby!), any tasteful defaults elsewhere.
- Screen fully usable via touch on phone landscape.
- `PROGRESS.md` updated.
