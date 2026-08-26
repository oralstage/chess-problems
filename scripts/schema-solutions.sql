-- Schema for chess-problems-solutions (D1, binding: SOLUTIONS_DB)
-- Created 2026-08-26: solution_text was split out of chess-problems-db's
-- `problems` table because that DB hit the 500MB per-database free-tier cap.
-- One row per problem, same id as problems.id. problems.solution_text is
-- kept blank ('') after the migration's empty phase.
CREATE TABLE IF NOT EXISTS solutions (
  id INTEGER PRIMARY KEY,
  solution_text TEXT NOT NULL DEFAULT ''
);
