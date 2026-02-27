/**
 * Cache store implementation with Monday 4pm AEST expiry and request coalescing
 */

import type { CacheEntry, CacheStatus, CacheEntryStatus, CachedSeasonData, CacheOptions, CacheFetchResult } from './types.js';
import { logger } from '../utils/logger.js';

// AEST is UTC+10, but during daylight saving (AEDT) it's UTC+11
// NRL season runs ~March-October, spanning both timezones
// Using AEST (UTC+10) as the standard reference
const AEST_OFFSET_HOURS = 10;
const EXPIRY_HOUR_LOCAL = 16; // 4pm AEST

/**
 * Calculate the next Monday 4pm AEST from a given date
 * @param from - The date to calculate from (defaults to now)
 * @returns Date object representing next Monday 4pm AEST
 */
export function getNextMondayExpiry(from: Date = new Date()): Date {
  // Convert to AEST by adding offset
  const utcTime = from.getTime();
  const aestOffset = AEST_OFFSET_HOURS * 60 * 60 * 1000;

  // Create a date in AEST "local time" for calculation
  const aestDate = new Date(utcTime + aestOffset);

  // Get current day of week (0 = Sunday, 1 = Monday, ...)
  const dayOfWeek = aestDate.getUTCDay();
  const currentHour = aestDate.getUTCHours();

  // Calculate days until next Monday
  // If it's Monday before 4pm, expiry is today at 4pm
  // If it's Monday after 4pm, expiry is next Monday at 4pm
  // Otherwise, expiry is the coming Monday at 4pm
  let daysUntilMonday: number;

  if (dayOfWeek === 1) { // Monday
    if (currentHour < EXPIRY_HOUR_LOCAL) {
      daysUntilMonday = 0; // Today at 4pm
    } else {
      daysUntilMonday = 7; // Next Monday
    }
  } else if (dayOfWeek === 0) { // Sunday
    daysUntilMonday = 1;
  } else { // Tuesday-Saturday
    daysUntilMonday = (8 - dayOfWeek) % 7;
  }

  // Start from midnight AEST of the target Monday
  const targetDate = new Date(aestDate);
  targetDate.setUTCHours(EXPIRY_HOUR_LOCAL, 0, 0, 0);
  targetDate.setUTCDate(targetDate.getUTCDate() + daysUntilMonday);

  // Convert back to UTC
  const expiryUtc = new Date(targetDate.getTime() - aestOffset);

  logger.debug('Calculated next Monday expiry', {
    from: from.toISOString(),
    expiry: expiryUtc.toISOString(),
    daysUntilMonday,
  });

  return expiryUtc;
}

/**
 * In-memory cache store for season data
 */
class CacheStore {
  private cache: Map<number, CacheEntry<CachedSeasonData>> = new Map();
  private inFlightRequests: Map<number, Promise<CachedSeasonData | null>> = new Map();

  /**
   * Get cached data for a year
   * @param year - The year to get cached data for
   * @param options - Cache options
   * @returns The cached data or null if not found/expired
   */
  get(year: number, options: CacheOptions = {}): CachedSeasonData | null {
    const entry = this.cache.get(year);

    if (!entry) {
      logger.debug('Cache miss', { year });
      return null;
    }

    const now = new Date();
    const isExpired = now > entry.expiresAt;

    if (isExpired) {
      if (options.skipStale) {
        logger.debug('Cache expired, skipping stale', { year });
        return null;
      }

      // Mark as stale but return for stale-while-revalidate
      if (!entry.isStale) {
        entry.isStale = true;
        entry.value.isStale = true;
        logger.debug('Cache expired, marking stale', { year });
      }
    }

    logger.debug('Cache hit', { year, isStale: entry.isStale });
    return entry.value;
  }

  /**
   * Store data in cache
   * @param year - The year to cache data for
   * @param data - The data to cache
   * @param expiresAt - Optional custom expiry (defaults to next Monday 4pm AEST)
   */
  set(year: number, data: Omit<CachedSeasonData, 'cachedAt' | 'expiresAt' | 'isStale'>, expiresAt?: Date): void {
    const now = new Date();
    const expiry = expiresAt || getNextMondayExpiry(now);

    const entry: CacheEntry<CachedSeasonData> = {
      value: {
        ...data,
        cachedAt: now,
        expiresAt: expiry,
        isStale: false,
      },
      cachedAt: now,
      expiresAt: expiry,
      isStale: false,
    };

    this.cache.set(year, entry);

    logger.info('Data cached', {
      year,
      fixtureCount: data.fixtureCount,
      expiresAt: expiry.toISOString(),
    });
  }

