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
