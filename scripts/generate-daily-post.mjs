import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { createServer } from 'vite';

const execFileAsync = promisify(execFile);
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const SITE_URL = process.env.DAILY_POST_SITE_URL || 'https://chess-problems.pages.dev';
const OUTPUT_ROOT = resolve(process.env.DAILY_POST_OUTPUT_DIR || 'daily-posts');
const CHROME_PATH = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

function wait(milliseconds) {
  return new Promise((resolveWait) => setTimeout(resolveWait, milliseconds));
}

async function fetchWithRetry(url, attempts = 5) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok || response.status < 500) return response;
      lastError = new Error(`Server returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    if (attempt < attempts) await wait(15_000);
  }
  throw lastError;
}

function localDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function validateDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function difficultyToRating(difficultyScore, moveCount, pieceCount) {
  if (moveCount != null && pieceCount != null) {
    const solutionComponent = Math.min((difficultyScore - moveCount * 100 - pieceCount * 2) * 5, 50);
    const rating = 600 + (moveCount - 2) * 300 + pieceCount * 50 + Math.max(0, solutionComponent);
    return Math.max(600, Math.min(3200, rating));
  }
  return Math.max(600, Math.min(3200, 700 + (difficultyScore - 200) * 7));
}

async function getProblemRating(problem) {
  const fallback = difficultyToRating(problem.difficultyScore, problem.moveCount, problem.pieceCount);
  try {
    const response = await fetchWithRetry(`${SITE_URL}/api/problem-rating?id=${encodeURIComponent(problem.id)}`);
    if (!response.ok) return { rating: fallback, rd: 350, source: 'initial-estimate' };
    const current = await response.json();
    if (!Number.isFinite(current.rating)) return { rating: fallback, rd: 350, source: 'initial-estimate' };
    return { rating: current.rating, rd: current.rd, source: 'live' };
  } catch {
    return { rating: fallback, rd: 350, source: 'initial-estimate' };
  }
}

function postText(problem, date, link, problemRating) {
  const displayDate = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`));
  const composer = Array.isArray(problem.authors) && problem.authors.length
    ? problem.authors.join(', ')
    : '';
  const source = [problem.sourceName, problem.sourceYear].filter(Boolean).join(', ');
  const attribution = [composer, source].filter(Boolean).join(' — ');
  const approximateRating = Math.round(problemRating.rating / 50) * 50;

  return [
    `Daily Chess Problem — ${displayDate}`,
    '',
    `White to play and mate in ${problem.moveCount}.`,
    `Problem rating: ~${approximateRating}`,
    attribution,
    '',
    link,
    '',
    '#ChessProblems #Chess',
  ].filter((line, index, lines) => line || lines[index - 1] !== '').join('\n');
}

async function renderBoard(problem, problemRating, pngPath) {
  const server = await createServer({
    root: resolve(SCRIPT_DIR, 'daily-board'),
    logLevel: 'silent',
    server: { host: '127.0.0.1', port: 0, strictPort: false },
  });

  try {
    await server.listen();
    const address = server.httpServer?.address();
    if (!address || typeof address === 'string') throw new Error('Could not start the local board renderer.');
    const query = new URLSearchParams({
      fen: problem.fen,
      mateIn: `MATE IN ${problem.moveCount}`,
      rating: String(Math.round(problemRating.rating / 50) * 50),
    });
    const renderUrl = `http://127.0.0.1:${address.port}/?${query}`;

    await execFileAsync(CHROME_PATH, [
      '--headless=new',
      '--hide-scrollbars',
      '--disable-gpu',
      '--force-device-scale-factor=1',
      '--window-size=1080,1080',
      '--virtual-time-budget=1000',
      `--screenshot=${pngPath}`,
      renderUrl,
    ]);
  } finally {
    await server.close();
  }
}

async function main() {
  const date = process.argv[2] || localDateString();
  if (!validateDate(date)) {
    throw new Error('Date must be a real calendar date in YYYY-MM-DD format.');
  }

  const apiUrl = `${SITE_URL}/api/daily?date=${encodeURIComponent(date)}`;
  const response = await fetchWithRetry(apiUrl);
  if (!response.ok) throw new Error(`Daily API returned ${response.status}: ${apiUrl}`);
  const problem = await response.json();
  const problemRating = await getProblemRating(problem);
  const link = `${SITE_URL}/#/daily/${date}`;
  const outputDir = resolve(OUTPUT_ROOT, date);
  const pngPath = resolve(outputDir, 'board.png');
  const oldSvgPath = resolve(outputDir, 'board.svg');

  mkdirSync(outputDir, { recursive: true });
  if (existsSync(oldSvgPath)) unlinkSync(oldSvgPath);
  writeFileSync(resolve(outputDir, 'post.txt'), `${postText(problem, date, link, problemRating)}\n`);
  writeFileSync(resolve(outputDir, 'link.txt'), `${link}\n`);
  writeFileSync(resolve(outputDir, 'problem.json'), `${JSON.stringify({ date, ...problem, problemRating }, null, 2)}\n`);
  await renderBoard(problem, problemRating, pngPath);

  console.log(`Daily post generated: ${outputDir}`);
  console.log(`Image: ${pngPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
