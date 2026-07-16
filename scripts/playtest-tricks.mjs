// Automated browser playtest for the PLAN-02 task-6 feel-tuning criteria
// (companion to playtest-drive.mjs — run that first as the regression gate).
//
// *** PLAN-05 ST-5/task 6 RECONCILIATION NOTE ***
// This script was written against PLAN-02's hardcoded TEST_LEVEL, which had
// a real trick kicker at x=10584. PLAN-05 ST-4 removed TEST_LEVEL and made
// every level data-driven; the 22 real configs were authored conservatively
// (gentle raised-cosine hops only, no flip-capable kicker anywhere — see
// src/levels/validate.ts's jump-safety floors) so gas-only survival could be
// PROVEN, not just hoped for. No PLAN-05 level has a kicker. Current status
// per mode, below:
//   - flip:    DORMANT. Cannot work until PLAN-07 re-adds a flip-capable
//              kicker to some level. Exits immediately with a clear message
//              instead of hanging/timing out against a kicker that no
//              longer exists (see FLIP_DORMANT_MESSAGE).
//   - gasonly: still runs (drives level 1 start-to-finish gas-only) but is
//              SUPERSEDED for cross-level coverage by the new, committed
//              scripts/playtest-levels.mjs, which drives all 22 levels.
//              Its kicker-specific `overKicker` field is now permanently
//              null (RAMP_X/RAMP_W no longer correspond to real geometry on
//              any level) — expected, not a bug.
//   - brake:   RE-POINTED at level 22 (BRAKE_TEST_LEVEL_ID below), the
//              hilliest jump-free level, since level 1 is flat as of
//              PLAN-05. The flat-stop portion is unaffected either way —
//              every level shares the same {0,700} spawn flat zone
//              (guarded by src/levels/validate.ts's validateFlatZones).
//
// Modes (node scripts/playtest-tricks.mjs [mode]):
//   flip     (default) — DORMANT, see above. When PLAN-07 adds a real
//            kicker: performs the deliberate-backflip recipe off it N times
//            (ATTEMPTS env, default 3), each on a fresh scene.restart + full
//            drive from spawn, and reports the airborne rotation AT LANDING
//            per attempt (the PLAN-07 tulip criterion: |rotation| >= 360deg
//            + clean landing). Exit 0 only if EVERY attempt full-flips and
//            lands clean. The recipe implementation (`flipAttempt` et al.)
//            is left intact/unreachable below, ready for PLAN-07 to re-point
//            at a real kicker rather than being rebuilt from scratch.
//   gasonly  — full-gas run start->finish (level 1) recording per-physics-
//            step telemetry; reports every airborne phase (steps, max
//            |chassis angle|, rotation at landing) + crash count. Exit 0
//            only if the level completes, with zero crashes, and no
//            airborne phase exceeds the LOOP_OUT_LIMIT_DEG chassis angle
//            ("no loop-outs on natural hills"). See supersession note above.
//   brake    — full-brake stops on the spawn flat (position-keyed, moderate
//            speed — the flat is only 700px) and across 3 rounds of
//            top-speed rolling hills on BRAKE_TEST_LEVEL_ID; exit 0 only if
//            no crash anywhere AND the GROUNDED max |chassis angle| stays
//            under ENDO_LIMIT_DEG (flat) / DESCENT_PITCH_LIMIT_DEG (rolling).
//            Grounded-only on purpose: an endo/faceplant is a grounded
//            pitch-over (front wheel down, rear lifting — `airborne` needs
//            BOTH wheels off, so it stays false through a real endo and the
//            frames count); harmless airborne hop attitude mid-braking is
//            governed by the gasonly/flip modes' loop-out checks, not this
//            gate.
//
// THE BACKFLIP RECIPE (human instructions, encoded in `flip` below — DORMANT,
// see above; kept for PLAN-07):
//   1. Hold gas at full speed up the big kicker (x=10584 in the old
//      TEST_LEVEL — stale, see reconciliation note above).
//   2. Right at the lip, let go of gas and immediately press it again
//      (~0.1s gap). A press that lands a little BEFORE takeoff still
//      counts — bike.ts's trickPressBufferSteps press-buffering.
//   3. Keep holding gas: the bike backflips (nose-up).
//   4. When the flip is all the way around (~360deg), release everything —
//      the auto-stabilization assist steadies the landing.
//
// Input events for the trick are dispatched PAGE-SIDE (window KeyboardEvent
// with a fixed ~90ms release gap): CDP keyboard.* can land a keyup+keydown
// pair between two render frames, where the game's per-frame pedal sampling
// never sees the release — an artifact a real finger cannot produce. The
// gesture itself is human-scale (nothing frame-perfect).
//
// Requires `npm run dev` (talks to the game via the dev-only
// window.__gabbyGame — see src/main.ts).
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const DEV_URL = process.env.PLAYTEST_URL ?? 'http://localhost:5173/';
const OUT_DIR = process.env.OUT_DIR ?? './playtest-out';
const DESIGN_W = 1280;
const DESIGN_H = 720;

