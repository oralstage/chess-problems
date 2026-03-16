# Chess Problems

## Project
- URL: https://chess-problems.pages.dev/
- Stack: React 19 + TypeScript + Vite 7 + Tailwind CSS 4 + Cloudflare D1 + Pages Functions
- Dev server: port 5183
- Deploy: `npm run build && npx wrangler pages deploy dist --project-name=chess-problems`
- Data source: YACPDB (Yet Another Chess Problem Database)
- D1 Database: `chess-problems-db` (ID: `43ccd454-aa55-420c-93b6-61333ccad8c1`)

## Commands
- `npm run dev` - Dev server (port 5183)
- `npm run build` - TypeScript check + Vite build
- `npm run lint` - ESLint
- `npm run fetch-data` - Fetch problems from YACPDB (`tsx scripts/fetch-problems.ts`)

## Architecture

### Data Pipeline (D1 API)
1. `scripts/fetch-problems.ts` scans YACPDB by ID range, filters orthodox problems, caches to `scripts/.cache/`
2. `scripts/import-to-d1.ts` converts cached entries to SQL and imports into Cloudflare D1
3. Pages Functions (`functions/api/`) serve problems from D1 on demand
4. App fetches problem metadata per genre via API (no solutionText), then fetches solutionText individually when user selects a problem
5. `solutionParser.ts` builds solution trees client-side from solutionText

### D1 Import Commands
- `npx tsx scripts/import-to-d1.ts` — Generate SQL files from YACPDB cache
- `for i in $(seq 0 N); do npx wrangler d1 execute chess-problems-db --remote --file=scripts/import-data-$i.sql; done` — Import into D1

### API Endpoints (Pages Functions)
| Endpoint | Purpose |
|----------|---------|
| `GET /api/stats?genre=X` | Genre counts, available stipulations, keywords, ranges |
| `GET /api/problems?genre=X&page=0&pageSize=20&...` | Paginated problem list (no solutionText), max pageSize=1000 |
| `GET /api/problems/:id` | Single problem with full solutionText |
| `GET /api/problems/ids?genre=X&...` | All matching problem IDs for navigation |
| `GET /api/daily` | Today's daily problem (#2 direct mate, with solutionText, 1h cache) |

### Key Files
| File | Purpose |
|------|---------|
| `src/services/solutionParser.ts` | YACPDB solution text → tree structure (most complex) |
| `src/services/api.ts` | API client for D1 backend |
| `src/hooks/useProblem.ts` | Problem state machine, move validation, auto-play |
| `src/hooks/useStockfish.ts` | Stockfish WASM wrapper (optional, hint-only) |
| `src/utils/algebraicToFen.ts` | YACPDB algebraic → FEN conversion |
| `src/App.tsx` | Main app, problem loading, view routing |
| `functions/api/problems.ts` | Problems list API endpoint |
| `functions/api/problems/[id].ts` | Single problem API endpoint |
| `functions/api/stats.ts` | Stats API endpoint |
| `src/components/Board.tsx` | react-chessboard wrapper |
| `scripts/fetch-problems.ts` | YACPDB data fetcher with caching |

