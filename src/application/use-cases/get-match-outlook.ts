/**
 * GetMatchOutlookUseCase — fetches the outlook for a (year, round).
 *
 * Spec 037 split: findPrecomputed (default windowSize) + computeLive (any).
 */

import type { MatchRepository } from '../../domain/repositories/match-repository.js';
import type { FixtureRepository } from '../../domain/repositories/fixture-repository.js';
import type {
  MatchOutlookAggregate,
  MatchOutlookPayload,
  MatchOutlookRepository,
} from '../../domain/repositories/match-outlook-repository.js';
import type { Match } from '../../domain/match.js';
import { computeFormTrajectory } from '../../analytics/team-form-service.js';
import { computeRoundOutlook } from '../../analytics/match-outlook-service.js';

export const DEFAULT_MATCH_OUTLOOK_WINDOW_SIZE = 5;

export class GetMatchOutlookUseCase {
  constructor(
    private readonly matchRepository: MatchRepository,
    private readonly fixtureRepository: FixtureRepository,
    private readonly matchOutlookRepository: MatchOutlookRepository,
  ) {}

  async findPrecomputed(
    year: number,
    round: number,
  ): Promise<MatchOutlookAggregate | null> {
    return this.matchOutlookRepository.findMatchOutlookAggregate(year, round);
  }

  async computeLive(
    year: number,
    round: number,
    windowSize: number = DEFAULT_MATCH_OUTLOOK_WINDOW_SIZE,
  ): Promise<MatchOutlookPayload> {
    const roundMatches = await this.matchRepository.findByYearAndRound(year, round);
    const allMatches = await this.matchRepository.findByYear(year);
    const allYears = await this.matchRepository.getLoadedYears();
    const allMatchesAllYears: Match[] = [];
    for (const y of allYears) {
      const yearMatches = await this.matchRepository.findByYear(y);
      allMatchesAllYears.push(...yearMatches);
    }
    const yearArtifact = await this.fixtureRepository.findByYear(year);
    const fixtures = yearArtifact ? [...yearArtifact.payload] : [];

    const formCache = new Map<string, number | null>();
    const getFormRating = (teamCode: string): number | null => {
      if (formCache.has(teamCode)) return formCache.get(teamCode)!;
      const teamFixtures = fixtures.filter(f => f.teamCode === teamCode);
      const trajectory = computeFormTrajectory(
        allMatches,
        teamFixtures,
        teamCode,
        year,
        windowSize,
      );
      formCache.set(teamCode, trajectory.rollingFormRating);
      return trajectory.rollingFormRating;
    };

    const { outlooks, completed } = computeRoundOutlook(
      roundMatches,
      allMatchesAllYears,
      fixtures,
      getFormRating,
    );

    return {
      year,
      round,
      matches: outlooks,
      completedMatches: completed,
    };
  }
}
