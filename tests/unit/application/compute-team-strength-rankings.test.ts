/**
 * Unit tests for ComputeTeamStrengthRankingsUseCase (feature 039 T019).
 *
 * Covers: saveYear receives the requested asOfRound, all three sub-artifacts
 * populated, IQR threshold math, idempotency on repeat invocation, and the
 * cold-start skip-and-log when `findByYear` returns null/empty.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ComputeTeamStrengthRankingsUseCase } from '../../../src/application/use-cases/compute-team-strength-rankings.js';
import { InMemoryTeamStrengthRankingsRepository } from '../../../src/infrastructure/persistence/in-memory-team-strength-rankings-repository.js';
import type { FixtureRepository, FixtureArtifact } from '../../../src/domain/repositories/fixture-repository.js';
import type { Fixture } from '../../../src/models/fixture.js';

function makeFixture(
  teamCode: string,
  round: number,
  strengthRating: number,
  overrides: Partial<Fixture> = {},
): Fixture {
  return {
    id: `2026-${round}-${teamCode}`,
    year: 2026,
    round,
    teamCode,
    opponentCode: 'OPP',
    isHome: true,
    isBye: false,
    strengthRating,
    ...overrides,
  };
}

function makeArtifact(year: number, fixtures: Fixture[]): FixtureArtifact {
  return {
    year,
    computedAt: '2026-05-20T00:00:00.000Z',
    freshness: { lastScrapedAt: '2026-05-20T00:00:00.000Z' },
    payload: fixtures,
  };
}

function makeFixtureRepo(artifact: FixtureArtifact | null): FixtureRepository {
  return {
    findByYear: async (_year) => artifact,
    findByYearAndTeam: async () => null,
    listScrapedYears: async () => new Map(),
    save: async () => {},
  };
}

describe('ComputeTeamStrengthRankingsUseCase', () => {
  let repo: InMemoryTeamStrengthRankingsRepository;

  beforeEach(() => {
    repo = new InMemoryTeamStrengthRankingsRepository();
  });

  it('saves all three sub-artifacts under the requested asOfRound', async () => {
    const fixtures: Fixture[] = [];
    const ratings = [200, 250, 280, 300, 320, 340, 360, 380, 400, 420, 450, 500];
    ratings.forEach((rating, i) =>
      fixtures.push(makeFixture(`T${String(i).padStart(2, '0')}`, 1, rating)),
    );
    const useCase = new ComputeTeamStrengthRankingsUseCase({
      fixtureRepository: makeFixtureRepo(makeArtifact(2026, fixtures)),
      teamStrengthRankingsRepository: repo,
    });

    await useCase.execute(2026, 7);

    const thresholds = await repo.findSeasonThresholds(2026);
    expect(thresholds).not.toBeNull();
    const season = await repo.findSeasonRankings(2026);
    expect(season?.size).toBe(ratings.length);
    const round1 = await repo.findRoundRankings(2026, 1);
    expect(round1?.size).toBe(ratings.length);

    const coverage = await repo.listCoveredRoundRankings(2026);
    expect(coverage.get(1)).toBe(7);
    const years = await repo.listYearsWithThresholds();
    expect(years.get(2026)).toBe(7);
  });

  it('removes outliers via IQR — preserves the legacy threshold math', async () => {
    const fixtures: Fixture[] = [];
    const ratings = [50, 300, 310, 320, 330, 340, 350, 360, 370, 380, 390, 400, 900];
    ratings.forEach((rating, i) =>
      fixtures.push(makeFixture(`T${String(i).padStart(2, '0')}`, 1, rating)),
    );
    const useCase = new ComputeTeamStrengthRankingsUseCase({
      fixtureRepository: makeFixtureRepo(makeArtifact(2026, fixtures)),
      teamStrengthRankingsRepository: repo,
    });
    await useCase.execute(2026, 3);

    const t = await repo.findSeasonThresholds(2026);
    expect(t).not.toBeNull();
    expect(50).toBeLessThan(t!.lowerFence);
    expect(900).toBeGreaterThan(t!.upperFence);
    expect(t!.p33).toBeGreaterThanOrEqual(300);
    expect(t!.p67).toBeLessThanOrEqual(400);
  });

  it('is idempotent — second invocation overwrites with the same values', async () => {
    const fixtures = [
      makeFixture('BRI', 1, 320),
      makeFixture('SYD', 1, 340),
      makeFixture('MEL', 1, 360),
      makeFixture('CBY', 1, 380),
    ];
    const useCase = new ComputeTeamStrengthRankingsUseCase({
      fixtureRepository: makeFixtureRepo(makeArtifact(2026, fixtures)),
      teamStrengthRankingsRepository: repo,
    });

    await useCase.execute(2026, 5);
    const first = await repo.findSeasonRankings(2026);
    await useCase.execute(2026, 5);
    const second = await repo.findSeasonRankings(2026);

    expect(second?.get('BRI')?.averageStrength).toBe(first?.get('BRI')?.averageStrength);
    expect(second?.get('BRI')?.percentile).toBe(first?.get('BRI')?.percentile);
  });

  it('cold-start (no fixtures): logs and returns successfully without writing', async () => {
    const useCase = new ComputeTeamStrengthRankingsUseCase({
      fixtureRepository: makeFixtureRepo(null),
      teamStrengthRankingsRepository: repo,
    });
    await expect(useCase.execute(2099, 1)).resolves.toBeUndefined();
    expect(await repo.findSeasonThresholds(2099)).toBeNull();
  });

  it('cold-start (empty fixture artifact): also skipped', async () => {
    const useCase = new ComputeTeamStrengthRankingsUseCase({
      fixtureRepository: makeFixtureRepo(makeArtifact(2099, [])),
      teamStrengthRankingsRepository: repo,
    });
    await useCase.execute(2099, 1);
    expect(await repo.findSeasonThresholds(2099)).toBeNull();
  });

  it('round rankings track per-round opponent strength via the season-wide percentile', async () => {
    const fixtures: Fixture[] = [
      makeFixture('BRI', 1, 300, { opponentCode: 'SYD' }),
      makeFixture('SYD', 1, 500, { opponentCode: 'BRI', isHome: false }),
      makeFixture('BRI', 2, 400, { opponentCode: 'MEL' }),
      makeFixture('MEL', 2, 350, { opponentCode: 'BRI', isHome: false }),
    ];
    const useCase = new ComputeTeamStrengthRankingsUseCase({
      fixtureRepository: makeFixtureRepo(makeArtifact(2026, fixtures)),
      teamStrengthRankingsRepository: repo,
    });
    await useCase.execute(2026, 2);

    const round1 = await repo.findRoundRankings(2026, 1);
    const bri = round1?.get('BRI');
    const syd = round1?.get('SYD');
    expect(bri?.percentile).toBeLessThan(syd!.percentile);
  });

  it('concurrent execute(Y, R) invocations resolve to a deterministic final state (last-write-wins per key)', async () => {
    const fixtures = [
      makeFixture('BRI', 1, 320),
      makeFixture('SYD', 1, 340),
      makeFixture('MEL', 1, 360),
      makeFixture('CBY', 1, 380),
    ];
    const useCase = new ComputeTeamStrengthRankingsUseCase({
      fixtureRepository: makeFixtureRepo(makeArtifact(2026, fixtures)),
      teamStrengthRankingsRepository: repo,
    });
    await Promise.all([useCase.execute(2026, 5), useCase.execute(2026, 5)]);
    const season = await repo.findSeasonRankings(2026);
    // Both invocations produced identical payloads; the final state has the
    // same team count and per-team values.
    expect(season?.size).toBe(4);
    expect(season?.get('BRI')?.averageStrength).toBe(320);
  });

  it('forwards the FixtureRepository call exactly once per execute', async () => {
    const fixtures = [
      makeFixture('BRI', 1, 320),
      makeFixture('SYD', 1, 340),
      makeFixture('MEL', 1, 360),
      makeFixture('CBY', 1, 380),
    ];
    const findByYear = vi.fn(async () => makeArtifact(2026, fixtures));
    const useCase = new ComputeTeamStrengthRankingsUseCase({
      fixtureRepository: {
        findByYear,
        findByYearAndTeam: async () => null,
        listScrapedYears: async () => new Map(),
        save: async () => {},
      },
      teamStrengthRankingsRepository: repo,
    });
    await useCase.execute(2026, 4);
    expect(findByYear).toHaveBeenCalledTimes(1);
  });
});
