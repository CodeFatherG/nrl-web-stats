/**
 * GetCompositionImpactUseCase — fetches team-composition-impact analysis.
 *
 * Spec 037 split: findPrecomputed + computeLive. No parameter-based bypass —
 * this endpoint has no windowSize parameter, so the handler always tries
 * findPrecomputed first and falls through to computeLive only for the
 * precompute job (not on the request path).
 */

import type { MatchRepository } from '../../domain/repositories/match-repository.js';
import type { PlayerRepository } from '../../domain/repositories/player-repository.js';
import type {
  CompositionImpactAggregate,
  CompositionImpactRepository,
} from '../../domain/repositories/composition-impact-repository.js';
import type { CompositionImpact } from '../../analytics/types.js';
import { computeCompositionImpact } from '../../analytics/composition-service.js';
import { resolveTeam } from '../../domain/team-identity.js';

export class GetCompositionImpactUseCase {
  constructor(
    private readonly matchRepository: MatchRepository,
    private readonly createPlayerRepository: (db: D1Database) => PlayerRepository,
    private readonly compositionImpactRepository: CompositionImpactRepository,
  ) {}

  async findPrecomputed(
    teamCode: string,
    year: number,
  ): Promise<CompositionImpactAggregate | null> {
    return this.compositionImpactRepository.findCompositionImpactAggregate(
      year,
      teamCode,
    );
  }

  async computeLive(
    db: D1Database,
    teamCode: string,
    year: number,
  ): Promise<CompositionImpact> {
    const repo = this.createPlayerRepository(db);
    const matches = await this.matchRepository.findByTeam(teamCode, year);
    const players = await repo.findByTeam(teamCode, year);
    const playersWithPerfs = await Promise.all(
      players.map(async (player) => {
        const performances = await repo.findMatchPerformances(player.id, year);
        return { ...player, performances };
      }),
    );
    const { playerImpacts, totalMatches, sampleSizeWarning } =
      computeCompositionImpact(matches, playersWithPerfs, teamCode, year);

    const team = resolveTeam(teamCode);
    return {
      teamCode,
      teamName: team?.name ?? teamCode,
      year,
      totalMatches,
      sampleSizeWarning,
      playerImpacts,
    };
  }
}
