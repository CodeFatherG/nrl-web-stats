import { describe, it, expect, vi } from 'vitest';
import { ScrapeDrawUseCase } from '../../../src/application/use-cases/scrape-draw.js';
import type { CacheService } from '../../../src/application/ports/cache-service.js';
import type { DrawDataSource } from '../../../src/domain/ports/draw-data-source.js';
import type { MatchRepository } from '../../../src/domain/repositories/match-repository.js';
import { createMatchFromSchedule } from '../../../src/domain/match.js';
import { success, failure } from '../../../src/domain/result.js';

function createMockCacheService(response: { data: any; fromCache: boolean; isStale: boolean; error?: Error | null }): CacheService {
  return {
    fetchWithCoalescing: async (_year, fetcher, _options) => {
      if (!response.fromCache && response.data !== null && !response.error) {
        // Actually call the fetcher to exercise the data source + repository
        try {
          await fetcher();
        } catch {
          // Fetcher errors are handled by the cache
        }
      }
      return {
        data: response.data,
        fromCache: response.fromCache,
        isStale: response.isStale,
        error: response.error ?? null,
      };
    },
    getStatus: () => ({ entries: 0, totalSize: 0 }),
  };
}

function createMockDataSource(result: ReturnType<typeof success> | ReturnType<typeof failure>): DrawDataSource {
  return {
    fetchDraw: vi.fn().mockResolvedValue(result),
  };
}

function createMockMatchRepository(): MatchRepository & { saveAll: ReturnType<typeof vi.fn> } {
  return {
    save: vi.fn().mockResolvedValue(undefined),
    saveAll: vi.fn().mockResolvedValue(undefined),
    findById: vi.fn().mockResolvedValue(null),
    findByYear: vi.fn().mockResolvedValue([]),
    findByYearAndRound: vi.fn().mockResolvedValue([]),
    findByTeam: vi.fn().mockResolvedValue([]),
    getLoadedYears: vi.fn().mockResolvedValue([]),
    isYearLoaded: vi.fn().mockResolvedValue(false),
    getMatchCount: vi.fn().mockResolvedValue(0),
  };
}

const testMatches = [
  createMatchFromSchedule({ year: 2025, round: 1, homeTeamCode: 'BRO', awayTeamCode: 'MEL', homeStrengthRating: 750, awayStrengthRating: 850 }),
];

describe('ScrapeDrawUseCase', () => {
  it('returns scrape result on success', async () => {
    const dataSource = createMockDataSource(success(testMatches));
    const repo = createMockMatchRepository();
    const cache = createMockCacheService({
      data: { year: 2025, fixtureCount: 1 },
      fromCache: false,
      isStale: false,
    });

    const useCase = new ScrapeDrawUseCase(cache, dataSource, repo);
    const result = await useCase.execute(2025);

    expect(result.success).toBe(true);
    expect(result.year).toBe(2025);
    expect(result.fixturesLoaded).toBe(1);
    expect(result.fromCache).toBe(false);
    expect(result.isStale).toBe(false);
  });

  it('calls fetchDraw and loadForYear on fresh fetch', async () => {
    const dataSource = createMockDataSource(success(testMatches));
    const repo = createMockMatchRepository();
    const cache = createMockCacheService({
      data: { year: 2025, fixtureCount: 1 },
      fromCache: false,
      isStale: false,
    });

    const useCase = new ScrapeDrawUseCase(cache, dataSource, repo);
    await useCase.execute(2025);

    expect(dataSource.fetchDraw).toHaveBeenCalledWith(2025);
    expect(repo.saveAll).toHaveBeenCalledWith(testMatches);
  });

  it('returns cached result when available', async () => {
    const dataSource = createMockDataSource(success(testMatches));
    const repo = createMockMatchRepository();
    const cache = createMockCacheService({
      data: { year: 2025, fixtureCount: 459 },
      fromCache: true,
      isStale: false,
    });

    const useCase = new ScrapeDrawUseCase(cache, dataSource, repo);
    const result = await useCase.execute(2025);

    expect(result.fromCache).toBe(true);
    // Data source should not be called for cached results
    expect(dataSource.fetchDraw).not.toHaveBeenCalled();
  });

  it('throws when cache returns error with no data', async () => {
    const dataSource = createMockDataSource(failure('Scrape failed'));
    const repo = createMockMatchRepository();
    const cache = createMockCacheService({
      data: null,
      fromCache: false,
      isStale: false,
      error: new Error('Scrape failed'),
    });

    const useCase = new ScrapeDrawUseCase(cache, dataSource, repo);
    await expect(useCase.execute(2025)).rejects.toThrow('Scrape failed');
  });

  it('returns stale data with warning on error', async () => {
    const dataSource = createMockDataSource(failure('Network error'));
    const repo = createMockMatchRepository();
    const cache = createMockCacheService({
      data: { year: 2025, fixtureCount: 400 },
      fromCache: true,
      isStale: true,
      error: new Error('Network error'),
    });

    const useCase = new ScrapeDrawUseCase(cache, dataSource, repo);
    const result = await useCase.execute(2025);

    expect(result.success).toBe(true);
    expect(result.isStale).toBe(true);
    expect(result.warning).toBe('Using stale data due to fetch error');
  });

  it('does not call loadForYear when data source fails', async () => {
    const dataSource = createMockDataSource(failure('Parse error'));
    const repo = createMockMatchRepository();
    const cache: CacheService = {
      fetchWithCoalescing: async (_year, fetcher) => {
        try {
          await fetcher();
        } catch {
          // expected
        }
        return { data: null, fromCache: false, isStale: false, error: new Error('Parse error') };
      },
      getStatus: () => ({ entries: 0, totalSize: 0 }),
    };

    const useCase = new ScrapeDrawUseCase(cache, dataSource, repo);
    try {
      await useCase.execute(2025);
    } catch {
      // expected
    }

    expect(repo.saveAll).not.toHaveBeenCalled();
  });
});
