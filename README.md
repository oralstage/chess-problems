# Chess Problems

Interactive solver for [YACPDB](https://www.yacpdb.org) chess problems with move validation, Stockfish hints, and full solution display including tries and variations.

**Live site: [chess-problems.pages.dev](https://chess-problems.pages.dev)**

## Features

- Solve direct mates, helpmates, selfmates, studies, and retro problems on the board
- Move validation against the solution tree
- Stockfish-powered hints
- Solution playback with clickable moves
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
