-- Player name links: persistent mapping between nrl.com players and nrlsupercoachstats.com names.
-- Auto-populated when algorithmic matching succeeds; manually editable for corrections.

CREATE TABLE IF NOT EXISTS player_name_links (
  player_id TEXT NOT NULL,
  player_name TEXT NOT NULL,
  team_code TEXT NOT NULL,
  supplementary_name TEXT NOT NULL,
  confidence TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'auto',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (player_id)
);

CREATE INDEX IF NOT EXISTS idx_player_name_links_supp ON player_name_links(supplementary_name);
