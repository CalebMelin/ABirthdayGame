// Automated browser playtest for the REAL PartyScene (PLAN-09 task 2 / ST-3,
// src/scenes/PartyScene.ts). Same structure as scripts/playtest-levelcomplete.mjs
// (playwright-core driving system Chrome headless, viewport 1280x720 with touch,
// driving through window.__gabbyGame, screenshots to the gitignored
// playtest-out/, console + page errors collected AND gating the exit code).
// Requires `npm run dev` already running on :5173.
//
// This is where PLAN-09's acceptance criteria for the party actually close.
//
// What it gates:
//   1. THE FOUR NAMED GUESTS: exactly Andrea / Allison / Dallas / Dom, asserted
//      against INDEPENDENT code-point oracles built here (String.fromCodePoint) —
//      never by importing the constant — both in the scene's cast data AND as
//      Text objects that really rendered. Same discipline for the banner
//      "HAPPY 22nd GABBY!!" and the bouquet toast.
//   2. THE TWIN JOKE, END TO END: Dallas's texture key === Gabby's (and nobody
//      else's); then a DIFFERENT character is saved, the party is re-entered,
//      and BOTH keys must have changed together and still match. (NORTH_STAR §5 /
//      PLAN-09: "Dallas mirrors the player's current character choices — change
//      character, revisit party -> Dallas updates".)
//   3. CROWD: 8..15 unnamed background partygoers, none carrying a name tag.
//   4. BALLOONS: >= 20 present; a real MOUSE CLICK pops exactly one and a real
//      TOUCH TAP pops exactly one; a replacement floats back in at the bottom
//      edge. Deliberately asserts "exactly ONE popped per press" plus a Zone
//      input-enabled census rather than "this specific balloon popped" — the
//      88px hit areas overlap by design and Phaser's topOnly delivers the press
//      to whichever balloon draws on top.
//   4b. OCCLUDED POP: the balloons draw BEHIND the cast, so a press landing on
//      one of the six front-row figures pops a balloon the player cannot see.
//      That press must still produce a VISIBLE puff — the puff layer (found by
//      observing which depth bucket gains visible Rectangles, not by importing a
//      constant) must sit above both the cast and the name tags. Without this,
//      ~7% of the screen is a no-feedback press zone.
//   5. BOUQUET PAYOFF BOTH WAYS: tulips = N > 0 -> Gabby holds the bouquet and
//      the toast reads byte-exactly "You brought N tulips to the party!! 🌷";
//      tulips = 0 -> no bouquet, no toast at all (not a zero-count one).
//   6. "Credits ->" BUTTON: absent immediately after entry, fades in by ~4s
//      (alpha ramps 0 -> 1), and routes to CreditsScene by BOTH click and tap.
//      Only the scene key is asserted — CreditsScene itself is still ST-4's stub.
//   7. NO FORCED EXIT: ~9s after entry the party is still the active scene and
//      the credits have NOT been auto-started.
//   8. 60FPS: average actualFps >= 55 with the whole scene live (cast + 32
//      balloons + continuous confetti), sampled after a warmup.
//   9. ZERO Matter bodies in the scene, and zero console/page errors throughout.
//  10. Screenshots (with bouquet, without bouquet, after a character change,
//      after popping, mid-puff over a cast member, with the Credits button) to
//      playtest-out/.
//
// Usage:
//   node scripts/playtest-party.mjs
//   PLAYTEST_URL=http://localhost:5174/ OUT_DIR=./shots node scripts/playtest-party.mjs
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const DEV_URL = process.env.PLAYTEST_URL ?? 'http://localhost:5173/';
const OUT_DIR = process.env.OUT_DIR ?? './playtest-out';
const DESIGN_W = 1280;
const DESIGN_H = 720;

const SETTLE_MS = 200;

// --- INDEPENDENT expected literals, assembled from explicit code points so a
// mangled shared constant can never pass (CLAUDE.md Rule 4 — the discipline
// playtest-levelcomplete.mjs uses for the L6 note). ---
const cp = (...points) => String.fromCodePoint(...points);

const ORACLE_ANDREA = cp(0x41, 0x6e, 0x64, 0x72, 0x65, 0x61); // Andrea
const ORACLE_ALLISON = cp(0x41, 0x6c, 0x6c, 0x69, 0x73, 0x6f, 0x6e); // Allison
const ORACLE_DALLAS = cp(0x44, 0x61, 0x6c, 0x6c, 0x61, 0x73); // Dallas
const ORACLE_DOM = cp(0x44, 0x6f, 0x6d); // Dom
const ORACLE_NAMES = [ORACLE_ANDREA, ORACLE_ALLISON, ORACLE_DALLAS, ORACLE_DOM];