  /**
   * Invalidate cache for a specific year
   * @param year - The year to invalidate
   */
  invalidate(year: number): void {
    const existed = this.cache.delete(year);
    logger.info('Cache invalidated', { year, existed });
  }

  /**
   * Invalidate all cached data
   */
  invalidateAll(): void {
    const count = this.cache.size;
    this.cache.clear();
    logger.info('All cache invalidated', { entriesCleared: count });
  }

  /**
   * Get cache status for health check
   */
  getStatus(): CacheStatus {
    const entries: CacheEntryStatus[] = [];
    let nextExpiry: Date | null = null;

    for (const [year, entry] of this.cache.entries()) {
      entries.push({
        year,
        cachedAt: entry.cachedAt,
        expiresAt: entry.expiresAt,
        isStale: entry.isStale,
        fixtureCount: entry.value.fixtureCount,
      });

      if (!entry.isStale && (!nextExpiry || entry.expiresAt < nextExpiry)) {
        nextExpiry = entry.expiresAt;
      }
    }

    return {
      hasData: this.cache.size > 0,
      yearsLoaded: this.cache.size,
      entries: entries.sort((a, b) => a.year - b.year),
      nextExpiry,
    };
  }

  /**
   * Fetch data with request coalescing
   * Prevents duplicate concurrent requests for the same year
   *
   * @param year - The year to fetch
   * @param fetcher - Function that fetches fresh data
   * @param options - Cache options
   * @returns The fetched or cached data
   */
  async fetchWithCoalescing(
    year: number,
    fetcher: () => Promise<CachedSeasonData | null>,
    options: CacheOptions = {}
  ): Promise<CacheFetchResult<CachedSeasonData>> {
    // Check cache first (unless forcing refresh)
    if (!options.forceRefresh) {
      const cached = this.get(year, options);
      if (cached && !cached.isStale) {
        return {
          data: cached,
          fromCache: true,
          isStale: false,
        };
      }
    }

    // Check if there's already an in-flight request
    const existingRequest = this.inFlightRequests.get(year);
    if (existingRequest) {
      logger.debug('Request coalesced', { year });
      try {
        const data = await existingRequest;
        return {
          data,
          fromCache: false,
          isStale: false,
        };
      } catch (error) {
        // Fall through to stale check
        return this.handleFetchError(year, error as Error, options);
      }
    }

    // Create new request
    const requestPromise = (async () => {
      try {
        const data = await fetcher();
        if (data) {
          this.set(year, data);
        }
        return data;
      } finally {
        this.inFlightRequests.delete(year);
      }
    })();

    this.inFlightRequests.set(year, requestPromise);

    try {
      const data = await requestPromise;
      return {
        data,
        fromCache: false,
        isStale: false,
      };
    } catch (error) {
      return this.handleFetchError(year, error as Error, options);
    }
  }

  /**
   * Handle fetch error with stale-while-revalidate fallback
   */
  private handleFetchError(
    year: number,
    error: Error,
    options: CacheOptions
  ): CacheFetchResult<CachedSeasonData> {
    logger.error('Fetch failed', { year, error: error.message });

    // Try to return stale data if available
    if (!options.skipStale) {
      const staleData = this.get(year, { skipStale: false });
      if (staleData) {
        logger.info('Returning stale data as fallback', { year });
        return {
          data: staleData,
          fromCache: true,
          isStale: true,
          error,
        };
      }
    }

    return {
      data: null,
      fromCache: false,
      isStale: false,
      error,
    };
  }

  /**
   * Check if data is currently being fetched
   */
  isLoading(year: number): boolean {
    return this.inFlightRequests.has(year);
  }

  /**
   * Get number of in-flight requests
   */
  getInFlightCount(): number {
    return this.inFlightRequests.size;
  }
}

// Export singleton instance
export const cacheStore = new CacheStore();

// Export class for testing
export { CacheStore };
