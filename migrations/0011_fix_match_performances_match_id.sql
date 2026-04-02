-- 0011: Purge match_performances rows that store NRL.com numeric match IDs.
-- Prior to this migration, match_id stored NRL.com numeric IDs (e.g. "20261110160").
-- The player stats adapter now computes domain IDs at scrape time (e.g. "2026-R1-NQL-SHA").
-- Affected rounds must be re-scraped with force=true after this migration is applied.
DELETE FROM match_performances WHERE match_id GLOB '[0-9]*';
