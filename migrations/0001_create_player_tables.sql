-- Migration 001: Create player statistics tables
-- Players table
CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  date_of_birth TEXT,
  team_code TEXT NOT NULL,
  position TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_players_team_code ON players(team_code);

-- Match performances table
CREATE TABLE IF NOT EXISTS match_performances (
  player_id TEXT NOT NULL REFERENCES players(id),
  match_id TEXT NOT NULL,
  season INTEGER NOT NULL,
  round INTEGER NOT NULL,
  team_code TEXT NOT NULL,
  tries INTEGER NOT NULL DEFAULT 0,
  goals INTEGER NOT NULL DEFAULT 0,
  tackles INTEGER NOT NULL DEFAULT 0,
  run_metres INTEGER NOT NULL DEFAULT 0,
  fantasy_points REAL NOT NULL DEFAULT 0,
  is_complete INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (player_id, match_id)
);

CREATE INDEX IF NOT EXISTS idx_mp_season ON match_performances(season);
CREATE INDEX IF NOT EXISTS idx_mp_team_season ON match_performances(team_code, season);
CREATE INDEX IF NOT EXISTS idx_mp_player_season ON match_performances(player_id, season);
CREATE INDEX IF NOT EXISTS idx_mp_season_round ON match_performances(season, round);
