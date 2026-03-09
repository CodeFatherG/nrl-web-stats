/**
 * GetCompositionImpactUseCase — retrieves team composition impact analysis with caching.
 */

import type { MatchRepository } from '../../domain/repositories/match-repository.js';
import type { PlayerRepository } from '../../domain/repositories/player-repository.js';
import type { AnalyticsCache } from '../../analytics/analytics-cache.js';
import type { CompositionImpact } from '../../analytics/types.js';
import { computeCompositionImpact } from '../../analytics/composition-service.js';
import { resolveTeam } from '../../domain/team-identity.js';

export class GetCompositionImpactUseCase {
  constructor(
    private readonly matchRepository: MatchRepository,
    private readonly createPlayerRepository: (db: D1Database) => PlayerRepository,
    private readonly cache: AnalyticsCache
  ) {}

  async execute(db: D1Database, teamCode: string, year: number): Promise<CompositionImpact> {
    const cacheKey = `composition-${teamCode}-${year}`;
    const version = String(await this.matchRepository.getMatchCount());

    const cached = this.cache.get<CompositionImpact>(cacheKey, version);
    if (cached) return cached;

    const repo = this.createPlayerRepository(db);
    const matches = await this.matchRepository.findByTeam(teamCode, year);
    const players = await repo.findByTeam(teamCode, year);

    // Load full performances for each player
    const playersWithPerfs = await Promise.all(
      players.map(async player => {
        const performances = await repo.findMatchPerformances(player.id, year);
        return { ...player, performances };
      })
    );

    const { playerImpacts, totalMatches, sampleSizeWarning } = computeCompositionImpact(
      matches, playersWithPerfs, teamCode, year
    );

    const team = resolveTeam(teamCode);
    const result: CompositionImpact = {
      teamCode,
      teamName: team?.name ?? teamCode,
      year,
      totalMatches,
      sampleSizeWarning,
      playerImpacts,
    };

    this.cache.set(cacheKey, result, version);
    return result;
  }
}
