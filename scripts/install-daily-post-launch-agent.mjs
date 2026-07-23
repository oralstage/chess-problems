import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const LABEL = 'com.chess-problems.daily-post';
const time = process.argv[2] || '07:00';
const match = time.match(/^([01]\d|2[0-3]):([0-5]\d)$/);

if (!match) {
  console.error('Time must be HH:MM in 24-hour format, for example 07:00.');
  process.exit(1);
}

const [, hour, minute] = match;
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const generatorPath = resolve(projectRoot, 'scripts/generate-weekly-daily-posts.mjs');
const outputRoot = resolve(projectRoot, 'daily-posts');
// Prefer Homebrew's stable symlink over its versioned Cellar path so a future
// `brew upgrade node` does not break the scheduled job.
const nodePath = [
  '/opt/homebrew/bin/node',
  '/usr/local/bin/node',
  process.execPath,
].find(existsSync);
const launchAgentsDir = resolve(homedir(), 'Library/LaunchAgents');
const plistPath = resolve(launchAgentsDir, `${LABEL}.plist`);
const uid = process.getuid();

function xml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

mkdirSync(launchAgentsDir, { recursive: true });
mkdirSync(outputRoot, { recursive: true });

const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${xml(nodePath)}</string>
    <string>${xml(generatorPath)}</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${xml(projectRoot)}</string>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>${Number(hour)}</integer>
    <key>Minute</key>
    <integer>${Number(minute)}</integer>
    <key>Weekday</key>
    <integer>1</integer>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${xml(resolve(outputRoot, 'launchd.log'))}</string>
  <key>StandardErrorPath</key>
  <string>${xml(resolve(outputRoot, 'launchd-error.log'))}</string>
</dict>
</plist>
`;

try {
  execFileSync('launchctl', ['bootout', `gui/${uid}`, plistPath], { stdio: 'ignore' });
} catch {
  // The agent was not loaded yet.
}

writeFileSync(plistPath, plist);
execFileSync('plutil', ['-lint', plistPath], { stdio: 'inherit' });
execFileSync('launchctl', ['bootstrap', `gui/${uid}`, plistPath], { stdio: 'inherit' });

console.log(`Weekly Daily post generator installed for every Monday at ${time}.`);
console.log(`LaunchAgent: ${plistPath}`);
console.log(`Output: ${outputRoot}`);