// STALE trick-kicker geometry from the removed PLAN-02 TEST_LEVEL (see the
// PLAN-05 ST-5/task 6 reconciliation note at the top of this file) — no
// longer corresponds to real geometry on any of the 22 PLAN-05 levels.
// Kept, not deleted: `flip` mode's (dormant) flipAttempt() still references
// it for when PLAN-07 re-points this at a real kicker, and `gasonly`
// mode's kicker-phase filter still references it too (harmlessly — it now
// just never matches anything, so `overKicker` reports null forever until
// re-pointed).
const RAMP_X = 10584;
const RAMP_W = 336;
const CREST_X = RAMP_X + RAMP_W / 2;

/** brake mode's re-pointed target (see the reconciliation note above):
 * level 22 is the hilliest of the 22 real PLAN-05 configs (hilliness 0.38)
 * AND jump-free, i.e. pure rolling hills — exactly what the "rolling
 * descents" portion of brake mode wants to stress-test. The flat-stop
 * portion doesn't care which level (every level shares the same {0,700}
 * spawn flat zone). */
const BRAKE_TEST_LEVEL_ID = 22;

/** flip mode's dormant-exit message (see the reconciliation note above). */
const FLIP_DORMANT_MESSAGE =
  'flip mode is dormant until PLAN-07: no flip-capable kicker exists in the current levels; ' +
  'gas-only survival is now covered by scripts/playtest-levels.mjs.';

/** Criterion (e): max |chassis angle| allowed during any airborne phase of
 * a gas-only run — "the bike never loops out on natural hills". */
const LOOP_OUT_LIMIT_DEG = 140;
/** Brake test, spawn flat: max GROUNDED |chassis angle| while stopping. */
const ENDO_LIMIT_DEG = 45;
/** Brake test, top-speed rolling descents: max GROUNDED |chassis angle|.
 * Looser than the flat limit because the bike legitimately aligns to
 * terrain slopes and adds a brake-pitch transient on top, and the timed
 * round boundaries land on slightly different terrain each run. Envelope
 * measured over 6 independent runs of 3 rounds each (2026-07-14, after
 * the anti-endo tuning): flat 5–6°, descents 10–34°. Limit sits midway
 * between that worst case and a real endo (90°+): unambiguous both ways. */
const DESCENT_PITCH_LIMIT_DEG = 60;

const mode = process.argv[2] ?? 'flip';

async function designClick(page, x, y) {
  const box = await page.locator('canvas').boundingBox();
  if (!box) throw new Error('canvas not found');
  await page.mouse.click(box.x + (x / DESIGN_W) * box.width, box.y + (y / DESIGN_H) * box.height);
}

async function waitForScene(page, key, timeout = 20_000) {
  await page.waitForFunction(
    (k) => globalThis.__gabbyGame?.scene.isActive(k) === true,
    key,
    { timeout }
  );
}

/** Click through Title -> CharacterCreation -> LevelSelect -> level 1. */
async function enterLevel1(page) {
  await waitForScene(page, 'TitleScene');
  await designClick(page, 640, 400); // Title: Play
  await waitForScene(page, 'CharacterCreationScene');
  await designClick(page, 820, 660); // CharacterCreation: Let's ride! -> (PLAN-04 task 3)
  await waitForScene(page, 'LevelSelectScene');
  await designClick(page, 265, 220);
  await waitForScene(page, 'GameScene');
  await page.waitForTimeout(600);
}

/** Telemetry tuple layout — the SINGLE source of truth shared by the
 * recorder below and every reader (airPhases, brake mode). Readers index
 * with these names, never bare numbers: a silent reorder here would
 * otherwise make e.g. the brake mode's grounded filter read the wrong
 * field and produce a false PASS — the worst failure mode for an
 * evidence harness. */
const T = { X: 0, Y: 1, ANGLE: 2, AIR: 3, ROT: 4, CRASHED: 5 };

/** Attach a per-physics-step telemetry recorder to the CURRENT Matter
 * world (scene.restart destroys the world, so re-install after one).
 * Frame layout MUST match `T` above (the page-side closure can't see
 * harness constants, hence the mirrored comment here). */
