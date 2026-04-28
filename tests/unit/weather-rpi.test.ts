/**
 * Unit tests for computeWeatherMultiplier — pure analytics function.
 * Feature: 029-venue-weather-analytics
 */

import { describe, it, expect } from 'vitest';
import { computeWeatherMultiplier } from '../../src/analytics/contextual-projection-service.js';
import type { ContextualEligibleGame } from '../../src/analytics/contextual-projection-types.js';

const W = 1;
const Y = 2026;

function game(round: number, score: number, weather: string | null, opponent = 'OPP'): ContextualEligibleGame {
  return { playerId: 'p1', round, totalScore: score, opponent, season: Y, weight: W, stadium: null, weather };
}

// ── No data cases ─────────────────────────────────────────────────────────────

describe('computeWeatherMultiplier — no data', () => {
  it('returns neutral multiplier when player has no games at all', () => {
    const result = computeWeatherMultiplier([], 'rain');
    expect(result.multiplier).toBe(1.0);
    expect(result.confidence).toBe(0);
    expect(result.sampleN).toBe(0);
    expect(result.category).toBe('rain');
  });

  it('returns neutral multiplier when player has games but none in the category', () => {
    const games = [game(1, 70, 'Clear'), game(2, 80, 'Clear'), game(3, 75, 'Clear')];
    const result = computeWeatherMultiplier(games, 'rain');
    expect(result.multiplier).toBe(1.0);
    expect(result.confidence).toBe(0);
    expect(result.sampleN).toBe(0);
  });

  it('returns neutral multiplier when all weather strings are null', () => {
    const games = [game(1, 70, null), game(2, 80, null)];
    const result = computeWeatherMultiplier(games, 'clear');
    expect(result.multiplier).toBe(1.0);
    expect(result.confidence).toBe(0);
    expect(result.sampleN).toBe(0);
  });

  it('excludes unrecognised weather games from numerator only — denominator uses all games', () => {
    // 'Hail' is excluded from the category numerator but counts in the overall mean.
    const games = [
      game(1, 100, 'Clear'),   // recognised → clear numerator
      game(2, 50,  'Hail'),    // unrecognised → excluded from numerator, included in denominator
    ];
    // overallMean = (100 + 50) / 2 = 75; clearMean = 100; rawRpi = 100/75
    const overallMean = (100 + 50) / 2;
    const rawRpi = 100 / overallMean;
    const confidence = 1 / 3;
    const result = computeWeatherMultiplier(games, 'clear');
    expect(result.sampleN).toBe(1);
    expect(result.multiplier).toBeCloseTo(1.0 + (rawRpi - 1.0) * confidence, 8);
  });

  it('null weather games count toward denominator baseline', () => {
    // null weather game scores 200 — counts in denominator, not in any category numerator
    const games = [
      game(1, 200, null),      // null: excluded from numerator, included in denominator
      game(2, 60,  'Raining'), // rain
      game(3, 80,  'Clear'),   // clear
    ];
    // overallMean = (200 + 60 + 80) / 3 ≈ 113.33
    // rain mean = 60; rawRpi = 60 / 113.33
    const overallMean = (200 + 60 + 80) / 3;
    const rawRpi = 60 / overallMean;
    const confidence = 1 / 3;
    const expected = 1.0 + (rawRpi - 1.0) * confidence;

    const result = computeWeatherMultiplier(games, 'rain');
    expect(result.sampleN).toBe(1);
    expect(result.multiplier).toBeCloseTo(expected, 8);
  });
});

// ── Category normalisation ────────────────────────────────────────────────────

describe('computeWeatherMultiplier — normalisation', () => {
  it('maps "Raining" and "Light Rain" to the same rain category', () => {
    const games = [
      game(1, 80, 'Raining'),
      game(2, 80, 'Light Rain'),
      game(3, 80, 'Raining'),
      game(4, 80, 'Clear'), // clear — different category
    ];
    const result = computeWeatherMultiplier(games, 'rain');
    expect(result.sampleN).toBe(3); // 3 rain games
  });

  it('treats showers as distinct from rain', () => {
    const games = [
      game(1, 90, 'Showers'),
      game(2, 60, 'Raining'),
      game(3, 75, 'Clear'),
    ];
    const showers = computeWeatherMultiplier(games, 'showers');
    const rain = computeWeatherMultiplier(games, 'rain');

    expect(showers.sampleN).toBe(1);
    expect(rain.sampleN).toBe(1);
    // Different scores → different multipliers
    expect(showers.multiplier).not.toBeCloseTo(rain.multiplier, 3);
  });
});