/** 'HAPPY 22nd GABBY!!' — lowercase "nd", exactly TWO '!'. */
const ORACLE_BANNER = cp(
  0x48, 0x41, 0x50, 0x50, 0x59, // HAPPY
  0x20,
  0x32, 0x32, 0x6e, 0x64, // 22nd
  0x20,
  0x47, 0x41, 0x42, 0x42, 0x59, // GABBY
  0x21, 0x21 // !!
);

/** U+1F337 TULIP. */
const ORACLE_TULIP = cp(0x1f337);

/** 'You brought N tulips to the party!! 🌷' — note the deliberate "1 tulips"
 * wart at N=1: this sentence is locked personal content and is NEVER
 * pluralized (see src/data/finale.ts). */
function oracleToast(count) {
  const head = cp(0x59, 0x6f, 0x75, 0x20, 0x62, 0x72, 0x6f, 0x75, 0x67, 0x68, 0x74, 0x20);
  const tail = cp(
    0x20,
    0x74, 0x75, 0x6c, 0x69, 0x70, 0x73, // tulips
    0x20,
    0x74, 0x6f, // to
    0x20,
    0x74, 0x68, 0x65, // the
    0x20,
    0x70, 0x61, 0x72, 0x74, 0x79, // party
    0x21, 0x21, // !!
    0x20
  );
  return head + String(count) + tail + ORACLE_TULIP;
}

// --- Balloon geometry oracle. RE-DERIVED here from the placeholder art rather
// than imported: BootScene's tex-balloon is 24x32 and partyBalloons.ts draws it
// at 2.4x, bottom-anchored on the knot — so the drawn body is 76.8px tall and
// its centre (where the invisible 88px hit Zone sits) is half that above the
// knot y the scene reports. ---
const BALLOON_BODY_HEIGHT_PX = 32 * 2.4;

// --- Cast sprite oracle, re-derived the same way: BootScene's tex-gabby-base /
// tex-caleb placeholders are 24x48, bottom-anchored at a member's feet and drawn
// at that member's own scale. Used to work out which balloons are HIDDEN BEHIND
// a front-row figure. ---
const SPRITE_WIDTH_PX = 24;
const SPRITE_HEIGHT_PX = 48;

/** PLAN-02's 60fps criterion, measured the way scripts/playtest-drive.mjs does:
 * 55 leaves headroom for headless-Chrome scheduling noise while still catching a
 * real perf regression. */
const MIN_AVG_FPS = 55;
const FPS_WARMUP_MS = 3_000;
const FPS_SAMPLE_MS = 6_000;

/** A character deliberately different from DEFAULT_CHARACTER on every axis the
 * RIDER texture key depends on (hair / eyes / outfit), so the twin-joke re-check
 * cannot pass by accident. Ids come from src/data/characters.ts's option sets. */
const CHANGED_CHARACTER = {
  hairColor: 'pink',
  eyeColor: 'green',
  bikeColor: 'teal',
  outfit: 'stealth',
};

async function waitForScene(page, key, timeout = 20_000) {
  await page.waitForFunction((k) => globalThis.__gabbyGame?.scene.isActive(k) === true, key, {
    timeout,
  });
}

// --- design->viewport mapping for real clicks/taps (canvas is FIT-scaled). ---
async function canvasBox(page) {
  const box = await page.locator('canvas').boundingBox();
  if (!box) throw new Error('canvas not found');
  return box;
}
function vx(box, x) {
  return box.x + (x / DESIGN_W) * box.width;
}
function vy(box, y) {
  return box.y + (y / DESIGN_H) * box.height;
}
async function clickDesign(page, x, y) {
  const box = await canvasBox(page);
  await page.mouse.click(vx(box, x), vy(box, y));
}
async function tapDesign(page, x, y) {
  const box = await canvasBox(page);
  await page.touchscreen.tap(vx(box, x), vy(box, y));
}

/** Enter PartyScene directly (scene-manager bypass). Every other scene is
 * stopped first so nothing lingers active behind it stealing input or frames.
 * Re-entering an already-active PartyScene restarts it, which is exactly the
 * re-entrancy path the scene must survive. */
async function enterParty(page) {
  await page.evaluate(() => {
    const g = globalThis.__gabbyGame;
    for (const k of [
      'GameScene',
      'PauseScene',
      'LevelCompleteScene',
      'LevelSelectScene',
      'CharacterCreationScene',
      'TitleScene',
      'CreditsScene',
    ]) {
      if (g.scene.isActive(k)) g.scene.stop(k);
    }
    g.scene.start('PartyScene');
  });
  await waitForScene(page, 'PartyScene');
  const enteredAt = Date.now();
  await page.waitForTimeout(SETTLE_MS);
  return enteredAt;
}

