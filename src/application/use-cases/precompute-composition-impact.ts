/**
 * PrecomputeCompositionImpactUseCase — per-(year,teamCode) leaf job for the
 * composition-impact fan-out precompute pipeline.
 *
 * Feature: 037-analytics-cache-replacement (T052).
 */

import type { MatchRepository } from '../../domain/repositories/match-repository.js';
import type { PlayerRepository } from '../../domain/repositories/player-repository.js';
import type {
  CompositionImpactAggregate,
  CompositionImpactRepository,
} from '../../domain/repositories/composition-impact-repository.js';
import { computeCompositionImpact } from '../../analytics/composition-service.js';
import { resolveTeam } from '../../domain/team-identity.js';

export interface PrecomputeCompositionImpactInput {
  readonly year: number;
  readonly asOfRound: number;
  readonly teamCode: string;
}

export class PrecomputeCompositionImpactUseCase {
  constructor(
    private readonly matchRepository: MatchRepository,
    private readonly playerRepository: PlayerRepository,
    private readonly compositionImpactRepository: CompositionImpactRepository,
  ) {}

  async execute(input: PrecomputeCompositionImpactInput): Promise<void> {
    const { year, asOfRound, teamCode } = input;

    const matches = await this.matchRepository.findByTeam(teamCode, year);
    const players = await this.playerRepository.findByTeam(teamCode, year);
    const playersWithPerfs = await Promise.all(
      players.map(async (player) => {
        const performances = await this.playerRepository.findMatchPerformances(
          player.id,
          year,
        );
        return { ...player, performances };
      }),
    );

    const { playerImpacts, totalMatches, sampleSizeWarning } =
      computeCompositionImpact(matches, playersWithPerfs, teamCode, year);

    const team = resolveTeam(teamCode);
    const aggregate: CompositionImpactAggregate = {
      year,
      teamCode,
      asOfRound,
      computedAt: new Date().toISOString(),
      impact: {
        teamCode,
        teamName: team?.name ?? teamCode,
        year,
        totalMatches,
        sampleSizeWarning,
        playerImpacts,
      },
    };
    await this.compositionImpactRepository.saveCompositionImpactAggregate(
      aggregate,
    );
  }
}
