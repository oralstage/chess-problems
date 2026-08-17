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

const ROUTES = [
  '/api/stats?genre=direct',
  '/api/daily',
  '/api/problems/ids?genre=retro',
];

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
