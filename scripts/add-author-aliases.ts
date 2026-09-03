/**
 * One-off migration: add the `aliases` column to an existing author_search
 * table and fill it, without rebuilding the index from the problems table
 * (which would read ~590k rows).
 *
 * A full rebuild via build-author-index.ts produces the same result and is the
 * right thing to run after a YACPDB import; this exists so the column can be
 * added to the live index for the cost of the writes alone.
 *
 * Usage:
 *   npx wrangler d1 execute chess-problems-db --remote --json \
 *     --command "SELECT name, name_lower, problem_ids FROM author_search;" > backup.json
 *   npx tsx scripts/add-author-aliases.ts backup.json
 *   for f in scripts/.update/author-aliases-*.sql; do npx wrangler d1 execute chess-problems-db --remote --file=$f; done
 */
import { readFileSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import { extraSearchText } from './translit.ts';

const UPDATE_DIR = path.join(import.meta.dirname, '.update');

function escapeSQL(s: string): string {
  return s.replace(/'/g, "''");
}

const src = process.argv[2];
if (!src) {
  console.error('usage: npx tsx scripts/add-author-aliases.ts <author_search dump .json>');
  process.exit(1);
}
const rows = JSON.parse(readFileSync(src, 'utf8'))[0].results as { name: string }[];

const stmts: string[] = [
  "ALTER TABLE author_search ADD COLUMN aliases TEXT NOT NULL DEFAULT '';",
];
let written = 0;
let batch: string[] = [];
let batchBytes = 0;
const STMT_BUDGET = 60_000;
const flush = () => {
  if (batch.length === 0) return;
  // One UPDATE per statement keeps it simple; batching is by file, not by row.
  stmts.push(batch.join('\n'));
  batch = [];
  batchBytes = 0;
};
for (const r of rows) {
  const aliases = extraSearchText(r.name);
  if (!aliases) continue;
  const stmt = `UPDATE author_search SET aliases='${escapeSQL(aliases)}' WHERE name='${escapeSQL(r.name)}';`;
  if (batchBytes + stmt.length > STMT_BUDGET) flush();
  batch.push(stmt);
  batchBytes += stmt.length + 1;
  written++;
}
flush();

const PER_FILE = 40;
let fileNo = 0;
for (let i = 0; i < stmts.length; i += PER_FILE) {
  writeFileSync(path.join(UPDATE_DIR, `author-aliases-${fileNo}.sql`), stmts.slice(i, i + PER_FILE).join('\n') + '\n');
  fileNo++;
}
console.log(`${written} of ${rows.length} rows need aliases → ${fileNo} SQL file(s) in scripts/.update/`);
