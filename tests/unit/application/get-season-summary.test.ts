import { describe, it, expect } from 'vitest';
import { GetSeasonSummaryUseCase } from '../../../src/application/use-cases/get-season-summary.js';
import type { FixtureRepository } from '../../../src/application/ports/fixture-repository.js';
import type { RankingService } from '../../../src/application/ports/ranking-service.js';
import type { Fixture } from '../../../src/models/fixture.js';
import type { Team } from '../../../src/models/team.js';

function createMockFixture(overrides: Partial<Fixture> = {}): Fixture {
  return {
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

const defaultThresholds = { soft: 3.5, moderate: 5.0, tough: 6.5, count: 0 };

function createMockFixtureRepo(fixtures: Fixture[] = [], yearLoaded = true): FixtureRepository {
  return {
    findByYear: () => fixtures,
    findByTeam: () => [],
    findByRound: () => [],
    findByYearAndTeam: () => [],
    isYearLoaded: () => yearLoaded,
    getLoadedYears: () => yearLoaded ? [2025] : [],
    getAllTeams: () => [],
    getTeamByCode: () => undefined,
    getLastScrapeTimes: () => ({}),
    getTotalFixtureCount: () => fixtures.length,
    loadFixtures: () => {},
  };
}

function createMockRankingService(): RankingService {
  return {
    getTeamRoundRanking: () => null,
    getTeamSeasonRanking: () => null,
    getAllTeamSeasonRankings: () => [],
    calculateSeasonThresholds: () => defaultThresholds,
  };
}

describe('GetSeasonSummaryUseCase', () => {
  it('returns null when year is not loaded', () => {
    const useCase = new GetSeasonSummaryUseCase(
      createMockFixtureRepo([], false),
      createMockRankingService()
    );
    expect(useCase.execute(2025)).toBeNull();
  });

  it('returns 27 rounds for a loaded year with no fixtures', () => {
    const useCase = new GetSeasonSummaryUseCase(
      createMockFixtureRepo([], true),
      createMockRankingService()
    );
    const result = useCase.execute(2025);
    expect(result).not.toBeNull();
    expect(result!.year).toBe(2025);
    expect(result!.rounds).toHaveLength(27);
    expect(result!.thresholds).toEqual(defaultThresholds);
  });

  it('correctly pairs home/away fixtures into matches', () => {
    const fixtures: Fixture[] = [
      createMockFixture({ teamCode: 'MNL', opponentCode: 'SYD', isHome: true, round: 1, strengthRating: 4.0 }),
      createMockFixture({ teamCode: 'SYD', opponentCode: 'MNL', isHome: false, round: 1, strengthRating: 6.0 }),
    ];
    const useCase = new GetSeasonSummaryUseCase(
      createMockFixtureRepo(fixtures),
      createMockRankingService()
    );
    const result = useCase.execute(2025)!;
    const round1 = result.rounds[0];
    expect(round1.matches).toHaveLength(1);
    expect(round1.matches[0].homeTeam).toBe('MNL');
    expect(round1.matches[0].awayTeam).toBe('SYD');
    expect(round1.matches[0].homeStrength).toBe(4.0);
    expect(round1.matches[0].awayStrength).toBe(6.0);
    expect(round1.byeTeams).toHaveLength(0);
  });

  it('identifies bye teams correctly', () => {
    const fixtures: Fixture[] = [
      createMockFixture({ teamCode: 'MNL', isBye: true, isHome: false, opponentCode: null, round: 3, strengthRating: 0 }),
      createMockFixture({ teamCode: 'SYD', isBye: true, isHome: false, opponentCode: null, round: 3, strengthRating: 0 }),
    ];
    const useCase = new GetSeasonSummaryUseCase(
      createMockFixtureRepo(fixtures),
      createMockRankingService()
    );
    const result = useCase.execute(2025)!;
    const round3 = result.rounds[2];
    expect(round3.matches).toHaveLength(0);
    expect(round3.byeTeams).toEqual(['MNL', 'SYD']);
  });
});
