import { execFile } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const generatorPath = resolve(projectRoot, 'scripts/generate-daily-post.mjs');

function localDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function parseMonday(value) {
  const date = value ? new Date(`${value}T00:00:00`) : new Date();
  if (Number.isNaN(date.getTime())) throw new Error('Week must be a real date in YYYY-MM-DD format.');
  date.setHours(0, 0, 0, 0);
  const offset = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - offset);
  return date;
}

function nextMonday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  const daysUntilNextMonday = 8 - (date.getDay() || 7);
  date.setDate(date.getDate() + daysUntilNextMonday);
  return date;
}

async function main() {
  const argument = process.argv[2];
  const monday = argument === '--next' ? nextMonday() : parseMonday(argument);
  const dates = Array.from({ length: 7 }, (_, offset) => {
    const date = new Date(monday);
    date.setDate(date.getDate() + offset);
    return localDateKey(date);
  });
  for (const date of dates) {
    const { stdout, stderr } = await execFileAsync(process.execPath, [generatorPath, date], { cwd: projectRoot });
    process.stdout.write(stdout);
    process.stderr.write(stderr);
  }
  console.log(`Weekly Daily posts generated: ${dates[0]} through ${dates.at(-1)}`);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
