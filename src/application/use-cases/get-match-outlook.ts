/**
 * GetMatchOutlookUseCase — retrieves match outlook for a round with caching.
 */

import type { MatchRepository } from '../../domain/repositories/match-repository.js';
import type { FixtureRepository } from '../ports/fixture-repository.js';
import type { AnalyticsCache } from '../../analytics/analytics-cache.js';
import type { MatchOutlook, CompletedMatchResult } from '../../analytics/types.js';
import { computeFormTrajectory } from '../../analytics/team-form-service.js';
import { computeRoundOutlook } from '../../analytics/match-outlook-service.js';

interface OutlookResult {
  year: number;
  round: number;
  matches: MatchOutlook[];
  completedMatches: CompletedMatchResult[];
}

export class GetMatchOutlookUseCase {
  constructor(
    private readonly matchRepository: MatchRepository,
    private readonly fixtureRepository: FixtureRepository,
    private readonly cache: AnalyticsCache
  ) {}

  execute(year: number, round: number, windowSize: number = 5): OutlookResult {
    const cacheKey = `outlook-${year}-${round}-${windowSize}`;
    const version = String(this.matchRepository.getMatchCount());

    const cached = this.cache.get<OutlookResult>(cacheKey, version);
    if (cached) return cached;

    const roundMatches = this.matchRepository.findByYearAndRound(year, round);
    const allMatches = this.matchRepository.findByYear(year);
    // Also get matches from other years for h2h
    const allYears = this.matchRepository.getLoadedYears();
    const allMatchesAllYears = allYears.flatMap(y => this.matchRepository.findByYear(y));

    const fixtures = this.fixtureRepository.findByYear(year);

    // Build form rating lookup
    const formCache = new Map<string, number | null>();
    const getFormRating = (teamCode: string): number | null => {
      if (formCache.has(teamCode)) return formCache.get(teamCode)!;
      const teamFixtures = this.fixtureRepository.findByYearAndTeam(year, teamCode);
      const trajectory = computeFormTrajectory(allMatches, teamFixtures, teamCode, year, windowSize);
      formCache.set(teamCode, trajectory.rollingFormRating);
      return trajectory.rollingFormRating;
    };

    const { outlooks, completed } = computeRoundOutlook(
      roundMatches,
      allMatchesAllYears,
      fixtures,
      getFormRating
    );

    const result: OutlookResult = {
      year,
      round,
      matches: outlooks,
      completedMatches: completed,
    };

    this.cache.set(cacheKey, result, version);
    return result;
  }
}
