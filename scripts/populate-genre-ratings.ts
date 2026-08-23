/**
 * Seed problem_ratings for a genre.
 *
 * D1 has no cross-database INSERT ... SELECT and `problems` lives in a different
 * database from `problem_ratings`, so rows are read out, scored here, and written
 * back as SQL files.
 *
 * Usage:
 *   npx tsx scripts/populate-genre-ratings.ts <genre> [--out scripts/seed]
 * then execute the generated files against the TARGET stats database yourself.
 * This script never writes to a database — it only produces .sql files.
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { difficultyToRating } from '../src/utils/glicko2';

const SOURCE_DB = 'chess-problems-db';
const PAGE = 10000;
const ROWS_PER_INSERT = 500;
const ROWS_PER_FILE = 20000;

interface Row {
  id: number;
  move_count: number;
  piece_count: number;
  difficulty_score: number;
  sol_len: number;
}

function query(sql: string): Row[] {
  const out = execFileSync('npx', [
    'wrangler', 'd1', 'execute', SOURCE_DB, '--remote', '--command', sql, '--json',
  ], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  const start = out.indexOf('[');
  return JSON.parse(out.slice(start))[0].results as Row[];
}

const genre = process.argv[2];
if (!genre || !['help', 'self', 'study', 'retro'].includes(genre)) {
  console.error('usage: populate-genre-ratings.ts <help|self|study|retro>');
  process.exit(1);
}
// 'direct' is deliberately not accepted. Its ~400k ratings were seeded before this
// script existed, from a call that passed no solution length; re-running it here
// would pass one and shift every untouched direct rating.

const outDir = process.argv.includes('--out')
  ? process.argv[process.argv.indexOf('--out') + 1]
  : 'scripts/seed';
mkdirSync(outDir, { recursive: true });

const rows: Row[] = [];
let lastId = 0;
for (;;) {
  // Keyset pagination: OFFSET over a table this size costs ~0.5s per page in D1.
  const page = query(
    // Mate-in-1 needs a filter the longer stipulations don't: YACPDB's #1 set is
    // over half construction records that list a dozen alternative keys, plus
    // stipulation-swapping twins. Those are not solving problems, and at 600-ish
    // they would be the first thing a new player ever sees. Helpmates are the
    // exception — several keys there are genuine alternative solutions.
    `SELECT id, move_count, piece_count, difficulty_score, length(solution_text) AS sol_len FROM problems
     WHERE genre = '${genre}' AND is_fairy = 0 AND id > ${lastId}
       AND (move_count > 1 OR (
         TRIM(solution_text) NOT LIKE 'a)%'
         AND instr(solution_text, '#') > 0
         AND ((length(solution_text) - length(replace(solution_text, '1.', ''))) / 2)
             - ((length(solution_text) - length(replace(solution_text, '1...', ''))) / 4)
             ${genre === 'help' ? '>= 1' : '= 1'}
       ))
     ORDER BY id LIMIT ${PAGE}`
  );
  if (page.length === 0) break;
  rows.push(...page);
  lastId = page[page.length - 1].id;
  process.stdout.write(`\r  read ${rows.length}`);
}
console.log(`\n  ${rows.length} ${genre} problems`);

const values = rows.map(r => {
  const rating = Math.round(
    difficultyToRating(r.difficulty_score, r.move_count, r.piece_count, genre, r.sol_len)
  );
  return `(${r.id},1,${rating},350,0.06,0,'${genre}')`;
});

let fileNo = 0;
for (let i = 0; i < values.length; i += ROWS_PER_FILE) {
  const slice = values.slice(i, i + ROWS_PER_FILE);
  const stmts: string[] = [];
  for (let j = 0; j < slice.length; j += ROWS_PER_INSERT) {
    stmts.push(
      'INSERT OR IGNORE INTO problem_ratings (problem_id, dev, rating, rd, volatility, solve_count, genre) VALUES\n'
      + slice.slice(j, j + ROWS_PER_INSERT).join(',\n') + ';'
    );
  }
  const path = `${outDir}/${genre}-${fileNo}.sql`;
  writeFileSync(path, stmts.join('\n') + '\n');
  console.log(`  wrote ${path} (${slice.length} rows)`);
  fileNo++;
}
console.log(`\n${fileNo} file(s). Execute against the STAGING stats DB with:`);
console.log(`  for i in $(seq 0 ${fileNo - 1}); do npx wrangler d1 execute chess-problems-db-staging --remote --file=${outDir}/${genre}-$i.sql; done`);
