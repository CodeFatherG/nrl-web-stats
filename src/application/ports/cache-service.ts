import type { CachedSeasonData } from '../../cache/types.js';
import type { CacheStatus, CacheFetchResult, CacheOptions } from '../../cache/types.js';

export interface CacheService {
  fetchWithCoalescing(
    year: number,
    fetcher: () => Promise<CachedSeasonData | null>,
    options?: CacheOptions
  ): Promise<CacheFetchResult<CachedSeasonData>>;
  getStatus(): CacheStatus;
}
