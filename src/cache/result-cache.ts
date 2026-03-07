/**
 * Result cache for match results, keyed by "results-{year}-{round}".
 * Completed rounds cache indefinitely (scores are immutable).
 * In-progress rounds use a configurable TTL for re-scraping.
 */

import { logger } from '../utils/logger.js';

/** Default TTL for in-progress round results (30 minutes) */
const DEFAULT_TTL_MS = 30 * 60 * 1000;

/** Long TTL for completed rounds (24 hours — effectively permanent within worker lifecycle) */
const COMPLETED_TTL_MS = 24 * 60 * 60 * 1000;

interface ResultCacheEntry {
  allCompleted: boolean;
  cachedAt: number;
  ttlMs: number;
}

export class ResultCacheStore {
  private cache = new Map<string, ResultCacheEntry>();
  private inFlight = new Map<string, Promise<void>>();

  private key(year: number, round: number): string {
    return `results-${year}-${round}`;
  }

  /** Check if a round's results are cached and not expired */
  isCached(year: number, round: number): boolean {
    const entry = this.cache.get(this.key(year, round));
    if (!entry) return false;
    if (entry.allCompleted) return true; // Completed rounds never expire
    return Date.now() - entry.cachedAt < entry.ttlMs;
  }

  /** Mark a round as scraped */
  markScraped(year: number, round: number, allCompleted: boolean): void {
    const k = this.key(year, round);
    this.cache.set(k, {
      allCompleted,
      cachedAt: Date.now(),
      ttlMs: allCompleted ? COMPLETED_TTL_MS : DEFAULT_TTL_MS,
    });
    logger.debug('Result cache entry set', { key: k, allCompleted });
  }

  /** Execute a scrape with request coalescing — prevents duplicate concurrent scrapes for same round */
  async fetchWithCoalescing(
    year: number,
    round: number,
    scraper: () => Promise<{ allCompleted: boolean }>
  ): Promise<void> {
    // Check cache first
    if (this.isCached(year, round)) {
      logger.debug('Result cache hit, skipping scrape', { year, round });
      return;
    }

    const k = this.key(year, round);

    // Coalesce with existing in-flight request
    const existing = this.inFlight.get(k);
    if (existing) {
      logger.debug('Result scrape coalesced', { year, round });
      return existing;
    }

    // New scrape
    const promise = (async () => {
      try {
        const result = await scraper();
        this.markScraped(year, round, result.allCompleted);
      } finally {
        this.inFlight.delete(k);
      }
    })();

    this.inFlight.set(k, promise);
    return promise;
  }

  /** Invalidate all result cache entries */
  invalidateAll(): void {
    const count = this.cache.size;
    this.cache.clear();
    logger.debug('Result cache invalidated', { entriesCleared: count });
  }
}

/** Singleton result cache instance */
export const resultCacheStore = new ResultCacheStore();
