import { describe, it, expect } from 'vitest';
import { GetTeamScheduleUseCase } from '../../../src/application/use-cases/get-team-schedule.js';
import type { FixtureRepository } from '../../../src/application/ports/fixture-repository.js';
import type { RankingService } from '../../../src/application/ports/ranking-service.js';
import type { Fixture } from '../../../src/models/fixture.js';
import type { TeamRoundRanking, SeasonThresholds } from '../../../src/models/types.js';

function makeFixture(overrides: Partial<Fixture> = {}): Fixture {
  return {
    id: '2025-MNL-1',
    year: 2025,
    round: 1,
    teamCode: 'MNL',
    opponentCode: 'MEL',
    isHome: true,
    isBye: false,
    strengthRating: 120,
    ...overrides,
  };
}

function makeRoundRanking(overrides: Partial<TeamRoundRanking> = {}): TeamRoundRanking {
  return {
    teamCode: 'MNL',
    year: 2025,
    round: 1,
    strengthRating: 120,
    percentile: 0.5,
    category: 'medium',
    opponentCode: 'MEL',
    isHome: true,
    isBye: false,
    ...overrides,
  };
}

const defaultThresholds: SeasonThresholds = { p33: 100, p67: 150, lowerFence: 50, upperFence: 200 };

function createMockFixtureRepo(fixtures: Fixture[] = []): FixtureRepository {
  return {
    findByYear: (year) => fixtures.filter(f => f.year === year),
    findByTeam: (code) => fixtures.filter(f => f.teamCode === code),
    findByRound: (year, round) => fixtures.filter(f => f.year === year && f.round === round),
    findByYearAndTeam: (year, code) => fixtures.filter(f => f.year === year && f.teamCode === code),
    isYearLoaded: () => true,
    getLoadedYears: () => [2025],
    getAllTeams: () => [{ code: 'MNL', name: 'Manly Sea Eagles' }],
    getTeamByCode: (code) => code === 'MNL' ? { code: 'MNL', name: 'Manly Sea Eagles' } : undefined,
    getLastScrapeTimes: () => ({}),
    getTotalFixtureCount: () => fixtures.length,
    loadFixtures: () => {},
  };
}

function createMockRankingService(rankings: Map<string, TeamRoundRanking> = new Map()): RankingService {
  return {
    getTeamRoundRanking: (year, code, round) => rankings.get(`${year}-${code}-${round}`) ?? null,
    getTeamSeasonRanking: () => null,
    getAllTeamSeasonRankings: () => [],
    calculateSeasonThresholds: () => defaultThresholds,
  };
}

describe('GetTeamScheduleUseCase', () => {
  it('returns enriched schedule with categories, totalStrength, byeRounds, and thresholds', () => {
    const fixtures = [
      makeFixture({ round: 1, strengthRating: 120 }),
      makeFixture({ round: 2, opponentCode: 'BRO', strengthRating: 80, id: '2025-MNL-2' }),
      makeFixture({ round: 3, opponentCode: null, isBye: true, isHome: false, strengthRating: 0, id: '2025-MNL-3' }),
    ];

    const rankings = new Map<string, TeamRoundRanking>();
    rankings.set('2025-MNL-1', makeRoundRanking({ round: 1, category: 'hard' }));
    rankings.set('2025-MNL-2', makeRoundRanking({ round: 2, category: 'easy', strengthRating: 80 }));

    const useCase = new GetTeamScheduleUseCase(
      createMockFixtureRepo(fixtures),
      createMockRankingService(rankings)
    );

    const result = useCase.execute('MNL', 2025);

    expect(result.teamCode).toBe('MNL');
    expect(result.teamName).toBe('Manly Sea Eagles');
    expect(result.schedule).toHaveLength(3);
    expect(result.schedule[0].category).toBe('hard');
    expect(result.schedule[1].category).toBe('easy');
    expect(result.schedule[2].category).toBe('medium'); // bye defaults to medium
    expect(result.totalStrength).toBe(200); // 120 + 80
    expect(result.byeRounds).toEqual([3]);
    expect(result.thresholds).toEqual(defaultThresholds);
  });

  it('returns all fixtures when no year is specified', () => {
    const fixtures = [
      makeFixture({ year: 2024, round: 1, id: '2024-MNL-1' }),
      makeFixture({ year: 2025, round: 1, id: '2025-MNL-1' }),
    ];

    const useCase = new GetTeamScheduleUseCase(
      createMockFixtureRepo(fixtures),
      createMockRankingService()
    );

    const result = useCase.execute('MNL');
    expect(result.schedule).toHaveLength(2);
    expect(result.schedule[0].year).toBe(2024);
    expect(result.schedule[1].year).toBe(2025);
  });

  it('returns empty schedule with zero totalStrength when no fixtures exist', () => {
    const useCase = new GetTeamScheduleUseCase(
      createMockFixtureRepo([]),
      createMockRankingService()
    );

    const result = useCase.execute('MNL', 2025);

    expect(result.schedule).toHaveLength(0);
    expect(result.totalStrength).toBe(0);
    expect(result.byeRounds).toEqual([]);
    expect(result.thresholds).toEqual(defaultThresholds); // thresholds still returned when year is given
  });

  it('returns teamCode as teamName when team not found in repository', () => {
    const useCase = new GetTeamScheduleUseCase(
      createMockFixtureRepo([]),
      createMockRankingService()
    );

    const result = useCase.execute('XYZ', 2025);
    expect(result.teamName).toBe('XYZ');
  });
});
