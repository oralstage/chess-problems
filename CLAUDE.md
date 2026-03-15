# Chess Problems

## Project
- URL: https://chess-problems.pages.dev/
- Stack: React 19 + TypeScript + Vite 7 + Tailwind CSS 4
- Dev server: port 5183
- Deploy: `npm run build && npx wrangler pages deploy dist --project-name=chess-problems`
- Data source: YACPDB (Yet Another Chess Problem Database)

## Commands
- `npm run dev` - Dev server (port 5183)
- `npm run build` - TypeScript check + Vite build
- `npm run lint` - ESLint
- `npm run fetch-data` - Fetch problems from YACPDB (`tsx scripts/fetch-problems.ts`)

## Architecture

### Data Pipeline
1. `scripts/fetch-problems.ts` scans YACPDB by ID range, filters orthodox problems
2. `src/utils/algebraicToFen.ts` converts YACPDB algebraic notation to FEN
3. Output: 4 JSON files in `src/data/` (direct, help, self, study)
4. App loads JSON at startup, parses solution text into trees via `solutionParser.ts`

### Key Files
| File | Purpose |
|------|---------|
| `src/services/solutionParser.ts` | YACPDB solution text → tree structure (most complex) |
| `src/hooks/useProblem.ts` | Problem state machine, move validation, auto-play |
| `src/hooks/useStockfish.ts` | Stockfish WASM wrapper (optional, hint-only) |
| `src/utils/algebraicToFen.ts` | YACPDB algebraic → FEN conversion |
| `src/App.tsx` | Main app, problem loading, view routing |
| `src/components/Board.tsx` | react-chessboard wrapper |
| `scripts/fetch-problems.ts` | YACPDB data fetcher with caching |

### 4 Genres (completely separated)
- **Direct Mate** (#1-#8): White to move, force checkmate. User=white, black auto-plays.
- **Helpmate** (h#1-h#8): Black moves first, both sides cooperate. User plays both sides.
- **Selfmate** (s#1-s#8): White forces black to deliver checkmate. User=white, black auto-plays.
- **Study** (+/=): No move limit. Win or draw. User=white, black auto-plays.

### Move Validation
- **Primary**: Solution tree matching (all genres). `matchMoveToTree()` in useProblem.ts.
- **Fallback**: chess.js checkmate/stalemate detection for immediate wins.
- **Stockfish**: Optional, lazy-loaded. Used only for hints and analysis, NOT for validation.

## Lessons Learned / Known Issues

### solutionParser.ts (most bug-prone)
- Parenthesized threats `(2.Rd1#)` and bracket threats `[2.Qf7#]` must be extracted BEFORE splitting on move numbers (`\d+\.`), otherwise the regex breaks the content inside parens.
- Try/key filtering: YACPDB solutions include "tries" (wrong moves marked with `?`) before the key move (`!`). Parser filters root nodes to keep only `isKey && color === firstMoveColor`.
- Threat nodes use the SAME color as the parent (attacker's follow-up), not the opposite color.
- `S` in YACPDB notation = Knight (`N`). Must normalize everywhere.
- Virtual indents: When all segments have the same indent (flat YACPDB text), compute indents from move numbers. Exclude threat segments from uniform-indent check.

### Stockfish WASM
- Uses lite variant (~7MB) to fit Cloudflare Pages 25MB file limit.
- Requires COOP/COEP headers for SharedArrayBuffer (multi-threaded). Falls back to single-threaded.
- Can freeze on mobile. 15-second timeout prevents hangs. Never use Stockfish for validation.
- `dist/assets/*.wasm` files >25MB must be removed before `wrangler pages deploy`.

### Deployment
- Cloudflare Pages: `npx wrangler pages deploy dist --project-name=chess-problems`
- WASM files >25MB are rejected by CF. The lite Stockfish variant avoids this but sometimes large WASM files from other packages sneak in — always `rm -f dist/assets/*.wasm` if any are >25MB before deploying.

### react-chessboard
- Click-to-move works (click piece, click destination). Drag also works.
- Board orientation: flipped for helpmate (black at bottom).
- Responsive: `min(viewportWidth - 32, 560)`.

### Problem Data
- ~13,400 problems total across 4 genres
- `problems-direct.json` is 9.2MB (largest), loaded via dynamic import
- Starter set (`problems-starter.json`, 29KB) exists but currently unused
- Cache in `scripts/.cache/` stores raw YACPDB API responses
