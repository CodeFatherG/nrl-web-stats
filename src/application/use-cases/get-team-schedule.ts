import type { FixtureRepository } from '../../domain/repositories/fixture-repository.js';
import type { GetTeamStrengthRankingsUseCase } from './get-team-strength-rankings.js';
import type { MatchRepository } from '../../domain/repositories/match-repository.js';
import type { Fixture } from '../../models/fixture.js';
import type { TeamScheduleResult, ScheduleFixture } from '../results/team-schedule-result.js';
import type { Match } from '../../domain/match.js';
import type { TeamRoundRanking } from '../../models/types.js';
import { MatchStatus } from '../../domain/match.js';
import { getTeamByCode } from '../../database/store.js';

export class GetTeamScheduleUseCase {
  constructor(
    private readonly fixtures: FixtureRepository,
    private readonly rankings: GetTeamStrengthRankingsUseCase,
    private readonly matchRepository?: MatchRepository,
  ) {}

  async execute(teamCode: string, year?: number): Promise<TeamScheduleResult> {
    const team = getTeamByCode(teamCode);
    const teamName = team?.name ?? teamCode;

    let teamFixtures: Fixture[];
    const yearsToLoad: number[] = [];
    if (year !== undefined) {
      const artifact = await this.fixtures.findByYearAndTeam(year, teamCode);
      teamFixtures = artifact ? [...artifact.payload] : [];
      yearsToLoad.push(year);
    } else {
      const years = await this.fixtures.listScrapedYears();
      const acc: Fixture[] = [];
      for (const y of years.keys()) {
        const artifact = await this.fixtures.findByYearAndTeam(y, teamCode);
        if (artifact) acc.push(...artifact.payload);
        yearsToLoad.push(y);
      }
      teamFixtures = acc;
    }

    teamFixtures = [...teamFixtures].sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year;
      return a.round - b.round;
    });

    const matchesByKey = new Map<string, Match>();
    if (this.matchRepository && year) {
      const allMatches = await this.matchRepository.findByYear(year);
      for (const match of allMatches) {
        if (match.homeTeamCode && match.awayTeamCode) {
          matchesByKey.set(`${match.year}-${match.round}-${match.homeTeamCode}-${match.awayTeamCode}`, match);
        }
      }
    }

    // Batched: one coverage-list + one watermark lookup per year, instead of
    // re-doing both inside getRoundRanking for every fixture in the loop.
    const rankingsByYear = new Map<number, Map<number, TeamRoundRanking>>();
    await Promise.all(
      yearsToLoad.map(async (y) => {
        const map = await this.rankings.getRoundRankingsForTeam(y, teamCode);
        rankingsByYear.set(y, map);
      }),
    );

    const schedule: ScheduleFixture[] = [];
    for (const f of teamFixtures) {
      const roundRanking = rankingsByYear.get(f.year)?.get(f.round) ?? null;

      let scheduledTime: string | null = null;
      let stadium: string | null = null;
      let weather: string | null = null;
      let homeScore: number | null = null;
      let awayScore: number | null = null;
      let isComplete = false;

      if (!f.isBye && f.opponentCode) {
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

      schedule.push({
        round: f.round,
        year: f.year,
        opponent: f.opponentCode,
        isHome: f.isHome,
        isBye: f.isBye,
        strengthRating: f.strengthRating,
        category: roundRanking?.category ?? ('medium' as const),
        scheduledTime,
        stadium,
        weather,
        homeScore,
        awayScore,
        isComplete,
      });
    }

    const totalStrength = schedule
      .filter(f => !f.isBye)
      .reduce((sum, f) => sum + f.strengthRating, 0);

    const byeRounds = schedule.filter(f => f.isBye).map(f => f.round);

    const scheduleYear = year ?? teamFixtures[0]?.year;
    const thresholds = scheduleYear
      ? (await this.rankings.getSeasonThresholds(scheduleYear)) ?? undefined
      : undefined;

    return { teamCode, teamName, schedule, totalStrength, byeRounds, thresholds };
  }
}

export function createGetTeamScheduleUseCase(
  fixtureRepository: FixtureRepository,
  rankings: GetTeamStrengthRankingsUseCase,
  matchRepository?: MatchRepository,
): GetTeamScheduleUseCase {
  return new GetTeamScheduleUseCase(fixtureRepository, rankings, matchRepository);
}
