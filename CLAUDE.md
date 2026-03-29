# Chess Problems

## ⚠️ Important Rules
- **本番サイトへのデプロイは絶対にユーザーの明示的な許可なしに行わないこと。** ビルドやステージングへのデプロイは可だが、本番（`--project-name=chess-problems`）は必ずユーザーに確認してから。

## Project
- URL: https://chess-problems.pages.dev/
- Stack: React 19 + TypeScript + Vite 7 + Tailwind CSS 4 + Cloudflare D1 + Pages Functions
- Dev server: port 5183
- Deploy: `npm run build && npx wrangler pages deploy dist --project-name=chess-problems`
- Data source: YACPDB (Yet Another Chess Problem Database)
- D1 Database (問題): `chess-problems-db` (ID: `3c2462f4-e342-48a8-807a-f40616066b02`)
- D1 Database (統計/本番): `chess-problems-stats` (ID: `00228378-19f2-4074-ba76-be8b5ebe0281`)
- D1 Database (統計/ステージング): `chess-problems-db-staging` (ID: `ea49673e-d115-4169-bce9-b74f4f632aae`)

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
| `GET /api/rated-problem?rating=X&sessionId=Y&dev=0\|1` | Matchmaking: random problem near player's rating, excluding solved |
| `POST /api/rating-event` | Submit solve result, updates player+problem Glicko-2 ratings |
| `GET /api/problem-rating?id=X&dev=0\|1` | Get a problem's current rating from problem_ratings |

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

### Rated Mode (Glicko-2)
- Player starts at rating 800, RD 350. Problems have initial ratings based on formula: `600 + (moveCount-2)*300 + pieceCount*50 + solutionComponent(0-50)`
- Scoring: perfect solve (no mistakes, no hints) = 1.0 (win), anything else = 0.0 (loss)
- Rating locks on first wrong move (score=0.0 immediately, show hint becomes available)
- `problem_ratings` and `rating_events` tables in STATS_DB, with `dev` column (0=prod, 1=staging)
- **All 398,325 direct mate problems pre-populated in `problem_ratings`** with initial ratings. No formula fallback — all matchmaking and display reads from this table only.
- Staging auto-detected by domain containing "staging" → `isDevMode()` returns true
- Matchmaking: reads from `problem_ratings` table. Range steps: ±50, ±100, ±150, ±200, ±250, ±300, ±400. Excludes already-solved problems via `solve_events`.
- Player rating stored in localStorage (`cp-player-rating`), problem ratings in D1
- **D1 binding limit**: D1 SQL has a 100-binding limit. Use literal IDs in `NOT IN` clauses (safe for numeric IDs) instead of parameterized bindings when excluding solved/rated problem IDs.
- **URL routing**: `#/rated/yacpdb/{id}` loads a specific problem in rated mode. `#/rated` (no ID) loads from cache or fetches random.
- **Cache persistence**: ModeSelector reads `cp-rated-problem` from localStorage before calling handleStartRated, passing cached problem ID to preserve the current problem across home navigation. Cache is NOT overwritten when opening specific problems (history/URL).
- **Back to Rated**: When viewing a non-cached problem in rated mode (from history/URL), "Back to Rated" button appears instead of "Next". Determined by comparing current problem ID with cached problem ID.
- **handleStartRated architecture**: Uses ref pattern (`handleStartRatedImpl` → `handleStartRatedRef` → stable `useCallback`) to avoid React StrictMode double-invocation issues. All internal functions (loadAndStartProblem, cacheProblem, updateHash, fetchAndStartRatedProblem) accessed via refs.

### Twin Problems
- Twin problems have multiple positions (a, b, c...) with modification instructions like `bKa7-->a6`
- `parseTwins()` in solutionParser.ts extracts all twins, applies FEN modifications (move `-->`, add `+`, remove `-`), and parses each twin's solution tree
- `+b)` = cumulative change from previous twin's FEN, `b)` (no +) = change from original FEN
- Solving uses a) only. After solve/give-up, Solution section shows twin navigation buttons (a, b, c...) to view all twin positions and solutions
- ~3,285 twin problems have no position change in a) (diagram as-is), ~3,874 have position changes
- Some twin formats not yet supported: `rotate`, `shift`, short forms like `Q -> g7`

