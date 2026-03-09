import type { FixtureRepository } from '../ports/fixture-repository.js';
import type { MatchRepository } from '../../domain/repositories/match-repository.js';
import type { RoundDetailsResult, RoundMatch } from '../results/round-details-result.js';
import { createMatchId, MatchStatus } from '../../domain/match.js';
import { fixtureRepositoryAdapter } from '../adapters/fixture-repository-adapter.js';

export class GetRoundDetailsUseCase {
  constructor(
    private readonly fixtures: FixtureRepository,
    private readonly matchRepository?: MatchRepository
  ) {}

  async execute(year: number, round: number): Promise<RoundDetailsResult> {
    const roundFixtures = this.fixtures.findByRound(year, round);

    const byeTeams: string[] = [];
    const matchMap = new Map<string, RoundMatch>();

    for (const fixture of roundFixtures) {
      if (fixture.isBye) {
        byeTeams.push(fixture.teamCode);
      } else if (fixture.isHome && fixture.opponentCode) {
        const awayFixture = roundFixtures.find(
          f => f.teamCode === fixture.opponentCode && f.opponentCode === fixture.teamCode
        );

        // Look up enriched match data if available
        let homeScore: number | null = null;
        let awayScore: number | null = null;
        let scheduledTime: string | null = null;
        let isComplete = false;

        if (this.matchRepository) {
          const matchId = createMatchId(fixture.teamCode, fixture.opponentCode, year, round);
          const match = await this.matchRepository.findById(matchId);
          if (match) {
            homeScore = match.homeScore;
            awayScore = match.awayScore;
            scheduledTime = match.scheduledTime;
            isComplete = match.status === MatchStatus.Completed;
          }
        }

        matchMap.set(`${fixture.teamCode}-${fixture.opponentCode}`, {
          homeTeam: fixture.teamCode,
          awayTeam: fixture.opponentCode,
          homeStrength: fixture.strengthRating,
          awayStrength: awayFixture?.strengthRating ?? 0,
          homeScore,
          awayScore,
          scheduledTime,
          isComplete,
        });
      }
    }

    return {
      year,
      round,
      matches: Array.from(matchMap.values()),
      byeTeams,
    };
  }
}

export function createGetRoundDetailsUseCase(matchRepository?: MatchRepository): GetRoundDetailsUseCase {
  return new GetRoundDetailsUseCase(fixtureRepositoryAdapter, matchRepository);
}
