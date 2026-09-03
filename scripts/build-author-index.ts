/**
 * Build the author_search index in the problems DB.
 *
 * Author search used to LIKE-scan all ~587k problems per query (~580k rows
 * read — most of a free-tier day in a handful of searches). This table holds
 * one row per distinct author name with that author's problem ids pre-sorted
 * the way the endpoint returns them (source_year DESC, difficulty ASC), so a
 * search scans ~30k small rows instead.
 *
 * Usage:
 *   npx tsx scripts/build-author-index.ts          # reads D1, writes scripts/.update/author-index-*.sql
 *   for f in scripts/.update/author-index-*.sql; do npx wrangler d1 execute chess-problems-db --remote --file=$f; done
 *
 * Rebuild after every YACPDB import (full rebuild ≈ 30k writes — fine even
 * under the post-2026-09-01 write budget). The problems DB is shared by prod
 * and staging, so one rebuild serves both.
 */
import { execFileSync } from 'node:child_process';
import { extraSearchParts } from './translit.ts';
import { writeFileSync } from 'node:fs';
import * as path from 'node:path';

const UPDATE_DIR = path.join(import.meta.dirname, '.update');

interface Row { id: number; authors: string; source_year: number | null; difficulty_score: number }

function query(sql: string): Row[] {
  const out = execFileSync('npx', [
    'wrangler', 'd1', 'execute', 'chess-problems-db', '--remote', '--command', sql, '--json',
  ], { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 });
  return JSON.parse(out.slice(out.indexOf('[')))[0].results as Row[];
}

function escapeSQL(s: string): string {
  return s.replace(/'/g, "''");
}

async function main() {
  const byAuthor = new Map<string, { id: number; year: number | null; score: number }[]>();
  let lastId = 0;
  let total = 0;
  for (;;) {
    const page = query(
      `SELECT id, authors, source_year, difficulty_score FROM problems
       WHERE id > ${lastId} AND is_fairy = 0 ORDER BY id LIMIT 10000`
    );
    if (page.length === 0) break;
    for (const r of page) {
      let names: string[];
      try {
        names = JSON.parse(r.authors);
      } catch {
        continue;
      }
      for (const name of names) {
        if (!name || typeof name !== 'string') continue;
        let list = byAuthor.get(name);
        if (!list) { list = []; byAuthor.set(name, list); }
        list.push({ id: r.id, year: r.source_year, score: r.difficulty_score });
      }
    }
    total += page.length;
    lastId = page[page.length - 1].id;
    process.stdout.write(`\r  read ${total} problems, ${byAuthor.size} authors`);
  }
  console.log();

  // Same order the endpoint used to produce with ORDER BY source_year DESC,
  // difficulty_score ASC (SQLite puts NULL years last in DESC).
  const values: string[] = [];
  for (const [name, list] of byAuthor) {
    list.sort((a, b) => {
      const ya = a.year, yb = b.year;
      if (ya == null && yb == null) return a.score - b.score;
      if (ya == null) return 1;
      if (yb == null) return -1;
      if (yb !== ya) return yb - ya;
      return a.score - b.score;
    });
    const ids = JSON.stringify(list.map(e => e.id));
    // Latin readings of Cyrillic names (and diacritic-free forms of Latin
    // ones) so a Latin-alphabet query reaches composers filed in Cyrillic.
    const alias = extraSearchParts(name);
    values.push(`('${escapeSQL(name)}','${escapeSQL(name.toLowerCase())}','${escapeSQL(ids)}','${escapeSQL(alias.surname)}','${escapeSQL(alias.other)}')`);
  }

  const stmts: string[] = [
    'CREATE TABLE IF NOT EXISTS author_search (name TEXT PRIMARY KEY, name_lower TEXT NOT NULL, problem_ids TEXT NOT NULL, aliases TEXT NOT NULL DEFAULT \'\', alias_other TEXT NOT NULL DEFAULT \'\');',
    'DELETE FROM author_search;',
  ];
  // Batch by bytes, not row count: one prolific author's tuple is ~33KB, and
  // 200 tuples per INSERT blew past the statement size limit (SQLITE_TOOBIG).
  const STMT_BUDGET = 60_000;
  let batch: string[] = [];
  let batchBytes = 0;
  const flush = () => {
    if (batch.length === 0) return;
    stmts.push('INSERT INTO author_search (name, name_lower, problem_ids, aliases, alias_other) VALUES\n' + batch.join(',\n') + ';');
    batch = [];
    batchBytes = 0;
  };
  for (const v of values) {
    if (batchBytes + v.length > STMT_BUDGET) flush();
    batch.push(v);
    batchBytes += v.length + 2;
  }
  flush();

  // Split into files under wrangler's upload comfort zone.
  const PER_FILE = 60;
  let fileNo = 0;
  for (let i = 0; i < stmts.length; i += PER_FILE) {
    writeFileSync(path.join(UPDATE_DIR, `author-index-${fileNo}.sql`), stmts.slice(i, i + PER_FILE).join('\n') + '\n');
    fileNo++;
  }
  console.log(`${byAuthor.size} authors from ${total} problems → ${fileNo} SQL file(s) in scripts/.update/`);
  console.log(`Import: for i in $(seq 0 ${fileNo - 1}); do npx wrangler d1 execute chess-problems-db --remote --file=scripts/.update/author-index-$i.sql; done`);
}

main().catch(e => { console.error(e); process.exit(1); });
