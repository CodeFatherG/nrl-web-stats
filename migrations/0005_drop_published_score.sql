-- Migration 005: Drop published_score column from supplementary_stats
-- Scores are now calculated from primary + supplementary stats, not scraped.
-- SQLite doesn't support DROP COLUMN before 3.35.0, so recreate the table.

CREATE TABLE supplementary_stats_new (
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
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (player_name, season, round)
);

INSERT INTO supplementary_stats_new (
  player_name, season, round,
  last_touch, missed_goals, missed_field_goals,
  effective_offloads, ineffective_offloads,
  runs_over_8m, runs_under_8m,
  try_saves, kick_regather_break, held_up_in_goal,
  created_at
)
SELECT
  player_name, season, round,
  last_touch, missed_goals, missed_field_goals,
  effective_offloads, ineffective_offloads,
  runs_over_8m, runs_under_8m,
  try_saves, kick_regather_break, held_up_in_goal,
  created_at
FROM supplementary_stats;

DROP TABLE supplementary_stats;
ALTER TABLE supplementary_stats_new RENAME TO supplementary_stats;

CREATE INDEX IF NOT EXISTS idx_supp_season_round
  ON supplementary_stats(season, round);