function installRecorder(page) {
  return page.evaluate(() => {
    const s = globalThis.__gabbyGame.scene.getScene('GameScene');
    const frames = [];
    globalThis.__telem = frames;
    s.matter.world.on('beforeupdate', () => {
      const b = s.bike;
      if (!b) return;
      // [X, Y, ANGLE, AIR, ROT, CRASHED] — keep in sync with T.
      frames.push([b.x, b.y, b.angle, b.airborne ? 1 : 0, b.airborneRotation, b.crashed ? 1 : 0]);
    });
  });
}

function bikeState(page) {
  return page.evaluate(() => {
    const g = globalThis.__gabbyGame;
    const complete = g.scene.isActive('LevelCompleteScene');
    const s = g.scene.getScene('GameScene');
    if (!g.scene.isActive('GameScene') || !s.bike) return { complete, gone: true };
    const b = s.bike;
    return {
      complete,
      gone: false,
      x: b.x,
      angle: b.angle,
      air: b.airborne,
      rot: b.airborneRotation,
      crashed: b.crashed,
    };
  });
}

/** Split telemetry into airborne phases (>= 3 steps, filters contact
 * chatter). Each phase: steps, x range, max |chassis angle| (deg), and
 * airborneRotation at the landing step (deg). */
function airPhases(frames) {
  const phases = [];
  let cur = null;
  let crashes = 0;
  let prevCrashed = false;
  for (const f of frames) {
    const [x, a, air, rot, crashed] = [f[T.X], f[T.ANGLE], f[T.AIR], f[T.ROT], f[T.CRASHED]];
    if (crashed && !prevCrashed) crashes++;
    prevCrashed = crashed === 1;
    if (air) {
      if (!cur) cur = { startX: Math.round(x), steps: 0, maxAbsAngleDeg: 0, landingRotationDeg: 0 };
      cur.steps++;
      cur.maxAbsAngleDeg = Math.max(cur.maxAbsAngleDeg, Math.round(Math.abs((a * 180) / Math.PI)));
      cur.landingRotationDeg = Math.round((rot * 180) / Math.PI);
      cur.endX = Math.round(x);
    } else if (cur) {
      if (cur.steps >= 3) phases.push(cur);
      cur = null;
    }
  }
  if (cur && cur.steps >= 3) phases.push(cur);
  return { phases, crashes };
}

/** One full flip attempt: fresh restart, drive from spawn, do the recipe
 * page-side (keyed to game state), wait for landing, return evidence. */
