-- Migration 006: Add price and break_even columns to supplementary_stats
-- These columns are nullable (DEFAULT NULL) to distinguish "not yet scraped" from "actually zero"
-- Existing rows will have NULL values, detected by backfill logic

ALTER TABLE supplementary_stats ADD COLUMN price INTEGER DEFAULT NULL;
ALTER TABLE supplementary_stats ADD COLUMN break_even INTEGER DEFAULT NULL;
