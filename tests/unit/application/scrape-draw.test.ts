import { describe, it, expect, vi } from 'vitest';
import { ScrapeDrawUseCase } from '../../../src/application/use-cases/scrape-draw.js';
import type { FixtureRepository } from '../../../src/domain/repositories/fixture-repository.js';
import type { DrawDataSource } from '../../../src/domain/ports/draw-data-source.js';
import type { MatchRepository } from '../../../src/domain/repositories/match-repository.js';
import { createMatchFromSchedule } from '../../../src/domain/match.js';
import { success, failure } from '../../../src/domain/result.js';

function createMockFixtureRepository(): FixtureRepository & { save: ReturnType<typeof vi.fn> } {
  return {
    findByYear: vi.fn().mockResolvedValue(null),
    findByYearAndTeam: vi.fn().mockResolvedValue(null),
    listScrapedYears: vi.fn().mockResolvedValue(new Map()),
    save: vi.fn().mockResolvedValue(undefined),
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
    const matchRepo = createMockMatchRepository();
    const fixtureRepo = createMockFixtureRepository();

    const useCase = new ScrapeDrawUseCase(fixtureRepo, dataSource, matchRepo);
    const result = await useCase.execute(2025);

    expect(result.success).toBe(true);
    expect(result.year).toBe(2025);
    expect(result.fixturesLoaded).toBeGreaterThan(0);
    expect(result.fromCache).toBe(false);
    expect(result.isStale).toBe(false);
  });

  it('persists matches via matchRepository and fixtures via fixtureRepository', async () => {
    const dataSource = createMockDataSource(success(testMatches));
    const matchRepo = createMockMatchRepository();
    const fixtureRepo = createMockFixtureRepository();

    const useCase = new ScrapeDrawUseCase(fixtureRepo, dataSource, matchRepo);
    await useCase.execute(2025);

    expect(dataSource.fetchDraw).toHaveBeenCalledWith(2025);
    expect(matchRepo.saveAll).toHaveBeenCalledWith(testMatches);
    expect(fixtureRepo.save).toHaveBeenCalledTimes(1);
    const [year, fixtures] = fixtureRepo.save.mock.calls[0];
    expect(year).toBe(2025);
    expect(Array.isArray(fixtures)).toBe(true);
    expect((fixtures as unknown[]).length).toBeGreaterThan(0);
  });

  it('throws when the data source fails', async () => {
    const dataSource = createMockDataSource(failure('Scrape failed'));
    const matchRepo = createMockMatchRepository();
    const fixtureRepo = createMockFixtureRepository();

    const useCase = new ScrapeDrawUseCase(fixtureRepo, dataSource, matchRepo);
    await expect(useCase.execute(2025)).rejects.toThrow('Scrape failed');
    expect(matchRepo.saveAll).not.toHaveBeenCalled();
    expect(fixtureRepo.save).not.toHaveBeenCalled();
  });
});
