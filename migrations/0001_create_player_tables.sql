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
  all_run_metres INTEGER NOT NULL DEFAULT 0,
  all_runs INTEGER NOT NULL DEFAULT 0,
  bomb_kicks INTEGER NOT NULL DEFAULT 0,
  cross_field_kicks INTEGER NOT NULL DEFAULT 0,
  conversions INTEGER NOT NULL DEFAULT 0,
  conversion_attempts INTEGER NOT NULL DEFAULT 0,
  dummy_half_runs INTEGER NOT NULL DEFAULT 0,
  dummy_half_run_metres INTEGER NOT NULL DEFAULT 0,
  dummy_passes INTEGER NOT NULL DEFAULT 0,
  errors INTEGER NOT NULL DEFAULT 0,
  fantasy_points_total REAL NOT NULL DEFAULT 0,
  field_goals INTEGER NOT NULL DEFAULT 0,
  forced_drop_out_kicks INTEGER NOT NULL DEFAULT 0,
  forty_twenty_kicks INTEGER NOT NULL DEFAULT 0,
  goals INTEGER NOT NULL DEFAULT 0,
  goal_conversion_rate REAL NOT NULL DEFAULT 0,
  grubber_kicks INTEGER NOT NULL DEFAULT 0,
  handling_errors INTEGER NOT NULL DEFAULT 0,
  hit_ups INTEGER NOT NULL DEFAULT 0,
  hit_up_run_metres INTEGER NOT NULL DEFAULT 0,
  ineffective_tackles INTEGER NOT NULL DEFAULT 0,
  intercepts INTEGER NOT NULL DEFAULT 0,
  kicks INTEGER NOT NULL DEFAULT 0,
  kicks_dead INTEGER NOT NULL DEFAULT 0,
  kicks_defused INTEGER NOT NULL DEFAULT 0,
  kick_metres INTEGER NOT NULL DEFAULT 0,
  kick_return_metres INTEGER NOT NULL DEFAULT 0,
  line_break_assists INTEGER NOT NULL DEFAULT 0,
  line_breaks INTEGER NOT NULL DEFAULT 0,
  line_engaged_runs INTEGER NOT NULL DEFAULT 0,
  minutes_played INTEGER NOT NULL DEFAULT 0,
  missed_tackles INTEGER NOT NULL DEFAULT 0,
  offloads INTEGER NOT NULL DEFAULT 0,
  offside_within_ten_metres INTEGER NOT NULL DEFAULT 0,
  one_on_one_lost INTEGER NOT NULL DEFAULT 0,
  one_on_one_steal INTEGER NOT NULL DEFAULT 0,
  one_point_field_goals INTEGER NOT NULL DEFAULT 0,
  on_report INTEGER NOT NULL DEFAULT 0,
  passes_to_run_ratio REAL NOT NULL DEFAULT 0,
  passes INTEGER NOT NULL DEFAULT 0,
  play_the_ball_total INTEGER NOT NULL DEFAULT 0,
  play_the_ball_average_speed REAL NOT NULL DEFAULT 0,
  penalties INTEGER NOT NULL DEFAULT 0,
  points INTEGER NOT NULL DEFAULT 0,
  penalty_goals INTEGER NOT NULL DEFAULT 0,
  post_contact_metres INTEGER NOT NULL DEFAULT 0,
  receipts INTEGER NOT NULL DEFAULT 0,
  ruck_infringements INTEGER NOT NULL DEFAULT 0,
  send_offs INTEGER NOT NULL DEFAULT 0,
  sin_bins INTEGER NOT NULL DEFAULT 0,
  stint_one INTEGER NOT NULL DEFAULT 0,
  tackle_breaks INTEGER NOT NULL DEFAULT 0,
  tackle_efficiency REAL NOT NULL DEFAULT 0,
  tackles_made INTEGER NOT NULL DEFAULT 0,
  tries INTEGER NOT NULL DEFAULT 0,
  try_assists INTEGER NOT NULL DEFAULT 0,
  twenty_forty_kicks INTEGER NOT NULL DEFAULT 0,
  two_point_field_goals INTEGER NOT NULL DEFAULT 0,
  is_complete INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (player_id, match_id)
);

CREATE INDEX IF NOT EXISTS idx_mp_season ON match_performances(season);
CREATE INDEX IF NOT EXISTS idx_mp_team_season ON match_performances(team_code, season);
CREATE INDEX IF NOT EXISTS idx_mp_player_season ON match_performances(player_id, season);
CREATE INDEX IF NOT EXISTS idx_mp_season_round ON match_performances(season, round);
