# PLAN-08 — Level-Complete Screens, Notes System & Story Polish

**Read `NORTH_STAR.md` first (§6 notes system — the fixed notes are VERBATIM). If confused, re-read it.**

Goal: the congratulations screen after every level, with the exact fixed notes at the exact levels and a non-repeating fun-fact pool everywhere else.

## Prerequisites
- PLAN-05 complete.

## Tasks

### 1. LevelCompleteScene (real version)
- Shows: "Level N complete!! 🎉" header, confetti burst, tulips earned this level (+ bouquet total), the note card (below), then buttons: "Next level →" (primary, big), "Replay", "Level select".
- Note card: pixel-art paper/postcard panel titled "Did you know?" for facts, or "Psst… 💡" for the two hint-style notes. Typewriter text effect.
- After level 22 this scene is skipped in favor of PartyScene (PLAN-09).

### 2. Notes data + engine (`src/data/notes.ts`, `src/systems/notes.ts`)
- **Fixed notes, bound to levels, VERBATIM from NORTH_STAR §6:**
  - L6 → "Believe it or not, cars can't actually see motorcycles on the road" (hint style)
  - L9 → "Caleb is most definitely a tease"
  - L13 → "When a guy is riding with a girl behind him, feeling down his chest and stomach might make him go crazy"
  - L14 → "Cops really like to pull over motorcycles... but we don't have time for that" (hint style)
- **Fact pool** for the other 18 levels — write ~20 real, light motorcycle facts. Draft (verify/adjust for accuracy, keep tone fun):
  1. The first motorcycle (1885, Daimler's Reitwagen) had a wooden frame — basically a bicycle with anger issues.
  2. The word "motorcycle" first appeared in the 1890s.
  3. Modern MotoGP bikes can hit over 220 mph.
  4. Motorcycles are typically 2–3x more fuel-efficient than cars.
  5. The longest motorcycle jump ever recorded is over 350 feet.
  6. Counter-steering: to turn right at speed, riders actually push the handlebar… left.
  7. Harley-Davidson started in a tiny wooden shed in 1903.
  8. The "motorcycle wave" — riders greet each other with a low two-finger wave.
  9. A motorcycle engine can rev more than twice as fast as most car engines.
  10. Some motorcycles have backwards-rotating parts just to help them lean into corners.
  11. The best-selling motor vehicle in history is a motorcycle: the Honda Super Cub (100M+).
  12. Riding uses more core muscles than driving — it's basically a workout.
  13. Wheelies were originally a drag-racing accident that became a sport.
  14. The fastest production motorcycles are electronically limited to 186 mph (299 km/h) by a gentleman's agreement.
  15. Motorcycle helmets must survive impacts at highway speed — modern ones are engineering marvels.
  16. In some countries, lane filtering by motorcycles is legal and reduces traffic for everyone.
  17. The Isle of Man TT is one of the oldest motorcycle races, first run in 1907.
  18. Sidecars used to be so popular that some had their own doors and windshields.
  19. "Two-up" is the official term for riding with a passenger. (Sound familiar?)
  20. Tulips are not a standard motorcycle accessory. Gabby is changing that. 🌷
- Rotation rules: draw randomly WITHOUT repetition within a playthrough (track in `gabby22.notesSeen`); reset pool when exhausted or on new playthrough. Fixed notes never enter the random pool and always override on their level.
- Unit-test: fixed mapping, no-repeat behavior, pool reset.

### 3. Fail/restart overlay polish
- Standardize soft-fail messages: generic pool ("Oops! Go again 💛", "So close!! One more time", "Even MotoGP riders crash sometimes 💛") + level-specific ones from PLAN-06 (cars/police). Instant restart button + auto-restart after 2.5s.

### 4. Story cohesion pass
- Verify the 22 intro one-liners (PLAN-05) + notes + fail messages read as one warm story arc when played in order. Adjust wording (EXCEPT the four verbatim notes and easter-egg texts — never touch those).

## Acceptance criteria
- Beating L6/L9/L13/L14 shows exactly the four verbatim notes; all other levels show non-repeating facts.
- Playthrough of several levels shows no repeated fact; reload mid-run preserves seen-set.
- Confetti + tulip tally correct on complete screen; buttons work on touch + desktop.
- Unit tests pass.
- `PROGRESS.md` updated.
