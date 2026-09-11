#!/usr/bin/env node
/**
 * Stop a deploy that nobody thought about. Run as a PreToolUse hook on Bash.
 *
 * On 2026-09-11 a session ran `npm run deploy:staging` six times in
 * twenty-six minutes while adjusting the look of a page. Each run ends in a
 * smoke check that rebuilt the whole genre summary on staging -- a little
 * over a million D1 rows -- and the account's daily read allowance ran out.
 * The live site could not open a problem until the quota reset the next
 * morning. Everything needed to avoid that was already written in CLAUDE.md,
 * and had been read, at the top of that same session.
 *
 * So this does not rely on remembering. A deploy command is refused unless it
 * carries CONFIRM_DEPLOY=1, which cannot be typed by accident and buys the
 * couple of seconds in which "is this deploy worth a day of the site?" can be
 * asked.
 *
 * Anything it cannot parse, it allows: a hook that breaks every command would
 * be worse than the accident it guards against.
 */

/* Called from package.json with --cli, it guards the npm script itself, so the
   gate is there for a human shell and for a session whose hooks are off. */
if (process.argv.includes('--cli')) {
  if (process.env.CONFIRM_DEPLOY === '1') process.exit(0);
  const target = process.argv.includes('staging') ? 'deploy:staging' : 'deploy';
  process.stderr.write(
    '\nThis deploys the site, and it is not free.\n\n'
    + (target === 'deploy:staging'
      ? 'The smoke check rebuilds the genre summary from D1 (about 1.2M rows when\n'
        + "staging's cache is cold). The free tier is 5M rows a day for the whole\n"
        + 'account: four or five of these take the LIVE site down until 00:00 UTC.\n\n'
      : 'Production. The user has to have asked for this deploy.\n\n')
    + 'Look at the change locally first: npm run dev (port 5183).\n'
    + 'If it has to go out:\n\n'
    + '  CONFIRM_DEPLOY=1 npm run ' + target + '\n\n'
    + 'See CLAUDE.md > デプロイの注意.\n\n',
  );
  process.exit(1);
}

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { raw += chunk; });
process.stdin.on('end', () => {
  let command = '';
  try {
    command = JSON.parse(raw)?.tool_input?.command ?? '';
  } catch {
    process.exit(0); // not something this hook understands
  }
  if (typeof command !== 'string' || !command) process.exit(0);

  const deploys = /npm\s+run\s+deploy\b|wrangler\s+pages\s+deploy\b/.test(command);
  const confirmed = /\bCONFIRM_DEPLOY=1\b/.test(command);
  if (!deploys || confirmed) process.exit(0);

  const staging = /staging/.test(command);
  process.stderr.write(
    'Blocked: this deploys the site.\n\n'
    + (staging
      ? 'Staging deploys are not free: the smoke check rebuilds the genre summary\n'
        + 'from D1 (about 1.2M rows when its cache is cold) and the free tier is 5M\n'
        + 'rows a day for the whole account. Four or five of these take the LIVE\n'
        + 'site down until the quota resets at 00:00 UTC.\n\n'
      : 'Production deploys need the user to say so, every time.\n\n')
    + 'Look at the change locally first: npm run dev (port 5183).\n'
    + 'If it genuinely has to go out, run it again with the confirmation:\n\n'
    + '  CONFIRM_DEPLOY=1 ' + command.trim() + '\n\n'
    + 'See CLAUDE.md > デプロイの注意.\n',
  );
  process.exit(2); // 2 = block the tool call
});
