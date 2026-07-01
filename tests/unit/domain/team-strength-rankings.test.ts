/**
 * Unit tests for the team-strength-rankings pure helpers (feature 039 T035).
 *
 * Migrated from `tests/unit/season-thresholds.test.ts`. The threshold-math
 * tests live in `compute-team-strength-rankings.test.ts`; only the pure
 * category-classification helpers remain here.
 */

import { describe, it, expect } from 'vitest';
import {
  getCategoryFromPercentile,
  getCategoryFromThresholds,
} from '../../../src/domain/team-strength-rankings.js';

describe('getCategoryFromThresholds', () => {
  const thresholds = {
    p33: 300,
    p67: 400,
    lowerFence: 150,
    upperFence: 550,
  };

  it('returns "hard" for outliers below lowerFence', () => {
    expect(getCategoryFromThresholds(100, thresholds)).toBe('hard');
    expect(getCategoryFromThresholds(149, thresholds)).toBe('hard');
  });

  it('returns "easy" for outliers above upperFence', () => {
    expect(getCategoryFromThresholds(551, thresholds)).toBe('easy');
    expect(getCategoryFromThresholds(999, thresholds)).toBe('easy');
  });

  it('returns "hard" for non-outlier ratings at or below p33', () => {
    expect(getCategoryFromThresholds(150, thresholds)).toBe('hard');
    expect(getCategoryFromThresholds(250, thresholds)).toBe('hard');
    expect(getCategoryFromThresholds(300, thresholds)).toBe('hard');
  });

  it('returns "medium" for ratings between p33 and p67', () => {
    expect(getCategoryFromThresholds(301, thresholds)).toBe('medium');
    expect(getCategoryFromThresholds(350, thresholds)).toBe('medium');
    expect(getCategoryFromThresholds(400, thresholds)).toBe('medium');
  });

  it('returns "easy" for non-outlier ratings above p67', () => {
    expect(getCategoryFromThresholds(401, thresholds)).toBe('easy');
    expect(getCategoryFromThresholds(500, thresholds)).toBe('easy');
    expect(getCategoryFromThresholds(550, thresholds)).toBe('easy');
  });

  it('ensures a higher rating is never categorised harder than a lower one', () => {
    const order = { hard: 0, medium: 1, easy: 2 };
    const testRatings = [50, 100, 149, 150, 200, 300, 301, 350, 400, 401, 500, 550, 551, 900];
    for (let i = 0; i < testRatings.length - 1; i++) {
      const cat1 = getCategoryFromThresholds(testRatings[i], thresholds);
      const cat2 = getCategoryFromThresholds(testRatings[i + 1], thresholds);
      expect(order[cat1]).toBeLessThanOrEqual(order[cat2]);
    }
  });
});

describe('getCategoryFromPercentile', () => {
  it('classifies the bottom third as hard', () => {
    expect(getCategoryFromPercentile(0)).toBe('hard');
    expect(getCategoryFromPercentile(0.33)).toBe('hard');
  });

  it('classifies the middle third as medium', () => {
    expect(getCategoryFromPercentile(0.34)).toBe('medium');
    expect(getCategoryFromPercentile(0.67)).toBe('medium');
  });

  it('classifies the top third as easy', () => {
    expect(getCategoryFromPercentile(0.68)).toBe('easy');
    expect(getCategoryFromPercentile(1)).toBe('easy');
  });
});
