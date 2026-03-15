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
- **CRITICAL**: Stockfish files must be served from `public/stockfish/` (not bundled by Vite). Vite hashes JS and WASM files independently, but the worker JS finds its WASM by replacing `.js→.wasm` in its own URL — mismatched hashes cause 404. The `prebuild`/`predev` scripts copy files from `node_modules/stockfish/bin/` to `public/stockfish/`.
- Requires COOP/COEP headers for SharedArrayBuffer (multi-threaded). Falls back to single-threaded.
- Can freeze on mobile. 15-second timeout prevents hangs. Never use Stockfish for validation.
- Lazy-loaded: first call to `analyze()` triggers `ensureReady()`. Don't gate on `readyState === 'ready'`.

### Deployment
- Cloudflare Pages: `npx wrangler pages deploy dist --project-name=chess-problems`
- Build: `npm run build` (prebuild copies Stockfish to public/, then tsc + vite build)
- No need to manually remove WASM files — Stockfish is now in `dist/stockfish/` (~7MB each), not in `dist/assets/`.

### react-chessboard
- Click-to-move works (click piece, click destination). Drag also works.
- Board orientation: flipped for helpmate (black at bottom).
- Responsive: `min(viewportWidth - 32, 560)`.
- **CRITICAL**: `customArrows` must be passed `[]` (empty array) to clear arrows, NOT `undefined`. Passing `undefined` leaves previous arrows rendered on the board. This caused a persistent bug where analysis arrows stayed after Stop.

### Analysis (Stockfish integration in App.tsx)
- `analysisActive` state controls toggle. `analysisActiveRef` is a ref mirror for async callbacks.
- `useEffect([problem.fen, analysisActive])` triggers analysis. Cleanup sets `cancelled = true`.
- **Race condition pitfall**: When user presses Stop, `handleAnalyze` must set `analysisActiveRef.current = false` IMMEDIATELY (not just in the useEffect), because the async callback might resolve between the state update and the effect cleanup.
- **Problem change cleanup**: The `useEffect([problem.problem?.id])` must reset ALL analysis state: `analysisActive`, `analysisResult`, `analysisArrow`, AND `analyzing`. Missing `setAnalyzing(false)` caused the button to show "..." permanently.
- `boardArrows` must check `analysisActive && analysisArrow` (not just `analysisArrow`) as a safety net.
- `useStockfish()` returns a new object on every `readyState` change. **Never** use `stockfish` directly in useEffect deps — use `stockfishRef = useRef(stockfish)` to avoid infinite re-render loops.

### solutionParser.ts — Additional Gotchas
- **"1. ...Kd6" format**: The regex for move numbers must allow space between the period and dots: `^(\d+)\.\s*(\.\.\.?)?`. Without `\s*`, defenses like "1. ...Kd6" are parsed as white moves (indent 0), become root nodes, and get filtered out by key-node filtering. This caused D37-type bugs where black never responded.
- **"S-" (any knight move)**: YACPDB uses "S-" for "any move by the knight". The move regex cannot parse this. These moves are silently dropped, which is acceptable — the continuation (e.g., "2.Qc5#") may attach to the wrong parent, but the problem remains solvable.
- **Same-line segment chaining**: YACPDB sometimes puts multiple moves on one line like `1...f4 2.Bh7#`. The `isSameLineFollow` check originally only used `indent > stackTopIndent`, but when raw indents are non-uniform (e.g., both segments have indent 3), this fails. Fixed by also tracking `prevSegMoveNum` and allowing chaining when the move number increases (`moveNumIncreased`). Without this, the second segment becomes a new root node and gets lost.
- **Try filtering (`?` marker)**: YACPDB marks tries with `?` (e.g., `1.0-0#?`). The parser tracks `isTry` on segments/nodes. Filtering: first prefer `isKey` nodes, then filter out `isTry` nodes even if no key exists. Without this, tries appear as valid solutions. Retro problems (keyword "Retro") often have tries that are illegal moves.
- **Retro problems**: Problems with "Retro" keyword involve analyzing previous moves, not making forward moves. Moves like `1.Kf3*g2` mean "the King on f3 captured on g2 (retro analysis)", not a forward move. These are unsolvable in the app — playback buttons won't appear because `tryExecuteNode` can't execute retro moves. This is acceptable.

### Playback Navigation
- `positions` array: index 0 = initial FEN, index N = after move N. `moveIndex = -1` means showing initial position.
- `moveIndex` is clamped to `[-1, positions.length - 2]`. Display: `moveIndex + 1` / `positions.length - 1`.
- **Don't** use `state.fen` as a fallback for the end of playback. Previously, `effectiveFen` had a special case that showed `state.fen` when `moveIndex >= positions.length - 2` and status was 'correct'. This caused the > button to appear to jump to the end when `positions` was shorter than the main line (due to unparseable moves). Just use `positions[moveIndex + 1]` always.
- Counter denominator should be `positions.length - 1` (actual parseable moves), not `mainLineLength` (which may be larger if some moves failed to parse).
- **Threat-only solutions** (e.g., `1.Kb3! (2.Rd1#)`): The main line has consecutive same-color moves (key + threat). `computePositions` detects this (node is threat and `node.color !== chess.turn()`) and inserts a legal opponent move between them so playback shows the full sequence (e.g., 3/3 instead of 1/1). During solving, the threat auto-play code (useProblem.ts ~515-565) already handles this by playing a random black legal move, then setting `currentNodes = threatChildren` so the user can play the threat move.
- **Retro problem banner**: Only show the "Retro problem" explanation banner when the problem has no playable moves (`positions.length <= 1`), not for all Retro-tagged problems. Many retro problems (like en passant keys) are perfectly playable.

### UI / UX Lessons
- **iPhone problem list pagination**: Grid cards were too tall, pushing pagination off-screen. Fix: reduce card height (`py-1 px-1`, `text-lg` number, `text-[10px]` stipulation, `text-[11px]` author). Don't make cards number-only — keep author and stipulation for context.
- **Moves display**: The "Moves: 1. Qa7 ..." in FeedbackPanel is redundant with the Solution section after solving. Only show during `status === 'solving'`.
- **Keywords**: Display inside SolutionTree between Solution moves and All variations (not after SolutionTree or in ProblemCard header). Passed as `keywordTags` React node prop. Make clickable with description popup using `findTheme(kw)`. Non-described keywords are grayed out spans, described ones are buttons.
- **Problem list**: `StatusFilter` type: 'all' | 'unsolved' | 'solved' | 'failed' | 'bookmarked'. Failed = gave up (orange), solved = correct (green). `ProblemStatus` in types.ts includes `'failed'`. `handleGiveUp` sets 'failed' (but doesn't downgrade 'solved'). `handleNextProblem` only sets 'solved' if `problem.status === 'correct'`.
- **Bookmarks**: Stored per-genre in localStorage (`cp-bookmarks`). Toggle via star button next to problem card.
- **"Exploring" / "Free play"**: Shows when user makes a move on the board during playback. Clicking a solution move or pressing < returns to normal playback.

### Problem Data
- ~13,400 problems total across 4 genres
- `problems-direct.json` is 9.2MB (largest), loaded via dynamic import
- Starter set (`problems-starter.json`, 29KB) exists but currently unused
- Cache in `scripts/.cache/` stores raw YACPDB API responses
