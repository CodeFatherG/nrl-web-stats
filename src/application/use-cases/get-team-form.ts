/**
 * GetTeamFormUseCase — retrieves team form trajectory with caching.
 */

import type { MatchRepository } from '../../domain/repositories/match-repository.js';
import type { FixtureRepository } from '../ports/fixture-repository.js';
import type { AnalyticsCache } from '../../analytics/analytics-cache.js';
import type { FormTrajectory } from '../../analytics/types.js';
import { computeFormTrajectory } from '../../analytics/team-form-service.js';
import { resolveTeam } from '../../domain/team-identity.js';

export class GetTeamFormUseCase {
  constructor(
    private readonly matchRepository: MatchRepository,
    private readonly fixtureRepository: FixtureRepository,
    private readonly cache: AnalyticsCache
  ) {}

  async execute(teamCode: string, year: number, windowSize: number = 5): Promise<FormTrajectory> {
    const cacheKey = `form-${teamCode}-${year}-${windowSize}`;
    const version = String(await this.matchRepository.getMatchCount());

    const cached = this.cache.get<FormTrajectory>(cacheKey, version);
    if (cached) return cached;

    const matches = await this.matchRepository.findByYear(year);
    const fixtures = this.fixtureRepository.findByYearAndTeam(year, teamCode);
    const team = resolveTeam(teamCode);

    const result = computeFormTrajectory(matches, fixtures, teamCode, year, windowSize);
    const trajectory: FormTrajectory = {
      ...result,
      teamName: team?.name ?? teamCode,
    };

    this.cache.set(cacheKey, trajectory, version);
    return trajectory;
  }
}
