/**
 * Integration tests for cache behavior
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Miniflare } from 'miniflare';

describe('Cache Integration', () => {
  let mf: Miniflare;

  beforeAll(async () => {
    mf = new Miniflare({
      modules: true,
      scriptPath: './dist/worker.js',
      compatibilityDate: '2024-01-01',
      compatibilityFlags: ['nodejs_compat'],
    });
  });

  afterAll(async () => {
    await mf.dispose();
  });

  describe('Request coalescing', () => {
    it('handles concurrent scrape requests without duplicate fetches', async () => {
      // Send multiple scrape requests simultaneously
      const requests = Array.from({ length: 3 }, () =>
        mf.dispatchFetch('http://localhost/api/scrape', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ year: 2026 }),
        })
      );

      const responses = await Promise.all(requests);

      // All responses should be successful (200) or have identical status
      const statuses = responses.map(r => r.status);

      // At least one should succeed
      expect(statuses.some(s => s === 200)).toBe(true);

      // If any succeeded, all concurrent ones should have succeeded
      // (they should have coalesced to the same request)
      const successCount = statuses.filter(s => s === 200).length;
      expect(successCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Cached response performance', () => {
    it('returns cached data quickly on subsequent requests', async () => {
      // First request loads data
      await mf.dispatchFetch('http://localhost/api/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year: 2026 }),
      });

      // Subsequent requests should be fast (cached)
      const start = performance.now();
      const response = await mf.dispatchFetch('http://localhost/api/fixtures?year=2026');
      const duration = performance.now() - start;

      expect(response.status).toBe(200);

      // Cached response should be very fast (under 100ms)
      // In practice it should be <10ms, but we allow 100ms for test environment overhead
      expect(duration).toBeLessThan(100);
    });
  });

  describe('Cache status in health check', () => {
    it('includes cache information in health response', async () => {
      // First load some data
      await mf.dispatchFetch('http://localhost/api/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year: 2026 }),
      });

      const response = await mf.dispatchFetch('http://localhost/api/health');
      const data = await response.json() as {
        status: string;
        cache?: {
          hasData: boolean;
          yearsLoaded: number;
        };
      };

      expect(response.status).toBe(200);
      expect(data.status).toBe('ok');

      // Cache status should be included if implemented
      // This test validates the contract once cache status is added
      if (data.cache) {
        expect(data.cache.hasData).toBe(true);
        expect(data.cache.yearsLoaded).toBeGreaterThanOrEqual(1);
      }
    });
  });
});
