import type { CacheService } from '../ports/cache-service.js';
import type { ScrapeDrawResult } from '../results/scrape-result.js';
import type { CachedSeasonData } from '../../cache/types.js';
import { scrapeAndLoadSchedule } from '../../scraper/index.js';
import { cacheServiceAdapter } from '../adapters/cache-service-adapter.js';

export class ScrapeDrawUseCase {
  constructor(
    private readonly cache: CacheService,
    private readonly scraper: (year: number) => Promise<{ success: boolean; fixturesLoaded: number }>
  ) {}

  async execute(year: number, force?: boolean): Promise<ScrapeDrawResult> {
    const cacheResult = await this.cache.fetchWithCoalescing(
      year,
      async (): Promise<CachedSeasonData | null> => {
        const result = await this.scraper(year);
        if (result.success) {
          return {
            year,
            fixtureCount: result.fixturesLoaded,
            cachedAt: new Date(),
            expiresAt: new Date(),
            isStale: false,
          };
        }
        return null;
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

export function createScrapeDrawUseCase(): ScrapeDrawUseCase {
  return new ScrapeDrawUseCase(cacheServiceAdapter, scrapeAndLoadSchedule);
}
