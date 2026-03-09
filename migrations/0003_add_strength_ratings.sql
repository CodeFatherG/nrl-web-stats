-- Migration 003: Add strength rating columns to matches table
-- Ratings are updated weekly from SuperCoach and frozen once a match is completed.
ALTER TABLE matches ADD COLUMN home_strength_rating REAL;
ALTER TABLE matches ADD COLUMN away_strength_rating REAL;
