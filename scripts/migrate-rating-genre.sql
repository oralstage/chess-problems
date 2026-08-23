-- Split the rated pools by genre (direct / self / help).
--
-- Every row that exists today was written by the direct-mate rated mode, so the
-- 'direct' default is a statement of fact, not a guess — no existing row changes
-- meaning. ADD COLUMN does not rewrite rows in SQLite; only player_ratings has to
-- be recreated, because its PRIMARY KEY has to grow and SQLite cannot alter one.
--
-- Before running this against production, dump player_ratings first:
--   npx wrangler d1 execute chess-problems-stats --remote \
--     --command "SELECT * FROM player_ratings" --json > player_ratings.backup.json

ALTER TABLE problem_ratings ADD COLUMN genre TEXT NOT NULL DEFAULT 'direct';
ALTER TABLE rating_events   ADD COLUMN genre TEXT NOT NULL DEFAULT 'direct';

-- Matchmaking picks candidates with WHERE dev = ? AND genre = ? AND rating BETWEEN ?
CREATE INDEX IF NOT EXISTS idx_problem_ratings_pool ON problem_ratings(dev, genre, rating);

CREATE TABLE player_ratings_new (
  session_id  TEXT NOT NULL,
  dev         INTEGER NOT NULL DEFAULT 0,
  genre       TEXT NOT NULL DEFAULT 'direct',
  rating      REAL NOT NULL,
  rd          REAL NOT NULL,
  volatility  REAL NOT NULL,
  solve_count INTEGER NOT NULL DEFAULT 0,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (session_id, dev, genre)
);

INSERT INTO player_ratings_new (session_id, dev, genre, rating, rd, volatility, solve_count, updated_at)
  SELECT session_id, dev, 'direct', rating, rd, volatility, solve_count, updated_at FROM player_ratings;

DROP TABLE player_ratings;
ALTER TABLE player_ratings_new RENAME TO player_ratings;
