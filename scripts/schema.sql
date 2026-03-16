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
