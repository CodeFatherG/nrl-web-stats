/**
 * Unit tests for computeVenueMultiplier — pure analytics function.
 * Feature: 029-venue-weather-analytics
 */

import { describe, it, expect } from 'vitest';
import { computeVenueMultiplier } from '../../src/analytics/contextual-projection-service.js';
import type { ContextualEligibleGame } from '../../src/analytics/contextual-projection-types.js';

const W = 1; // uniform weight for single-season tests
const Y = 2026;

function game(round: number, score: number, stadium: string | null, opponent = 'OPP'): ContextualEligibleGame {
  return { playerId: 'p1', round, totalScore: score, opponent, season: Y, weight: W, stadium, weather: null };
}

// ── No data cases ─────────────────────────────────────────────────────────────

describe('computeVenueMultiplier — no data', () => {
  it('returns neutral multiplier when player has no games at all', () => {
    const result = computeVenueMultiplier([], 'suncorp');
    expect(result.multiplier).toBe(1.0);
    expect(result.confidence).toBe(0);
    expect(result.sampleN).toBe(0);
    expect(result.stadiumId).toBe('suncorp');
  });

  it('returns neutral multiplier when player has games but none at the venue', () => {
    const games = [
      game(1, 70, 'Accor Stadium'),
      game(2, 80, 'Accor Stadium'),
      game(3, 75, 'Accor Stadium'),
    ];
    const result = computeVenueMultiplier(games, 'suncorp');
    expect(result.multiplier).toBe(1.0);
    expect(result.confidence).toBe(0);
    expect(result.sampleN).toBe(0);
  });

  it('returns neutral multiplier when all stadium strings are null', () => {
    const games = [game(1, 70, null), game(2, 80, null)];
    const result = computeVenueMultiplier(games, 'suncorp');
    expect(result.multiplier).toBe(1.0);
    expect(result.confidence).toBe(0);
    expect(result.sampleN).toBe(0);
  });

  it('excludes unrecognised games from numerator only — denominator uses all games', () => {
    // 'Unknown Ground' is excluded from the venue numerator but counts in the overall mean.
    const games = [
      game(1, 100, 'Suncorp Stadium'), // known: suncorp → numerator
      game(2, 50,  'Unknown Ground'),  // unknown: excluded from numerator, included in denominator
    ];
    // overallMean = (100 + 50) / 2 = 75; venueMean = 100; rawRpi = 100/75
    const overallMean = (100 + 50) / 2;
    const rawRpi = 100 / overallMean;
    const confidence = 1 / 3;
    const result = computeVenueMultiplier(games, 'suncorp');
    expect(result.sampleN).toBe(1);
    expect(result.multiplier).toBeCloseTo(1.0 + (rawRpi - 1.0) * confidence, 8);
  });
});

// ── Canonical ID normalisation ────────────────────────────────────────────────

describe('computeVenueMultiplier — normalisation', () => {
  it('treats variant name variants as the same canonical stadium', () => {
    // 'Lang Park' and 'Suncorp Stadium' both map to 'suncorp'
    const games = [
      game(1, 80, 'Lang Park'),
      game(2, 90, 'Suncorp Stadium'),
      game(3, 70, 'Accor Stadium'), // different canonical ID → not counted for suncorp
    ];
    // suncorp games: round 1 + 2 → mean = 85; overall recognised games: all 3 → mean = 80
    const result = computeVenueMultiplier(games, 'suncorp');
    expect(result.sampleN).toBe(2);
    const rawRpi = 85 / 80; // 1.0625
    const confidence = 2 / 3;
    expect(result.multiplier).toBeCloseTo(1.0 + (rawRpi - 1.0) * confidence, 8);
    expect(result.confidence).toBeCloseTo(2 / 3, 8);
  });
});

// ── Confidence blending ───────────────────────────────────────────────────────

