#!/usr/bin/env node
/**
 * Reads the reports sent from the "Something looks wrong" button.
 *
 *   npm run feedback              latest 20 from production
 *   npm run feedback -- --dev     from staging instead
 *   npm run feedback -- --limit 100
 *   npm run feedback -- --id 150514      only that problem
 *
 * Nothing notifies me when one arrives — this is the way to read them.
 */
import { execFileSync } from 'node:child_process';

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const dev = argv.includes('--dev');
const db = dev ? 'chess-problems-db-staging' : 'chess-problems-stats';
const limit = Number(flag('limit', 20));
const onlyId = flag('id', null);

const where = [`dev = ${dev ? 1 : 0}`];
if (onlyId) where.push(`problem_id = ${Number(onlyId)}`);

const sql = `SELECT id, problem_id, comment, context, country, created_at, handled
  FROM problem_feedback WHERE ${where.join(' AND ')}
  ORDER BY id DESC LIMIT ${limit}`;

let raw;
try {
  raw = execFileSync('npx', ['wrangler', 'd1', 'execute', db, '--remote', '--json', '--command', sql], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
} catch (err) {
  console.error(err.stdout || err.message);
  process.exit(1);
}

// wrangler prints a banner before the JSON.
const rows = JSON.parse(raw.slice(raw.indexOf('[')))[0]?.results ?? [];

if (rows.length === 0) {
  console.log(`No reports in ${db}.`);
  process.exit(0);
}

console.log(`${rows.length} report${rows.length === 1 ? '' : 's'} in ${db}, newest first:\n`);

for (const r of rows) {
  let ctx = {};
  try { ctx = JSON.parse(r.context || '{}'); } catch { /* stored as-is */ }

  const head = [
    `#${r.id}`,
    r.problem_id ? `D${r.problem_id}` : '(no problem)',
    ctx.stipulation || '',
    r.created_at,
    r.country || '',
    r.handled ? '· handled' : '',
  ].filter(Boolean).join('  ');
  console.log(head);

  if (r.comment) console.log(`   "${r.comment}"`);

  const line2 = [
    ctx.genre,
    ctx.twin ? `twin ${ctx.twin}` : null,
    ctx.outcome,
    ctx.wrongMoves ? `${ctx.wrongMoves} wrong` : null,
    ctx.hintUsed ? 'hint' : null,
    ctx.mode && ctx.mode !== 'browsing' ? ctx.mode : null,
  ].filter(Boolean).join(' · ');
  if (line2) console.log(`   ${line2}`);

  if (ctx.position) console.log(`   ${ctx.position}`);
  if (ctx.movesPlayed) console.log(`   played: ${ctx.movesPlayed}`);
  if (ctx.page) console.log(`   ${ctx.page}`);
  if (ctx.build) console.log(`   build ${ctx.build}`);
  console.log();
}
