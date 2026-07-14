// Self-hosted pixel font loading helper.
// See CLAUDE.md — no external CDN at runtime; the TTF ships in public/assets/fonts.
import { FONT_FAMILY_PIXEL } from './constants';

/**
 * Waits for the pixel font to become available via the CSS Font Loading API,
 * racing it against a timeout so a slow/failed load never blocks the game.
 *
 * This promise NEVER rejects: on timeout, missing `document.fonts` support,
 * or any loading error, it resolves anyway. The game must work even if the
 * font never loads — text falls back to the monospace stack in that case
 * (see FONT_STACK_PIXEL).
 */
export function loadPixelFont(timeoutMs = 3000): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) {
    return Promise.resolve();
  }

  // try/catch guards against SYNCHRONOUS throws from the font API (seen in
  // odd mobile WebViews); the .catch handles ordinary async rejection.
  let load: Promise<void>;
  try {
    load = document.fonts
      .load(`16px "${FONT_FAMILY_PIXEL}"`)
      .then(() => undefined)
      .catch(() => undefined);
  } catch {
    return Promise.resolve();
  }

  let timerId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((resolve) => {
    timerId = setTimeout(resolve, timeoutMs);
  });

  // Clear the race timer once either side settles so a won race doesn't
  // leave a live timer firing into an already-resolved promise.
  return Promise.race([load, timeout]).finally(() => {
    if (timerId !== undefined) {
      clearTimeout(timerId);
    }
  });
}
