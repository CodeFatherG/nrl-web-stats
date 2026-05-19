CREATE TABLE IF NOT EXISTS game_strength_ratings (
  year      INTEGER NOT NULL,
  round     INTEGER NOT NULL,
  data      TEXT    NOT NULL,
  locked_at TEXT    NOT NULL,
  PRIMARY KEY (year, round)
);
