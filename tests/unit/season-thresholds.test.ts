/**
 * Unit tests for season-wide threshold calculation with IQR outlier removal.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  calculateSeasonThresholds,
  getCategoryFromThresholds,
  clearRankingsCache,
} from '../../src/database/rankings.js';
import { setFixtureRepository, resetDatabase } from '../../src/database/store.js';
import { InMemoryFixtureRepository } from '../../src/infrastructure/persistence/in-memory-fixture-repository.js';
import type { Fixture } from '../../src/models/fixture.js';

function makeFixture(
  teamCode: string,
  round: number,
  strengthRating: number,
  isBye = false,
): Fixture {
  return {
    id: `2026-${round}-${teamCode}`,
    year: 2026,
    round,
    teamCode,
    opponentCode: isBye ? null : 'OPP',
    isHome: true,
    isBye,
    strengthRating,
  };
}

async function seedYear(fixtures: Fixture[]): Promise<void> {
  const repo = new InMemoryFixtureRepository();
  await repo.save(2026, fixtures);
  setFixtureRepository(repo);
}

describe('calculateSeasonThresholds', () => {
  beforeEach(() => {
    resetDatabase();
    clearRankingsCache();
  });

  it('computes thresholds from a normal distribution of ratings', async () => {
    const fixtures: Fixture[] = [];
    const ratings = [200, 250, 280, 300, 320, 340, 360, 380, 400, 420, 450, 500];
    ratings.forEach((rating, i) => {
      fixtures.push(makeFixture(`T${String(i).padStart(2, '0')}`, 1, rating));
    });

    await seedYear(fixtures);
    const thresholds = await calculateSeasonThresholds(2026);

    expect(thresholds.p33).toBeGreaterThanOrEqual(200);
    expect(thresholds.p33).toBeLessThan(thresholds.p67);
    expect(thresholds.p67).toBeLessThanOrEqual(500);
    expect(thresholds.lowerFence).toBeLessThanOrEqual(200);
    expect(thresholds.upperFence).toBeGreaterThanOrEqual(500);
  });

  it('removes outliers using IQR method', async () => {
    const fixtures: Fixture[] = [];
    const ratings = [50, 300, 310, 320, 330, 340, 350, 360, 370, 380, 390, 400, 900];
    ratings.forEach((rating, i) => {
      fixtures.push(makeFixture(`T${String(i).padStart(2, '0')}`, 1, rating));
    });

    await seedYear(fixtures);
    const thresholds = await calculateSeasonThresholds(2026);

    expect(50).toBeLessThan(thresholds.lowerFence);
    expect(900).toBeGreaterThan(thresholds.upperFence);
    expect(thresholds.p33).toBeGreaterThanOrEqual(300);
    expect(thresholds.p67).toBeLessThanOrEqual(400);
  });

  it('skips bye fixtures when computing thresholds', async () => {
    const fixtures: Fixture[] = [
      makeFixture('T01', 1, 300),
      makeFixture('T02', 1, 400),
      makeFixture('T03', 1, 500),
      makeFixture('T04', 1, 350),
      makeFixture('BYE', 2, 0, true),
    ];

    await seedYear(fixtures);
    const thresholds = await calculateSeasonThresholds(2026);

    expect(thresholds.lowerFence).toBeGreaterThanOrEqual(0);
    expect(thresholds.p33).toBeGreaterThanOrEqual(300);
  });

  it('handles fewer than 4 data points gracefully', async () => {
    const fixtures: Fixture[] = [
      makeFixture('T01', 1, 200),
      makeFixture('T02', 1, 400),
      makeFixture('T03', 1, 600),
    ];

    await seedYear(fixtures);
    const thresholds = await calculateSeasonThresholds(2026);

    expect(thresholds.p33).toBeGreaterThanOrEqual(200);
    expect(thresholds.p67).toBeLessThanOrEqual(600);
    expect(thresholds.lowerFence).toBeLessThanOrEqual(200);
    expect(thresholds.upperFence).toBeGreaterThanOrEqual(600);
  });

  it('caches results for the same year', async () => {
    const fixtures: Fixture[] = [
      makeFixture('T01', 1, 300),
      makeFixture('T02', 1, 400),
      makeFixture('T03', 1, 350),
      makeFixture('T04', 1, 450),
    ];

    await seedYear(fixtures);
    const first = await calculateSeasonThresholds(2026);
    const second = await calculateSeasonThresholds(2026);

    expect(first).toBe(second);
  });
});

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
