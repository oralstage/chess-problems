-- Chess Problems Stats Schema (solve events + analytics)
CREATE TABLE IF NOT EXISTS solve_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  problem_id INTEGER NOT NULL,
  session_id TEXT NOT NULL,
  dev INTEGER NOT NULL DEFAULT 0,
  correct INTEGER NOT NULL,
  first_move TEXT,
  moves TEXT NOT NULL DEFAULT '[]',
  move_count INTEGER NOT NULL,
  time_spent INTEGER,
  excluded INTEGER NOT NULL DEFAULT 0,
  hint_used INTEGER NOT NULL DEFAULT 0,
  wrong_move_count INTEGER NOT NULL DEFAULT 0,
  genre TEXT NOT NULL DEFAULT '',
  stipulation TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_solve_problem ON solve_events(problem_id);
CREATE INDEX IF NOT EXISTS idx_solve_session ON solve_events(session_id);
CREATE INDEX IF NOT EXISTS idx_solve_created ON solve_events(created_at);
CREATE INDEX IF NOT EXISTS idx_solve_excluded ON solve_events(excluded, dev);

CREATE TABLE IF NOT EXISTS analytics_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_name TEXT NOT NULL,
  problem_id INTEGER,
  session_id TEXT NOT NULL,
  dev INTEGER NOT NULL DEFAULT 0,
  data TEXT NOT NULL DEFAULT '{}',
  country TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_analytics_event ON analytics_events(event_name);
CREATE INDEX IF NOT EXISTS idx_analytics_session ON analytics_events(session_id);
CREATE INDEX IF NOT EXISTS idx_analytics_created ON analytics_events(created_at);
CREATE INDEX IF NOT EXISTS idx_analytics_problem ON analytics_events(problem_id, event_name);

-- Latest player Glicko-2 rating per session — written on each rating event,
-- so the Sync feature can read it directly instead of replaying all events.
CREATE TABLE IF NOT EXISTS player_ratings (
  session_id TEXT NOT NULL,
  dev INTEGER NOT NULL DEFAULT 0,
  rating REAL NOT NULL,
  rd REAL NOT NULL,
  volatility REAL NOT NULL,
  solve_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (session_id, dev)
);

-- Bookmarks: synced across devices via session_id
CREATE TABLE IF NOT EXISTS bookmarks (
  session_id TEXT NOT NULL,
  genre TEXT NOT NULL,
  problem_id INTEGER NOT NULL,
  dev INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (session_id, genre, problem_id, dev)
);

CREATE INDEX IF NOT EXISTS idx_bookmarks_session ON bookmarks(session_id, dev);

-- Review Mode (FSRS-4.5) state per problem per session
CREATE TABLE IF NOT EXISTS review_state (
  session_id TEXT NOT NULL,
  problem_id INTEGER NOT NULL,
  dev INTEGER NOT NULL DEFAULT 0,
  stability REAL NOT NULL,
  difficulty REAL NOT NULL,
  is_new INTEGER NOT NULL DEFAULT 1,
  due_date TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (session_id, problem_id, dev)
);

CREATE INDEX IF NOT EXISTS idx_review_state_session ON review_state(session_id, dev);
