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
        let stadium: string | null = null;
        let weather: string | null = null;

        if (this.matchRepository) {
          const matchId = createMatchId(fixture.teamCode, fixture.opponentCode, year, round);
          const match = await this.matchRepository.findById(matchId);
          if (match) {
            homeScore = match.homeScore;
            awayScore = match.awayScore;
            scheduledTime = match.scheduledTime;
            isComplete = match.status === MatchStatus.Completed;
            stadium = match.stadium;
            weather = match.weather;
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
          stadium,
          weather,
        });
      }
    }

    const matches = Array.from(matchMap.values()).sort((a, b) => {
      if (a.scheduledTime && b.scheduledTime) return a.scheduledTime.localeCompare(b.scheduledTime);
      if (a.scheduledTime) return -1;
      if (b.scheduledTime) return 1;
      return 0;
    });

    return { year, round, matches, byeTeams };
  }
}

export function createGetRoundDetailsUseCase(matchRepository?: MatchRepository): GetRoundDetailsUseCase {
  return new GetRoundDetailsUseCase(fixtureRepositoryAdapter, matchRepository);
}
