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
  -- Blank since 2026-08-26: solution texts moved to the chess-problems-solutions
  -- DB (schema-solutions.sql) when this DB neared the 500MB per-database cap.
  -- The column stays (dropping it would rewrite the whole table) but every row
  -- holds '' and all readers go through SOLUTIONS_DB with this as fallback.
  solution_text TEXT NOT NULL,
  keywords TEXT NOT NULL DEFAULT '[]',  -- JSON array
  award TEXT NOT NULL DEFAULT ''
);

-- Indexes for common queries
-- idx_genre / idx_stipulation / idx_problems_fairy were dropped 2026-08-26:
-- redundant prefixes of the composite indexes below, and the DB was at the
-- 500MB free-tier ceiling.
CREATE INDEX IF NOT EXISTS idx_genre_difficulty ON problems(genre, difficulty_score);
CREATE INDEX IF NOT EXISTS idx_genre_year ON problems(genre, source_year);
-- Category quick-start: genre + exact move_count in difficulty order.
CREATE INDEX IF NOT EXISTS idx_genre_moves_diff ON problems(genre, move_count, difficulty_score);
CREATE INDEX IF NOT EXISTS idx_genre_stip ON problems(genre, stipulation);
