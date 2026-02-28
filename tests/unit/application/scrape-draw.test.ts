import { describe, it, expect } from 'vitest';
import { ScrapeDrawUseCase } from '../../../src/application/use-cases/scrape-draw.js';
import type { CacheService } from '../../../src/application/ports/cache-service.js';

function createMockCacheService(response: { data: any; fromCache: boolean; isStale: boolean; error?: Error | null }): CacheService {
  return {
    fetchWithCoalescing: async () => ({
      data: response.data,
      fromCache: response.fromCache,
      isStale: response.isStale,
      error: response.error ?? null,
    }),
    getStatus: () => ({ entries: 0, totalSize: 0 }),
  };
}

describe('ScrapeDrawUseCase', () => {
  it('returns scrape result on success', async () => {
    const cache = createMockCacheService({
      data: { year: 2025, fixtureCount: 459 },
      fromCache: false,
      isStale: false,
    });
    const scraper = async () => ({ success: true, fixturesLoaded: 459 });
    const useCase = new ScrapeDrawUseCase(cache, scraper);
    const result = await useCase.execute(2025);
    expect(result.success).toBe(true);
    expect(result.year).toBe(2025);
    expect(result.fixturesLoaded).toBe(459);
    expect(result.fromCache).toBe(false);
    expect(result.isStale).toBe(false);
  });

  it('returns cached result when available', async () => {
    const cache = createMockCacheService({
      data: { year: 2025, fixtureCount: 459 },
      fromCache: true,
      isStale: false,
    });
    const scraper = async () => ({ success: true, fixturesLoaded: 459 });
    const useCase = new ScrapeDrawUseCase(cache, scraper);
    const result = await useCase.execute(2025);
    expect(result.fromCache).toBe(true);
  });

  it('throws when cache returns error with no data', async () => {
    const cache = createMockCacheService({
      data: null,
      fromCache: false,
      isStale: false,
      error: new Error('Scrape failed'),
    });
    const scraper = async () => ({ success: false, fixturesLoaded: 0 });
    const useCase = new ScrapeDrawUseCase(cache, scraper);
    await expect(useCase.execute(2025)).rejects.toThrow('Scrape failed');
  });

  it('returns stale data with warning on error', async () => {
    const cache = createMockCacheService({
      data: { year: 2025, fixtureCount: 400 },
      fromCache: true,
      isStale: true,
      error: new Error('Network error'),
    });
    const scraper = async () => ({ success: false, fixturesLoaded: 0 });
    const useCase = new ScrapeDrawUseCase(cache, scraper);
    const result = await useCase.execute(2025);
    expect(result.success).toBe(true);
    expect(result.isStale).toBe(true);
    expect(result.warning).toBe('Using stale data due to fetch error');
  });
});
