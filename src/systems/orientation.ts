// Portrait orientation guard (PLAN-03 task 3): on a touch phone held upright,
// a full-screen DOM overlay (OUTSIDE the Phaser canvas) shows a cute rotating-
// phone graphic + "Flip your phone sideways to ride! 🏍️", and the game
// auto-pauses beneath it. Rotating back to landscape hides it and resumes,
// instantly and seamlessly.
//
// IMPORTANT — like pedals.ts/bike.ts/terrain.ts, this file has NO RUNTIME
// import of 'phaser' (`import type` below is erased at compile time by
// verbatimModuleSyntax + erasableSyntaxOnly). That keeps the pure `shouldBlock`
// predicate importable in the plain-Node vitest env (tests/orientation.test.ts)
// without dragging Phaser/DOM into Node. The consequence: we can't reference
// Phaser's runtime enums (e.g. Phaser.Core.Events.POST_STEP) — we use their
// stable string values with a comment, exactly like pedals.ts sidesteps
// Phaser.Geom. Everything that touches the DOM / the `game` runs INSIDE
// installOrientationGuard (never at module import), so importing this module in
// Node is side-effect-free.
import type Phaser from 'phaser';
import { PALETTE, PASTEL_BG_COLOR, TEXT_COLOR, FONT_STACK_PIXEL, hexToCss } from './constants';
import { isTouchDevice } from './device';
// getAudio is import-safe (audio.ts imports only the equally import-safe
// ./save) — so this stays a Node no-op and orientation.ts keeps its
// runtime-Phaser-free / side-effect-free-at-import contract.
import { getAudio } from './audio';

// ---------------------------------------------------------------------------
// Pure core — no Phaser, no DOM. Unit-tested in tests/orientation.test.ts.
// ---------------------------------------------------------------------------

/**
 * Should the rotate-phone overlay block the game right now?
 *
 * TRUE only when the device is BOTH portrait AND a touch device. The touch
 * requirement is load-bearing: desktop/dev must NEVER be blocked just because
 * its window happens to be portrait-shaped (see isTouchDevice / the task's
 * "desktop is never blocked" rule). Pure so the truth table is trivially
 * testable without a browser.
 */
export function shouldBlock(isPortrait: boolean, isTouch: boolean): boolean {
  return isPortrait && isTouch;
}

// ---------------------------------------------------------------------------
// DOM + Phaser wiring (browser-only; never imports Phaser at runtime).
// ---------------------------------------------------------------------------

/** The exact overlay copy. VERBATIM personal content — never paraphrase,
 * retone, or drop the motorcycle emoji (CLAUDE.md Rule 4 / NORTH_STAR). */
const OVERLAY_TEXT = 'Flip your phone sideways to ride! 🏍️';

/** DOM ids/classes for the overlay (not gameplay tunables, so local here, not
 * in constants.ts). The playtest (scripts/playtest-orientation.mjs) reads
 * these — keep them in sync if renamed. */
const OVERLAY_ID = 'gabby-orientation-guard';
const STYLE_ID = 'gabby-orientation-style';
const MSG_CLASS = 'gabby-orientation-msg';
const PHONE_CLASS = 'gabby-orientation-phone';

/** Overlay stacking value. Max 32-bit z-index: this is a critical, fully-
 * opaque BLOCKING overlay that must sit above the #app canvas (z-index auto)
 * and any future DOM chrome, so "always on top" is intentional. */
const OVERLAY_Z_INDEX = 2147483647;

/** Cute pixel-art phone icon for the overlay (PLAN-10 ST-4b — replaces the old
 * placeholder 📱 emoji). Inline SVG rather than a raster so it stays crisp at
 * any size and needs no committed PNG; `shape-rendering="crispEdges"` keeps the
 * whole thing hard-edged (pixel-art, no anti-aliasing), and the colors are the
 * shared game PALETTE so the phone matches the canvas + chrome. A plum handset
 * with a sky screen showing a little coral heart (a birthday-gift wink); the
 * existing CSS wobble rotates the whole SVG 0->90->0 to say "turn me sideways".
 * The 22x34 viewBox is the design grid; every rect lands on an integer cell. */
