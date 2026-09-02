#!/usr/bin/env node
/**
 * Build the static per-genre problem index that the app loads when a genre
 * is opened (id + stipulation + year for every non-fairy problem, sorted by
 * difficulty). It replaces the `/api/problems/ids` round trip, which read the
 * whole genre from D1 (~400k rows for direct) on every edge-cache miss and was
 * the single largest consumer of the D1 daily read quota.
 *
 * The index only changes at a YACPDB import, so it is generated here and
 * committed under public/problem-index/. The file name carries DATA_VERSION
 * (read from functions/api/data-cache.ts) and the matching constant is
 * written to src/data/problemIndexVersion.ts, so bumping DATA_VERSION and
 * re-running this script is all an import needs.
 *
 * Sources (pick one):
 *   --db <file.sqlite>   a local SQLite copy of the problems table
 *                        (e.g. rebuilt from scripts/.update/rebuild-*.sql)
 *   --api <baseUrl>      the live /api/problems/ids endpoint (reads ~590k
 *                        D1 rows once — fine right after an import)
 *
 * Optional:
 *   --verify <baseUrl>   after generating, fetch the live endpoint and
 *                        compare every entry (count, order, fields).
 *
 * Output format (columnar, ~6MB for direct instead of ~20MB as objects):
 *   { version, genre, count, stipulations: string[], ids: number[],
 *     stips: number[] (index into stipulations), years: (number|null)[] }
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, unlinkSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const GENRES = ['direct', 'help', 'self', 'study', 'retro'];
const OUT_DIR = resolve(ROOT, 'public/problem-index');
const VERSION_TS = resolve(ROOT, 'src/data/problemIndexVersion.ts');

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function readDataVersion() {
  const src = readFileSync(resolve(ROOT, 'functions/api/data-cache.ts'), 'utf8');
  const m = src.match(/export const DATA_VERSION = '([^']+)'/);
  if (!m) throw new Error('DATA_VERSION not found in functions/api/data-cache.ts');
  return m[1];
}

/** Rows as {id, stipulation, sourceYear} in app order: difficulty asc, id asc. */
async function loadFromSqlite(file, genre) {
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(file, { readOnly: true });
  const rows = db.prepare(
    `SELECT id, stipulation, source_year FROM problems
     WHERE genre = ? AND is_fairy = 0
     ORDER BY difficulty_score ASC, id ASC`
  ).all(genre);
  db.close();
  return rows.map(r => ({ id: r.id, stipulation: r.stipulation, sourceYear: r.source_year ?? null }));
}

async function loadFromApi(baseUrl, genre) {
  // Same URL the client used, so we hit whatever the edge already holds.
  const url = `${baseUrl.replace(/\/$/, '')}/api/problems/ids?genre=${genre}&sortBy=difficulty&sortOrder=asc&v=2`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  const data = await res.json();
  return data.problems.map(p => ({ id: p.id, stipulation: p.stipulation, sourceYear: p.sourceYear ?? null }));
}

function encode(version, genre, rows) {
  const stipulations = [];
  const stipIndex = new Map();
  const ids = new Array(rows.length);
  const stips = new Array(rows.length);
  const years = new Array(rows.length);
  rows.forEach((r, i) => {
    let s = stipIndex.get(r.stipulation);
    if (s === undefined) {
      s = stipulations.length;
      stipulations.push(r.stipulation);
      stipIndex.set(r.stipulation, s);
    }
    ids[i] = r.id;
    stips[i] = s;
    years[i] = r.sourceYear;
  });
  return { version, genre, count: rows.length, stipulations, ids, stips, years };
}

function diffRows(a, b) {
  if (a.length !== b.length) return `count ${a.length} vs ${b.length}`;
  for (let i = 0; i < a.length; i++) {
    const x = a[i], y = b[i];
    if (x.id !== y.id || x.stipulation !== y.stipulation || x.sourceYear !== y.sourceYear) {
      return `first difference at index ${i}: ${JSON.stringify(x)} vs ${JSON.stringify(y)}`;
    }
  }
  return null;
}

async function main() {
  const dbFile = arg('--db');
  const apiBase = arg('--api');
  const verifyBase = arg('--verify');
  if (!dbFile && !apiBase) {
    console.error('usage: node scripts/build-problem-index.mjs (--db file.sqlite | --api https://…) [--verify https://…]');
    process.exit(2);
  }

  const version = readDataVersion();
  mkdirSync(OUT_DIR, { recursive: true });
  for (const f of readdirSync(OUT_DIR)) {
    if (f.endsWith('.json')) unlinkSync(resolve(OUT_DIR, f));
  }

  let failed = false;
  for (const genre of GENRES) {
    const rows = dbFile ? await loadFromSqlite(dbFile, genre) : await loadFromApi(apiBase, genre);
    const out = resolve(OUT_DIR, `${genre}-${version}.json`);
    writeFileSync(out, JSON.stringify(encode(version, genre, rows)));
    const mb = (statSync(out).size / 1024 / 1024).toFixed(2);
    let note = '';
    if (verifyBase) {
      const live = await loadFromApi(verifyBase, genre);
      const d = diffRows(rows, live);
      note = d ? `  ✗ MISMATCH vs live: ${d}` : '  ✓ matches live';
      if (d) failed = true;
    }
    console.log(`${genre.padEnd(6)} ${String(rows.length).padStart(7)} problems  ${mb.padStart(6)} MB${note}`);
  }

  writeFileSync(VERSION_TS,
    `// Generated by scripts/build-problem-index.mjs — do not edit by hand.\n` +
    `// Must match the file names under public/problem-index/.\n` +
    `export const PROBLEM_INDEX_VERSION = '${version}';\n`);
  console.log(`version ${version} → ${VERSION_TS.replace(ROOT + '/', '')}`);
  if (failed) process.exit(1);
}

main().catch(err => { console.error(err); process.exit(1); });
