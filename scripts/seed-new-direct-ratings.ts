/**
 * Seed problem_ratings rows for direct problems that entered D1 in an
 * incremental update (scripts/update-from-yacpdb.ts).
 *
 * populate-genre-ratings.ts deliberately refuses 'direct': the original
 * ~400k direct ratings were seeded WITHOUT a solution-length term, and new
 * rows must use the same formula or they sit on a different scale than the
 * pool they compete in. This script reads the update's target ids, keeps the
 * ones that are non-fairy direct problems in D1, and emits INSERT OR IGNORE
 * files per dev pool (existing rows are never touched).
 *
 * Usage:
 *   npx tsx scripts/seed-new-direct-ratings.ts
 *   for f in scripts/.update/direct-dev0-*.sql; do npx wrangler d1 execute chess-problems-stats --remote --file=$f; done
 *   for f in scripts/.update/direct-dev1-*.sql; do npx wrangler d1 execute chess-problems-db-staging --remote --file=$f; done
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import { difficultyToRating } from '../src/utils/glicko2';

const UPDATE_DIR = path.join(import.meta.dirname, '.update');

interface Row { id: number; move_count: number; piece_count: number; difficulty_score: number }

function query(sql: string): Row[] {
  const out = execFileSync('npx', [
    'wrangler', 'd1', 'execute', 'chess-problems-db', '--remote', '--command', sql, '--json',
  ], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  return JSON.parse(out.slice(out.indexOf('[')))[0].results as Row[];
}

const { targets } = JSON.parse(readFileSync(path.join(UPDATE_DIR, 'refetched.json'), 'utf8')) as { targets: number[] };

const rows: Row[] = [];
for (let i = 0; i < targets.length; i += 500) {
  const chunk = targets.slice(i, i + 500);
  rows.push(...query(
    `SELECT id, move_count, piece_count, difficulty_score FROM problems
     WHERE genre = 'direct' AND is_fairy = 0 AND id IN (${chunk.join(',')})`
  ));
  process.stdout.write(`\r  ${Math.min(i + 500, targets.length)}/${targets.length} checked, ${rows.length} direct`);
}
console.log();

const values = rows.map(r => {
  // No solutionLength on purpose — see header comment.
  const rating = Math.round(difficultyToRating(r.difficulty_score, r.move_count, r.piece_count, 'direct'));
  return (dev: number) => `(${r.id},${dev},${rating},350,0.06,0,'direct')`;
});

for (const dev of [0, 1]) {
  let fileNo = 0;
  for (let i = 0; i < values.length; i += 20000) {
    const slice = values.slice(i, i + 20000);
    const stmts: string[] = [];
    for (let j = 0; j < slice.length; j += 500) {
      stmts.push(
        'INSERT OR IGNORE INTO problem_ratings (problem_id, dev, rating, rd, volatility, solve_count, genre) VALUES\n'
        + slice.slice(j, j + 500).map(f => f(dev)).join(',\n') + ';'
      );
    }
    writeFileSync(path.join(UPDATE_DIR, `direct-dev${dev}-${fileNo}.sql`), stmts.join('\n') + '\n');
    fileNo++;
  }
  console.log(`dev=${dev}: ${values.length} rows in ${fileNo} file(s)`);
}
