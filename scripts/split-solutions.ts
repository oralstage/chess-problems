/**
 * Move solution_text out of the problems DB into chess-problems-solutions.
 *
 * The problems DB sits at ~464MB of the 500MB free-tier per-database cap;
 * solutions are ~60% of it. Each database gets its own 500MB, so the split
 * buys decades of headroom at YACPDB's growth rate.
 *
 * Phases (run in this order — see the migration runbook in CLAUDE.md):
 *   npx tsx scripts/split-solutions.ts export
 *     Read id+solution_text from the problems DB and write INSERT files to
 *     scripts/.update/solutions-*.sql. Execute each against the NEW DB:
 *       for f in scripts/.update/solutions-*.sql; do npx wrangler d1 execute chess-problems-solutions --remote --file=$f; done
 *   npx tsx scripts/split-solutions.ts empty
 *     AFTER the readers are deployed and verified: write chunked UPDATE files
 *     (scripts/.update/empty-solutions-*.sql) that blank solution_text in the
 *     problems DB, freeing the space for future imports to reuse.
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import * as path from 'node:path';

const UPDATE_DIR = path.join(import.meta.dirname, '.update');

function query<T>(db: string, sql: string): T[] {
  const out = execFileSync('npx', [
    'wrangler', 'd1', 'execute', db, '--remote', '--command', sql, '--json',
  ], { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 });
  return JSON.parse(out.slice(out.indexOf('[')))[0].results as T[];
}

function escapeSQL(s: string): string {
  return s.replace(/'/g, "''");
}

async function exportSolutions() {
  const STMT_BUDGET = 60_000;
  const FILE_BUDGET = 4_000_000;
  let lastId = 0;
  let total = 0;
  let fileNo = 0;
  let fileStmts: string[] = [];
  let fileBytes = 0;
  let batch: string[] = [];
  let batchBytes = 0;

  const flushBatch = () => {
    if (batch.length === 0) return;
    const stmt = 'INSERT OR REPLACE INTO solutions (id, solution_text) VALUES\n' + batch.join(',\n') + ';';
    fileStmts.push(stmt);
    fileBytes += stmt.length;
    batch = [];
    batchBytes = 0;
  };
  const flushFile = () => {
    flushBatch();
    if (fileStmts.length === 0) return;
    writeFileSync(path.join(UPDATE_DIR, `solutions-${String(fileNo).padStart(3, '0')}.sql`), fileStmts.join('\n') + '\n');
    fileNo++;
    fileStmts = [];
    fileBytes = 0;
  };

  for (;;) {
    const page = query<{ id: number; solution_text: string }>(
      'chess-problems-db',
      `SELECT id, solution_text FROM problems WHERE id > ${lastId} ORDER BY id LIMIT 5000`
    );
    if (page.length === 0) break;
    for (const r of page) {
      const v = `(${r.id},'${escapeSQL(r.solution_text || '')}')`;
      if (batchBytes + v.length > STMT_BUDGET) flushBatch();
      if (fileBytes > FILE_BUDGET) flushFile();
      batch.push(v);
      batchBytes += v.length + 2;
    }
    total += page.length;
    lastId = page[page.length - 1].id;
    process.stdout.write(`\r  exported ${total} solutions`);
  }
  flushFile();
  console.log(`\n${total} solutions → ${fileNo} SQL file(s) in scripts/.update/`);
  console.log(`Import: for f in scripts/.update/solutions-*.sql; do npx wrangler d1 execute chess-problems-solutions --remote --file=$f; done`);
}

async function emptyColumn() {
  // Blank in id-range chunks: DROP COLUMN rewrites the whole 464MB table and
  // blows D1's statement time limit, and a copy-without-column needs more
  // space than the 500MB cap allows. Blanked pages go to SQLite's freelist
  // and future imports reuse them, which is what the migration is for.
  const rows = query<{ min_id: number; max_id: number; n: number }>(
    'chess-problems-db',
    'SELECT MIN(id) AS min_id, MAX(id) AS max_id, COUNT(*) AS n FROM problems'
  );
  const { min_id, max_id, n } = rows[0];
  const CHUNK = 20000;
  const stmts: string[] = [];
  for (let lo = min_id; lo <= max_id; lo += CHUNK) {
    stmts.push(`UPDATE problems SET solution_text = '' WHERE id >= ${lo} AND id < ${lo + CHUNK} AND solution_text != '';`);
  }
  const PER_FILE = 8;
  let fileNo = 0;
  for (let i = 0; i < stmts.length; i += PER_FILE) {
    writeFileSync(path.join(UPDATE_DIR, `empty-solutions-${String(fileNo).padStart(2, '0')}.sql`), stmts.slice(i, i + PER_FILE).join('\n') + '\n');
    fileNo++;
  }
  console.log(`${n} rows across ids ${min_id}-${max_id} → ${stmts.length} chunked UPDATEs in ${fileNo} file(s)`);
  console.log(`Run ONLY after the SOLUTIONS_DB readers are deployed and verified:`);
  console.log(`  for f in scripts/.update/empty-solutions-*.sql; do npx wrangler d1 execute chess-problems-db --remote --file=$f; done`);
}

const cmd = process.argv[2];
if (cmd === 'export') exportSolutions();
else if (cmd === 'empty') emptyColumn();
else { console.log('usage: split-solutions.ts export|empty'); process.exit(1); }
