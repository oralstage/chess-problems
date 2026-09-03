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
 *   npx wrangler d1 execute chess-problems-db --remote --file=scripts/.update/author-aliases-alter.sql
 *   for i in $(seq 0 N); do npx wrangler d1 execute chess-problems-db --remote --file=scripts/.update/author-aliases-$i.sql; done
 */
import { readFileSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import { extraSearchParts } from './translit.ts';

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

// The ALTERs go in their own file: each one fails if the column is already
// there, and a failure aborts the rest of its file, so keeping them apart
// lets the UPDATEs be re-run on their own.
writeFileSync(path.join(UPDATE_DIR, 'author-aliases-alter.sql'),
  "ALTER TABLE author_search ADD COLUMN aliases TEXT NOT NULL DEFAULT '';\n"
  + "ALTER TABLE author_search ADD COLUMN alias_other TEXT NOT NULL DEFAULT '';\n");

const stmts: string[] = [];
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
  const alias = extraSearchParts(r.name);
  if (!alias.surname && !alias.other) continue;
  const stmt = `UPDATE author_search SET aliases='${escapeSQL(alias.surname)}', alias_other='${escapeSQL(alias.other)}' WHERE name='${escapeSQL(r.name)}';`;
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
console.log(`${written} of ${rows.length} rows need aliases → author-aliases-alter.sql + ${fileNo} data file(s) in scripts/.update/`);
console.log('Run the alter file first; it errors harmlessly if the columns already exist.');
