import type { FixtureRepository } from '../ports/fixture-repository.js';
import type { RoundDetailsResult } from '../results/round-details-result.js';
import { fixtureRepositoryAdapter } from '../adapters/fixture-repository-adapter.js';

export class GetRoundDetailsUseCase {
  constructor(private readonly fixtures: FixtureRepository) {}

  execute(year: number, round: number): RoundDetailsResult {
    const roundFixtures = this.fixtures.findByRound(year, round);

    const byeTeams: string[] = [];
    const matchMap = new Map<string, { homeTeam: string; awayTeam: string; homeStrength: number; awayStrength: number }>();

    for (const fixture of roundFixtures) {
      if (fixture.isBye) {
        byeTeams.push(fixture.teamCode);
      } else if (fixture.isHome && fixture.opponentCode) {
        const awayFixture = roundFixtures.find(
          f => f.teamCode === fixture.opponentCode && f.opponentCode === fixture.teamCode
        );

        matchMap.set(`${fixture.teamCode}-${fixture.opponentCode}`, {
          homeTeam: fixture.teamCode,
          awayTeam: fixture.opponentCode,
          homeStrength: fixture.strengthRating,
          awayStrength: awayFixture?.strengthRating ?? 0,
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

export function createGetRoundDetailsUseCase(): GetRoundDetailsUseCase {
  return new GetRoundDetailsUseCase(fixtureRepositoryAdapter);
}
