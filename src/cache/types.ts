/**
 * Cache types and interfaces for in-memory caching
 */

/**
 * Cached scrape data for a season
 */
export interface CachedSeasonData {
  /** Year of the season */
  year: number;
  /** Number of fixtures loaded */
  fixtureCount: number;
  /** Timestamp when data was cached */
  cachedAt: Date;
  /** Timestamp when cache expires */
  expiresAt: Date;
  /** Whether this is stale data (kept as fallback) */
  isStale: boolean;
}

/**
 * Cache entry wrapping any cached value
 */
export interface CacheEntry<T> {
  /** The cached value */
  value: T;
  /** Timestamp when cached */
  cachedAt: Date;
  /** Timestamp when cache expires */
  expiresAt: Date;
  /** Whether the entry is stale (past expiry but kept as fallback) */
  isStale: boolean;
}

/**
 * Cache status for health check
 */
export interface CacheStatus {
  /** Whether cache has any data */
  hasData: boolean;
  /** Number of years cached */
  yearsLoaded: number;
  /** List of cached years with their status */
  entries: CacheEntryStatus[];
  /** Next scheduled expiry time */
  nextExpiry: Date | null;
}

/**
 * Status of a single cache entry
 */
export interface CacheEntryStatus {
  /** Year of cached data */
  year: number;
  /** When the data was cached */
  cachedAt: Date;
  /** When the cache expires */
  expiresAt: Date;
  /** Whether data is stale */
  isStale: boolean;
  /** Fixture count */
  fixtureCount: number;
}

/**
 * Options for cache operations
 */
export interface CacheOptions {
  /** Force refresh even if cached data exists */
  forceRefresh?: boolean;
  /** Skip stale-while-revalidate fallback */
  skipStale?: boolean;
}

/**
 * Result of a cache fetch operation
 */
export interface CacheFetchResult<T> {
  /** The data (either fresh or stale) */
  data: T | null;
  /** Whether the data came from cache */
  fromCache: boolean;
  /** Whether the data is stale */
  isStale: boolean;
  /** Any error that occurred during fetch */
  error?: Error;
}