### Classic B&W Diagram Mode
- Toggle via printer icon in Header (next to theme toggle), only shown during solving view
- `classicMode` prop on Board.tsx → wraps board div with `.board-classic` class
- CSS in index.css: `.board-classic [data-square-color="black"]` → white bg + SVG diagonal hatch (10px spacing), `[data-square-color="white"]` → plain white
- Pieces get white outline via `filter: drop-shadow(...)` (8 directions)
- Coordinate labels (a-h, 1-8) forced black with white `text-shadow` outline
- `!important` needed everywhere to override react-chessboard inline styles
- Auto-resets to normal mode when navigating back to home (`goBack`)
- Hatch density adjustable via SVG `width`/`height` and `background-size` in CSS

### solutionParser.ts (most bug-prone)
- Parenthesized threats `(2.Rd1#)` and bracket threats `[2.Qf7#]` must be extracted BEFORE splitting on move numbers (`\d+\.`), otherwise the regex breaks the content inside parens.
- Try/key filtering: YACPDB solutions include "tries" (wrong moves marked with `?`) before the key move (`!`). Parser filters root nodes to keep only `isKey && color === firstMoveColor`.
- Threat nodes use the SAME color as the parent (attacker's follow-up), not the opposite color.
- **`isThreat` vs `hasThreatLabel`**: `isThreat` means this segment IS a threat move (from parens like `(2.Rd1#)`). `hasThreatLabel` means this segment's CHILDREN are threats (e.g., `1.f4 ! threat:`). Previously `1.f4 ! threat:` set `isThreat=true` on the key move itself, causing wrong color assignment (key move was treated as a threat continuation inheriting parent's color, but stack was empty so it got `firstMoveColor` wrong for `#2` problems where `firstMoveColor='w'`). Fix: separate the two flags.
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
- No move count limit in fetch script — all move counts collected. Filter via UI Moves slider.
- `#0` excluded (proof positions). YACPDB `stipulation` field can be non-string — `parseStipulation()` guards with `typeof stip !== 'string'`.
- Cache in `scripts/.cache/` stores raw YACPDB API responses (~545k+ entries)
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

