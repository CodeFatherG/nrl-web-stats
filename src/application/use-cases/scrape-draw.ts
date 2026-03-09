import type { CacheService } from '../ports/cache-service.js';
import type { DrawDataSource } from '../../domain/ports/draw-data-source.js';
import type { MatchRepository } from '../../domain/repositories/match-repository.js';
import type { ScrapeDrawResult } from '../results/scrape-result.js';
import type { CachedSeasonData } from '../../cache/types.js';
import { buildLegacyFixtureBridge } from '../../database/legacy-fixture-bridge.js';

export class ScrapeDrawUseCase {
  constructor(
    private readonly cache: CacheService,
    private readonly dataSource: DrawDataSource,
    private readonly matchRepository: MatchRepository
  ) {}

  async execute(year: number, force?: boolean): Promise<ScrapeDrawResult> {
    const cacheResult = await this.cache.fetchWithCoalescing(
      year,
      async (): Promise<CachedSeasonData | null> => {
        const result = await this.dataSource.fetchDraw(year);
        if (result.success) {
          await this.matchRepository.saveAll(result.data);
          // Populate legacy in-memory fixture store for backward compatibility
          buildLegacyFixtureBridge(year, result.data);
          return {
            year,
            fixtureCount: result.data.length,
            cachedAt: new Date(),
            expiresAt: new Date(),
            isStale: false,
          };
        }
        throw new Error(result.error);
      },
      { forceRefresh: force === true }
    );

    if (cacheResult.error && !cacheResult.data) {
      throw new Error(cacheResult.error.message);
    }

    return {
      success: true,
      year,
      fixturesLoaded: cacheResult.data?.fixtureCount ?? 0,
      fromCache: cacheResult.fromCache,
      isStale: cacheResult.isStale,
      ...(cacheResult.error && { warning: 'Using stale data due to fetch error' }),
    };
  }
}
