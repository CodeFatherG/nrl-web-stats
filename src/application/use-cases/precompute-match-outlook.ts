/**
 * PrecomputeMatchOutlookUseCase — per-(year,round) leaf job for the
 * match-outlook fan-out precompute pipeline.
 *
 * Feature: 037-analytics-cache-replacement (T050).
 */

import type { MatchRepository } from '../../domain/repositories/match-repository.js';
import type { FixtureRepository } from '../../domain/repositories/fixture-repository.js';
import type {
  MatchOutlookAggregate,
  MatchOutlookRepository,
  MatchOutlookPayload,
} from '../../domain/repositories/match-outlook-repository.js';
import type { Match } from '../../domain/match.js';
import { computeFormTrajectory } from '../../analytics/team-form-service.js';
import { computeRoundOutlook } from '../../analytics/match-outlook-service.js';

const DEFAULT_WINDOW_SIZE = 5;

export interface PrecomputeMatchOutlookInput {
  readonly year: number;
  readonly asOfRound: number;
  readonly round: number;
}

export class PrecomputeMatchOutlookUseCase {
  constructor(
    private readonly matchRepository: MatchRepository,
    private readonly fixtureRepository: FixtureRepository,
    private readonly matchOutlookRepository: MatchOutlookRepository,
  ) {}

  async execute(input: PrecomputeMatchOutlookInput): Promise<void> {
    const { year, asOfRound, round } = input;

    const roundMatches = await this.matchRepository.findByYearAndRound(
      year,
      round,
    );
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
        DEFAULT_WINDOW_SIZE,
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

    const outlook: MatchOutlookPayload = {
      year,
      round,
      matches: outlooks,
      completedMatches: completed,
    };
    const aggregate: MatchOutlookAggregate = {
      year,
      round,
      asOfRound,
      computedAt: new Date().toISOString(),
      outlook,
    };
    await this.matchOutlookRepository.saveMatchOutlookAggregate(aggregate);
  }
}
