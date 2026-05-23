/**
 * End-to-end integration test: POST /api/scrape/draw → 202 → queue consumer
 * pass → durable artifact present in the repository.
 *
 * Feature: 038-kv-fixture-repository (T031).
 */

import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import * as handlers from '../../src/api/handlers.js';
import type { HandlerDeps } from '../../src/api/handlers.js';
import { HandleScrapeJobUseCase } from '../../src/application/use-cases/handle-scrape-job.js';
import { ScrapeDrawUseCase } from '../../src/application/use-cases/scrape-draw.js';
import { InMemoryJobQueue } from '../../src/infrastructure/queue/in-memory-job-queue.js';
import { InMemoryFixtureRepository } from '../../src/infrastructure/persistence/in-memory-fixture-repository.js';
import { InMemoryMatchRepository } from '../../src/database/in-memory-match-repository.js';
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
  return { fetchDraw: async () => success(testMatches) };
}

describe('Scrape-draw endpoint flow (e2e)', () => {
  it('POST → 202 → queue drain → artifact persisted', async () => {
    const queue = new InMemoryJobQueue();
    const fixtureRepo = new InMemoryFixtureRepository();
    const matchRepo = new InMemoryMatchRepository();
    const scrapeDraw = new ScrapeDrawUseCase(fixtureRepo, makeStubDataSource(), matchRepo);

    const deps = {
      fixtureRepository: fixtureRepo,
      jobProducer: queue,
    } as unknown as HandlerDeps;

    const app = new Hono();
    app.post('/api/scrape/draw', handlers.triggerScrape(deps));

    const res = await app.request('/api/scrape/draw', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ year: 2026 }),
    });
    expect(res.status).toBe(202);

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

    await dispatcher.handle(queue.drain());

    const artifact = await fixtureRepo.findByYear(2026);
    expect(artifact).not.toBeNull();
    expect(artifact!.payload.length).toBeGreaterThan(0);
  });
});
