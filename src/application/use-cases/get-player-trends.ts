/**
 * GetPlayerTrendsUseCase — fetches team-wide player trend signals.
 *
 * Spec 037 split: findPrecomputed (default windowSize=5 & significantOnly=false)
 * + computeLive (any). The handler is responsible for routing non-default
 * requests through computeLive.
 */

import type { PlayerRepository } from '../../domain/repositories/player-repository.js';
import type {
  PlayerTrendsAggregate,
  PlayerTrendsPayload,
  PlayerTrendsRepository,
} from '../../domain/repositories/player-trends-repository.js';
import { computePlayerTrends } from '../../analytics/player-trend-service.js';
import { resolveTeam } from '../../domain/team-identity.js';

export const DEFAULT_PLAYER_TRENDS_WINDOW_SIZE = 5;
export const DEFAULT_PLAYER_TRENDS_SIGNIFICANT_ONLY = false;

export class GetPlayerTrendsUseCase {
  constructor(
    private readonly createPlayerRepository: (db: D1Database) => PlayerRepository,
    private readonly playerTrendsRepository: PlayerTrendsRepository,
  ) {}

  async findPrecomputed(
    teamCode: string,
    year: number,
  ): Promise<PlayerTrendsAggregate | null> {
    return this.playerTrendsRepository.findPlayerTrendsAggregate(year, teamCode);
  }

  async computeLive(
    db: D1Database,
    teamCode: string,
    year: number,
    windowSize: number = DEFAULT_PLAYER_TRENDS_WINDOW_SIZE,
    significantOnly: boolean = DEFAULT_PLAYER_TRENDS_SIGNIFICANT_ONLY,
  ): Promise<PlayerTrendsPayload> {
    const repo = this.createPlayerRepository(db);
    const players = await repo.findByTeam(teamCode, year);
    const playersWithPerfs = await Promise.all(
      players.map(async (player) => {
        const performances = await repo.findMatchPerformances(player.id, year);
        return { ...player, performances };
      }),
    );

    let trends = computePlayerTrends(playersWithPerfs, year, windowSize);
    if (significantOnly) {
      trends = trends.filter((t) => t.isSignificant);
    }

    const team = resolveTeam(teamCode);
    return {
      teamCode,
      teamName: team?.name ?? teamCode,
      year,
      windowSize,
      players: trends,
    };
  }
}
