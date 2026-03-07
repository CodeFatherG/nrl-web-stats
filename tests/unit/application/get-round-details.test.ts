import { describe, it, expect } from 'vitest';
import { GetRoundDetailsUseCase } from '../../../src/application/use-cases/get-round-details.js';
import type { FixtureRepository } from '../../../src/application/ports/fixture-repository.js';
import type { Fixture } from '../../../src/models/fixture.js';

function createMockFixture(overrides: Partial<Fixture> = {}): Fixture {
  return {
    teamCode: 'MNL',
    opponentCode: 'SYD',
    round: 5,
    year: 2025,
    isHome: true,
    isBye: false,
    strengthRating: 5.0,
    ...overrides,
  };
}

function createMockFixtureRepo(roundFixtures: Fixture[] = []): FixtureRepository {
  return {
    findByYear: () => [],
    findByTeam: () => [],
    findByRound: () => roundFixtures,
    findByYearAndTeam: () => [],
    isYearLoaded: () => true,
    getLoadedYears: () => [2025],
    getAllTeams: () => [],
    getTeamByCode: () => undefined,
    getLastScrapeTimes: () => ({}),
    getTotalFixtureCount: () => 0,
    loadFixtures: () => {},
  };
}

describe('GetRoundDetailsUseCase', () => {
  it('correctly pairs home/away matches with strength ratings', () => {
    const fixtures: Fixture[] = [
      createMockFixture({ teamCode: 'MNL', opponentCode: 'SYD', isHome: true, strengthRating: 4.0 }),
      createMockFixture({ teamCode: 'SYD', opponentCode: 'MNL', isHome: false, strengthRating: 6.0 }),
    ];
    const useCase = new GetRoundDetailsUseCase(createMockFixtureRepo(fixtures));
    const result = useCase.execute(2025, 5);
    expect(result.year).toBe(2025);
    expect(result.round).toBe(5);
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]).toEqual({
      homeTeam: 'MNL',
      awayTeam: 'SYD',
      homeStrength: 4.0,
      awayStrength: 6.0,
      homeScore: null,
      awayScore: null,
      scheduledTime: null,
      isComplete: false,
    });
    expect(result.byeTeams).toHaveLength(0);
  });

  it('returns bye teams with empty matches for bye-only round', () => {
    const fixtures: Fixture[] = [
      createMockFixture({ teamCode: 'MNL', isBye: true, isHome: false, opponentCode: null, strengthRating: 0 }),
      createMockFixture({ teamCode: 'SYD', isBye: true, isHome: false, opponentCode: null, strengthRating: 0 }),
    ];
    const useCase = new GetRoundDetailsUseCase(createMockFixtureRepo(fixtures));
    const result = useCase.execute(2025, 5);
    expect(result.matches).toHaveLength(0);
    expect(result.byeTeams).toEqual(['MNL', 'SYD']);
  });

  it('handles home fixture without matching away fixture gracefully', () => {
    const fixtures: Fixture[] = [
      createMockFixture({ teamCode: 'MNL', opponentCode: 'SYD', isHome: true, strengthRating: 4.0 }),
    ];
    const useCase = new GetRoundDetailsUseCase(createMockFixtureRepo(fixtures));
    const result = useCase.execute(2025, 5);
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].awayStrength).toBe(0);
  });
});
