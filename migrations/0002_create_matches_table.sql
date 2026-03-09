-- Migration 002: Create matches table
CREATE TABLE IF NOT EXISTS matches (
  id TEXT PRIMARY KEY NOT NULL,
  year INTEGER NOT NULL,
  round INTEGER NOT NULL,
  home_team_code TEXT,
  away_team_code TEXT,
  home_score INTEGER,
  away_score INTEGER,
  status TEXT NOT NULL DEFAULT 'Scheduled',
  scheduled_time TEXT,
  stadium TEXT,
  weather TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_matches_year ON matches(year);
CREATE INDEX IF NOT EXISTS idx_matches_year_round ON matches(year, round);
CREATE INDEX IF NOT EXISTS idx_matches_home_team ON matches(home_team_code);
CREATE INDEX IF NOT EXISTS idx_matches_away_team ON matches(away_team_code);
CREATE INDEX IF NOT EXISTS idx_matches_status ON matches(status);
