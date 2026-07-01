/**
 * GetTeamFormUseCase — fetches a team's form trajectory.
 *
 * After spec 037 the use case has two read paths:
 *   - findPrecomputed: returns the stored aggregate for the default
 *     windowSize=5 (or null on a precompute miss). Bounded latency.
 *   - computeLive: runs the analytics service inline. Used by the handler
 *     for non-default windowSize requests and for the precompute job.
 *
 * The use case itself NEVER writes to the repository — all writes go through
 * PrecomputeTeamFormUseCase.
 */

import type { MatchRepository } from '../../domain/repositories/match-repository.js';
import type { FixtureRepository } from '../../domain/repositories/fixture-repository.js';
import type {
  TeamFormAggregate,
  TeamFormRepository,
} from '../../domain/repositories/team-form-repository.js';
import type { FormTrajectory } from '../../analytics/types.js';
import { computeFormTrajectory } from '../../analytics/team-form-service.js';
import { resolveTeam } from '../../domain/team-identity.js';

export const DEFAULT_TEAM_FORM_WINDOW_SIZE = 5;

export class GetTeamFormUseCase {
  constructor(
    private readonly matchRepository: MatchRepository,
    private readonly fixtureRepository: FixtureRepository,
    private readonly teamFormRepository: TeamFormRepository,
  ) {}

  /** Default-params read path. Returns `null` on a precompute miss; the
   *  handler emits the unavailable envelope. */
  async findPrecomputed(
    teamCode: string,
    year: number,
  ): Promise<TeamFormAggregate | null> {
    return this.teamFormRepository.findTeamFormAggregate(year, teamCode);
  }

  /** Live-compute path. Used by the handler for non-default windowSize and
   *  by PrecomputeTeamFormUseCase. */
  async computeLive(
    teamCode: string,
    year: number,
    windowSize: number = DEFAULT_TEAM_FORM_WINDOW_SIZE,
  ): Promise<FormTrajectory> {
    const matches = await this.matchRepository.findByYear(year);
    const artifact = await this.fixtureRepository.findByYearAndTeam(year, teamCode);
    const fixtures = artifact ? [...artifact.payload] : [];
    const team = resolveTeam(teamCode);
    const result = computeFormTrajectory(matches, fixtures, teamCode, year, windowSize);
    return { ...result, teamName: team?.name ?? teamCode };
  }
}