describe('computeVenueMultiplier — confidence blending', () => {
  it('returns full raw RPI when sampleN >= 3 (confidence = 1.0)', () => {
    // overall mean = (70+85+65+90+72+80)/6 = 77
    // suncorp (Lang Park) games: 85, 90, 80 → mean = 85
    const games = [
      game(1, 70, 'Accor Stadium'),
      game(2, 85, 'Lang Park'),        // suncorp
      game(3, 65, 'Accor Stadium'),
      game(4, 90, 'Suncorp Stadium'),  // suncorp
      game(5, 72, 'Accor Stadium'),
      game(6, 80, 'Lang Park'),        // suncorp
    ];
    const overallMean = (70 + 85 + 65 + 90 + 72 + 80) / 6;
    const venueMean = (85 + 90 + 80) / 3;
    const rawRpi = venueMean / overallMean;

    const result = computeVenueMultiplier(games, 'suncorp');
    expect(result.sampleN).toBe(3);
    expect(result.confidence).toBeCloseTo(1.0);
    expect(result.multiplier).toBeCloseTo(rawRpi, 8);
  });

  it('attenuates multiplier toward 1.0 when sampleN = 1 (confidence = 1/3)', () => {
    const games = [
      game(1, 60, 'Accor Stadium'),
      game(2, 90, 'Suncorp Stadium'), // 1 suncorp game
      game(3, 60, 'Accor Stadium'),
    ];
    // overall mean = (60+90+60)/3 = 70; venue mean = 90; rawRpi = 90/70 ≈ 1.2857
    const overallMean = (60 + 90 + 60) / 3;
    const rawRpi = 90 / overallMean;
    const confidence = 1 / 3;
    const expected = 1.0 + (rawRpi - 1.0) * confidence;

    const result = computeVenueMultiplier(games, 'suncorp');
    expect(result.sampleN).toBe(1);
    expect(result.confidence).toBeCloseTo(1 / 3, 8);
    expect(result.multiplier).toBeCloseTo(expected, 8);
    expect(result.multiplier).toBeGreaterThan(1.0); // above neutral
    expect(result.multiplier).toBeLessThan(rawRpi);  // attenuated below raw
  });

  it('attenuates multiplier toward 1.0 when sampleN = 2 (confidence = 2/3)', () => {
    const games = [
      game(1, 50, 'Accor Stadium'),
      game(2, 80, 'Suncorp Stadium'),
      game(3, 80, 'Suncorp Stadium'),
    ];
    const overallMean = (50 + 80 + 80) / 3;
    const rawRpi = 80 / overallMean;
    const confidence = 2 / 3;
    const expected = 1.0 + (rawRpi - 1.0) * confidence;

    const result = computeVenueMultiplier(games, 'suncorp');
    expect(result.sampleN).toBe(2);
    expect(result.multiplier).toBeCloseTo(expected, 8);
  });
});

// ── Below-average venue ───────────────────────────────────────────────────────

describe('computeVenueMultiplier — below-average venue', () => {
  it('produces a multiplier below 1.0 when player scores worse at the venue', () => {
    const games = [
      game(1, 90, 'Accor Stadium'),
      game(2, 40, 'Suncorp Stadium'), // poor game at suncorp
      game(3, 90, 'Accor Stadium'),
      game(4, 40, 'Suncorp Stadium'), // poor game at suncorp
      game(5, 90, 'Accor Stadium'),
      game(6, 40, 'Suncorp Stadium'), // poor game at suncorp
    ];
    const result = computeVenueMultiplier(games, 'suncorp');
    expect(result.multiplier).toBeLessThan(1.0);
    expect(result.sampleN).toBe(3);
    expect(result.confidence).toBeCloseTo(1.0);
  });
});

// ── Recency weighting ─────────────────────────────────────────────────────────

describe('computeVenueMultiplier — recency weighting', () => {
  it('applies game.weight to both overall and venue means', () => {
    // Two seasons: older (weight=1), newer (weight=2)
    const games: ContextualEligibleGame[] = [
      { playerId: 'p1', round: 1, totalScore: 60, opponent: 'OPP', season: 2025, weight: 1, stadium: 'Suncorp Stadium', weather: null },
      { playerId: 'p1', round: 1, totalScore: 90, opponent: 'OPP', season: 2026, weight: 2, stadium: 'Suncorp Stadium', weather: null },
    ];
    // weighted overall = (60×1 + 90×2) / (1+2) = 240/3 = 80
    // weighted venue  = same (all games at suncorp) → rawRpi = 1.0
    // confidence = clamp(2/3, 0, 1) = 2/3
    const result = computeVenueMultiplier(games, 'suncorp');
    expect(result.sampleN).toBe(2);
    expect(result.multiplier).toBeCloseTo(1.0, 8); // weighted RPI = 1.0
  });
});
