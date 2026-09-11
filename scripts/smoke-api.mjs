#!/usr/bin/env node
/**
 * Post-deploy smoke check: verify the Pages Functions actually shipped.
 *
 * A deploy made from the wrong working directory uploads dist/ but silently
 * drops functions/ — every /api/* route then falls through to the SPA and
 * returns index.html with HTTP 200. The app looks fine until the browser
 * cache runs out, so nothing alerts. This checks the content type, not the
 * status code.
 *
 * Usage: node scripts/smoke-api.mjs [origin]
 *   default origin: https://chess-problems.pages.dev
 */

const origin = (process.argv[2] || 'https://chess-problems.pages.dev').replace(/\/$/, '');

/* Cheap routes only. The check is on the content type, so any /api/* route
   proves the same thing -- that the Functions shipped -- and these three cost
   a handful of rows between them.

   /api/stats used to be the first of them. On production it is normally warm
   and costs one row, but staging keeps its cache in its own database, where
   it is nearly always cold: every staging deploy rebuilt the whole genre
   summary, a little over a million rows a time. Six deploys in half an hour
   on 2026-09-11 spent the account's daily read allowance and took the live
   site's problem pages down until the quota reset. The check was never worth
   that, and it still runs against stats below where it is cheap. */
const ROUTES = [
  '/api/problems/3684',
  '/api/daily',
  '/api/problems/ids?genre=retro',
];

/* Production's stats cache is warm, so this one is a row and worth keeping:
   it is the only route here that exercises functions/api/stats.ts. */
if (!origin.includes('staging')) ROUTES.push('/api/stats?genre=direct');

let failed = 0;

for (const route of ROUTES) {
  const url = `${origin}${route}`;
  try {
    const res = await fetch(url);
    const type = res.headers.get('content-type') || '';
    const ok = res.ok && type.includes('application/json');
    console.log(`${ok ? 'ok  ' : 'FAIL'}  ${res.status} ${type.split(';')[0] || '(no type)'}  ${route}`);
    if (!ok) failed++;
  } catch (e) {
    console.log(`FAIL  ${e instanceof Error ? e.message : e}  ${route}`);
    failed++;
  }
}

if (failed > 0) {
  console.error(
    `\n${failed}/${ROUTES.length} API routes did not return JSON on ${origin}.\n` +
    `If they returned text/html, the Pages Functions were not uploaded.\n` +
    `Re-run the deploy from the repo root (cd into this project first) so that\n` +
    `wrangler can find ./functions — see CLAUDE.md > Deployment.`
  );
  process.exit(1);
}

console.log(`\nAll ${ROUTES.length} API routes served JSON on ${origin}.`);
