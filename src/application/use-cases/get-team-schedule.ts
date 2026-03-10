import type { FixtureRepository } from '../ports/fixture-repository.js';
import type { RankingService } from '../ports/ranking-service.js';
import type { MatchRepository } from '../../domain/repositories/match-repository.js';
import type { TeamScheduleResult, ScheduleFixture } from '../results/team-schedule-result.js';
import type { Match } from '../../domain/match.js';
import { MatchStatus } from '../../domain/match.js';
import { fixtureRepositoryAdapter } from '../adapters/fixture-repository-adapter.js';
import { rankingServiceAdapter } from '../adapters/ranking-service-adapter.js';

export class GetTeamScheduleUseCase {
  constructor(
    private readonly fixtures: FixtureRepository,
    private readonly rankings: RankingService,
    private readonly matchRepository?: MatchRepository
  ) {}

  async execute(teamCode: string, year?: number): Promise<TeamScheduleResult> {
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

    // Batch-fetch matches for enrichment if repository available
    let matchesByKey = new Map<string, Match>();
    if (this.matchRepository && year) {
      const allMatches = await this.matchRepository.findByYear(year);
      for (const match of allMatches) {
        if (match.homeTeamCode && match.awayTeamCode) {
          matchesByKey.set(`${match.year}-${match.round}-${match.homeTeamCode}-${match.awayTeamCode}`, match);
        }
      }
    }

    const schedule: ScheduleFixture[] = teamFixtures.map(f => {
      const roundRanking = this.rankings.getTeamRoundRanking(f.year, teamCode, f.round);

      // Look up match data for this fixture
      let scheduledTime: string | null = null;
      let stadium: string | null = null;
      let weather: string | null = null;
      let homeScore: number | null = null;
      let awayScore: number | null = null;
      let isComplete = false;

      if (!f.isBye && f.opponentCode) {
        // Try both orientations: team as home or team as away
        const homeKey = `${f.year}-${f.round}-${teamCode}-${f.opponentCode}`;
        const awayKey = `${f.year}-${f.round}-${f.opponentCode}-${teamCode}`;
        const match = matchesByKey.get(homeKey) ?? matchesByKey.get(awayKey);

        if (match) {
          scheduledTime = match.scheduledTime;
          stadium = match.stadium;
          weather = match.weather;
          homeScore = match.homeScore;
          awayScore = match.awayScore;
          isComplete = match.status === MatchStatus.Completed;
        }
      }

      return {
        round: f.round,
        year: f.year,
        opponent: f.opponentCode,
        isHome: f.isHome,
        isBye: f.isBye,
        strengthRating: f.strengthRating,
        category: roundRanking?.category ?? 'medium' as const,
        scheduledTime,
        stadium,
        weather,
        homeScore,
        awayScore,
        isComplete,
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

export function createGetTeamScheduleUseCase(matchRepository?: MatchRepository): GetTeamScheduleUseCase {
  return new GetTeamScheduleUseCase(fixtureRepositoryAdapter, rankingServiceAdapter, matchRepository);
}