async function setTulips(page, n) {
  await page.evaluate((v) => localStorage.setItem('gabby22.tulips', String(v)), n);
}
async function setCharacter(page, character) {
  await page.evaluate((c) => {
    if (c === null) localStorage.removeItem('gabby22.character');
    else localStorage.setItem('gabby22.character', JSON.stringify(c));
  }, character);
}

/** Atomic in-page read of the PartyScene DEV snapshot (+ its function fields
 * evaluated), plus a few facts read straight off the live scene: the Matter body
 * count, the interactive-Zone census, and the loop's fps. */
const READ_PARTY = () => {
  const g = globalThis.__gabbyGame;
  const s = g.scene.getScene('PartyScene');
  const active = g.scene.isActive('PartyScene');
  const d = s && s.__party;
  if (!d) return { hasParty: false, active };
  const zones = s.children.list.filter((o) => o.type === 'Zone');
  return {
    hasParty: true,
    active,
    bannerText: d.bannerText,
    toastText: d.toastText,
    tulips: d.tulips,
    bouquetShown: d.bouquetShown,
    riderTextureKey: d.riderTextureKey,
    cast: d.cast.map((m) => ({
      id: m.id,
      role: m.role,
      nameTag: m.nameTag,
      textureKey: m.textureKey,
      x: m.x,
      groundY: m.groundY,
      scale: m.scale,
      depth: m.depth,
    })),
    balloonCount: d.balloonCount,
    balloons: d.balloons(),
    creditsShown: d.creditsButtonShown(),
    creditsAlpha: d.creditsButtonAlpha(),
    creditsPos: d.creditsButtonPos,
    // -1 == the scene has no Matter world at all (also fine); anything > 0 is a
    // regression — PartyScene must never create a body.
    matterBodies: s.matter && s.matter.world ? s.matter.world.getAllBodies().length : -1,
    zonesTotal: zones.length,
    zonesEnabled: zones.filter((z) => z.input && z.input.enabled).length,
    fps: g.loop.actualFps,
    creditsActive: g.scene.isActive('CreditsScene'),
  };
};
const readParty = (page) => page.evaluate(READ_PARTY);

/** Every string that a live Text object in PartyScene is actually rendering,
 * INCLUDING Text nested inside Containers (name tags and button labels live
 * there). Proves a string reached the screen, not merely the DEV snapshot. */
function renderedTexts(page) {
  return page.evaluate(() => {
    const out = [];
    const walk = (list) => {
      for (const o of list) {
        if (o.type === 'Text' && typeof o.text === 'string') out.push(o.text);
        if (Array.isArray(o.list)) walk(o.list);
      }
    };
    walk(globalThis.__gabbyGame.scene.getScene('PartyScene').children.list);
    return out;
  });
}

const sumPops = (balloons) => balloons.reduce((total, b) => total + b.pops, 0);
const aliveCount = (balloons) => balloons.filter((b) => b.alive).length;

/** Poll readParty until `predicate` holds or `timeoutMs` elapses; returns the
 * last sample either way. */
async function pollParty(page, predicate, timeoutMs, stepMs = 80) {
  const start = Date.now();
  let last = await readParty(page);
  while (Date.now() - start < timeoutMs) {
    if (predicate(last)) return last;
    await page.waitForTimeout(stepMs);
    last = await readParty(page);
  }
  return last;
}

/**
 * Fires ONE real press (mouse click or touch tap) at a live balloon and asserts
 * that exactly one balloon popped, that the Zone census matches, and that a
 * replacement floats back in from the bottom edge.
 *
 * The target is chosen well clear of the bottom-right "Credits ->" button (which
 * sits above the balloons and would otherwise swallow the press) and away from
 * the screen edges.
 */