const PHONE_SVG = (() => {
  const plum = hexToCss(PALETTE.plum);
  const sky = hexToCss(PALETTE.sky);
  const cream = hexToCss(PALETTE.cream);
  const coral = hexToCss(PALETTE.coral);
  // A little pixel heart on the screen, drawn as horizontal runs [x, y, w].
  const heart: readonly [number, number, number][] = [
    [9, 13, 2],
    [12, 13, 2],
    [8, 14, 7],
    [8, 15, 7],
    [9, 16, 5],
    [10, 17, 3],
    [11, 18, 1],
  ];
  const heartRects = heart
    .map(([x, y, w]) => `<rect x="${x}" y="${y}" width="${w}" height="1" fill="${coral}"/>`)
    .join('');
  return (
    `<svg viewBox="0 0 22 34" shape-rendering="crispEdges" aria-hidden="true" focusable="false">` +
    `<rect x="3" y="1" width="16" height="32" rx="3" fill="${plum}"/>` + // handset frame
    `<rect x="5" y="5" width="12" height="22" fill="${sky}"/>` + // screen
    `<rect x="9" y="3" width="4" height="1" fill="${cream}"/>` + // earpiece slit
    `<rect x="8" y="30" width="6" height="1" fill="${cream}"/>` + // home bar
    heartRects +
    `</svg>`
  );
})();

/** Phaser's Phaser.Core.Events.POST_STEP string. We can't import the enum
 * (runtime-Phaser-free module, see file header); this value is stable. Used to
 * defer the FIRST loop sync until the loop is actually RUNNING — see below. */
const POST_STEP_EVENT = 'poststep';

/** Injects the overlay's stylesheet once (structural CSS + the phone-wobble
 * @keyframes, which can't live inline). Colors/font come from the shared game
 * constants so the overlay matches the canvas + index.html chrome exactly. */
function injectStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  // NOTE: height is declared twice on purpose — `100dvh` (dynamic viewport
  // height) fixes iOS Safari's 100vh overflow (100vh there is TALLER than the
  // visible area, pushing content under the URL bar); browsers that don't
  // understand `dvh` silently discard that line and keep the `100vh` fallback.
  style.textContent = `
#${OVERLAY_ID} {
  position: fixed;
  inset: 0;
  height: 100vh;
  height: 100dvh;
  z-index: ${OVERLAY_Z_INDEX};
  margin: 0;
  padding: 24px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 28px;
  background: ${hexToCss(PASTEL_BG_COLOR)};
  color: ${TEXT_COLOR};
  font-family: ${FONT_STACK_PIXEL};
  text-align: center;
  -webkit-user-select: none;
  user-select: none;
}
#${OVERLAY_ID}[hidden] { display: none; }
#${OVERLAY_ID} .${PHONE_CLASS} {
  display: inline-block;
  line-height: 0;
  animation: gabby-phone-wobble 2.4s ease-in-out infinite;
}
#${OVERLAY_ID} .${PHONE_CLASS} svg {
  display: block;
  width: auto;
  height: 128px;
}
#${OVERLAY_ID} .${MSG_CLASS} {
  font-size: clamp(12px, 3.6vw, 20px);
  line-height: 1.7;
  max-width: 22ch;
}
/* Compositor-driven, so it keeps animating while game.loop is asleep. */
@keyframes gabby-phone-wobble {
  0%, 15% { transform: rotate(0deg); }
  55%, 70% { transform: rotate(90deg); }
  100% { transform: rotate(0deg); }
}
`;
  document.head.appendChild(style);
}

/** Builds the overlay element (permanent in the DOM; visibility is toggled via
 * the `hidden` attribute so show/hide is INSTANT). The phone is the inline
 * pixel-art PHONE_SVG (PLAN-10 ST-4b, replacing the old 📱 placeholder), with a
 * gentle CSS wobble that rotates it sideways to suggest "turn me". */
function createOverlay(): HTMLDivElement {
  injectStyle();
  const overlay = document.createElement('div');
  overlay.id = OVERLAY_ID;
  overlay.hidden = true; // start hidden; the initial evaluate() reveals it if portrait

  const phone = document.createElement('div');
  phone.className = PHONE_CLASS;
  phone.innerHTML = PHONE_SVG;
  // The phone graphic is decorative; the message carries the meaning for
  // screen readers (the SVG is aria-hidden too, belt-and-suspenders).
  phone.setAttribute('aria-hidden', 'true');

  const msg = document.createElement('div');
  msg.className = MSG_CLASS;
  msg.textContent = OVERLAY_TEXT;

  overlay.appendChild(phone);
  overlay.appendChild(msg);
  document.body.appendChild(overlay);
  return overlay;
}

