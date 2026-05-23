/**
 * PrecomputeTeamFormUseCase — single-team leaf job for the team-form
 * fan-out precompute pipeline.
 *
 * Idempotent under last-write-wins (same `(year, teamCode, asOfRound)`
 * produces byte-identical envelopes modulo `computedAt`).
 *
 * Feature: 037-analytics-cache-replacement (T049).
 */

import type { MatchRepository } from '../../domain/repositories/match-repository.js';
import type { FixtureRepository } from '../../domain/repositories/fixture-repository.js';
import type {
  TeamFormAggregate,
  TeamFormRepository,
} from '../../domain/repositories/team-form-repository.js';
import { computeFormTrajectory } from '../../analytics/team-form-service.js';
import { resolveTeam } from '../../domain/team-identity.js';

const DEFAULT_WINDOW_SIZE = 5;

export interface PrecomputeTeamFormInput {
  readonly year: number;
  readonly asOfRound: number;
  readonly teamCode: string;
}

export class PrecomputeTeamFormUseCase {
  constructor(
    private readonly matchRepository: MatchRepository,
    private readonly fixtureRepository: FixtureRepository,
    private readonly teamFormRepository: TeamFormRepository,
  ) {}

  async execute(input: PrecomputeTeamFormInput): Promise<void> {
    const { year, asOfRound, teamCode } = input;
    const matches = await this.matchRepository.findByYear(year);
    const artifact = await this.fixtureRepository.findByYearAndTeam(year, teamCode);
    const fixtures = artifact ? [...artifact.payload] : [];
    const team = resolveTeam(teamCode);
    const result = computeFormTrajectory(
      matches,
      fixtures,
      teamCode,
      year,
      DEFAULT_WINDOW_SIZE,
    );
    const aggregate: TeamFormAggregate = {
      year,
      teamCode,
      asOfRound,
      computedAt: new Date().toISOString(),
      trajectory: { ...result, teamName: team?.name ?? teamCode },
    };
    await this.teamFormRepository.saveTeamFormAggregate(aggregate);
  }
}
