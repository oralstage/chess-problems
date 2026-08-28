# Chess Problems

Interactive solver for [YACPDB](https://www.yacpdb.org) chess problems with move validation, Stockfish hints, and full solution display including tries and variations.

Over 575,000 problems: direct mates (~406,000), helpmates (~85,000), selfmates (~53,000), studies (~32,000), and retros (~1,500).

**Live site: [chess-problems.pages.dev](https://chess-problems.pages.dev)**

## Features

- Solve direct mates, helpmates, selfmates, studies, and retro problems on the board
- Move validation against the solution tree
- Stockfish-powered hints
- Solution playback with clickable moves
- **Rated Mode** — Glicko-2 matchmaking that picks problems near your skill level, with separate pools for direct mates, helpmates, and selfmates. Perfect solve = rating up, any mistake = rating down
- **Review Mode** — FSRS-4.5 spaced repetition for problems you've played in Rated Mode. Reinforces weak spots on a schedule
- **Analysis board** — a free board for thinking while you solve: move any piece anywhere, both colours, nothing checked. Your answer still counts only on the real board
- **Play vs engine** — continue against Stockfish when YACPDB's solution stops early, or play out a study
- **Themes** — a guide to the classic ideas (Battery, Zugzwang, Grimshaw, Novotny, Plachutta, Model & Ideal mate, and more), each explained on a prize-winning example. After you solve, the idea inside that problem is explained on a marked-up diagram
- Twin problems: every twin's position and solution
- Helpmates with several solutions: find them all
- Filters by theme, stipulation, piece count, year, and award
- Search problems by composer
- Bookmarks and solve history
- Daily problem, with an archive of past days
- Dark mode

## Bug Reports & Feedback

Please open an [issue](https://github.com/oralstage/chess-problems/issues).

## Tech Stack

- React + TypeScript + Vite + Tailwind CSS
- Cloudflare Pages + D1 (SQLite) + Workers
- Stockfish WASM for analysis