async function popOneBalloon(page, kind, problems, out) {
  const before = await pollParty(
    page,
    (s) => pickTarget(s) !== undefined,
    3000
  );
  const target = pickTarget(before);
  if (!target) {
    problems.push(`${kind}: no reachable live balloon to aim at`);
    return;
  }

  const popsBefore = sumPops(before.balloons);
  const fire = kind === 'tap' ? tapDesign : clickDesign;
  await fire(page, target.x, target.y - BALLOON_BODY_HEIGHT_PX / 2);

  const after = await pollParty(page, (s) => sumPops(s.balloons) > popsBefore, 2000);
  const popped = after.balloons.filter((b) => b.pops > before.balloons[b.index].pops);
  const record = {
    kind,
    aimedIndex: target.index,
    poppedCount: popped.length,
    poppedIndices: popped.map((b) => b.index),
    aliveAfter: aliveCount(after.balloons),
    zonesEnabledAfter: after.zonesEnabled,
    zonesTotal: after.zonesTotal,
  };

  if (popped.length !== 1) {
    problems.push(`${kind}: ${popped.length} balloons popped from one press (want exactly 1)`);
  }
  // Census: every balloon that is currently popped must have an input-DISABLED
  // Zone, and every live one an enabled Zone — so a popped balloon can never
  // swallow a press meant for a live balloon drifting behind it.
  const outOfView = after.balloons.length - aliveCount(after.balloons);
  if (after.zonesEnabled !== after.zonesTotal - outOfView) {
    problems.push(
      `${kind}: zone census off — ${after.zonesEnabled} enabled of ${after.zonesTotal} with ${outOfView} popped`
    );
  }

  // A replacement floats back in, at the bottom edge (the derived entry knot y,
  // below the screen) rather than where it popped.
  const index = popped.length > 0 ? popped[0].index : target.index;
  const back = await pollParty(page, (s) => s.balloons[index].alive, 3000);
  record.respawnedY = Math.round(back.balloons[index].y);
  record.respawnedAlive = back.balloons[index].alive;
  if (!back.balloons[index].alive) {
    problems.push(`${kind}: popped balloon ${index} never floated back in`);
  } else if (back.balloons[index].y <= DESIGN_H) {
    problems.push(
      `${kind}: replacement balloon re-entered at y=${record.respawnedY} (want below the bottom edge)`
    );
  }

  out.push(record);
  // Let every popped balloon settle back in before the next press, so the next
  // census starts from a full flock.
  await pollParty(page, (s) => aliveCount(s.balloons) === s.balloonCount, 2500);
}

/**
 * A depth census of the scene's TOP-LEVEL visible Rectangles, plus the depth of
 * every Container that renders a Text.
 *
 * This is how the puff layer is identified WITHOUT importing a constant: the
 * only top-level Rectangles that toggle visibility are the pop-confetti pieces
 * (the ambient rain's 60 are always visible, the venue's are static, and every
 * other Rectangle in the scene — balloon strings, name-tag panels, the bouquet
 * grip, the button's face/shadow — lives inside a Container and is therefore off
 * the display list). So the ONE depth bucket that gains visible rectangles
 * across a press IS the puff layer, observed rather than assumed.
 */
const READ_LAYERS = () => {
  const scene = globalThis.__gabbyGame.scene.getScene('PartyScene');
  const rectDepths = {};
  const textContainers = [];
  for (const o of scene.children.list) {
    if (o.type === 'Rectangle' && o.visible) {
      rectDepths[o.depth] = (rectDepths[o.depth] || 0) + 1;
    }
    if (o.type === 'Container' && Array.isArray(o.list)) {
      const texts = o.list.filter((c) => c.type === 'Text').map((c) => c.text);
      if (texts.length > 0) textContainers.push({ depth: o.depth, texts });
    }
  }
  return { rectDepths, textContainers };
};
const readLayers = (page) => page.evaluate(READ_LAYERS);

/** The drawn box of each FRONT-ROW cast member (the six that are not crowd),
 * derived from the placeholder sprite geometry. */
function frontRowBoxes(sample) {
  return sample.cast
    .filter((m) => m.role !== 'crowd')
    .map((m) => ({
      id: m.id,
      depth: m.depth,
      left: m.x - (SPRITE_WIDTH_PX * m.scale) / 2,
      right: m.x + (SPRITE_WIDTH_PX * m.scale) / 2,
      top: m.groundY - SPRITE_HEIGHT_PX * m.scale,
      bottom: m.groundY,
    }));
}

/** A live balloon whose hit centre lands ON one of the six front-row figures —
 * i.e. a balloon the player CANNOT SEE, because ST-3 moved the flock behind the
 * cast. Pressing there must still produce a visible puff. */
function pickOccludedTarget(sample) {
  if (!sample.hasParty) return undefined;
  const boxes = frontRowBoxes(sample);
  for (const balloon of sample.balloons) {
    if (!balloon.alive) continue;
    const hitY = balloon.y - BALLOON_BODY_HEIGHT_PX / 2;
    const dx = balloon.x - sample.creditsPos.x;
    const dy = hitY - sample.creditsPos.y;
    if (Math.hypot(dx, dy) <= 260) continue; // the button would take the press
    const box = boxes.find(
      (b) => balloon.x >= b.left && balloon.x <= b.right && hitY >= b.top && hitY <= b.bottom
    );
    if (box) return { balloon, box, hitY };
  }
  return undefined;
}

/**
 * THE REGRESSION GUARD FOR ST-3's DEPTH REVERSAL. Balloons now drift BEHIND the
 * cast, so a press landing on one of the six front-row figures pops a balloon
 * the player cannot see — over roughly 7% of the screen, exactly where the eye
 * goes. The pop PUFF is therefore the only guaranteed feedback for that press,
 * and it must draw ABOVE the cast and its name tags. (It did not, at first: the
 * puffs went down the ladder with the balloons, and the press produced nothing
 * at all on screen.)
 *
 * Asserts the LAYER, observed from the display list — the puff layer is the one
 * depth bucket that gains visible rectangles across the press — rather than a
 * constant, and reports whether the balloon that actually popped was itself
 * behind a figure.
 */
