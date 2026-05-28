import { describe, it, expect } from 'vitest';
import { GetTeamScheduleUseCase } from '../../../src/application/use-cases/get-team-schedule.js';
import type { FixtureArtifact, FixtureRepository } from '../../../src/domain/repositories/fixture-repository.js';
import type { GetTeamStrengthRankingsUseCase } from '../../../src/application/use-cases/get-team-strength-rankings.js';
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

function makeArtifact(year: number, fixtures: Fixture[]): FixtureArtifact {
  return {
    year,
    computedAt: '2026-05-20T00:00:00.000Z',
    freshness: { lastScrapedAt: '2026-05-20T00:00:00.000Z' },
    payload: fixtures,
  };
}

function createMockFixtureRepo(fixtures: Fixture[] = []): FixtureRepository {
  const years = [...new Set(fixtures.map(f => f.year))];
  return {
    findByYear: async (year) => {
      const yearFixtures = fixtures.filter(f => f.year === year);
      if (yearFixtures.length === 0 && !years.includes(year)) return null;
      return makeArtifact(year, yearFixtures);
    },
    findByYearAndTeam: async (year, code) => {
      if (!years.includes(year)) return null;
      return makeArtifact(year, fixtures.filter(f => f.year === year && f.teamCode === code));
    },
    listScrapedYears: async () => {
      const map = new Map<number, string>();
      for (const y of years) map.set(y, '2026-05-20T00:00:00.000Z');
      return map;
    },
    save: async () => {},
  };
}

function createMockRankings(
  rankings: Map<string, TeamRoundRanking> = new Map(),
  thresholds: SeasonThresholds | null = defaultThresholds,
): GetTeamStrengthRankingsUseCase {
  return {
    getSeasonThresholds: async () => thresholds,
    getRoundRanking: async (year: number, round: number, code: string) =>
      rankings.get(`${year}-${code}-${round}`) ?? null,
    getRoundRankingsForTeam: async (year: number, code: string) => {
      const out = new Map<number, TeamRoundRanking>();
      for (const [key, ranking] of rankings) {
        const [keyYear, keyCode, keyRound] = key.split('-');
        if (Number(keyYear) === year && keyCode === code) {
          out.set(Number(keyRound), ranking);
        }
      }
      return out;
    },
    getSeasonRanking: async () => null,
    getAllSeasonRankings: async () => null,
  } as unknown as GetTeamStrengthRankingsUseCase;
}

describe('GetTeamScheduleUseCase', () => {
  it('returns enriched schedule with categories, totalStrength, byeRounds, and thresholds', async () => {
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
      createMockRankings(rankings),
    );

    const result = await useCase.execute('MNL', 2025);

    expect(result.teamCode).toBe('MNL');
    expect(result.teamName).toBe('Manly Sea Eagles');
    expect(result.schedule).toHaveLength(3);
    expect(result.schedule[0].category).toBe('hard');
    expect(result.schedule[1].category).toBe('easy');
    expect(result.schedule[2].category).toBe('medium'); // bye defaults to medium
    expect(result.totalStrength).toBe(200);
    expect(result.byeRounds).toEqual([3]);
    expect(result.thresholds).toEqual(defaultThresholds);
  });

  it('returns all fixtures when no year is specified', async () => {
    const fixtures = [
      makeFixture({ year: 2024, round: 1, id: '2024-MNL-1' }),
      makeFixture({ year: 2025, round: 1, id: '2025-MNL-1' }),
    ];

    const useCase = new GetTeamScheduleUseCase(
      createMockFixtureRepo(fixtures),
      createMockRankings(),
    );

    const result = await useCase.execute('MNL');
    expect(result.schedule).toHaveLength(2);
    expect(result.schedule[0].year).toBe(2024);
    expect(result.schedule[1].year).toBe(2025);
  });

  it('returns empty schedule with zero totalStrength when no fixtures exist', async () => {
    const useCase = new GetTeamScheduleUseCase(
      createMockFixtureRepo([]),
      createMockRankings(),
    );

    const result = await useCase.execute('MNL', 2025);

    expect(result.schedule).toHaveLength(0);
    expect(result.totalStrength).toBe(0);
    expect(result.byeRounds).toEqual([]);
    expect(result.thresholds).toEqual(defaultThresholds);
  });

  it('returns teamCode as teamName when team not found in repository', async () => {
    const useCase = new GetTeamScheduleUseCase(
      createMockFixtureRepo([]),
      createMockRankings(),
    );

    const result = await useCase.execute('XYZ', 2025);
    expect(result.teamName).toBe('XYZ');
  });
});
