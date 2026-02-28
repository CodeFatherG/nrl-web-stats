import type { FixtureRepository } from '../ports/fixture-repository.js';
import type { RankingService } from '../ports/ranking-service.js';
import type { TeamScheduleResult } from '../results/team-schedule-result.js';
import { fixtureRepositoryAdapter } from '../adapters/fixture-repository-adapter.js';
import { rankingServiceAdapter } from '../adapters/ranking-service-adapter.js';

export class GetTeamScheduleUseCase {
  constructor(
    private readonly fixtures: FixtureRepository,
    private readonly rankings: RankingService
  ) {}

  execute(teamCode: string, year?: number): TeamScheduleResult {
    const team = this.fixtures.getTeamByCode(teamCode);
    const teamName = team?.name ?? teamCode;

    let teamFixtures = year
      ? this.fixtures.findByYearAndTeam(year, teamCode)
      : this.fixtures.findByTeam(teamCode);

    // Sort by year then round
    teamFixtures = [...teamFixtures].sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year;
      return a.round - b.round;
    });

    const schedule = teamFixtures.map(f => {
      const roundRanking = this.rankings.getTeamRoundRanking(f.year, teamCode, f.round);
      return {
        round: f.round,
        year: f.year,
        opponent: f.opponentCode,
        isHome: f.isHome,
        isBye: f.isBye,
        strengthRating: f.strengthRating,
        category: roundRanking?.category ?? 'medium' as const,
      };
    });

    const totalStrength = schedule
      .filter(f => !f.isBye)
      .reduce((sum, f) => sum + f.strengthRating, 0);

    const byeRounds = schedule
      .filter(f => f.isBye)
      .map(f => f.round);

    const scheduleYear = year ?? teamFixtures[0]?.year;
    const thresholds = scheduleYear ? this.rankings.calculateSeasonThresholds(scheduleYear) : undefined;

    return { teamCode, teamName, schedule, totalStrength, byeRounds, thresholds };
  }
}

export function createGetTeamScheduleUseCase(): GetTeamScheduleUseCase {
  return new GetTeamScheduleUseCase(fixtureRepositoryAdapter, rankingServiceAdapter);
}
