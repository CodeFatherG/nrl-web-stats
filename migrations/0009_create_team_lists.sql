-- Migration: Create team_lists table for storing match-day squad data
-- Feature: 022-team-list-scraper

CREATE TABLE IF NOT EXISTS team_lists (
  match_id TEXT NOT NULL,
  team_code TEXT NOT NULL,
  year INTEGER NOT NULL,
  round INTEGER NOT NULL,
  jersey_number INTEGER NOT NULL,
  player_name TEXT NOT NULL,
  position TEXT NOT NULL,
  player_id INTEGER NOT NULL,
  scraped_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (match_id, team_code, jersey_number)
);

CREATE INDEX IF NOT EXISTS idx_team_lists_year_round ON team_lists(year, round);
CREATE INDEX IF NOT EXISTS idx_team_lists_match ON team_lists(match_id);
CREATE INDEX IF NOT EXISTS idx_team_lists_team ON team_lists(team_code, year);
