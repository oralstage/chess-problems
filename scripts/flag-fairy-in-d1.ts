/**
 * Re-derive is_fairy for problems already in D1.
 *
 * Usage:
 *   npx tsx scripts/flag-fairy-in-d1.ts            # write scripts/flag-fairy.sql
 *   npx tsx scripts/flag-fairy-in-d1.ts --ids-only # print the ids, one per line
 *
 * The import filter only decides what goes in; rows already in D1 keep
 * whatever is_fairy they were given. This walks the YACPDB cache with the
 * same isFairyEntry() the import uses and emits UPDATE statements for the
 * fairy ones, so the column and the filter can never disagree.
 *
 * Only ever sets is_fairy = 1. Clearing the flag would un-hide problems that
 * an earlier pass hid on purpose, so that stays a manual decision.
 */
import * as fs from 'fs';
import * as path from 'path';
import { isFairyEntry } from './fairy-detect';

const CACHE_DIR = path.join(import.meta.dirname, '.cache');
const OUT_FILE = path.join(import.meta.dirname, 'flag-fairy.sql');
const CHUNK_SIZE = 500; // D1 runs out of memory on very large IN lists

function main() {
  const idsOnly = process.argv.includes('--ids-only');
  const files = fs.readdirSync(CACHE_DIR).filter(f => f.endsWith('.json'));
  const ids: number[] = [];

  for (const file of files) {
    let entry: { id?: number; algebraic?: unknown };
    try {
      entry = JSON.parse(fs.readFileSync(path.join(CACHE_DIR, file), 'utf-8'));
    } catch {
      continue;
    }
    if (typeof entry.id !== 'number') continue;
    // Entries with no position were never importable, so they cannot be in
    // D1. Skipping them keeps the id list to real problems (~17k, not ~375k).
    if (!entry.algebraic) continue;
    if (isFairyEntry(entry)) ids.push(entry.id);
  }

  ids.sort((a, b) => a - b);

  if (idsOnly) {
    console.log(ids.join('\n'));
    return;
  }

  const statements: string[] = [];
  for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
    const chunk = ids.slice(i, i + CHUNK_SIZE);
    statements.push(`UPDATE problems SET is_fairy = 1 WHERE is_fairy = 0 AND id IN (${chunk.join(',')});`);
  }
  fs.writeFileSync(OUT_FILE, statements.join('\n') + '\n');

  console.log(`Scanned ${files.length} cached entries`);
  console.log(`Fairy entries: ${ids.length}`);
  console.log(`Wrote ${statements.length} statements to ${OUT_FILE}`);
}

main();