async function flipAttempt(page, att) {
  await page.evaluate(() =>
    globalThis.__gabbyGame.scene.getScene('GameScene').scene.restart({ level: 1 })
  );
  await page.waitForTimeout(600);
  await installRecorder(page);

  // The whole drive + trick runs page-side so the pedal timing is keyed to
  // game state (~8ms granularity), not harness poll roundtrips. The
  // monitor also re-presses gas if a mid-drive fail-restart cleared the
  // key state (restart recreates the Key objects).
  const attemptPromise = page.evaluate(
    ([crestX]) =>
      new Promise((resolve) => {
        const s = globalThis.__gabbyGame.scene.getScene('GameScene');
        const fire = (type) => {
          const ev = new KeyboardEvent(type, {
            code: 'ArrowRight',
            key: 'ArrowRight',
            bubbles: true,
          });
          Object.defineProperty(ev, 'keyCode', { get: () => 39 });
          window.dispatchEvent(ev);
        };
        const info = { approachRestarts: 0, swapX: null, swapSpeedPxPerStep: null, releaseRotDeg: null };
        let phase = 'approach'; // -> 'swapped' -> 'holding' -> done
        let lastX = -1;
        const giveUp = setTimeout(() => {
          fire('keyup');
          resolve({ outcome: 'timeout', ...info });
        }, 90_000);
        const done = (outcome) => {
          clearTimeout(giveUp);
          resolve({ outcome, ...info });
        };
        fire('keydown'); // gas from spawn
        const tick = () => {
          const b = s.bike;
          if (!b) return void setTimeout(tick, 20); // mid-restart
          if (phase === 'approach') {
            // A fail-restart warps x back to spawn and clears key state.
            if (lastX !== -1 && b.x < lastX - 1500) {
              info.approachRestarts++;
              fire('keydown');
            }
            lastX = b.x;
            if (b.x >= crestX - 50) {
              phase = 'swapped';
              info.swapX = Math.round(b.x);
              info.swapSpeedPxPerStep = Math.round(b.speed * 10) / 10;
              // The recipe: release at the lip, re-press ~90ms later.
              fire('keyup');
              setTimeout(() => {
                fire('keydown');
                phase = 'holding';
                setTimeout(tick, 8);
              }, 90);
              return;
            }
          } else if (phase === 'holding') {
            // Hold the backflip until fully around, then release and let
            // the stabilization assist steady the landing.
            if (b.airborneRotation < -6.3 || (!b.airborne && b.x > crestX + 120)) {
              fire('keyup');
              info.releaseRotDeg = Math.round((b.airborneRotation * 180) / Math.PI);
              return done('released');
            }
          }
          setTimeout(tick, 8);
        };
        tick();
      }),
    [CREST_X]
  );

  // Harness-side: mid-flip screenshot while the page-side recipe runs.
  let midShot = false;
  const shotPoll = (async () => {
    for (let i = 0; i < 4000; i++) {
      const st = await bikeState(page).catch(() => null);
      if (!st || st.gone) break;
      if (!midShot && st.air && st.rot < -2.6) {
        await page.screenshot({ path: join(OUT_DIR, `flip-mid-${att}.png`) });
        midShot = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 25));
    }
  })();
  const holdInfo = await attemptPromise;
  await shotPoll;

  // Wait for landing, then watch 1s for a crash.
  let st = null;
  const tEnd = Date.now() + 5_000;
  while (Date.now() < tEnd) {
    st = await bikeState(page);
    if (!st || st.gone || (!st.air && st.x > CREST_X + 120)) break;
    await page.waitForTimeout(20);
  }
  await page.screenshot({ path: join(OUT_DIR, `flip-land-${att}.png`) });
  await page.waitForTimeout(1000);
  const after = await bikeState(page);

  const frames = await page.evaluate(() => globalThis.__telem);
  const { phases } = airPhases(frames);
  const flight = phases
    .filter((p) => p.startX > RAMP_X - 200 && p.startX < RAMP_X + RAMP_W + 200)
    .sort((a, b) => b.steps - a.steps)[0];
  const landingRotationDeg = flight ? flight.landingRotationDeg : null;
  return {
    attempt: att,
    ...holdInfo,
    flightSteps: flight ? flight.steps : 0,
    landingRotationDeg,
    fullFlip: landingRotationDeg !== null && Math.abs(landingRotationDeg) >= 360,
    crashedWithin1sOfLanding: after && !after.gone ? after.crashed : false,
    settledAngleDeg: after && !after.gone ? Math.round((after.angle * 180) / Math.PI) : null,
  };
}

