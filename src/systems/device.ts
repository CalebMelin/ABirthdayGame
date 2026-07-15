// Shared device predicate (PLAN-03). Extracted from pedals.ts (task 2) so the
// touch pedals (task 2) AND the portrait orientation guard (task 3) share ONE
// definition of "is this a touch device we should show phone-only UI on" — two
// consumers now, so the check lives here instead of being copied.
//
// Node-safe to IMPORT (both consumers have Node-tested pure paths that
// transitively import this module): it only ever touches navigator/window when
// CALLED at runtime in the browser, never at module import — so pulling it into
// a plain-Node vitest env defines a function but runs no DOM code.

/**
 * True on a touch device the phone-only UI (touch pedals, portrait guard)
 * should activate on; false on pure desktop.
 *
 * The task's named signal is `navigator.maxTouchPoints > 0`. That is CORRECT
 * on phones/tablets but OVER-REPORTS on desktop Chrome on Windows: the OS
 * advertises touch capability (up to 10 contacts) even on a machine with NO
 * touchscreen, so maxTouchPoints alone is > 0 there and would wrongly show
 * phone-only UI on a mouse-only Windows desktop — breaking the equally
 * explicit requirement that desktop is never blocked (browser-verified:
 * headless Chrome on this Windows host reports maxTouchPoints = 10 on a plain
 * non-touch context; see DECISIONS.md 2026-07-15). We therefore AND it with
 * `(any-pointer: coarse)`, which is true iff SOME connected input is a
 * finger/coarse pointer — every phone, tablet, and touch 2-in-1 — and false on
 * a mouse-only desktop. A real phone passes BOTH, so phone-only UI is never
 * hidden where it's actually needed (the safe direction); a pure desktop fails
 * the media query, so it stays unblocked regardless of the Windows
 * maxTouchPoints quirk. Only ever called at runtime in the browser (never at
 * module import), so touching navigator/window here is safe for the Node-tested
 * pure helpers in the modules that import it.
 */
export function isTouchDevice(): boolean {
  return navigator.maxTouchPoints > 0 && window.matchMedia('(any-pointer: coarse)').matches;
}