### 5 Genres (completely separated)
- **Direct Mate** (#1-#5): White to move, force checkmate. User=white, black auto-plays.
- **Helpmate** (h#1-h#5): Black moves first, both sides cooperate. User plays both sides.
- **Selfmate** (s#1-s#5): White forces black to deliver checkmate. User=white, black auto-plays.
- **Study** (+/=): No move limit. Win or draw. User=white, black auto-plays.
- **Retro**: Deduce the position's history. User plays both colors (must figure out whose turn it is). Mixed stipulations (#, h#, s#) with stipulation badge.

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
- Cloudflare Pages + Functions: `npx wrangler pages deploy dist --project-name=chess-problems`
- Build: `npm run build` (prebuild copies Stockfish to public/, then tsc + vite build)
- `wrangler.toml` configures D1 binding (`DB`) for Pages Functions
- No need to manually remove WASM files — Stockfish is now in `dist/stockfish/` (~7MB each), not in `dist/assets/`.
- **dist size**: ~0.5MB (was ~48MB with static JSON). All problem data served from D1 API.

### react-chessboard
- Click-to-move works (click piece, click destination). Drag also works.
- Board orientation: always white at bottom (chess problem convention, even for helpmate).
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
- **Playback after solving**: When the user solves a problem, build playback from the actual `moveHistory` (SAN strings), not from `getMainLine()`. Problems with multiple branches (e.g., D9 #2 with Ka5/Bb2/b3 defenses) auto-play a random defense — the solution display must show the branch the user actually played through, not always the first branch. `startPlayback` accepts optional `playedMoves` param. Give Up still uses `getMainLine` (no played moves).

### UI / UX Lessons
- **iPhone problem list pagination**: Grid cards were too tall, pushing pagination off-screen. Fix: reduce card height (`py-1 px-1`, `text-lg` number, `text-[10px]` stipulation, `text-[11px]` author). Don't make cards number-only — keep author and stipulation for context.
- **Moves display**: The "Moves: 1. Qa7 ..." in FeedbackPanel is redundant with the Solution section after solving. Only show during `status === 'solving'`.
- **Keywords**: Display inside SolutionTree between Solution moves and All variations (not after SolutionTree or in ProblemCard header). Passed as `keywordTags` React node prop. Make clickable with description popup using `findTheme(kw)`. Non-described keywords are grayed out spans, described ones are buttons.
- **Problem list**: `StatusFilter` type: 'all' | 'unsolved' | 'solved' | 'failed' | 'bookmarked'. Failed = gave up (orange), solved = correct (green). `ProblemStatus` in types.ts includes `'failed'`. `handleGiveUp` sets 'failed' (but doesn't downgrade 'solved'). `handleNextProblem` only sets 'solved' if `problem.status === 'correct'`.
- **Bookmarks**: Stored per-genre in localStorage (`cp-bookmarks`). Toggle via star button next to problem card.
- **"Exploring" / "Free play"**: Shows when user makes a move on the board during playback. Clicking a solution move or pressing < returns to normal playback.

### URL Routing & Browser History
- Hash-based: `#/direct/yacpdb/12345` persists genre and YACPDB problem ID across reloads
- `updateHash(genre, problemId, replace)` uses `pushState` (default) or `replaceState` for browser history
- `popstate` event listener handles browser back/forward buttons — navigates between problems
- All navigation functions (selectMode, handleSelectProblem, handleNavProblem, handleRandomProblem, etc.) call `updateHash` which pushes to browser history stack
- `hashRestoredRef` prevents double-restore after initial load
- Legacy format `#/direct/44` (1-based index) auto-converted to new format on load

### Lazy Loading & Caching
- **Per-genre lazy loading via API**: Genre data is NOT loaded at startup. `loadGenre(genre)` fetches all problem metadata (no solutionText) from `/api/problems` when user selects a genre. Metadata is paginated (1000/page) and fetched in parallel.
- **Quick-start optimization**: When entering a genre with a saved `currentProblemId`, the app fetches that single problem via `/api/problems/:id` and shows it immediately. Full genre data loads in background for navigation/filters.
- **Daily problem via API**: `/api/daily` returns today's daily problem server-side (1 DB query). No need to load 53k direct problems just for the home page.
- **On-demand solutionText**: `solutionText` is fetched individually via `/api/problems/:id` when a problem is selected. `ensureSolution()` fetches + parses into `solutionTree`.
- **Genre counts from API**: `fetchStats()` retrieves counts on mount. Hardcoded `ESTIMATED_COUNTS` as fallback.
- **Problem cache for instant reload**: `cacheProblem()` saves the current problem (minus `solutionTree`, but WITH `solutionText`) to localStorage (`cp-cached-problem`). On hash restore, `solutionTree` is rebuilt from cached `solutionText` synchronously.

### Problem Data
- **~79,000 problems** in D1 across 5 genres (direct: ~53,200, help: ~16,500, self: ~6,200, study: ~3,100, retro: ~180)
- Previously ~36,900 as static JSON; migrated to D1 API for 2x+ more problems and no bundle size limit
- Move count limited: #1-#5 for direct/help/self, no limit for study. `#0` excluded (proof positions).
- Cache in `scripts/.cache/` stores raw YACPDB API responses (~96k entries, ~386MB)
- D1 storage: ~63MB (5GB free tier)
- **Stable numbering**: `problemIndexMap` (Map<id, index>) in ProblemList ensures global indices persist across filters
- Static JSON files (`src/data/problems-*.json`) still exist but are no longer imported by the app

### Retro Genre
- FIDE Album section 8. Separated as 5th genre. Problems with YACPDB `keywords` containing `"Retro"` are extracted from other genres into `problems-retro.json`.
- **User plays both colors** (`allowAnyColor` on Board component). The user must deduce whose turn it is — moving the wrong color is rejected as incorrect. This avoids giving away the answer.
- **`{(illegal)` problems**: Some retro problems have `{(illegal)}` or `{(illegal, ...)}` in their solutionText, indicating White's apparent move is illegal (e.g., castling rights). For these:
  - Solution tree colors are flipped at load time (parser assigns wrong colors because notation like `1.Kf3*g2` looks like White's move but is actually Black's).
  - "White's move is illegal — it's Black's turn" banner shown only AFTER solving (showing during solve gives away the answer).
  - **Pattern matching**: Use `includes('{(illegal')` (no closing paren) because YACPDB notation varies: `{(illegal)}`, `{(illegal, Black has no last move!)}`, etc.
- **Cache double-flip bug**: When caching problems to localStorage, the solutionTree has already-flipped colors. On restore, always rebuild from `solutionText` via `parseSolution()` before applying the flip — never use the cached tree directly, or the flip gets applied twice (undoing it).
- **FEN flip for opposite-turn moves**: chess.js enforces turn order. When user moves the non-active color in retro, `tryMove` flips the FEN turn and retries. Same pattern in `Board.tsx` `legalMoves`, `computePositions`, and `startPlayback`.
- Many retro problems are playable (e.g., en passant key, castling analysis). Some are not (retro move notation like `1.Kf3*g2` meaning "undo capture") — these show a banner for unplayable ones (`positions.length <= 1`).

### Safari Issues
- **SVG favicon not supported**: Safari ignores `<link rel="icon" type="image/svg+xml">`. Must provide PNG fallbacks: `<link rel="icon" type="image/png" sizes="32x32">` and `<link rel="apple-touch-icon" sizes="180x180">`. Generated via `npx sharp-cli`.
- **CSS `@keyframes` animation not working on Safari**: Tried multiple approaches, none worked on Safari:
  1. Inline `<style>` tag with `@keyframes cp-bounce` + inline `style={{ animation: ... }}` — only first element animated
  2. Moved `@keyframes` to `index.css` with CSS classes (`.animate-cp-bounce`) — Tailwind v4 tree-shakes `@keyframes` not referenced by Tailwind utilities; worked after adding classes but still Safari-only issue
  3. Added `-webkit-` prefixes (`@-webkit-keyframes`, `-webkit-animation`, `-webkit-transform`) + `will-change: transform` — still not working on Safari
  4. Switched to Web Animations API (`element.animate()`) — current approach, needs Safari testing
  - **Root cause**: Safari renders some Unicode chess symbols as emoji/image glyphs rather than text glyphs, and `transform` doesn't apply to those. iPhone Safari: ♚♛ animate (text glyph), ♜♝♞ don't (emoji). Mac Safari: only ♚ animates. Chrome: all 5 animate. This is a font/emoji rendering difference across platforms — no CSS/JS workaround known.

### Stripe / Ko-fi Integration
- Ko-fi "Buy me a coffee" button in header, shown only on home page (`view === 'mode-select'`), not on problem-solving pages.
- Commerce Disclosure page (`TermsPage.tsx`) at `#/terms`: Business Name, Product/Service, Donations/Payments (USD via Stripe/Ko-fi), Refund Policy, Privacy Policy, Payment Security, Contact (Ko-fi only).
- "About & Terms" link on home page footer — keep small/subtle (`text-xs text-gray-400`). URL was submitted directly to Stripe for review.

### Stale Closure Bug in selectMode
- After `await loadGenre(genre)`, the captured `updateHash` callback references old `problemsByGenre` (empty). Fix: use `problems.findIndex()` directly and call `history.replaceState()` instead of `updateHash()`. Remove `updateHash` from `selectMode` dependency array.

### UI Components (Batch 3)
- **FilterPage** (`src/components/FilterPage.tsx`): Full-screen overlay for global filter settings. Stipulation multi-select pills, DualRangeSlider for pieces/year, theme tag cloud with search + Select all/Deselect all. Reset preserves sort settings.
- **HamburgerMenu** (`src/components/HamburgerMenu.tsx`): Right-side slide-in menu (solving view only). Contains: Problem List, Filters (with badge), Home. No genre switching — genres are separate.
- **GlobalFilters** interface: `keywords: string[]`, `stipulations: string[]`, `minPieces`, `maxPieces`, `minYear`, `maxYear`, `sortBy: 'difficulty' | 'year'`, `sortOrder: 'asc' | 'desc'`. Stored in localStorage (`cp-filters`) with migration from old `keyword: string` / `stipulation: string` formats.
- **Sort dropdown**: Located in ProblemList header (not on problem page). macOS-style button showing current sort (e.g., "Difficulty ▲▼"). Dropdown lists ascending/descending for each sort type.
- **Header layout**: Left = `<` back button (Home) + genre title + `?` help. Right = theme toggle + ☰ hamburger (solving view only).
- **Theme filter behavior**: `keywords: []` (empty) = no theme filtering (show ALL problems). Only filters when keywords are explicitly selected.
- **Theme hiding**: `showThemes` on ProblemCard is `false` during solving (prevents hints). Themes shown after solving in SolutionTree's `keywordTags`.
- **Info modal** (`i` button): Inline modal in App.tsx showing author, source, YACPDB link, stipulation, pieces, award, themes.
- **History page** (`src/components/HistoryPage.tsx`): Full-screen overlay showing solved/failed problems across ALL genres, grouped by date (Today, Yesterday, N days ago, Mon DD, Earlier). Accessible from hamburger menu. Clicking an entry navigates to the problem (cross-genre). Timestamps stored in `cp-timestamps` localStorage (`Record<string, number>`, key = `"genre:problemId"`).
- **Status filter in navigation**: `statusFilter` is part of `GlobalFilters` (not local ProblemList state). Applied in centralized `filteredProblems` useMemo so prev/next/random all respect the filter (e.g., Unsolved filter skips solved problems in navigation).