async function popBehindCastMember(page, problems) {
  // Let the PREVIOUS pops' puffs expire first. popConfettiLifetimeMaxMs is 1.0s
  // and the earlier checks only wait for balloons to respawn (~0.4s), so without
  // this the "before" census still holds pieces in flight and the delta below
  // undercounts this pop's burst (measured: 13 of 14).
  await page.waitForTimeout(1200);

  const sample = await pollParty(page, (s) => pickOccludedTarget(s) !== undefined, 20_000);
  const found = pickOccludedTarget(sample);
  if (!found) {
    problems.push('occluded pop: no balloon ever drifted behind a front-row cast member');
    return null;
  }

  const boxes = frontRowBoxes(sample);
  const maxCastDepth = Math.max(...boxes.map((b) => b.depth));
  const tagDepths = sample.hasParty
    ? (await readLayers(page)).textContainers
        .filter((c) => c.texts.some((t) => ORACLE_NAMES.includes(t)))
        .map((c) => c.depth)
    : [];
  const maxTagDepth = tagDepths.length > 0 ? Math.max(...tagDepths) : null;

  const before = await readLayers(page);
  const popsBefore = sumPops(sample.balloons);
  await clickDesign(page, found.balloon.x, found.hitY);
  // Read the layers FIRST: a puff piece lives only 0.5-1.0s.
  const after = await readLayers(page);
  // ...then capture it while it is still on screen. Asserting "the puff's depth
  // is above the cast" does not prove the puff LOOKS right over them, and the
  // reason the balloons went behind the cast in the first place was occlusion —
  // so the fix has to be eyeballed too. The clip covers the pressed figure AND
  // the name tag above them.
  const popBox = await canvasBox(page);
  await page.screenshot({ path: join(OUT_DIR, 'party-pop-over-cast.png') });
  await page.screenshot({
    path: join(OUT_DIR, 'party-pop-over-cast-closeup.png'),
    clip: {
      x: vx(popBox, Math.max(0, found.balloon.x - 190)),
      y: vy(popBox, 350),
      width: (380 / DESIGN_W) * popBox.width,
      height: (270 / DESIGN_H) * popBox.height,
    },
  });
  const popped = await pollParty(page, (s) => sumPops(s.balloons) > popsBefore, 2000);

  const gained = Object.keys(after.rectDepths)
    .map(Number)
    .filter((depth) => (after.rectDepths[depth] ?? 0) > (before.rectDepths[depth] ?? 0));
  const puffDepth = gained.length === 1 ? gained[0] : null;
  const puffPieces =
    puffDepth === null ? 0 : after.rectDepths[puffDepth] - (before.rectDepths[puffDepth] ?? 0);

  const poppedBalloon = popped.balloons.find(
    (b) => b.pops > (sample.balloons[b.index]?.pops ?? 0)
  );
  const poppedWasHidden =
    poppedBalloon !== undefined &&
    frontRowBoxes(popped).some(
      (b) =>
        poppedBalloon.x >= b.left &&
        poppedBalloon.x <= b.right &&
        poppedBalloon.y - BALLOON_BODY_HEIGHT_PX / 2 >= b.top &&
        poppedBalloon.y - BALLOON_BODY_HEIGHT_PX / 2 <= b.bottom
    );

  const record = {
    pressedOn: found.box.id,
    pressedAt: { x: Math.round(found.balloon.x), y: Math.round(found.hitY) },
    occludingDepth: found.box.depth,
    maxCastDepth,
    maxNameTagDepth: maxTagDepth,
    puffDepth,
    puffPieces,
    poppedIndex: poppedBalloon?.index ?? null,
    poppedWasHiddenBehindCast: poppedWasHidden,
  };

  if (poppedBalloon === undefined) {
    problems.push('occluded pop: pressing on a cast member popped nothing');
  }
  if (puffDepth === null) {
    problems.push(
      `occluded pop: could not identify one puff layer (${gained.length} depth buckets grew)`
    );
  } else {
    if (puffPieces <= 0) problems.push('occluded pop: no puff pieces became visible');
    // The layer was EMPTY beforehand (see the settle above), so every piece
    // counted is this pop's — the delta IS the burst, not a partial view of it.
    if ((before.rectDepths[puffDepth] ?? 0) !== 0) {
      problems.push(
        `occluded pop: puff layer already held ${before.rectDepths[puffDepth]} pieces before the press`
      );
    }
    if (puffDepth <= maxCastDepth) {
      problems.push(
        `occluded pop: puff draws at depth ${puffDepth}, BEHIND the cast (${maxCastDepth}) — an invisible pop`
      );
    }
    if (maxTagDepth !== null && puffDepth <= maxTagDepth) {
      problems.push(
        `occluded pop: puff draws at depth ${puffDepth}, behind the name tags (${maxTagDepth})`
      );
    }
  }

  await pollParty(page, (s) => aliveCount(s.balloons) === s.balloonCount, 2500);
  return record;
}