// ── Confidence blending ───────────────────────────────────────────────────────

describe('computeWeatherMultiplier — confidence blending', () => {
  it('returns full raw RPI when sampleN >= 3 (confidence = 1.0)', () => {
    // 3 rain games, 3 clear games
    // rain mean = (50+60+55)/3 = 55; clear mean = (80+85+82)/3 = 82.33
    // overall mean = (50+60+55+80+85+82)/6 = 412/6 ≈ 68.67
    const games = [
      game(1, 50, 'Raining'),
      game(2, 60, 'Raining'),
      game(3, 55, 'Raining'),
      game(4, 80, 'Clear'),
      game(5, 85, 'Clear'),
      game(6, 82, 'Clear'),
    ];
    const overallMean = (50 + 60 + 55 + 80 + 85 + 82) / 6;
    const rainMean = (50 + 60 + 55) / 3;
    const rawRpi = rainMean / overallMean;

    const result = computeWeatherMultiplier(games, 'rain');
    expect(result.sampleN).toBe(3);
    expect(result.confidence).toBeCloseTo(1.0);
    expect(result.multiplier).toBeCloseTo(rawRpi, 8);
    expect(result.multiplier).toBeLessThan(1.0); // rain games scored below average
  });

  it('attenuates multiplier toward 1.0 when sampleN = 1 (confidence = 1/3)', () => {
    const games = [
      game(1, 60, 'Clear'),
      game(2, 60, 'Clear'),
      game(3, 120, 'Raining'), // 1 rain game — unusually high
    ];
    // overall (all recognised) = (60+60+120)/3 = 80
    const overallMean = (60 + 60 + 120) / 3;
    const rawRpi = 120 / overallMean;
    const confidence = 1 / 3;
    const expected = 1.0 + (rawRpi - 1.0) * confidence;

    const result = computeWeatherMultiplier(games, 'rain');
    expect(result.sampleN).toBe(1);
    expect(result.confidence).toBeCloseTo(1 / 3, 8);
    expect(result.multiplier).toBeCloseTo(expected, 8);
    expect(result.multiplier).toBeGreaterThan(1.0);
    expect(result.multiplier).toBeLessThan(rawRpi); // attenuated
  });

  it('caps confidence at 1.0 when sampleN > 3', () => {
    const games = Array.from({ length: 6 }, (_, i) =>
      game(i + 1, 70, 'Raining'),
    );
    const result = computeWeatherMultiplier(games, 'rain');
    expect(result.confidence).toBeCloseTo(1.0);
    expect(result.sampleN).toBe(6);
  });
});

// ── Above-average and below-average categories ────────────────────────────────

describe('computeWeatherMultiplier — direction of effect', () => {
  it('produces multiplier > 1.0 when player scores above average in the category', () => {
    const games = [
      game(1, 60, 'Clear'),
      game(2, 60, 'Clear'),
      game(3, 60, 'Clear'),
      game(4, 90, 'Raining'),
      game(5, 90, 'Raining'),
      game(6, 90, 'Raining'),
    ];
    const result = computeWeatherMultiplier(games, 'rain');
    expect(result.multiplier).toBeGreaterThan(1.0);
  });

  it('produces multiplier < 1.0 when player scores below average in the category', () => {
    const games = [
      game(1, 90, 'Clear'),
      game(2, 90, 'Clear'),
      game(3, 90, 'Clear'),
      game(4, 60, 'Raining'),
      game(5, 60, 'Raining'),
      game(6, 60, 'Raining'),
    ];
    const result = computeWeatherMultiplier(games, 'rain');
    expect(result.multiplier).toBeLessThan(1.0);
  });
});

// ── Recency weighting ─────────────────────────────────────────────────────────

describe('computeWeatherMultiplier — recency weighting', () => {
  it('applies game.weight to both the overall and category means', () => {
    const games: ContextualEligibleGame[] = [
      { playerId: 'p1', round: 1, totalScore: 100, opponent: 'OPP', season: 2025, weight: 1, stadium: null, weather: 'Raining' },
      { playerId: 'p1', round: 2, totalScore: 100, opponent: 'OPP', season: 2026, weight: 2, stadium: null, weather: 'Raining' },
    ];
    // Both are in 'rain'; weighted overall = weighted rain → rawRpi = 1.0
    const result = computeWeatherMultiplier(games, 'rain');
    expect(result.multiplier).toBeCloseTo(1.0, 8);
    expect(result.sampleN).toBe(2);
  });
});
