/**
 * Unit tests for cache store
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CacheStore, getNextMondayExpiry } from '../../src/cache/store.js';
import type { CachedSeasonData } from '../../src/cache/types.js';

describe('Cache Expiry Calculation', () => {
  describe('getNextMondayExpiry', () => {
    it('returns Monday 4pm AEST when called on Monday before 4pm AEST', () => {
      // Monday 10am AEST = Monday 00:00 UTC (since AEST is UTC+10)
      const mondayMorningAest = new Date('2026-03-02T00:00:00.000Z'); // Monday 10am AEST

      const expiry = getNextMondayExpiry(mondayMorningAest);

      // Should be same Monday at 4pm AEST = 06:00 UTC
      expect(expiry.toISOString()).toBe('2026-03-02T06:00:00.000Z');
    });

    it('returns next Monday 4pm AEST when called on Monday after 4pm AEST', () => {
      // Monday 5pm AEST = Monday 07:00 UTC
      const mondayEveningAest = new Date('2026-03-02T07:00:00.000Z');

      const expiry = getNextMondayExpiry(mondayEveningAest);

      // Should be next Monday at 4pm AEST = 06:00 UTC
      expect(expiry.toISOString()).toBe('2026-03-09T06:00:00.000Z');
    });

    it('returns next Monday 4pm AEST when called on Tuesday', () => {
      // Tuesday at any time
      const tuesday = new Date('2026-03-03T10:00:00.000Z');

      const expiry = getNextMondayExpiry(tuesday);

      // Should be Monday 9th at 4pm AEST = 06:00 UTC
      expect(expiry.toISOString()).toBe('2026-03-09T06:00:00.000Z');
    });

    it('returns next Monday 4pm AEST when called on Sunday', () => {
      // Sunday
      const sunday = new Date('2026-03-08T10:00:00.000Z');

      const expiry = getNextMondayExpiry(sunday);

      // Should be Monday 9th at 4pm AEST = 06:00 UTC
      expect(expiry.toISOString()).toBe('2026-03-09T06:00:00.000Z');
    });

    it('returns next Monday 4pm AEST when called on Friday', () => {
      // Friday
      const friday = new Date('2026-03-06T15:00:00.000Z');

      const expiry = getNextMondayExpiry(friday);

      // Should be Monday 9th at 4pm AEST = 06:00 UTC
      expect(expiry.toISOString()).toBe('2026-03-09T06:00:00.000Z');
    });

    it('returns correct expiry at Monday exactly 4pm AEST', () => {
      // Monday exactly 4pm AEST = Monday 06:00 UTC
      const mondayExactly4pm = new Date('2026-03-02T06:00:00.000Z');

      const expiry = getNextMondayExpiry(mondayExactly4pm);

      // At exactly 4pm, should go to next Monday
      expect(expiry.toISOString()).toBe('2026-03-09T06:00:00.000Z');
    });
  });
});

describe('Cache Store', () => {
  let store: CacheStore;

  beforeEach(() => {
    store = new CacheStore();
  });

  describe('get/set operations', () => {
    it('stores and retrieves data correctly', () => {
      const data = { year: 2026, fixtureCount: 459 };
      const customExpiry = new Date(Date.now() + 1000 * 60 * 60); // 1 hour from now

      store.set(2026, data, customExpiry);
      const result = store.get(2026);

      expect(result).not.toBeNull();
      expect(result?.year).toBe(2026);
      expect(result?.fixtureCount).toBe(459);
      expect(result?.isStale).toBe(false);
    });

    it('returns null for non-existent cache entry', () => {
      const result = store.get(2025);
      expect(result).toBeNull();
    });

    it('returns stale data after expiry by default', () => {
      const data = { year: 2026, fixtureCount: 459 };
      const pastExpiry = new Date(Date.now() - 1000); // 1 second ago

      store.set(2026, data, pastExpiry);
      const result = store.get(2026);

      expect(result).not.toBeNull();
      expect(result?.isStale).toBe(true);
    });

    it('returns null when skipStale is true and data is expired', () => {
      const data = { year: 2026, fixtureCount: 459 };
      const pastExpiry = new Date(Date.now() - 1000);

      store.set(2026, data, pastExpiry);
      const result = store.get(2026, { skipStale: true });

      expect(result).toBeNull();
    });
  });

  describe('invalidation', () => {
    it('invalidates specific year', () => {
      store.set(2026, { year: 2026, fixtureCount: 459 });
      store.set(2025, { year: 2025, fixtureCount: 400 });

      store.invalidate(2026);

      expect(store.get(2026)).toBeNull();
      expect(store.get(2025)).not.toBeNull();
    });

    it('invalidates all entries', () => {
      store.set(2026, { year: 2026, fixtureCount: 459 });
      store.set(2025, { year: 2025, fixtureCount: 400 });

      store.invalidateAll();

      expect(store.get(2026)).toBeNull();
      expect(store.get(2025)).toBeNull();
    });
  });

  describe('getStatus', () => {
    it('returns empty status when cache is empty', () => {
      const status = store.getStatus();

      expect(status.hasData).toBe(false);
      expect(status.yearsLoaded).toBe(0);
      expect(status.entries).toHaveLength(0);
      expect(status.nextExpiry).toBeNull();
    });

    it('returns correct status with cached data', () => {
      const expiry1 = new Date(Date.now() + 1000 * 60 * 60); // 1 hour
      const expiry2 = new Date(Date.now() + 1000 * 60 * 30); // 30 minutes

      store.set(2026, { year: 2026, fixtureCount: 459 }, expiry1);
      store.set(2025, { year: 2025, fixtureCount: 400 }, expiry2);

      const status = store.getStatus();

      expect(status.hasData).toBe(true);
      expect(status.yearsLoaded).toBe(2);
      expect(status.entries).toHaveLength(2);
      expect(status.nextExpiry?.getTime()).toBe(expiry2.getTime());
    });
  });

  describe('stale-while-revalidate fallback', () => {
    it('returns stale data when fetch fails', async () => {
      // First, populate cache with data that will expire
      const pastExpiry = new Date(Date.now() - 1000);
      store.set(2026, { year: 2026, fixtureCount: 459 }, pastExpiry);

      // Simulate a fetch that fails
      const failingFetcher = vi.fn().mockRejectedValue(new Error('Network error'));

      const result = await store.fetchWithCoalescing(2026, failingFetcher);

      expect(result.data).not.toBeNull();
      expect(result.data?.year).toBe(2026);
      expect(result.isStale).toBe(true);
      expect(result.error).toBeDefined();
      expect(result.error?.message).toBe('Network error');
    });

    it('returns null when fetch fails and no stale data exists', async () => {
      const failingFetcher = vi.fn().mockRejectedValue(new Error('Network error'));

      const result = await store.fetchWithCoalescing(2026, failingFetcher);

      expect(result.data).toBeNull();
      expect(result.isStale).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('request coalescing', () => {
    it('coalesces concurrent requests for the same year', async () => {
      let resolvePromise: (value: CachedSeasonData) => void;
      const slowFetcher = vi.fn().mockImplementation(() => {
        return new Promise<CachedSeasonData>((resolve) => {
          resolvePromise = resolve;
        });
      });

      // Start two concurrent requests
      const promise1 = store.fetchWithCoalescing(2026, slowFetcher);
      const promise2 = store.fetchWithCoalescing(2026, slowFetcher);

      // Fetcher should only be called once
      expect(slowFetcher).toHaveBeenCalledTimes(1);

      // Resolve the promise
      resolvePromise!({
        year: 2026,
        fixtureCount: 459,
        cachedAt: new Date(),
        expiresAt: new Date(Date.now() + 1000 * 60 * 60),
        isStale: false,
      });

      // Both promises should resolve with the same data
      const [result1, result2] = await Promise.all([promise1, promise2]);

      expect(result1.data?.year).toBe(2026);
      expect(result2.data?.year).toBe(2026);
      expect(result1.fromCache).toBe(false);
      expect(result2.fromCache).toBe(false);
    });

    it('allows separate requests for different years', async () => {
      const fetcher = vi.fn().mockImplementation((year: number) => {
        return Promise.resolve({
          year,
          fixtureCount: 459,
          cachedAt: new Date(),
          expiresAt: new Date(Date.now() + 1000 * 60 * 60),
          isStale: false,
        });
      });

      await Promise.all([
        store.fetchWithCoalescing(2026, () => fetcher(2026)),
        store.fetchWithCoalescing(2025, () => fetcher(2025)),
      ]);

      // Should call fetcher twice (once per year)
      expect(fetcher).toHaveBeenCalledTimes(2);
    });

    it('returns cached data without calling fetcher', async () => {
      // Pre-populate cache
      const futureExpiry = new Date(Date.now() + 1000 * 60 * 60);
      store.set(2026, { year: 2026, fixtureCount: 459 }, futureExpiry);

      const fetcher = vi.fn();
      const result = await store.fetchWithCoalescing(2026, fetcher);

      expect(fetcher).not.toHaveBeenCalled();
      expect(result.fromCache).toBe(true);
      expect(result.data?.year).toBe(2026);
    });

    it('calls fetcher when forceRefresh is true', async () => {
      // Pre-populate cache
      const futureExpiry = new Date(Date.now() + 1000 * 60 * 60);
      store.set(2026, { year: 2026, fixtureCount: 459 }, futureExpiry);

      const fetcher = vi.fn().mockResolvedValue({
        year: 2026,
        fixtureCount: 500,
        cachedAt: new Date(),
        expiresAt: futureExpiry,
        isStale: false,
      });

      const result = await store.fetchWithCoalescing(2026, fetcher, { forceRefresh: true });

      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(result.fromCache).toBe(false);
      expect(result.data?.fixtureCount).toBe(500);
    });
  });

  describe('loading state', () => {
    it('tracks in-flight requests', async () => {
      let resolvePromise: () => void;
      const slowFetcher = vi.fn().mockImplementation(() => {
        return new Promise<CachedSeasonData>((resolve) => {
          resolvePromise = () => resolve({
            year: 2026,
            fixtureCount: 459,
            cachedAt: new Date(),
            expiresAt: new Date(Date.now() + 1000 * 60 * 60),
            isStale: false,
          });
        });
      });

      const fetchPromise = store.fetchWithCoalescing(2026, slowFetcher);

      expect(store.isLoading(2026)).toBe(true);
      expect(store.getInFlightCount()).toBe(1);

      resolvePromise!();
      await fetchPromise;

      expect(store.isLoading(2026)).toBe(false);
      expect(store.getInFlightCount()).toBe(0);
    });
  });
});
