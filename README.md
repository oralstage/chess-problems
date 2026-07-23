# Chess Problems

Interactive solver for [YACPDB](https://www.yacpdb.org) chess problems with move validation, Stockfish hints, and full solution display including tries and variations.

**Live site: [chess-problems.pages.dev](https://chess-problems.pages.dev)**

## Features

- Solve direct mates, helpmates, selfmates, studies, and retro problems on the board
- Move validation against the solution tree
- Stockfish-powered hints
- Solution playback with clickable moves
- **Rated Mode** — Glicko-2 matchmaking that picks problems near your skill level. Perfect solve = rating up, any mistake = rating down
- **Review Mode** — FSRS-4.5 spaced repetition for problems you've played in Rated Mode. Reinforces weak spots on a schedule
- Search problems by composer
- Bookmarks and solve history
- Daily problem
- Dark mode

## Bug Reports & Feedback

Please open an [issue](https://github.com/oralstage/chess-problems/issues).

## Tech Stack

- React + TypeScript + Vite + Tailwind CSS
- Cloudflare Pages + D1 (SQLite) + Workers
- Stockfish WASM for analysis

## Daily X post assets

Generate a square board image, ready-to-paste post text, link, and source JSON
for today's Daily Problem:

```bash
npm run daily-post
```

The files are written to `daily-posts/YYYY-MM-DD/`. The PNG uses the same pieces,
colors, and coordinates as the web app, with `Mate in N` and approximate rating in its header. To generate assets for a
specific date, append the date after `--`:

```bash
npm run daily-post -- 2026-07-22
```

The generator reads the same `/api/daily` endpoint as the live site, so its
problem always matches the Daily Problem shown to visitors. This is the site's
own read-only endpoint, not the X API. It requires Google Chrome at the standard
macOS application path to render the web board as a PNG.
`DAILY_POST_OUTPUT_DIR`, `DAILY_POST_SITE_URL`, and `CHROME_PATH` can be
used to override the defaults.

The post text includes the problem's current Rated Mode rating, rounded to the
nearest 50 and marked as approximate. If the live rating is unavailable, the
generator falls back to the same initial difficulty estimate used by the app.

On a Mac, install a daily `launchd` job by passing the desired local time
(7:00 AM in this example):

```bash
npm run daily-post:install -- 07:00
```

The job runs every Monday and generates that Monday through Sunday. Generate a
specific week manually with any date in that week:

```bash
npm run daily-post:week -- 2026-07-20
```

The job also runs once when it is installed or loaded. A calendar run missed
while the Mac is asleep is run after it wakes. Logs are kept in `daily-posts/`.
