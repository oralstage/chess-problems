/**
 * Carrying a player across the move to the arcade.chessproblem.org address.
 *
 * A player's rating, history, bookmarks and review queue live in localStorage,
 * and localStorage belongs to one origin. chess-problems.pages.dev and
 * arcade.chessproblem.org are different origins, so a player who follows the
 * move arrives as a stranger: rating 800, nothing solved. The server still has
 * everything — solve_events and rating_events are keyed by session id — so the
 * fix is to hand that one id over and let the existing Sync restore do the rest.
 *
 * The id travels in the URL fragment, never the query string: a fragment is not
 * sent to the server, so it stays out of request logs on the way. It is stripped
 * from the address bar the moment it is read.
 *
 * This is the receiving half. The sending half belongs with the redirect from
 * the old address, which is not in place yet — a redirect served at the edge
 * never runs the old page's JavaScript, so whatever sends the code has to run
 * in the browser before the redirect takes over.
 */

export const ARCADE_ORIGIN = 'https://arcade.chessproblem.org';

const HANDOFF_PREFIX = '#sync=';

/** Every key that carries an account on this device. */
const ACCOUNT_KEYS = [
  'cp-progress',
  'cp-rated-ids',
  'cp-bookmarks',
  'cp-review-queue',
];

/**
 * The URL that hands this device's account to the new address. Used by the
 * sending side once the old address starts forwarding.
 */
export function buildHandoffUrl(sessionId: string): string {
  return `${ARCADE_ORIGIN}/${HANDOFF_PREFIX}${encodeURIComponent(sessionId)}`;
}

/**
 * Reads a handed-over session id out of the fragment and clears it from the
 * address bar, so a reload cannot replay it and the code is not left sitting in
 * a URL the player might copy or share. Returns null when there is nothing to
 * take.
 */
export function consumeHandoffCode(): string | null {
  let code: string;
  try {
    const hash = window.location.hash;
    if (!hash.startsWith(HANDOFF_PREFIX)) return null;
    code = decodeURIComponent(hash.slice(HANDOFF_PREFIX.length)).trim();
  } catch {
    return null;
  }
  if (!code) return null;

  try {
    window.history.replaceState(
      null,
      '',
      window.location.pathname + window.location.search,
    );
  } catch {
    // If the address bar cannot be rewritten, refuse the handoff rather than
    // let the next load apply it again.
    return null;
  }
  return code;
}

/**
 * Whether this device already holds an account worth protecting. A handoff
 * replaces everything wholesale, the same way the Sync modal does, so it is
 * only ever applied to a device that has nothing of its own — someone who has
 * already been playing at the new address keeps what they have.
 */
export function hasLocalAccountData(): boolean {
  try {
    for (const key of ACCOUNT_KEYS) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        if (parsed.length > 0) return true;
      } else if (parsed && typeof parsed === 'object') {
        if (Object.keys(parsed).some(k => {
          const inner = (parsed as Record<string, unknown>)[k];
          if (Array.isArray(inner)) return inner.length > 0;
          if (inner && typeof inner === 'object') return Object.keys(inner).length > 0;
          return inner != null;
        })) return true;
      }
    }
  } catch {
    // Unreadable storage is treated as occupied: better to skip the handoff
    // than to overwrite something we cannot see.
    return true;
  }
  return false;
}
