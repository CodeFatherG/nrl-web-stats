import type { FixtureRepository } from '../ports/fixture-repository.js';
import type { RankingService } from '../ports/ranking-service.js';
import type { MatchRepository } from '../../domain/repositories/match-repository.js';
import type { SeasonSummaryResult, MatchPairing, RoundSummary } from '../results/season-summary-result.js';
import { createMatchId, MatchStatus } from '../../domain/match.js';
import { fixtureRepositoryAdapter } from '../adapters/fixture-repository-adapter.js';
import { rankingServiceAdapter } from '../adapters/ranking-service-adapter.js';

export class GetSeasonSummaryUseCase {
  constructor(
    private readonly fixtures: FixtureRepository,
    private readonly rankings: RankingService,
    private readonly matchRepository?: MatchRepository
  ) {}

  async execute(year: number): Promise<SeasonSummaryResult | null> {
    if (!this.fixtures.isYearLoaded(year)) {
      return null;
    }

    const yearFixtures = this.fixtures.findByYear(year);

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
          f => f.round === fixture.round && f.teamCode === fixture.opponentCode && !f.isHome
        );

        // Look up enriched match data (scores, status, scheduledTime) if available
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

    const rounds: RoundSummary[] = Array.from(roundsMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([round, data]) => ({
        round,
        matches: data.matches,
        byeTeams: data.byeTeams,
      }));

    return {
      year,
      thresholds: this.rankings.calculateSeasonThresholds(year),
      rounds,
    };
  }
}

export function createGetSeasonSummaryUseCase(matchRepository?: MatchRepository): GetSeasonSummaryUseCase {
  return new GetSeasonSummaryUseCase(fixtureRepositoryAdapter, rankingServiceAdapter, matchRepository);
}
