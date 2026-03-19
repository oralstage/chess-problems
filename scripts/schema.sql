-- Chess Problems D1 Schema
CREATE TABLE IF NOT EXISTS problems (
  id INTEGER PRIMARY KEY,
  fen TEXT NOT NULL,
  authors TEXT NOT NULL,        -- JSON array
  source_name TEXT NOT NULL DEFAULT 'Unknown',
  source_year INTEGER,
  stipulation TEXT NOT NULL,
  move_count INTEGER NOT NULL,
  genre TEXT NOT NULL,          -- direct, help, self, study, retro
  difficulty TEXT NOT NULL,
  difficulty_score REAL NOT NULL,
  piece_count INTEGER NOT NULL,
  solution_text TEXT NOT NULL,
  keywords TEXT NOT NULL DEFAULT '[]',  -- JSON array
  award TEXT NOT NULL DEFAULT ''
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_genre ON problems(genre);
CREATE INDEX IF NOT EXISTS idx_genre_difficulty ON problems(genre, difficulty_score);
CREATE INDEX IF NOT EXISTS idx_genre_year ON problems(genre, source_year);
CREATE INDEX IF NOT EXISTS idx_stipulation ON problems(stipulation);
CREATE INDEX IF NOT EXISTS idx_genre_stip ON problems(genre, stipulation);

-- Solve events: anonymous solve attempt tracking
CREATE TABLE IF NOT EXISTS solve_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  problem_id INTEGER NOT NULL,
  session_id TEXT NOT NULL,          -- browser UUID from localStorage
  dev INTEGER NOT NULL DEFAULT 0,    -- 1 if dev_mode flag was set
  correct INTEGER NOT NULL,          -- 1 = solved, 0 = gave up
  first_move TEXT,                   -- first move attempted (SAN)
  moves TEXT NOT NULL DEFAULT '[]',  -- JSON array of all moves attempted
  move_count INTEGER NOT NULL,       -- number of moves made
  time_spent INTEGER,                -- milliseconds from first move to solve/give-up
  excluded INTEGER NOT NULL DEFAULT 0, -- 1 = excluded from stats (admin)
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (problem_id) REFERENCES problems(id)
);

CREATE INDEX IF NOT EXISTS idx_solve_problem ON solve_events(problem_id);
CREATE INDEX IF NOT EXISTS idx_solve_session ON solve_events(session_id);
CREATE INDEX IF NOT EXISTS idx_solve_created ON solve_events(created_at);
CREATE INDEX IF NOT EXISTS idx_solve_excluded ON solve_events(excluded, dev);

-- Generic analytics events: flexible event tracking
CREATE TABLE IF NOT EXISTS analytics_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_name TEXT NOT NULL,            -- e.g. 'move_wrong', 'hint_used', 'session_start'
  problem_id INTEGER,                  -- nullable (not all events are problem-specific)
  session_id TEXT NOT NULL,            -- browser UUID
  dev INTEGER NOT NULL DEFAULT 0,      -- 1 if dev_mode flag was set
  data TEXT NOT NULL DEFAULT '{}',     -- JSON payload (flexible per event type)
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_analytics_event ON analytics_events(event_name);
CREATE INDEX IF NOT EXISTS idx_analytics_session ON analytics_events(session_id);
CREATE INDEX IF NOT EXISTS idx_analytics_created ON analytics_events(created_at);
CREATE INDEX IF NOT EXISTS idx_analytics_problem ON analytics_events(problem_id, event_name);
