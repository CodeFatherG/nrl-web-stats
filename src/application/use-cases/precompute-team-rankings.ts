/**
 * PrecomputeTeamRankingsUseCase — single (year, teamCode, mode) leaf job for
 * the fan-out precompute pipeline.
 *
 * Idempotent: same inputs → same bytes (modulo computedAt).
 */

import type {
  ProjectionRepository,
  TeamRankingsAggregate,
} from '../../domain/repositories/projection-repository.js';
import type { RankingMode } from '../../analytics/player-projection-types.js';
import type { GetTeamProjectionRankingsUseCase } from './get-team-projection-rankings.js';

export interface PrecomputeTeamRankingsDeps {
  projectionRepository: ProjectionRepository;
  teamRankingsLive: { computeLive: GetTeamProjectionRankingsUseCase['computeLive'] };
}

export interface PrecomputeTeamRankingsInput {
  year: number;
  asOfRound: number;
  teamCode: string;
  mode: RankingMode;
}

export class PrecomputeTeamRankingsUseCase {
  constructor(private readonly deps: PrecomputeTeamRankingsDeps) {}

  async execute(input: PrecomputeTeamRankingsInput): Promise<void> {
    const { year, asOfRound, teamCode, mode } = input;
    const rankings = await this.deps.teamRankingsLive.computeLive(year, teamCode, mode);
    const aggregate: TeamRankingsAggregate = {
      year,
      teamCode,
      mode,
      asOfRound,
      computedAt: new Date().toISOString(),
      rankings,
    };
    await this.deps.projectionRepository.saveTeamRankingsAggregate(aggregate);
  }
}