/** Best-effort landscape lock (Android Chrome in fullscreen supports it; iOS
 * Safari + desktop do NOT — `lock` is either absent or returns a Promise that
 * REJECTS). Feature-detect, swallow any rejection so it never surfaces as an
 * unhandled rejection, and try/catch as a final backstop. Silent best-effort
 * is the whole requirement — a failure must never surface. */
function tryLockLandscape(): void {
  try {
    // Cast via unknown (no `any`): `lock` isn't in every TS DOM lib version,
    // and screen.orientation itself can be undefined on old browsers.
    const orientation = screen.orientation as unknown as
      | { lock?: (orientation: string) => Promise<unknown> }
      | undefined;
    // Optional chaining short-circuits the whole chain (incl. `.catch`) when
    // orientation or lock is missing, so this is safe when unsupported.
    void orientation?.lock?.('landscape').catch(() => {});
  } catch {
    /* screen.orientation unavailable — ignore, per silent best-effort */
  }
}

/**
 * Installs the portrait guard for the page's lifetime. Call ONCE from main.ts
 * right after `new Phaser.Game(config)`. No teardown (the game + overlay live
 * as long as the page does).
 *
 * On a NON-touch device it installs nothing and returns immediately — desktop
 * is never blocked, so dev/desktop play is never interrupted by a narrow
 * window (see isTouchDevice / shouldBlock).
 *
 * Pause mechanism: `game.loop.sleep()` freezes the RAF loop — Matter world,
 * bike, every scene's update/render stop with one call — WITHOUT touching any
 * per-scene paused/active state, so it composes with the (later) pause menu:
 * rotate away while paused and you return still paused. `wake()` resumes.
 */
export function installOrientationGuard(game: Phaser.Game): void {
  const isTouch = isTouchDevice();
  if (!isTouch) return; // desktop is never blocked

  tryLockLandscape();

  const overlay = createOverlay();
  const portraitMql = window.matchMedia('(orientation: portrait)');

  // Last-applied blocked state (drives the overlay + the loop). Evaluate once
  // immediately: the page may LOAD already in portrait.
  let blocked = shouldBlock(portraitMql.matches, isTouch);
  overlay.hidden = !blocked;

  // The loop sync must wait until the RAF loop is actually RUNNING. At install
  // time (right after `new Phaser.Game`) the loop hasn't started — running is
  // false — so a sleep() now would be a no-op and the loop would start anyway
  // (wrong for a load-in-portrait). Even the game's READY event fires BEFORE
  // loop.start(), so we defer the first sync to the first POST_STEP, when the
  // loop is guaranteed live. Calling sleep() mid-step is safe: Phaser's
  // RequestAnimationFrame re-checks `isRunning` AFTER the callback, so it
  // cleanly stops after the current frame.
  let booted = false;

  const applyLoop = (): void => {
    if (!booted) return; // deferred: the POST_STEP handler will apply once live
    // Idempotent: sleep() no-ops if already asleep, wake() if already awake —
    // so re-firing on every resize event during a rotation is harmless.
    if (blocked) {
      game.loop.sleep();
      // ST-8 #9 (folds in the ST-7 orientation-hum finding): sleeping the RAF
      // loop freezes GameScene.update(), so the continuous engine hum / siren
      // would otherwise DRONE at their last gain the whole time the phone is
      // portrait. Duck the shared continuous bus to silence them (same call the
      // pause menu uses). Guarded no-op when audio is unavailable / not started.
      getAudio().pauseContinuous();
    } else {
      game.loop.wake();
      // Un-duck on rotate-back-to-landscape: update() resumes retuning the
      // engine from the next frame. Idempotent + guarded.
      getAudio().resumeContinuous();
    }
  };

  const evaluate = (): void => {
    const next = shouldBlock(portraitMql.matches, isTouch);
    if (next !== blocked) {
      blocked = next;
      overlay.hidden = !blocked; // instant show/hide
    }
    applyLoop();
  };

  // Primary signal: the orientation media query. Backups: window resize +
  // orientationchange — some mobile browsers are flaky on the MQL `change`
  // event, and each backup re-reads the live `portraitMql.matches`, so at
  // least one always catches a rotation (and under Playwright, setViewportSize
  // fires `resize`).
  portraitMql.addEventListener('change', evaluate);
  window.addEventListener('resize', evaluate);
  window.addEventListener('orientationchange', evaluate);

  // First loop sync, once the loop is live (see the `booted` note above).
  game.events.once(POST_STEP_EVENT, () => {
    booted = true;
    applyLoop();
  });
}
