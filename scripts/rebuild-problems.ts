/**
 * Compact the problems table in place after the 2026-08-26 solution split.
 *
 * Blanking solution_text left ~250MB as intra-page fragmentation: SQLite does
 * not repack pages when rows shrink, and D1 (auto_vacuum) only reclaims pages
 * that become entirely empty. New problems append to fresh pages, so that
 * space is unusable for growth and the file sits at 486MB of the 500MB cap.
 *
 * Deleting a contiguous id range empties its pages (reclaimed immediately —
 * verified 2026-08-26: +15MB test table grew the file, DROP shrank it back),
 * and re-inserting the same rows without solution text packs them densely.
 * Chunk by chunk the file shrinks to roughly the real data size (~200MB).
 *
 * Phases:
 *   npx tsx scripts/rebuild-problems.ts export
 *     Read every problems row (minus solution_text) from D1 into
 *     scripts/.update/rebuild-NNN.sql. Each file covers a contiguous id range
 *     and starts with the DELETE for that exact range, so one file = one
 *     self-contained delete+reinsert step. Read-only; run any time.
 *   npx tsx scripts/rebuild-problems.ts apply
 *     Execute the files in order against chess-problems-db. Rows in a range
 *     are missing for the seconds that file takes — run with user approval.
 *     Idempotent: re-running a file after a partial failure is safe.
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync, readdirSync } from 'node:fs';
import * as path from 'node:path';

const UPDATE_DIR = path.join(import.meta.dirname, '.update');
const DB = 'chess-problems-db';

const COLS = [
  'id', 'fen', 'authors', 'source_name', 'source_year', 'stipulation',
  'move_count', 'genre', 'difficulty', 'difficulty_score', 'piece_count',
  'solution_text', 'keywords', 'award', 'is_fairy',
] as const;
type ProblemRow = Record<(typeof COLS)[number], string | number | null>;

function query<T>(sql: string): T[] {
  const out = execFileSync('npx', [
    'wrangler', 'd1', 'execute', DB, '--remote', '--command', sql, '--json',
  ], { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 });
  return JSON.parse(out.slice(out.indexOf('[')))[0].results as T[];
}

function sqlLiteral(v: string | number | null): string {
  if (v === null) return 'NULL';
  if (typeof v === 'number') return String(v);
  return `'${v.replace(/'/g, "''")}'`;
}

async function exportRows() {
  const STMT_BUDGET = 60_000;
  const FILE_BUDGET = 4_000_000;
  let lastId = 0;
  let total = 0;
  let fileNo = 0;

  let fileStmts: string[] = [];
  let fileBytes = 0;
  let fileFirstId = 1;
  let batch: string[] = [];
  let batchBytes = 0;

  const flushBatch = () => {
    if (batch.length === 0) return;
    const stmt = `INSERT OR REPLACE INTO problems (${COLS.join(',')}) VALUES\n` + batch.join(',\n') + ';';
    fileStmts.push(stmt);
    fileBytes += stmt.length;
    batch = [];
    batchBytes = 0;
  };
  // endId = last id INCLUDED in this file; the next file starts at endId+1.
  const flushFile = (endId: number) => {
    flushBatch();
    if (fileStmts.length === 0) return;
    const del = `DELETE FROM problems WHERE id >= ${fileFirstId} AND id <= ${endId};`;
    writeFileSync(
      path.join(UPDATE_DIR, `rebuild-${String(fileNo).padStart(3, '0')}.sql`),
      del + '\n' + fileStmts.join('\n') + '\n'
    );
    fileNo++;
    fileStmts = [];
    fileBytes = 0;
    fileFirstId = endId + 1;
  };

  for (;;) {
    const page = query<ProblemRow>(
      `SELECT ${COLS.filter(c => c !== 'solution_text').join(',')} FROM problems WHERE id > ${lastId} ORDER BY id LIMIT 5000`
    );
    if (page.length === 0) break;
    for (const r of page) {
      // solution_text stays in the schema but is '' for every row since the split.
      const vals = COLS.map(c => (c === 'solution_text' ? "''" : sqlLiteral(r[c])));
      const v = `(${vals.join(',')})`;
      if (batchBytes + v.length > STMT_BUDGET) flushBatch();
      if (fileBytes > FILE_BUDGET) flushFile((r.id as number) - 1);
      batch.push(v);
      batchBytes += v.length + 2;
    }
    total += page.length;
    lastId = page[page.length - 1].id as number;
    process.stdout.write(`\r  exported ${total} rows`);
  }
  flushFile(lastId);
  console.log(`\n${total} rows → ${fileNo} rebuild files in scripts/.update/`);
}

async function apply() {
  const files = readdirSync(UPDATE_DIR).filter(f => /^rebuild-\d+\.sql$/.test(f)).sort();
  if (files.length === 0) throw new Error('no rebuild-*.sql files — run export first');
  const before = query<{ n: number }>('SELECT COUNT(*) AS n FROM problems')[0].n;
  console.log(`${files.length} files, ${before} rows before`);
  for (const f of files) {
    process.stdout.write(`  ${f} ... `);
    execFileSync('npx', [
      'wrangler', 'd1', 'execute', DB, '--remote', '--file', path.join(UPDATE_DIR, f),
    ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    console.log('ok');
  }
  const after = query<{ n: number }>('SELECT COUNT(*) AS n FROM problems')[0].n;
  console.log(`rows after: ${after} (before: ${before})`);
  if (after !== before) throw new Error('ROW COUNT MISMATCH — re-run the failed file, do not proceed');
}

const cmd = process.argv[2];
if (cmd === 'export') exportRows();
else if (cmd === 'apply') apply();
else { console.log('usage: rebuild-problems.ts export|apply'); process.exit(1); }
