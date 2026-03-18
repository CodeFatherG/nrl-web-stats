-- Add team_code column to supplementary_stats for team-based player matching.
-- Existing rows will have NULL; re-scraping backfills them.

ALTER TABLE supplementary_stats ADD COLUMN team_code TEXT DEFAULT NULL;
