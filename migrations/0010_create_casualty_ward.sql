-- Migration: Create casualty_ward table for tracking player injury stints
-- Feature: 023-casualty-ward-scraper

CREATE TABLE IF NOT EXISTS casualty_ward (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  team_code TEXT NOT NULL,
  injury TEXT NOT NULL,
  expected_return TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT,
  player_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_casualty_ward_open
  ON casualty_ward(end_date) WHERE end_date IS NULL;
CREATE INDEX IF NOT EXISTS idx_casualty_ward_player
  ON casualty_ward(first_name, last_name, team_code);
CREATE INDEX IF NOT EXISTS idx_casualty_ward_team
  ON casualty_ward(team_code);
CREATE INDEX IF NOT EXISTS idx_casualty_ward_player_id
  ON casualty_ward(player_id) WHERE player_id IS NOT NULL;
