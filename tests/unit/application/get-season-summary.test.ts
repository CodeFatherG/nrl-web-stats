import { describe, it, expect } from 'vitest';
import { GetSeasonSummaryUseCase } from '../../../src/application/use-cases/get-season-summary.js';
import type { FixtureArtifact, FixtureRepository } from '../../../src/domain/repositories/fixture-repository.js';
import type { GetTeamStrengthRankingsUseCase } from '../../../src/application/use-cases/get-team-strength-rankings.js';
import type { Fixture } from '../../../src/models/fixture.js';
import type { SeasonThresholds } from '../../../src/models/types.js';

function createMockFixture(overrides: Partial<Fixture> = {}): Fixture {
  return {
    id: 'fixture-mock',
    teamCode: 'MNL',
    opponentCode: 'SYD',
    round: 1,
    year: 2025,
    isHome: true,
    isBye: false,
    strengthRating: 5.0,
    ...overrides,
  };
}

const defaultThresholds: SeasonThresholds = { p33: 100, p67: 150, lowerFence: 50, upperFence: 200 };

function makeArtifact(year: number, fixtures: Fixture[]): FixtureArtifact {
  return {
    year,
    computedAt: '2026-05-20T00:00:00.000Z',
    freshness: { lastScrapedAt: '2026-05-20T00:00:00.000Z' },
    payload: fixtures,
  };
}

function createMockFixtureRepo(fixtures: Fixture[] = [], yearLoaded = true): FixtureRepository {
  return {
    findByYear: async (year) => (yearLoaded ? makeArtifact(year, fixtures) : null),
    findByYearAndTeam: async () => null,
    listScrapedYears: async () => yearLoaded ? new Map([[2025, '2026-05-20T00:00:00.000Z']]) : new Map(),
    save: async () => {},
  };
}

function createMockRankings(
  thresholds: SeasonThresholds | null = defaultThresholds,
): GetTeamStrengthRankingsUseCase {
  return {
    getSeasonThresholds: async () => thresholds,
    getSeasonRanking: async () => null,
    getRoundRanking: async () => null,
    getAllSeasonRankings: async () => null,
  } as unknown as GetTeamStrengthRankingsUseCase;
}

describe('GetSeasonSummaryUseCase', () => {
  it('returns null when year is not loaded', async () => {
    const useCase = new GetSeasonSummaryUseCase(
      createMockFixtureRepo([], false),
      createMockRankings(),
    );
    expect(await useCase.execute(2025)).toBeNull();
  });

  it('returns 27 rounds for a loaded year with no fixtures', async () => {
    const useCase = new GetSeasonSummaryUseCase(
      createMockFixtureRepo([], true),
      createMockRankings(),
    );
    const result = await useCase.execute(2025);
    expect(result).not.toBeNull();
    expect(result!.year).toBe(2025);
    expect(result!.rounds).toHaveLength(27);
    expect(result!.thresholds).toEqual(defaultThresholds);
  });

  it('correctly pairs home/away fixtures into matches', async () => {
    const fixtures: Fixture[] = [
      createMockFixture({ teamCode: 'MNL', opponentCode: 'SYD', isHome: true, round: 1, strengthRating: 4.0 }),
      createMockFixture({ teamCode: 'SYD', opponentCode: 'MNL', isHome: false, round: 1, strengthRating: 6.0 }),
    ];
    const useCase = new GetSeasonSummaryUseCase(
      createMockFixtureRepo(fixtures),
      createMockRankings(),
    );
    const result = (await useCase.execute(2025))!;
    const round1 = result.rounds[0];
    expect(round1.matches).toHaveLength(1);
    expect(round1.matches[0].homeTeam).toBe('MNL');
    expect(round1.matches[0].awayTeam).toBe('SYD');
    expect(round1.matches[0].homeStrength).toBe(4.0);
    expect(round1.matches[0].awayStrength).toBe(6.0);
    expect(round1.byeTeams).toHaveLength(0);
  });

  it('identifies bye teams correctly', async () => {
    const fixtures: Fixture[] = [
      createMockFixture({ teamCode: 'MNL', isBye: true, isHome: false, opponentCode: null, round: 3, strengthRating: 0 }),
      createMockFixture({ teamCode: 'SYD', isBye: true, isHome: false, opponentCode: null, round: 3, strengthRating: 0 }),
    ];
    const useCase = new GetSeasonSummaryUseCase(
      createMockFixtureRepo(fixtures),
      createMockRankings(),
    );
    const result = (await useCase.execute(2025))!;
    const round3 = result.rounds[2];
    expect(round3.matches).toHaveLength(0);
    expect(round3.byeTeams).toEqual(['MNL', 'SYD']);
  });

  it('returns null thresholds when the precompute artifact is missing', async () => {
    const useCase = new GetSeasonSummaryUseCase(
      createMockFixtureRepo([], true),
      createMockRankings(null),
    );
    const result = await useCase.execute(2025);
    expect(result?.thresholds).toBeNull();
  });
});
