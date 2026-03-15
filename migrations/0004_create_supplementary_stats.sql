-- Migration 004: Create supplementary stats table for Supercoach scoring
-- Stores the 8+ stats not available from nrl.com, fetched from nrlsupercoachstats.com
-- Data is immutable once a round completes — re-fetch only with force flag

CREATE TABLE IF NOT EXISTS supplementary_stats (
  player_name TEXT NOT NULL,
  season INTEGER NOT NULL,
  round INTEGER NOT NULL,
  last_touch INTEGER NOT NULL DEFAULT 0,
  missed_goals INTEGER NOT NULL DEFAULT 0,
  missed_field_goals INTEGER NOT NULL DEFAULT 0,
  effective_offloads INTEGER NOT NULL DEFAULT 0,
  ineffective_offloads INTEGER NOT NULL DEFAULT 0,
  runs_over_8m INTEGER NOT NULL DEFAULT 0,
  runs_under_8m INTEGER NOT NULL DEFAULT 0,
  try_saves INTEGER NOT NULL DEFAULT 0,
  kick_regather_break INTEGER NOT NULL DEFAULT 0,
  held_up_in_goal INTEGER NOT NULL DEFAULT 0,
  published_score INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (player_name, season, round)
);

CREATE INDEX IF NOT EXISTS idx_supp_season_round
  ON supplementary_stats(season, round);
