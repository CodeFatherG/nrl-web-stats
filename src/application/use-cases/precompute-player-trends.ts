/**
 * PrecomputePlayerTrendsUseCase — per-(year,teamCode) leaf job for the
 * player-trends fan-out precompute pipeline.
 *
 * Identity is team-keyed (matches the existing analytics use case). Uses
 * default windowSize=5, significantOnly=false. Non-default parameter requests
 * bypass the precomputed-artifact repository and live-compute (FR-016).
 *
 * Feature: 037-analytics-cache-replacement (T051).
 */

import type { PlayerRepository } from '../../domain/repositories/player-repository.js';
import type {
  PlayerTrendsAggregate,
  PlayerTrendsRepository,
} from '../../domain/repositories/player-trends-repository.js';
import { computePlayerTrends } from '../../analytics/player-trend-service.js';
import { resolveTeam } from '../../domain/team-identity.js';

const DEFAULT_WINDOW_SIZE = 5;

export interface PrecomputePlayerTrendsInput {
  readonly year: number;
  readonly asOfRound: number;
  readonly teamCode: string;
}

export class PrecomputePlayerTrendsUseCase {
  constructor(
    private readonly playerRepository: PlayerRepository,
    private readonly playerTrendsRepository: PlayerTrendsRepository,
  ) {}

  async execute(input: PrecomputePlayerTrendsInput): Promise<void> {
    const { year, asOfRound, teamCode } = input;

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

    const trends = computePlayerTrends(playersWithPerfs, year, DEFAULT_WINDOW_SIZE);
    const team = resolveTeam(teamCode);

    const aggregate: PlayerTrendsAggregate = {
      year,
      teamCode,
      asOfRound,
      computedAt: new Date().toISOString(),
      trends: {
        teamCode,
        teamName: team?.name ?? teamCode,
        year,
        windowSize: DEFAULT_WINDOW_SIZE,
        players: trends,
      },
    };
    await this.playerTrendsRepository.savePlayerTrendsAggregate(aggregate);
  }
}