async function main() {
  // flip mode is DORMANT until PLAN-07 (see the reconciliation note at the
  // top of this file) — exit immediately with a clear, unambiguous message.
  // No browser/dev-server round trip at all, so this genuinely CANNOT hang
  // or time out against a kicker that no longer exists.
  if (mode === 'flip') {
    console.log(JSON.stringify({ mode, status: 'dormant', message: FLIP_DORMANT_MESSAGE }, null, 1));
    console.warn(FLIP_DORMANT_MESSAGE);
    return;
  }

  if (mode !== 'gasonly' && mode !== 'brake') {
    console.error(`unknown mode: ${mode} (use flip | gasonly | brake)`);
    process.exitCode = 1;
    return;
  }

  await mkdir(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: DESIGN_W, height: DESIGN_H } });
  const page = await context.newPage();

  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
  page.on('pageerror', (e) => pageErrors.push(String(e)));

  try {
    await page.goto(DEV_URL, { waitUntil: 'domcontentloaded' });
    await enterLevel1(page);

    if (mode === 'brake') {
      // Re-point at a real descent (see BRAKE_TEST_LEVEL_ID doc comment):
      // level 1 is flat as of PLAN-05, so brake mode's "rolling descents"
      // portion needs a hillier level. Same direct-entry technique (and the
      // same verified-against-Phaser-source shutdown-then-restart
      // semantics) as scripts/playtest-levels.mjs.
      await page.evaluate(
        (levelId) => globalThis.__gabbyGame.scene.start('GameScene', { level: levelId }),
        BRAKE_TEST_LEVEL_ID
      );
      await waitForScene(page, 'GameScene');
      await page.waitForTimeout(600);
    }

    if (mode === 'gasonly') {
      await installRecorder(page);
      const t0 = Date.now();
      let last = null;
      while (Date.now() - t0 < 90_000) {
        await page.keyboard.down('ArrowRight'); // re-press: survives restarts
        last = await bikeState(page);
        if (!last || last.complete) break;
        await page.waitForTimeout(150);
      }
      await page.keyboard.up('ArrowRight');
      const frames = await page.evaluate(() => globalThis.__telem);
      const { phases, crashes } = airPhases(frames);
      const worstAngle = Math.max(0, ...phases.map((p) => p.maxAbsAngleDeg));
      const kickerPhase = phases
        .filter((p) => p.startX > RAMP_X - 200 && p.startX < RAMP_X + RAMP_W + 200)
        .sort((a, b) => b.steps - a.steps)[0];
      const report = {
        mode,
        finished: last?.complete ?? false,
        seconds: Math.round((Date.now() - t0) / 100) / 10,
        crashes,
        airbornePhases: phases.length,
        worstAirborneAngleDeg: worstAngle,
        loopOutLimitDeg: LOOP_OUT_LIMIT_DEG,
        overKicker: kickerPhase ?? null,
        consoleErrors,
        pageErrors,
      };
      console.log(JSON.stringify(report, null, 1));
      const kickerSafe =
        !kickerPhase || (Math.abs(kickerPhase.landingRotationDeg) < 360 && kickerPhase.maxAbsAngleDeg < LOOP_OUT_LIMIT_DEG);
      if (
        !report.finished ||
        crashes > 0 ||
        worstAngle >= LOOP_OUT_LIMIT_DEG ||
        !kickerSafe ||
        consoleErrors.length > 0 ||
        pageErrors.length > 0
      ) {
        process.exitCode = 1;
      }
      return;
    }

    if (mode === 'brake') {
      /** Max |chassis angle| (deg) over GROUNDED frames only — see the
       * header for why airborne frames are excluded from the endo gate. */
      const groundedMaxDeg = (fr) =>
        Math.round(
          Math.max(
            0,
            ...fr.filter((f) => f[T.AIR] === 0).map((f) => Math.abs((f[T.ANGLE] * 180) / Math.PI))
          )
        );

      // Flat: gas from spawn, brake at x >= 550 (POSITION-keyed — a timed
      // press let timing jitter carry the stop past the 700px flat zone
      // into the hills, which made runs unreproducible), hold until
      // stopped. Moderate speed by design; top speed needs ~1200px of
      // runway and is exercised in the rolling rounds below.
      await installRecorder(page);
      await page.keyboard.down('ArrowRight');
      await page.waitForFunction(
        () => {
          const s = globalThis.__gabbyGame.scene.getScene('GameScene');
          return s.bike && s.bike.x >= 550;
        },
        undefined,
        { timeout: 10_000 }
      );
      await page.keyboard.up('ArrowRight');
      await page.keyboard.down('ArrowLeft');
      await page.waitForTimeout(1800);
      await page.keyboard.up('ArrowLeft');
      let frames = await page.evaluate(() => globalThis.__telem);
      // Only frames inside the flat zone count toward the flat limit.
      const flatMax = groundedMaxDeg(frames.filter((f) => f[T.X] < 700));
      const flatCrashed = frames.some((f) => f[T.CRASHED] === 1);
      // Rolling: 3 rounds of full gas to (near-)top speed, then full brake
      // to a stop, marching forward through the hills. Round boundaries are
      // timed — where each brake lands on the terrain varies slightly run
      // to run, which is why the limit is an envelope, not a point value.
      await page.evaluate(() => (globalThis.__telem.length = 0));
      let downMax = 0;
      let downCrashed = false;
      for (let round = 0; round < 3; round++) {
        await page.keyboard.down('ArrowRight');
        await page.waitForTimeout(2500);
        await page.keyboard.up('ArrowRight');
        await page.keyboard.down('ArrowLeft');
        await page.waitForTimeout(2000);
        await page.keyboard.up('ArrowLeft');
        frames = await page.evaluate(() => globalThis.__telem);
        downMax = Math.max(downMax, groundedMaxDeg(frames));
        downCrashed = downCrashed || frames.some((f) => f[T.CRASHED] === 1);
        await page.evaluate(() => (globalThis.__telem.length = 0));
      }
      const report = {
        mode,
        flat: { groundedMaxAbsAngleDeg: flatMax, crashed: flatCrashed },
        rollingDescents: { groundedMaxAbsAngleDeg: downMax, crashed: downCrashed },
        endoLimitDeg: ENDO_LIMIT_DEG,
        descentPitchLimitDeg: DESCENT_PITCH_LIMIT_DEG,
        consoleErrors,
        pageErrors,
      };
      console.log(JSON.stringify(report, null, 1));
      if (
        flatCrashed ||
        downCrashed ||
        flatMax >= ENDO_LIMIT_DEG ||
        downMax >= DESCENT_PITCH_LIMIT_DEG ||
        consoleErrors.length > 0 ||
        pageErrors.length > 0
      ) {
        process.exitCode = 1;
      }
      return;
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