### Staging / Production Workflow
- **Staging**: `npx wrangler pages deploy dist --project-name=chess-problems-staging` (https://chess-problems-staging.pages.dev/)
- **Production**: `npx wrangler pages deploy dist --project-name=chess-problems` (https://chess-problems.pages.dev/)
- Always deploy to staging first. Only deploy to production after user confirms.
- On production deploy, update `CHANGELOG` array in `src/components/ChangelogPage.tsx` with user-facing summary.
- GitHub: https://github.com/oralstage/chess-problems (public). `git push` after commits.

### New API Endpoints
| Endpoint | Purpose |
|----------|---------|
| `GET /api/search?author=X&limit=N` | Search problems by author name (partial match, all genres) |
| `POST /api/solve-event` | Record solve attempt (correct/give-up) with moves and timing |
| `GET /api/solve-stats/:id` | Per-problem solve statistics (accuracy, common moves) |
| `POST /api/analytics` | Batch insert analytics events |
| `GET /api/site-stats` | Aggregate site stats (solvers, problems solved) |
| `GET/POST /api/admin/solve-events` | Admin: list/exclude/delete sessions (Bearer auth) |

### New Components (2026-03-18)
| Component | Purpose |
|-----------|---------|
| `src/components/SearchPage.tsx` | Full-screen author search with mini boards, genre filter, sort |
| `src/components/BookmarksPage.tsx` | Full-screen bookmarks list with mini boards |
| `src/components/ChangelogPage.tsx` | "What's new" page linked from home footer |

### Category System (2026-03-18)
- `Category` type in `types.ts`: UI-level subcategories (twomover, threemover, moremover, help2, help3, helpmore, self, study, retro)
- `CATEGORY_DEFS` array defines title, brief, genre mapping, and move count filters
- `currentCategory` state in App.tsx (localStorage persisted) — determines move count filter and hash URL
- Accordion ModeSelector with expandable groups (Direct Mates, Helpmates)
- Stats API returns `moveCounts` per genre for accurate category counts

### Retro Black-to-Move (2026-03-18)
- Detection in `ensureSolution()`: `{Black to move}`, `{(illegal}`, leading `....` or `1...` notation
- FEN turn flipped to `b` in `ensureSolution()` and detected in `useProblem.ts` via `fenTurn`
- "Black to move" shown after solving only (red text, no box) — deducing whose turn is part of the puzzle
- `fixEnPassantFen` updated to handle retro h# (black first move)

### Stale Closure Bug in selectMode
- After `await loadGenre(genre)`, the captured `updateHash` callback references old `problemsByGenre` (empty). Fix: use `problems.findIndex()` directly and call `history.replaceState()` instead of `updateHash()`. Remove `updateHash` from `selectMode` dependency array.

### UI Components (Batch 3)
- **FilterPage** (`src/components/FilterPage.tsx`): Full-screen overlay for global filter settings. Stipulation multi-select pills, DualRangeSlider for pieces/year, theme tag cloud with search + Select all/Deselect all. Reset preserves sort settings.
- **HamburgerMenu** (`src/components/HamburgerMenu.tsx`): Right-side slide-in menu (solving view only). Contains: Problem List, Filters (with badge), Home. No genre switching — genres are separate.
- **GlobalFilters** interface: `keywords: string[]`, `stipulations: string[]`, `minPieces`, `maxPieces`, `minYear`, `maxYear`, `minMoves`, `maxMoves`, `sortBy: 'difficulty' | 'year'`, `sortOrder: 'asc' | 'desc'`. Stored in localStorage (`cp-filters`) with migration from old `keyword: string` / `stipulation: string` formats.
- **Sort dropdown**: Located in ProblemList header (not on problem page). macOS-style button showing current sort (e.g., "Difficulty ▲▼"). Dropdown lists ascending/descending for each sort type.
- **Header layout**: Left = `<` back button (Home) + genre title + `?` help. Right = theme toggle + ☰ hamburger (solving view only).
- **Theme filter behavior**: `keywords: []` (empty) = no theme filtering (show ALL problems). Only filters when keywords are explicitly selected.
- **Theme hiding**: `showThemes` on ProblemCard is `false` during solving (prevents hints). Themes shown after solving in SolutionTree's `keywordTags`.
- **Info modal** (`i` button): Inline modal in App.tsx showing author, source, YACPDB link, stipulation, pieces, award, themes.
- **History page** (`src/components/HistoryPage.tsx`): Full-screen overlay showing solved/failed problems across ALL genres, grouped by date (Today, Yesterday, N days ago, Mon DD, Earlier). Accessible from hamburger menu. Clicking an entry navigates to the problem (cross-genre). Timestamps stored in `cp-timestamps` localStorage (`Record<string, number>`, key = `"genre:problemId"`).
- **Status filter in navigation**: `statusFilter` is part of `GlobalFilters` (not local ProblemList state). Applied in centralized `filteredProblems` useMemo so prev/next/random all respect the filter (e.g., Unsolved filter skips solved problems in navigation).

### Progressive Loading & Filter UX (Batch 4)
- **Progressive loading**: `fetchAllProblems` fetches all genre problems in paginated batches (5000 per page) with `onProgress` callback. UI shows partial results immediately while remaining pages load in background. `genreLoaded[genre]` tracks completion; data stays in memory until page reload.
- **API pageSize max**: Increased from 1000 to 5000 in `functions/api/problems.ts` for fewer round trips.
- **Filter Done behavior**: `filterOpenedFrom` state tracks context ('problemList' | 'hamburger'). From ProblemList → FilterPage → Done returns to ProblemList. From problem page (hamburger) → FilterPage → Done navigates to first matching problem if current problem doesn't match new filters.
- **FilterPage hit count**: Real-time `matchCount` computed via useMemo, displayed on Done button (`Done · 1,234 problems`).
- **YACPDB ID as problem number**: Problem numbers use YACPDB IDs directly (`#243207`) instead of sequential indices. Stable across filters/sorts. Removed redundant `YACPDB #ID` line from ProblemCard.
- **Green color scheme**: All active filter pills, pagination, genre badges unified to green (`bg-green-700 text-white`).
- **fullSolutionTree**: `parseSolution()` returns all nodes including tries. `filterKeyMoves()` extracts key-only nodes for solving. `ChessProblem` has both `solutionTree` (key moves for solver) and `fullSolutionTree` (all variations including tries for display). SolutionTree "All variations" uses `fullSolutionTree`. Try moves shown with `?` marker.

### Solution Display & Variations (Batch 5)
- **Slash alternatives expansion**: YACPDB notation uses `/` for alternative moves (e.g., `1...Rg3/Rxg4 2.O-O-O#`). `expandSlashAlternatives()` in `solutionParser.ts` pre-processes lines before parsing — splits into separate lines per alternative with shared continuation. `/` followed by a move number (e.g., `/2.`) is a full variation split (NOT expanded); `/` without is alternative moves at the same level.
- **Castling rights detection**: `fixCastlingRights()` in `api.ts` uses negative lookbehind+lookahead regex to distinguish O-O from O-O-O: `(?<!O-)(?<!0-)\b(O-O(?!-O)|0-0(?!-0))\b`. Without this, clicking O-O-O castling moves in variations didn't work.
- **Active node highlighting**: Clicking a move in Key Variations or Tries highlights it with green background (`bg-cp-primary text-white`). `activeNode` state in SolutionTree tracks the currently clicked node. Resets when leaving exploring mode.
- **Variation line-break display**: Key Variations and Tries show each defense on its own indented line (instead of inline with `/` separators). Single-line variations stay inline. Refutations shown on separate line with `↳ but` prefix.
- **Tries/Key open by default**: `<details open>` on Tries and Key Variations sections so they're expanded on load.
- **Root-level refutation fix**: `v.refutation.moves.slice(1)` returned empty for root-level refutations (only 1 element). Fixed with conditional: check if first node equals rootNode before slicing.
- **loadedProblemIdRef guard**: Ref-based guard in `App.tsx` prevents late async callbacks (from `ensureSolution` or `loadGenre`) from resetting problem state when user navigates quickly between problems. Fixes intermittent "try again" reset bug.

### Quick-Start Fix (2026-03-18)
- **Bug**: `selectMode` quick-start fetches 1 problem from API immediately. If the API call fails (e.g. local dev where `/api/problems` returns HTML), the catch block fell through to the "genre already loaded" path — but `genreData[genre]` was empty (loadGenre was never called), leaving the UI stuck on "Loading problems..." forever.
- **Fix**: Restructured `selectMode` to track `quickStarted` success flag. On success: load genre in background, return. On failure: fall through to `await loadGenre(genre)` to properly load all data before finding the next unsolved problem.
- **Production behavior**: Quick-start succeeds → problem shows instantly → background load doesn't replace it (confirmed via staging).

### Daily Problem Navigation (2026-03-18)
- **Issue**: Daily problem (from `/api/daily`) has no genre context loaded, so Next/Random buttons don't work after solving.
- **Fix**: Added `isDaily` state flag. Set `true` in `handleSolveDaily`, cleared in `goBack`/`selectMode`.
- When `isDaily=true`, FeedbackPanel hides Next/Random and instead shows:
  - **Home** button → returns to ModeSelector
  - **More Twomovers →** button → calls `handleDailyMore` to enter #2 category
- Solving state also hides Next/Random when daily (only Show Hint + Give Up shown).
- `handleDailyMore` defined after `selectMode` (avoids forward reference error).
- Daily API currently only returns `#2` direct mates; if expanded to other genres, update `moreCategoryLabel` dynamically based on problem's genre/moveCount.
- **`handleDailyMore` resume logic**: When genre data is loaded, resumes from saved `currentProblemId['twomover']` position (not from the start). Falls back to first unsolved problem. Excludes daily problem ID from selection. When genre data not loaded, calls `selectMode('twomover')` (no `skipSavedId` — daily ID is stored under `currentProblemId.direct`, not `twomover`).
- **Daily problem date sync**: `/api/daily` accepts `?date=YYYY-MM-DD` query param (client's local date). Client sends its local date so the problem matches the displayed "Daily Problem — Mar 19" label. Without this, UTC vs local timezone mismatch caused the date label to change before the problem did.

### Instant Board Display & API Fallback (2026-03-19)
- **Instant board**: `loadAndStartProblem` now shows the board (FEN) immediately even before solutionText is fetched. Shows "Loading..." in FeedbackPanel; Hint/Give Up hidden until solution loads. Move attempts blocked while solutionTree is empty.
- **API fallback for Next/Random**: When `filteredProblems` is empty (genre data still loading in background), `handleNextProblem`/`handleRandomProblem`/`handleNavProblem` fall back to `fetchRandomFromApi()` which fetches a random problem directly via API (`fetchProblemsPage` with random offset).
- **`clearProblem`**: Added to `useProblem` hook — resets state to idle with no problem, showing loading animation.

### Progress Auto-Save & History Fix (2026-03-19)
- **Auto-save on solve**: `useEffect` watches `problem.status` — when it becomes `'correct'`, progress is immediately saved as `'solved'` in localStorage. Previously progress was only saved when clicking Next, so the problem list showed ✗ for solved problems.
- **Random skips solved**: `handleRandomProblem` filters out already-attempted problems (solved or failed). Falls back to full pool if all problems are attempted.
- **History page fix**: `HistoryPage` no longer requires `genreLoaded[genre]` to display entries. Shows all progress entries immediately; lazy-fetches problem details (FEN, author) from API for entries without genre data loaded. Shows placeholder (♚ icon) while fetching.

### Lightweight Index Architecture & Performance Overhaul (2026-03-19)

#### 問題: 全データロードが遅く、UXを壊していた
- ジャンル選択時に全問題データ（FEN、著者、出典など含む53k件）を一括取得 → 数秒かかる
- バックグラウンドロード完了時に解いている問題が勝手に切り替わる
- History/Bookmarksを開くたびにサムネが再ロード
- リロードのたびに全データ再取得

#### 試行錯誤の過程
1. **プログレッシブ表示を削除** → 全ページ揃うまで何も表示されなくなり逆効果。元に戻した
2. **Cache API導入** (`cachedFetch`) → APIレスポンスをブラウザのCache APIに保存。リロード後はネットワーク不要。`fetchAllProblems`と`fetchProblem`の両方に適用
3. **History/Bookmarksの個別fetchをモジュールレベルキャッシュに** → コンポーネントの開閉でキャッシュが消える問題を解決。ただしリロードで消える
4. **genreData全取得をやめてgenreIndexに** → `/api/problems/ids`（IDとstipulationだけ）を先に取得し、フルデータはバックグラウンド。しかしProblemListが空になる問題発生
5. **stubフォールバック** → `genreIndex`からダミーの`ChessProblem`を生成してProblemListに渡す。IDとstipulationだけで問題リストは表示可能
6. **History/Bookmarksのサムネを並列fetch** → `Promise.all`で全件同時取得。順次→並列で劇的高速化

#### 最終アーキテクチャ
- **ジャンル選択時**: `/api/problems/ids`（ID+stipulation、軽量）を一発で取得 → 問題リスト即表示
- **個別問題表示**: `/api/problems/:id`でcachedFetch → FEN・著者・解答を1件だけ取得（Cache APIで永続化）
- **フルデータ**: バックグラウンドで`fetchAllProblems` → フィルタリング用（完了しなくても基本機能は動く）
- **History/Bookmarks**: progressのID一覧を即表示 → サムネはバッチAPI（`POST /api/problems/batch`）で1リクエスト取得
- **問題の上書き防止**: `loadedProblemIdRef`ガードを`!loadedProblemIdRef.current`に変更。すでに問題が表示されていたらバックグラウンドロードで絶対に上書きしない

#### History/Bookmarksサムネ取得のバグ修正過程
1. **直列fetch（元）**: 37件を1件ずつ順番に取得 → 各リクエストの往復時間が積み重なり非常に遅い
2. **並列fetch（`Promise.all`）**: 37件同時リクエスト → D1の同時接続制限に引っかかり1分以上かかる
3. **バッチAPI**: `POST /api/problems/batch` で1リクエスト・1クエリ（`WHERE id IN (...)`）→ 高速
4. **スタブ問題**: `genreIndex`からFEN空のスタブが`e.problem`に入るため`!e.problem`がfalseになりfetchが走らない → `!e.problem.fen`チェックを追加
5. **useMemo再計算されない問題**: `metaCache`はモジュールレベルMapなのでuseMemoのdepsに入らない。`forceUpdate()`でre-renderしても`entries`が古いまま → `useReducer`のカウンタ`cacheVersion`をuseMemoのdepsに追加して解決

#### 既知のバグ（未修正）
- **D415097 threat-only playback**: `getMainLine`がthreat(`2.b5`)を選びプレイバックが白のみ2手になる。原因はsolutionParserがdefense(`1...a4`)をthreatの子ノードとして構築するため`nonThreat`フィルタに引っかからない。インデント/stack復元ロジック（`stackDepthBeforeThreat`）のバグ。Key variationsの表示自体は正しい（`1...a4 2.b5`等）。

#### その他の修正
- **デプロイルール**: CLAUDE.mdに「本番デプロイはユーザー許可必須」を追記
- **Daily Problem日付同期**: `/api/daily`にクライアントのローカル日付を`?date=YYYY-MM-DD`で送信。UTC→ローカルのズレを解消
- **Bookmark遷移バグ**: `handleHistorySelect`を`async`→同期に変更。`await loadGenre`で永遠に待つ問題を解消
- **`/api/problems/ids`エンドポイント拡張**: `stipulation`フィールドを追加（問題リストのバッジ表示用）

### Anonymous Solve Tracking & Analytics (2026-03-19)
- **solve_events**: 問題の正解/give-upを記録。problemId, sessionId, correct, firstMove, moves(JSON), moveCount, timeSpent, country
- **analytics_events**: 全ユーザーインタラクションをバッチ記録。move_correct, move_wrong, hint_used, problem_started, problem_solved, problem_gave_up, bookmark_added/removed, session_start等
- **Session ID**: ブラウザごとにUUID生成、localStorage(`cp-session-id`)で永続化
- **Dev mode**: `localStorage.setItem('cp-dev-mode', '1')`で全イベントに`dev: 1`フラグ。後から統計除外可能
- **Event batching**: `trackEvent()`は3秒バッファ、`navigator.sendBeacon`でページ離脱時も送信
- **Dedup**: `sessionStorage`で同一問題のsolve_event重複送信を防止
- **Rate limiting**: IP単位（solve-event: 60/min, analytics: 120/min）
- **Admin API**: `POST /api/admin/solve-events`でsession単位のイベント除外/削除。Bearer token認証
- **SolveStatsPanel**: 問題解答後に表示。accuracy, 平均時間, common first moves, common wrong first moves

### Site Stats on Home Page (2026-03-19)
- **表示**: solvers(左) + problems solved(右)、緑色の大きな数字(`text-4xl sm:text-5xl`)
- **カウント方法**: `analytics_events`の`move_correct`/`move_wrong`イベントから`COUNT(DISTINCT problem_id)` — 一手でも動かした問題をカウント
- **キャッシュ**: 1分（`Cache-Control: max-age=60`）
- **プライバシー通知**: フッターに「Anonymous usage data is collected to improve the site. No personal information is stored.」

### DB分離 (2026-03-19)
- **問題データ**: `DB` binding → `chess-problems-db` (ID: `3c2462f4-e342-48a8-807a-f40616066b02`)
- **統計データ(本番)**: `STATS_DB` binding → `chess-problems-stats` (ID: `00228378-19f2-4074-ba76-be8b5ebe0281`)
- **統計データ(ステージング)**: `STATS_DB` binding → `chess-problems-db-staging` (ID: `ea49673e-d115-4169-bce9-b74f4f632aae`)
- `wrangler.toml` = 本番用（STATS_DB → chess-problems-stats）
- `wrangler-staging.toml` = ステージング用（STATS_DB → chess-problems-db-staging）
- ステージングデプロイ時: `cp wrangler.toml wrangler.toml.bak && cp wrangler-staging.toml wrangler.toml && npx wrangler pages deploy dist --project-name=chess-problems-staging && cp wrangler.toml.bak wrangler.toml && rm wrangler.toml.bak`
- `scripts/schema.sql` = 問題テーブルのみ、`scripts/schema-stats.sql` = 統計テーブルのみ
- **国コード記録**: `CF-IPCountry`ヘッダーからsolve_events/analytics_eventsに自動記録

### Solve Statistics Modal (2026-03-21)
- **統計ボタン**: 解答後に右上にバッジ付きアイコン（解かれた回数）で表示。`totalAttempts > 0` またはmoves triedデータがあれば表示
- **表示内容**: Solved回数、ユニークSolvers数、手番ごとのMoves tried（正解手は緑太字）
- **データソース**: solve_eventsから`totalAttempts`/`uniqueSolvers`、analytics_eventsの`move_correct`/`move_wrong`からmovesByNumber
- **solve_events追加フィールド**: `hint_used`, `wrong_move_count`, `genre`, `stipulation`

### Progress判定変更 (2026-03-21)
- **solved**: ヒントなし、一回も間違えず、初見で正解した場合のみ（`wrongMoveCount === 0 && !hintUsed && correct`）
- **failed**: 間違えた、ヒントを使った、give upした — 全部failed
- **ダウングレードなし**: 一度solvedになったらfailedにならない
- **マイグレーション**: 起動時に`/api/my-progress`からsolve_eventsを取得し、過去の不正な`solved`を`failed`に修正（1回のみ、`cp-progress-migrated`フラグ）

### Daily Problem Archive (2026-03-21)
- **DailyHistoryPage**: 過去のdaily問題一覧（2026-03-15〜今日）。バーガーメニューからアクセス
- **ナビゲーション**: Previous / Next ボタン、All daily problems ボタン
- **URL**: `#/daily/YYYY-MM-DD` でリロード対応
- **solve_eventsのsource**: `'daily'` フラグで通常solveと区別

### Site Stats 3カラム (2026-03-21)
- **表示**: SOLVERS / PROBLEMS / TIMES SOLVED の3つ
- **PROBLEMS**: `COUNT(DISTINCT problem_id)` from analytics_events（一手でも動かした問題数）
- **TIMES SOLVED**: `COUNT(*)` from analytics_events problem_started（途中離脱含む）

### Try手の除外修正 (2026-03-21)
- **バグ**: キャッシュ復元パスで`filterKeyMoves`が欠けていて、tryを含む全ノードが`solutionTree`に入っていた
- **修正**: `cacheProblem`時に`fullSolutionTree`を保存し、復元時に`filterKeyMoves`を適用

### Truncated Solution対応 (2026-03-21)
- **問題**: solutionTextが1手しかない問題（YACPDB データ不足）でボタンがLoading...のまま
- **修正**: `solutionLoading`を`!solutionText && !solutionTree`に変更。空のsolutionTreeでもボタン表示
- **1手解答**: solutionが1手しかない場合、その手を指した時点で正解（solved）にする

### German Notation対応 (2026-03-21)
- `=D` (Dame) → Queen promotion として認識。solutionParser/algebraicToFenで対応

### theme-color (2026-03-21)
- **iOS Safari**: Safari 26で`theme-color`メタタグ廃止。`html`のbackground-colorから自動取得
- **対応**: `index.css`で`html`/`html.dark`にbackground-color設定（`#f9fafb`/`#030712`）
- **`useTheme.ts`**: テーマ切替時に`theme-color`メタタグも動的更新（古いSafari向け）

### 初回表示の未解答問題スキップ (2026-03-21)
- **selectMode**: カテゴリ初回進入時、`solved`/`failed`の問題をスキップして未解答問題を表示
- **フィルター変更時**: Done後も未解答問題にジャンプ

### Daily Problem Archive & Navigation (2026-03-19)
- **DailyHistoryPage**: ハンバーガーメニューからアクセス。過去のdaily problems一覧（2026-03-15〜）
- **`/api/daily/history`**: 過去N日分のdaily problem IDを一括計算・取得
- **`#/daily/YYYY-MM-DD`**: URL永続化。リロードしてもdailyとして復元
- **Previous/Next**: 問題ヘッダーの< >ボタンで前後の日に移動、FeedbackPanelにもPrevious/Nextボタン

### Progress判定の修正 (2026-03-20)
- **solved**: ヒントなし・ノーミス（`wrongMoveCount === 0 && !hintUsed`）で正解した場合のみ
- **failed**: 間違いあり、ヒント使用、give upのすべて。間違えた後に正解しても`failed`
- 一度`solved`になった問題は`failed`にダウングレードしない
- **フィルター変更後**: 未解答問題を優先的に表示（solvedとfailedをスキップ）

### Solve Statistics Modal (2026-03-20)
- **統計アイコン**: 解答後に右上に📊アイコン表示。データがあるときのみ（`analytics_events`に`move_correct`/`move_wrong`があれば）
- **バッジ**: solvedの回数を赤バッジで表示
- **モーダル内容**: Solved回数、Solvers（ユニーク）、Moves tried（手番ごと、正解手は緑太字）
- **Moves tried**: `analytics_events`の`move_correct`/`move_wrong`を`moveNumber`別に集計

### Truncated Solution対応 (2026-03-20)
- **`=D`（ドイツ語表記）**: Queen promotionとして認識。`normalizeMove`で`=D`→`=Q`に変換
- **solutionが1手のみ**: 1手指した時点で正解扱い。以降はplaybackの矢印で進められる
- **solutionTree空**: `solutionLoading`判定を`!solutionText && !solutionTree`に変更。パース済みだが空の場合もボタン表示

### selectMode初回進入時のunsolved優先 (2026-03-20)
- カテゴリ選択時、既にsolved/failedの問題をスキップして最初の未解答問題を表示
- `genreProgress[id] !== 'solved' && genreProgress[id] !== 'failed'`でフィルタ
- **DAILY PROBLEM — MAR 19**: 日付ラベルをボード上部に表示（isDaily時のみ）
- **`fetchDailyByDate(date)`**: 特定日のdaily problemを取得するAPI関数

### Solve Statistics Modal (2026-03-19)
- **統計ボタン**: `i`ボタンの隣に棒グラフアイコン（解答後、データありの場合のみ表示）
- **赤バッジ**: uniqueSolvers数を表示。solve_eventsなしでanalytics_eventsのみの場合は赤丸のみ
- **モーダル内容**: Solved（回数）、Solvers（ユニーク数）、First moves tried（初手の試行統計）
- **正解手は緑**: `correct`フラグで判定（`move_wrong`が0件の手のみ正解扱い）
- **`useSolveStats`フック**: problemIdからstats取得。`SolveStatsModal`コンポーネントで表示
- **solve_events追加フィールド**: `hint_used`, `wrong_move_count`, `genre`, `stipulation`
- **solve-stats API拡張**: `uniqueSolvers`, `hintUsedCount`, `avgWrongMoves`, `allTriedMoves`, `movesByNumber`（手番ごとの試行統計、correct/wrongフラグ付き）

### Threat Display Fix (2026-03-19)
- **solutionParser修正**: `isThreatParent`フラグを1回でクリアせず維持。`!seg.isBlackNum`でdefenseとthreatを区別
- **getMainLine修正**: 全子がthreatの場合はkey moveで停止（Key variationsから探索）
- **影響**: D415097等のthreat-only問題でSolution表示が `1.Qa3 b5#` → `1.Qa3!` のみに改善

### Skip Solved Problem on Category Enter (2026-03-19)
- `selectMode`で保存されたproblemIdが`solved`の場合、次の未解決問題にスキップ

### German Notation Support (2026-03-19)
- **`normalizeGerman()`**: D→Q (Dame), T→R (Turm), L→B (Läufer), S→N (Springer)
- 正規表現（LONG_RE, ANY_MOVE_RE）にもDTL文字を追加
- `normalizePiece()`も全ドイツ語駒文字に対応

### Truncated Solution Handling (2026-03-19)
- solution treeのノードにchildrenがなければ即solved（`movesRemaining`チェック削除）
- D180848等のYACPDBデータ不完全問題で、初手が合えば正解として扱う
- その後はAnalyze（Stockfish）で検討可能

### Beginner's Guide Book Promo Banner (2026-03-27)
- **バナー**: ランディングページ上部に「New to chess problems? Get the beginner's guide on Kindle」バナー追加
- **リンク先**: Amazon Kindle (`B0GV27N3RM`)
- **スタイル**: ダークモード対応（`bg-amber-900/30 border-amber-700/50`）、ライトモード（`bg-amber-50 border-amber-200`）
- **コンポーネント**: `ModeSelector.tsx` 内、タイトル上部に配置

### Daily Problem Author Name Overflow Fix (2026-03-27)
- **問題**: 作者名が長い場合にSolveボタンがはみ出る
- **修正**: 左側コンテナに`min-w-0`、"Mate in X"・区切り・Solveボタンに`shrink-0`を追加
- **効果**: 長い作者名がtruncateで切れ、Solveボタンが常に表示される

### Known Issues
- **不完全なsolutionText**: 一部問題でYACPDBのsolutionTextが途中までしかない（例: D180848 #4で1手のみ）。初手正解で即solved扱い
