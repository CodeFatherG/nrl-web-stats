import type { CacheService } from '../ports/cache-service.js';
import { cacheStore } from '../../cache/store.js';

export const cacheServiceAdapter: CacheService = {
  fetchWithCoalescing: (year, fetcher, options) => cacheStore.fetchWithCoalescing(year, fetcher, options),
  getStatus: () => cacheStore.getStatus(),
};
