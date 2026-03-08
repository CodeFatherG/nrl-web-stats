/**
 * GetPlayerTrendsUseCase — retrieves player performance trends with caching.
 */

import type { PlayerRepository } from '../../domain/repositories/player-repository.js';
import type { AnalyticsCache } from '../../analytics/analytics-cache.js';
import type { PlayerTrend } from '../../analytics/types.js';
import { computePlayerTrends } from '../../analytics/player-trend-service.js';
import { resolveTeam } from '../../domain/team-identity.js';

interface TrendsResult {
  teamCode: string;
  teamName: string;
  year: number;
  windowSize: number;
  players: PlayerTrend[];
}

export class GetPlayerTrendsUseCase {
  constructor(
    private readonly createPlayerRepository: (db: D1Database) => PlayerRepository,
    private readonly cache: AnalyticsCache
  ) {}

  async execute(
    db: D1Database,
    teamCode: string,
    year: number,
    windowSize: number = 5,
    significantOnly: boolean = false
  ): Promise<TrendsResult> {
    const cacheKey = `trends-${teamCode}-${year}-${windowSize}-${significantOnly}`;
    const repo = this.createPlayerRepository(db);

    // Use a simple version based on team code + year (no easy count metric)
    const version = `${teamCode}-${year}`;

    const cached = this.cache.get<TrendsResult>(cacheKey, version);
    if (cached) return cached;

    const players = await repo.findByTeam(teamCode, year);

    // Load full performances for each player
    const playersWithPerfs = await Promise.all(
      players.map(async player => {
        const performances = await repo.findMatchPerformances(player.id, year);
        return { ...player, performances };
      })
    );

    let trends = computePlayerTrends(playersWithPerfs, year, windowSize);

    if (significantOnly) {
      trends = trends.filter(t => t.isSignificant);
    }

    const team = resolveTeam(teamCode);
    const result: TrendsResult = {
      teamCode,
      teamName: team?.name ?? teamCode,
      year,
      windowSize,
      players: trends,
    };

    this.cache.set(cacheKey, result, version);
    return result;
  }
}
