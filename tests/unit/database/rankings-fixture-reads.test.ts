/**
 * Asserts that getAllTeamSeasonRankings(year) issues exactly one fixture
 * read against the repository per invocation (Risk 1).
 *
 * Feature: 038-kv-fixture-repository (T015).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  setFixtureRepository,
  resetDatabase,
} from '../../../src/database/store.js';
import {
  getAllTeamSeasonRankings,
  clearRankingsCache,
} from '../../../src/database/rankings.js';
import type {
  FixtureRepository,
  FixtureArtifact,
} from '../../../src/domain/repositories/fixture-repository.js';
import { createFixture } from '../../../src/models/fixture.js';

function makeArtifact(year: number): FixtureArtifact {
  const fixtures = [
    createFixture(year, 1, 'BRI', 'SYD', true, 100),
    createFixture(year, 1, 'SYD', 'BRI', false, 90),
    createFixture(year, 1, 'MEL', 'CBY', true, 110),
    createFixture(year, 1, 'CBY', 'MEL', false, 80),
    createFixture(year, 2, 'BRI', 'MEL', true, 95),
    createFixture(year, 2, 'MEL', 'BRI', false, 105),
    createFixture(year, 2, 'SYD', 'CBY', true, 88),
    createFixture(year, 2, 'CBY', 'SYD', false, 92),
  ];
  return {
    year,
    computedAt: '2026-05-20T00:00:00.000Z',
    freshness: { lastScrapedAt: '2026-05-20T00:00:00.000Z' },
    payload: fixtures,
  };
}

describe('rankings — repository read minimisation', () => {
  beforeEach(() => {
    resetDatabase();
    clearRankingsCache();
  });

  it('reads the year fixtures exactly once per getAllTeamSeasonRankings call', async () => {
    const findByYear = vi.fn(async (year: number) =>
      year === 2026 ? makeArtifact(2026) : null,
    );
    const repo: FixtureRepository = {
      findByYear,
      findByYearAndTeam: vi.fn(async () => null),
      listScrapedYears: vi.fn(async () => new Map()),
      save: vi.fn(async () => {}),
    };
    setFixtureRepository(repo);

    const rankings = await getAllTeamSeasonRankings(2026);
    expect(rankings.length).toBeGreaterThan(0);

    // The repository was hit once for the year's payload. All per-team
    // fixture iteration is in-memory filter, not a second repository call.
    expect(findByYear).toHaveBeenCalledTimes(1);
    expect(findByYear).toHaveBeenCalledWith(2026);
  });
});
