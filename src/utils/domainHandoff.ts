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
 * It is a round trip, and the new address starts it: go to the old address
 * asking for the account, and be sent straight back carrying it. Only the old
 * address can read its own storage, so the trip is the only way — an invisible
 * iframe would be quieter but Safari blocks a third-party origin's storage
 * outright, which is most of the phones.
 *
 * The id travels in the URL fragment, never the query string: a fragment is not
 * sent to the server, so it stays out of request logs on the way. It is
 * stripped from the address bar the moment it is read. The route travels in the
 * query string, where it is harmless — it is a problem id, not a credential —
 * because the fragment is already spoken for.
 *
 * The trip runs by itself, once, on a device that has nothing of its own. That
 * catches the players who would never read a banner, at the cost of sending
 * every genuinely new visitor through the old address once. It is a device for
 * the move and it has a shelf life: see AUTO_HANDOFF_UNTIL.
 */

export const ARCADE_HOST = 'arcade.chessproblem.org';
export const ARCADE_ORIGIN = `https://${ARCADE_HOST}`;
export const OLD_HOST = 'chess-problems.pages.dev';

/**
 * The last day the automatic trip runs, as a local calendar date. After this it
 * goes quiet on its own and only the banner is left; **take the whole thing out
 * of the code once the date has passed** — a crawler renders JavaScript and
 * arrives with a clean profile every time, so while this is live the new
 * address's home page can look to it like a redirect back to the old one, which
 * is the opposite of what the move is for.
 *
 * A longer window buys less than it looks. One visit anywhere inside it is
 * enough — the trip runs, the account is restored, and this device never needs
 * it again — and Safari deletes script-written storage after seven days without
 * a visit, so someone who stays away for months has nothing left at the old
 * address to fetch. The window is sized for the people who come back at all.
 */
export const AUTO_HANDOFF_UNTIL = '2026-12-31';

/** Set before leaving, never after: a trip that fails must not be retried. */
const TRIED_KEY = 'cp-handoff-tried';
/** Set on arrival back. Separate from TRIED_KEY, which is set on the way out
 *  and so cannot tell a trip that found nothing from one that never returned —
 *  and those two want opposite things from the notice. */
const RETURNED_KEY = 'cp-handoff-returned';

const HANDOFF_PREFIX = '#sync=';
/* What the new address sends to the old one to ask for the account. It is a
   request, not a redirect: the old address hands nothing over without it.
   It rides in the query string, not the fragment, because the old address now
   answers `/` with a 301 — and a fragment never reaches a server, so a marker
   hidden there could not be exempted from the redirect. The marker is not a
   secret; the session id still travels only in the fragment, on the way back. */
const REQUEST_PARAM = 'handoff';
/* Where to land once the trip is done, so a link to one problem still opens
   that problem. The app routes on the fragment, which the id is using. */
const ROUTE_PARAM = 'r';

/** Every key that carries an account on this device. */
const ACCOUNT_KEYS = [
  'cp-progress',
  'cp-rated-ids',
  'cp-bookmarks',
  'cp-review-queue',
];

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

function localToday(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Whether the trip has already been made (or refused) on this device. */
export function handoffAlreadyTried(): boolean {
  try {
    return localStorage.getItem(TRIED_KEY) === '1';
  } catch {
    return true;
  }
}

export function markHandoffTried(): void {
  try { localStorage.setItem(TRIED_KEY, '1'); } catch { /* ignore */ }
}

export function markHandoffReturned(): void {
  try { localStorage.setItem(RETURNED_KEY, '1'); } catch { /* ignore */ }
}

/**
 * Whether the old address has already been asked and answered on this device.
 * True means there was nothing to fetch — the account either came back and is
 * here, or never existed — and the notice about the move has nobody to talk to.
 */
export function handoffAnswered(): boolean {
  try {
    return localStorage.getItem(RETURNED_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Whether to start the trip by ourselves on this load: at the new address,
 * inside the window, not tried before, and nothing here to lose. The return leg
 * carries `#sync=`, which is handled before this is ever asked.
 */
export function shouldAutoHandoff(): boolean {
  try {
    if (window.location.hostname !== ARCADE_HOST) return false;
    if (localToday() > AUTO_HANDOFF_UNTIL) return false;
    if (handoffAlreadyTried()) return false;
    return !hasLocalAccountData();
  } catch {
    return false;
  }
}

/** Where the trip goes: the old address, asking for the account. */
export function buildRequestUrl(route?: string): string {
  let hash = route;
  if (hash === undefined) {
    try { hash = window.location.hash; } catch { hash = ''; }
  }
  const back = hash && hash !== '#'
    ? `&${ROUTE_PARAM}=${encodeURIComponent(hash)}`
    : '';
  return `https://${OLD_HOST}/?${REQUEST_PARAM}=1${back}`;
}

/**
 * On the old address, whether this load is a player asking for their account
 * back. Exact host match, never a suffix: chess-problems-staging.pages.dev runs
 * the same code and must not send anyone anywhere.
 */
export function isHandoffRequest(): boolean {
  try {
    return window.location.hostname === OLD_HOST
      && new URLSearchParams(window.location.search).has(REQUEST_PARAM);
  } catch {
    return false;
  }
}

/** The route the trip started from, read on either leg. */
function readRoute(): string {
  try {
    const raw = new URLSearchParams(window.location.search).get(ROUTE_PARAM);
    if (!raw) return '';
    const route = decodeURIComponent(raw);
    // Only ever our own fragment route. Anything else is discarded rather than
    // followed — this value came in over the wire.
    return route.startsWith('#/') ? route : '';
  } catch {
    return '';
  }
}

/** The URL that hands this device's account back to the new address. */
export function buildHandoffUrl(sessionId: string, route = readRoute()): string {
  const query = route ? `?${ROUTE_PARAM}=${encodeURIComponent(route)}` : '';
  return `${ARCADE_ORIGIN}/${query}${HANDOFF_PREFIX}${encodeURIComponent(sessionId)}`;
}

export interface Handoff {
  code: string;
  /** Where the player was headed before the trip, '' for the home page. */
  route: string;
}

/**
 * Reads a handed-over session id out of the fragment and clears the whole trip
 * out of the address bar — the id so a reload cannot replay it and so the code
 * is not left in a URL the player might copy, the route because it has served
 * its purpose and becomes the address instead. Returns null when there is
 * nothing to take.
 */
export function consumeHandoff(): Handoff | null {
  let code: string;
  let route: string;
  try {
    const hash = window.location.hash;
    if (!hash.startsWith(HANDOFF_PREFIX)) return null;
    code = decodeURIComponent(hash.slice(HANDOFF_PREFIX.length)).trim();
    route = readRoute();
  } catch {
    return null;
  }
  if (!code) return null;

  try {
    window.history.replaceState(null, '', window.location.pathname + route);
  } catch {
    // If the address bar cannot be rewritten, refuse the handoff rather than
    // let the next load apply it again.
    return null;
  }
  return { code, route };
}
