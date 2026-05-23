/**
 * Integration test for the scrape-draw dispatch path through
 * HandleScrapeJobUseCase.
 *
 * Publishes a `scrape-draw` job via the in-memory queue, drives the
 * dispatcher, and asserts the in-memory FixtureRepository now contains
 * the year's artifact. Also asserts FixtureStoreQuotaExhaustedError is
 * classified terminal (DLQ on first delivery once retry budget exhausted).
 *
 * Feature: 038-kv-fixture-repository (T028).
 */

import { describe, it, expect } from 'vitest';
import { HandleScrapeJobUseCase } from '../../src/application/use-cases/handle-scrape-job.js';
import { ScrapeDrawUseCase } from '../../src/application/use-cases/scrape-draw.js';
import { InMemoryJobQueue } from '../../src/infrastructure/queue/in-memory-job-queue.js';
import { InMemoryFixtureRepository } from '../../src/infrastructure/persistence/in-memory-fixture-repository.js';
import { InMemoryMatchRepository } from '../../src/database/in-memory-match-repository.js';
import { FixtureStoreQuotaExhaustedError } from '../../src/domain/repositories/fixture-repository.js';
import type { DrawDataSource } from '../../src/domain/ports/draw-data-source.js';
import { success } from '../../src/domain/result.js';
import { createMatchFromSchedule } from '../../src/domain/match.js';

const testMatches = [
  createMatchFromSchedule({
    year: 2026, round: 1, homeTeamCode: 'BRI', awayTeamCode: 'SYD',
    homeStrengthRating: 100, awayStrengthRating: 95,
  }),
];

function makeStubDataSource(): DrawDataSource {
  return {
    fetchDraw: async () => success(testMatches),
  };
}

describe('HandleScrapeJobUseCase — scrape-draw dispatch', () => {
  it('publishes a scrape-draw job and the dispatcher writes the artifact', async () => {
    const queue = new InMemoryJobQueue();
    const fixtureRepo = new InMemoryFixtureRepository();
    const matchRepo = new InMemoryMatchRepository();
    const scrapeDraw = new ScrapeDrawUseCase(fixtureRepo, makeStubDataSource(), matchRepo);
    const dispatcher = new HandleScrapeJobUseCase({
      scrapeMatchResults: {} as never,
      scrapePlayerStats: {} as never,
      scrapeSupplementaryStats: {} as never,
      scrapeTeamLists: {} as never,
      scrapeCasualtyWard: {} as never,
      computePlayerMovements: {} as never,
      lockGameStrength: {} as never,
      scrapeDraw,
    });

    await queue.publish({ type: 'scrape-draw', version: 1, year: 2026 });
    const batch = queue.drain();
    expect(batch.handles).toHaveLength(1);

    await dispatcher.handle(batch);

    const artifact = await fixtureRepo.findByYear(2026);
    expect(artifact).not.toBeNull();
    expect(artifact!.payload.length).toBeGreaterThan(0);
    expect(typeof artifact!.freshness.lastScrapedAt).toBe('string');
  });

  it('classifies FixtureStoreQuotaExhaustedError as terminal (re-thrown by dispatcher)', async () => {
    const queue = new InMemoryJobQueue({ maxRetries: 0 });
    const matchRepo = new InMemoryMatchRepository();
    const failingRepo = {
      findByYear: async () => null,
      findByYearAndTeam: async () => null,
      listScrapedYears: async () => new Map(),
      save: async () => { throw new FixtureStoreQuotaExhaustedError('quota'); },
    };
    const scrapeDraw = new ScrapeDrawUseCase(failingRepo, makeStubDataSource(), matchRepo);
    const dispatcher = new HandleScrapeJobUseCase({
      scrapeMatchResults: {} as never,
      scrapePlayerStats: {} as never,
      scrapeSupplementaryStats: {} as never,
      scrapeTeamLists: {} as never,
      scrapeCasualtyWard: {} as never,
      computePlayerMovements: {} as never,
      lockGameStrength: {} as never,
      scrapeDraw,
    });

    await queue.publish({ type: 'scrape-draw', version: 1, year: 2026 });
    const batch = queue.drain();

    let thrown: unknown = null;
    try {
      await dispatcher.handle(batch);
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(FixtureStoreQuotaExhaustedError);
  });
});
