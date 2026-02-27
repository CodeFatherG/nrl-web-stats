/**
 * Unit tests for cache store functionality
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CacheStore, getNextMondayExpiry } from '../../src/cache/store.js';
import type { CachedSeasonData } from '../../src/cache/types.js';

describe('CacheStore', () => {
  let store: CacheStore;

  beforeEach(() => {
    store = new CacheStore();
  });

  describe('get/set operations', () => {
    it('returns null for empty cache', () => {
      const result = store.get(2026);
      expect(result).toBeNull();
    });

    it('stores and retrieves data correctly', () => {
      const data = { year: 2026, fixtureCount: 459 };
      store.set(2026, data);

      const result = store.get(2026);
      expect(result).not.toBeNull();
      expect(result?.year).toBe(2026);
      expect(result?.fixtureCount).toBe(459);
      expect(result?.isStale).toBe(false);
    });

    it('adds metadata to stored data', () => {
      const data = { year: 2026, fixtureCount: 459 };
      const now = new Date();
      store.set(2026, data);

      const result = store.get(2026);
      expect(result?.cachedAt).toBeDefined();
      expect(result?.cachedAt.getTime()).toBeGreaterThanOrEqual(now.getTime() - 100);
      expect(result?.expiresAt).toBeDefined();
      expect(result?.expiresAt.getTime()).toBeGreaterThan(result!.cachedAt.getTime());
    });

    it('uses custom expiry time when provided', () => {
      const data = { year: 2026, fixtureCount: 459 };
      const customExpiry = new Date(Date.now() + 1000 * 60 * 60); // 1 hour from now
      store.set(2026, data, customExpiry);

      const result = store.get(2026);
      expect(result?.expiresAt.getTime()).toBe(customExpiry.getTime());
    });
  });

  describe('cache expiration', () => {
    it('marks data as stale when expired', () => {
      const data = { year: 2026, fixtureCount: 459 };
      // Set expiry to the past
      const pastExpiry = new Date(Date.now() - 1000);
      store.set(2026, data, pastExpiry);

      const result = store.get(2026);
      expect(result).not.toBeNull();
      expect(result?.isStale).toBe(true);
    });

    it('returns null for expired data when skipStale is true', () => {
      const data = { year: 2026, fixtureCount: 459 };
      const pastExpiry = new Date(Date.now() - 1000);
      store.set(2026, data, pastExpiry);

      const result = store.get(2026, { skipStale: true });
      expect(result).toBeNull();
    });
  });

  describe('invalidation', () => {
    it('removes specific year from cache', () => {
      store.set(2025, { year: 2025, fixtureCount: 400 });
      store.set(2026, { year: 2026, fixtureCount: 459 });

      store.invalidate(2025);

      expect(store.get(2025)).toBeNull();
      expect(store.get(2026)).not.toBeNull();
    });

    it('clears all entries', () => {
      store.set(2025, { year: 2025, fixtureCount: 400 });
      store.set(2026, { year: 2026, fixtureCount: 459 });

      store.invalidateAll();

      expect(store.get(2025)).toBeNull();
      expect(store.get(2026)).toBeNull();
    });

    it('handles invalidating non-existent entries gracefully', () => {
      expect(() => store.invalidate(9999)).not.toThrow();
    });
  });

  describe('getStatus', () => {
    it('returns empty status for new cache', () => {
      const status = store.getStatus();

      expect(status.hasData).toBe(false);
      expect(status.yearsLoaded).toBe(0);
      expect(status.entries).toHaveLength(0);
      expect(status.nextExpiry).toBeNull();
    });

    it('returns correct status with cached data', () => {
      store.set(2025, { year: 2025, fixtureCount: 400 });
      store.set(2026, { year: 2026, fixtureCount: 459 });

      const status = store.getStatus();

      expect(status.hasData).toBe(true);
      expect(status.yearsLoaded).toBe(2);
      expect(status.entries).toHaveLength(2);
      expect(status.entries[0].year).toBe(2025);
      expect(status.entries[1].year).toBe(2026);
      expect(status.nextExpiry).not.toBeNull();
    });

    it('excludes stale entries from nextExpiry calculation', () => {
      const futureExpiry = new Date(Date.now() + 1000 * 60 * 60);
      const pastExpiry = new Date(Date.now() - 1000);

      store.set(2025, { year: 2025, fixtureCount: 400 }, pastExpiry);
      store.set(2026, { year: 2026, fixtureCount: 459 }, futureExpiry);

      // Trigger stale marking by accessing the expired entry
      store.get(2025);

      const status = store.getStatus();

      expect(status.nextExpiry?.getTime()).toBe(futureExpiry.getTime());
    });
  });

  describe('request coalescing', () => {
    it('coalesces concurrent requests for the same year', async () => {
      let fetchCount = 0;
      const fetcher = async (): Promise<CachedSeasonData> => {
        fetchCount++;
        await new Promise(resolve => setTimeout(resolve, 50));
        return {
          year: 2026,
          fixtureCount: 459,
          cachedAt: new Date(),
          expiresAt: getNextMondayExpiry(),
          isStale: false,
        };
      };

      // Start multiple concurrent requests
      const results = await Promise.all([
        store.fetchWithCoalescing(2026, fetcher),
        store.fetchWithCoalescing(2026, fetcher),
        store.fetchWithCoalescing(2026, fetcher),
      ]);

      // Should only have fetched once
      expect(fetchCount).toBe(1);

      // All results should have data
      results.forEach(result => {
        expect(result.data).not.toBeNull();
        expect(result.data?.year).toBe(2026);
      });
    });

    it('returns cached data without fetching', async () => {
      let fetchCount = 0;
      const fetcher = async (): Promise<CachedSeasonData> => {
        fetchCount++;
        return {
          year: 2026,
          fixtureCount: 459,
          cachedAt: new Date(),
          expiresAt: getNextMondayExpiry(),
          isStale: false,
        };
      };

      // Pre-populate cache
      store.set(2026, { year: 2026, fixtureCount: 459 });

      const result = await store.fetchWithCoalescing(2026, fetcher);

      expect(fetchCount).toBe(0);
      expect(result.fromCache).toBe(true);
      expect(result.isStale).toBe(false);
    });

    it('fetches fresh data when forceRefresh is true', async () => {
      let fetchCount = 0;
      const fetcher = async (): Promise<CachedSeasonData> => {
        fetchCount++;
        return {
          year: 2026,
          fixtureCount: 500, // Different count
          cachedAt: new Date(),
          expiresAt: getNextMondayExpiry(),
          isStale: false,
        };
      };

      // Pre-populate cache
      store.set(2026, { year: 2026, fixtureCount: 459 });

      const result = await store.fetchWithCoalescing(2026, fetcher, { forceRefresh: true });

      expect(fetchCount).toBe(1);
      expect(result.fromCache).toBe(false);
      expect(result.data?.fixtureCount).toBe(500);
    });

    it('returns stale data when fetch fails', async () => {
      const pastExpiry = new Date(Date.now() - 1000);
      store.set(2026, { year: 2026, fixtureCount: 459 }, pastExpiry);

      // Trigger stale marking
      store.get(2026);

      const fetcher = async (): Promise<CachedSeasonData> => {
        throw new Error('Network error');
      };

      const result = await store.fetchWithCoalescing(2026, fetcher, { forceRefresh: true });

      expect(result.data).not.toBeNull();
      expect(result.isStale).toBe(true);
      expect(result.error).toBeDefined();
      expect(result.error?.message).toBe('Network error');
    });

    it('returns error when fetch fails and no stale data available', async () => {
      const fetcher = async (): Promise<CachedSeasonData> => {
        throw new Error('Network error');
      };

      const result = await store.fetchWithCoalescing(2026, fetcher);

      expect(result.data).toBeNull();
      expect(result.error).toBeDefined();
    });
  });

  describe('isLoading', () => {
    it('returns true while fetch is in progress', async () => {
      let resolvePromise: () => void;
      const fetchPromise = new Promise<void>(resolve => {
        resolvePromise = resolve;
      });

      const fetcher = async (): Promise<CachedSeasonData> => {
        await fetchPromise;
        return {
          year: 2026,
          fixtureCount: 459,
          cachedAt: new Date(),
          expiresAt: getNextMondayExpiry(),
          isStale: false,
        };
      };

      // Start fetch but don't await
      const resultPromise = store.fetchWithCoalescing(2026, fetcher);

      // Should be loading
      expect(store.isLoading(2026)).toBe(true);

      // Resolve and wait
      resolvePromise!();
      await resultPromise;

      // Should no longer be loading
      expect(store.isLoading(2026)).toBe(false);
    });
  });

  describe('getInFlightCount', () => {
    it('tracks number of in-flight requests', async () => {
      expect(store.getInFlightCount()).toBe(0);

      let resolvePromise1: () => void;
      let resolvePromise2: () => void;

      const fetcher1 = async (): Promise<CachedSeasonData> => {
        await new Promise<void>(resolve => { resolvePromise1 = resolve; });
        return { year: 2025, fixtureCount: 400, cachedAt: new Date(), expiresAt: new Date(), isStale: false };
      };

      const fetcher2 = async (): Promise<CachedSeasonData> => {
        await new Promise<void>(resolve => { resolvePromise2 = resolve; });
        return { year: 2026, fixtureCount: 459, cachedAt: new Date(), expiresAt: new Date(), isStale: false };
      };

      const promise1 = store.fetchWithCoalescing(2025, fetcher1);
      expect(store.getInFlightCount()).toBe(1);

      const promise2 = store.fetchWithCoalescing(2026, fetcher2);
      expect(store.getInFlightCount()).toBe(2);

      resolvePromise1!();
      await promise1;
      expect(store.getInFlightCount()).toBe(1);

      resolvePromise2!();
      await promise2;
      expect(store.getInFlightCount()).toBe(0);
    });
  });
});