/** A live balloon whose hit centre is comfortably inside the screen and far from
 * the "Credits ->" button's corner. */
function pickTarget(sample) {
  if (!sample.hasParty) return undefined;
  return sample.balloons.find((b) => {
    if (!b.alive) return false;
    const hitY = b.y - BALLOON_BODY_HEIGHT_PX / 2;
    if (hitY < 220 || hitY > DESIGN_H - 140) return false;
    if (b.x < 140 || b.x > DESIGN_W - 140) return false;
    const dx = b.x - sample.creditsPos.x;
    const dy = hitY - sample.creditsPos.y;
    return Math.hypot(dx, dy) > 260;
  });
}

/** One "Credits ->" routing assertion by a real click OR tap. */
async function checkCreditsRoute(page, kind, problems) {
  await enterParty(page);
  const shown = await pollParty(page, (s) => s.creditsShown, 8000);
  if (!shown.creditsShown) {
    problems.push(`credits via ${kind}: button never appeared`);
    return;
  }
  const fire = kind === 'tap' ? tapDesign : clickDesign;
  await fire(page, shown.creditsPos.x, shown.creditsPos.y);
  try {
    await waitForScene(page, 'CreditsScene', 6000);
  } catch {
    problems.push(`credits via ${kind}: CreditsScene never activated`);
  }
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({
    viewport: { width: DESIGN_W, height: DESIGN_H },
    hasTouch: true,
  });
  const page = await context.newPage();

  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => pageErrors.push(String(err)));

  const problems = [];
  let report;
  try {
    await page.goto(DEV_URL, { waitUntil: 'domcontentloaded' });
    await waitForScene(page, 'TitleScene');

    // ---------------------------------------------------------------- setup
    const TULIPS = 7;
    await setCharacter(page, null); // the default Gabby
    await setTulips(page, TULIPS);
    await enterParty(page);

    const base = await readParty(page);
    if (!base.hasParty) throw new Error('__party snapshot missing — is the dev server in DEV mode?');
    const texts = await renderedTexts(page);

    // (1) BANNER + the four NAMED guests, in the data AND on screen.
    if (base.bannerText !== ORACLE_BANNER)
      problems.push(`banner mismatch: ${JSON.stringify(base.bannerText)}`);
    if (!texts.includes(ORACLE_BANNER)) problems.push('banner never rendered as a Text object');

    const tagged = base.cast.filter((m) => m.nameTag !== null);
    const tags = tagged.map((m) => m.nameTag).sort();
    if (JSON.stringify(tags) !== JSON.stringify([...ORACLE_NAMES].sort()))
      problems.push(`name tags ${JSON.stringify(tags)} != the four named guests`);
    for (const name of ORACLE_NAMES) {
      if (!texts.includes(name)) problems.push(`name tag "${name}" never rendered`);
    }

    // (3) CROWD: 8..15 unnamed partygoers, no tags.
    const crowd = base.cast.filter((m) => m.role === 'crowd');
    if (crowd.length < 8 || crowd.length > 15)
      problems.push(`crowd of ${crowd.length} is outside NORTH_STAR §5's 8..15`);
    if (crowd.some((m) => m.nameTag !== null)) problems.push('a crowd member carries a name tag');
    if (!base.cast.some((m) => m.role === 'gabby')) problems.push('Gabby is missing from the cast');
    if (!base.cast.some((m) => m.role === 'caleb')) problems.push('Caleb is missing from the cast');

    // (2) TWIN JOKE, default character.
    const dallasBefore = base.cast.find((m) => m.id === ORACLE_DALLAS);
    const gabbyBefore = base.cast.find((m) => m.role === 'gabby');
    if (!dallasBefore || !gabbyBefore) {
      problems.push('Dallas and/or Gabby missing from the cast');
    } else {
      if (dallasBefore.textureKey !== gabbyBefore.textureKey)
        problems.push(
          `twin joke broken: Dallas ${dallasBefore.textureKey} != Gabby ${gabbyBefore.textureKey}`
        );
      if (gabbyBefore.textureKey !== base.riderTextureKey)
        problems.push("Gabby's texture is not the one-source-of-truth rider key");
      const sharers = base.cast.filter((m) => m.textureKey === base.riderTextureKey).map((m) => m.id);
      if (JSON.stringify(sharers.sort()) !== JSON.stringify([ORACLE_DALLAS, 'gabby'].sort()))
        problems.push(`the rider texture is shared by ${JSON.stringify(sharers)} (want Gabby+Dallas)`);
    }

    // (5a) BOUQUET PAYOFF, tulips > 0.
    if (base.tulips !== TULIPS) problems.push(`tulips read ${base.tulips} != ${TULIPS}`);
    if (base.toastText !== oracleToast(TULIPS))
      problems.push(`toast mismatch: ${JSON.stringify(base.toastText)}`);
    if (!texts.includes(oracleToast(TULIPS))) problems.push('bouquet toast never rendered');
    if (!base.bouquetShown) problems.push('bouquet is not shown despite tulips > 0');

    // (4a) BALLOONS present.
    if (base.balloonCount < 20)
      problems.push(`only ${base.balloonCount} balloons (PLAN-09 wants >= 20)`);
    if (aliveCount(base.balloons) !== base.balloonCount)
      problems.push(`${aliveCount(base.balloons)}/${base.balloonCount} balloons visible on entry`);
    if (base.zonesTotal !== base.balloonCount)
      problems.push(`${base.zonesTotal} hit Zones for ${base.balloonCount} balloons`);

    // (9) ZERO Matter bodies.
    if (base.matterBodies > 0)
      problems.push(`PartyScene holds ${base.matterBodies} Matter bodies (want 0)`);

    await page.screenshot({ path: join(OUT_DIR, 'party-with-bouquet.png') });
    // ...and a close-up on Gabby, because "bouquetShown === true" is not the
    // same as "you can SEE her holding it" at placeholder fidelity.
    const gabbyBox = await canvasBox(page);
    await page.screenshot({
      path: join(OUT_DIR, 'party-bouquet-closeup.png'),
      clip: {
        x: vx(gabbyBox, 440),
        y: vy(gabbyBox, 380),
        width: (360 / DESIGN_W) * gabbyBox.width,
        height: (280 / DESIGN_H) * gabbyBox.height,
      },
    });

    // (4b) POPPING by a real click and a real tap.
    const pops = [];
    await popOneBalloon(page, 'click', problems, pops);
    await popOneBalloon(page, 'tap', problems, pops);
    await page.screenshot({ path: join(OUT_DIR, 'party-after-pops.png') });

    // (4c) A press ON A CAST MEMBER pops the balloon hidden behind them — and
    // the puff must still be visible, or that press produces nothing at all.
    const occluded = await popBehindCastMember(page, problems);

    // (6) CREDITS BUTTON: absent on entry, fades in, then routes.
    const enteredAt = await enterParty(page);
    const early = await readParty(page);
    const earlyAgeMs = Date.now() - enteredAt;
    if (early.creditsShown)
      problems.push(`Credits button already present ${earlyAgeMs}ms after entry`);

    const appeared = await pollParty(page, (s) => s.creditsShown, 8000);
    const appearedAtMs = Date.now() - enteredAt;
    if (!appeared.creditsShown) problems.push('Credits button never appeared');
    const faded = await pollParty(page, (s) => s.creditsAlpha >= 1, 3000);
    if (!(faded.creditsAlpha >= 1)) problems.push(`Credits button faded only to ${faded.creditsAlpha}`);
    await page.screenshot({ path: join(OUT_DIR, 'party-credits-button.png') });

    // (8) 60FPS with the whole scene live, and (7) NO FORCED EXIT.
    await page.waitForTimeout(FPS_WARMUP_MS);
    const fpsSamples = [];
    const fpsStart = Date.now();
    while (Date.now() - fpsStart < FPS_SAMPLE_MS) {
      const s = await readParty(page);
      if (s.hasParty) fpsSamples.push(s.fps);
      await page.waitForTimeout(250);
    }
    const avgFps =
      fpsSamples.length > 0
        ? Math.round((fpsSamples.reduce((a, b) => a + b, 0) / fpsSamples.length) * 10) / 10
        : null;
    const minFps = fpsSamples.length > 0 ? Math.round(Math.min(...fpsSamples) * 10) / 10 : null;
    if (avgFps === null || avgFps < MIN_AVG_FPS)
      problems.push(`average fps ${avgFps} < ${MIN_AVG_FPS}`);

    const stillThere = await readParty(page);
    const aliveForMs = Date.now() - enteredAt;
    if (!stillThere.active) problems.push(`party stopped on its own after ${aliveForMs}ms`);
    if (stillThere.creditsActive) problems.push('party auto-advanced to the credits');

    // (6) ROUTING by click AND tap.
    for (const kind of ['click', 'tap']) {
      await checkCreditsRoute(page, kind, problems);
    }

    // (5b) BOUQUET PAYOFF, tulips === 0: no bouquet, no toast at all.
    await setTulips(page, 0);
    await enterParty(page);
    const zero = await readParty(page);
    const zeroTexts = await renderedTexts(page);
    if (zero.toastText !== null)
      problems.push(`toast shown at 0 tulips: ${JSON.stringify(zero.toastText)}`);
    if (zero.bouquetShown) problems.push('bouquet shown at 0 tulips');
    if (zeroTexts.some((t) => t.includes('tulips')))
      problems.push(`a tulip toast rendered at 0 tulips: ${JSON.stringify(zeroTexts)}`);
    await page.screenshot({ path: join(OUT_DIR, 'party-no-bouquet.png') });

    // (2) TWIN JOKE after a CHARACTER CHANGE — the literal acceptance criterion.
    await setTulips(page, TULIPS);
    await setCharacter(page, CHANGED_CHARACTER);
    await enterParty(page);
    const changed = await readParty(page);
    const dallasAfter = changed.cast.find((m) => m.id === ORACLE_DALLAS);
    const gabbyAfter = changed.cast.find((m) => m.role === 'gabby');
    const twin = {
      before: { gabby: gabbyBefore?.textureKey, dallas: dallasBefore?.textureKey },
      after: { gabby: gabbyAfter?.textureKey, dallas: dallasAfter?.textureKey },
    };
    if (!dallasAfter || !gabbyAfter) {
      problems.push('Dallas and/or Gabby missing after the character change');
    } else {
      if (dallasAfter.textureKey !== gabbyAfter.textureKey)
        problems.push(
          `twin joke broken after change: Dallas ${dallasAfter.textureKey} != Gabby ${gabbyAfter.textureKey}`
        );
      if (gabbyAfter.textureKey === gabbyBefore?.textureKey)
        problems.push("Gabby's texture did not change when the saved character did");
      if (dallasAfter.textureKey === dallasBefore?.textureKey)
        problems.push("Dallas's texture did not change when the saved character did");
    }
    await page.screenshot({ path: join(OUT_DIR, 'party-character-changed.png') });

    report = {
      banner: base.bannerText,
      nameTags: tags,
      crowd: crowd.length,
      castSize: base.cast.length,
      toast: base.toastText,
      bouquetShown: base.bouquetShown,
      zeroTulips: { toast: zero.toastText, bouquetShown: zero.bouquetShown },
      twin,
      balloons: {
        count: base.balloonCount,
        visibleOnEntry: aliveCount(base.balloons),
        zones: base.zonesTotal,
        pops,
        occludedPop: occluded,
      },
      credits: {
        shownAtEntry: early.creditsShown,
        checkedAtMs: earlyAgeMs,
        appearedAtMs,
        finalAlpha: faded.creditsAlpha,
        pos: appeared.creditsPos,
      },
      stillAliveAfterMs: aliveForMs,
      matterBodies: base.matterBodies,
      avgFps,
      minFps,
      consoleErrors,
      pageErrors,
    };
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await browser.close();
  }

  if (consoleErrors.length > 0) problems.push(`${consoleErrors.length} console error(s)`);
  if (pageErrors.length > 0) problems.push(`${pageErrors.length} page error(s)`);

  if (problems.length > 0) {
    console.error('PARTY HARNESS FAILURES:\n  - ' + problems.join('\n  - '));
    process.exitCode = 1;
  } else {
    const popSummary = report.balloons.pops
      .map((p) => `${p.kind} popped ${p.poppedCount} (back in at y=${p.respawnedY})`)
      .join('; ');
    const occ = report.balloons.occludedPop;
    const occSummary = occ
      ? `a press ON "${occ.pressedOn}" popped the balloon hidden behind them and threw ${occ.puffPieces} puff pieces at depth ${occ.puffDepth}, over the cast (${occ.maxCastDepth}) and the name tags (${occ.maxNameTagDepth})`
      : 'occluded-pop check did not run';
    console.log(
      `PARTY OK: banner "${report.banner}"; name tags ${report.nameTags.join('/')} + ${report.crowd} unnamed partygoers (cast ${report.castSize}); Dallas===Gabby "${report.twin.before.dallas}" and BOTH became "${report.twin.after.dallas}" after a character change; ${report.balloons.count} balloons (${report.balloons.visibleOnEntry} visible, ${report.balloons.zones} hit zones), ${popSummary}; ${occSummary}; toast "${report.toast}" with bouquet, and neither at 0 tulips; Credits button absent at ${report.credits.checkedAtMs}ms, faded in by ${report.credits.appearedAtMs}ms to alpha ${report.credits.finalAlpha}, routes by click AND tap; party still alive after ${report.stillAliveAfterMs}ms with no auto-advance; ${report.matterBodies === -1 ? 'no' : report.matterBodies} Matter bodies; avg ${report.avgFps} fps (min ${report.minFps}); no errors.`
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
