-- Add sc_position column to supplementary_stats for the Supercoach lineup-eligibility position.
-- Stores SC abbreviations (FLB, FRF, 2RF, HOK, HFB, 5/8, CTW); dual positions are comma-separated
-- (e.g. "HFB,CTW"). Comma rather than slash because the SC value "5/8" contains a slash.
-- Existing rows will have NULL; re-scraping backfills them.

ALTER TABLE supplementary_stats ADD COLUMN sc_position TEXT DEFAULT NULL;
