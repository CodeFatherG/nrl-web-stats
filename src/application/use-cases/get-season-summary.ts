import type { FixtureRepository } from '../../domain/repositories/fixture-repository.js';
import type { RankingService } from '../ports/ranking-service.js';
import type { MatchRepository } from '../../domain/repositories/match-repository.js';
import type { TeamListRepository } from '../../domain/repositories/team-list-repository.js';
import type { SeasonSummaryResult, MatchPairing, RoundSummary } from '../results/season-summary-result.js';
import { createMatchId, MatchStatus } from '../../domain/match.js';
import { rankingServiceAdapter } from '../adapters/ranking-service-adapter.js';

export class GetSeasonSummaryUseCase {
  constructor(
    private readonly fixtures: FixtureRepository,
    private readonly rankings: RankingService,
    private readonly matchRepository?: MatchRepository,
    private readonly teamListRepository?: TeamListRepository,
  ) {}

  async execute(year: number): Promise<SeasonSummaryResult | null> {
    const artifact = await this.fixtures.findByYear(year);
    if (!artifact) return null;
    const yearFixtures = artifact.payload;

    const roundsMap = new Map<number, { matches: MatchPairing[]; byeTeams: string[] }>();
    for (let round = 1; round <= 27; round++) {
      roundsMap.set(round, { matches: [], byeTeams: [] });
    }

    for (const fixture of yearFixtures) {
      const roundData = roundsMap.get(fixture.round);
      if (!roundData) continue;

      if (fixture.isBye) {
        roundData.byeTeams.push(fixture.teamCode);
      } else if (fixture.isHome && fixture.opponentCode) {
        const awayFixture = yearFixtures.find(
          f => f.round === fixture.round && f.teamCode === fixture.opponentCode && !f.isHome,
        );

        let homeScore: number | null = null;
        let awayScore: number | null = null;
        let scheduledTime: string | null = null;
        let isComplete = false;

        if (this.matchRepository) {
          const matchId = createMatchId(fixture.teamCode, fixture.opponentCode, year, fixture.round);
          const match = await this.matchRepository.findById(matchId);
          if (match) {
            homeScore = match.homeScore;
            awayScore = match.awayScore;
            scheduledTime = match.scheduledTime;
            isComplete = match.status === MatchStatus.Completed;
          }
        }

        roundData.matches.push({
          homeTeam: fixture.teamCode,
          awayTeam: fixture.opponentCode,
          homeScore,
          awayScore,
          scheduledTime,
          isComplete,
          homeStrength: fixture.strengthRating,
          awayStrength: awayFixture?.strengthRating ?? 0,
        });
      }
    }

    const roundsWithTeamLists = this.teamListRepository
      ? await this.teamListRepository.getRoundsWithTeamLists(year)
      : new Set<number>();

    const rounds: RoundSummary[] = Array.from(roundsMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([round, data]) => ({
        round,
        matches: data.matches,
        byeTeams: data.byeTeams,
        hasTeamLists: roundsWithTeamLists.has(round),
      }));

    return {
      year,
      thresholds: await this.rankings.calculateSeasonThresholds(year),
      rounds,
    };
  }
}

export function createGetSeasonSummaryUseCase(
  fixtureRepository: FixtureRepository,
  matchRepository?: MatchRepository,
  teamListRepository?: TeamListRepository,
): GetSeasonSummaryUseCase {
  return new GetSeasonSummaryUseCase(fixtureRepository, rankingServiceAdapter, matchRepository, teamListRepository);
}
