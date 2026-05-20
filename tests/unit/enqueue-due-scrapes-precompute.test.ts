/**
 * T031 — Tests for the precompute-due predicate in EnqueueDueScrapesUseCase.
 * Feature: 034-precomputed-projections (US4).
 *
 * The predicate fires when watermark > status.asOfRound (including when
 * status is null, i.e. first-ever precompute) and does NOT fire when they
 * are equal or when watermark is 0.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { EnqueueDueScrapesUseCase, type EnqueueDueScrapesDeps } from '../../src/application/use-cases/enqueue-due-scrapes.js';
import { InMemoryProjectionRepository } from '../../src/infrastructure/cache/in-memory-projection-repository.js';
import type { JobProducer, ScrapeJob } from '../../src/application/ports/job-queue.js';

class StubProducer implements JobProducer {
  published: ScrapeJob[] = [];
  async publish(job: ScrapeJob) { this.published.push(job); }
  async publishBatch(jobs: readonly ScrapeJob[]) { this.published.push(...jobs); }
}

function makeMinimalDeps(opts: {
  watermark: number;
  status: number | null;
  repo: InMemoryProjectionRepository;
  producer: JobProducer;
}): EnqueueDueScrapesDeps {
  return {
    matchRepository: { findByYear: async () => [], getLoadedYears: async () => [], findByYearAndRound: async () => [] } as any,
    playerRepository: { isRoundComplete: async () => false, countDistinctMatchesInRound: async () => 0 } as any,
    supplementaryRepo: { isRoundCached: async () => false, findRoundsWithNullPriceBreakEven: async () => [], findRoundsWithNullTeamCode: async () => [] },
    teamListRepository: {} as any,
    gameStrengthRepo: { findByRound: async () => null },
    matchResultSource: { isAvailable: async () => false } as any,
    playerStatsSource: { isAvailable: async () => false } as any,
    supplementaryStatsSource: { isAvailable: async () => false } as any,
    teamListSource: { isAvailable: async () => false } as any,
    casualtyWardSource: { isAvailable: async () => false } as any,
    producer: opts.producer,
    projectionRepository: opts.repo,
    watermarkFn: async () => opts.watermark,
  };
}

describe('EnqueueDueScrapesUseCase — precompute-due predicate (US4)', () => {
  let repo: InMemoryProjectionRepository;
  let producer: StubProducer;

  beforeEach(() => {
    repo = new InMemoryProjectionRepository();
    producer = new StubProducer();
  });

  async function runWithFixtures(watermark: number, status: number | null) {
    if (status !== null) {
      await repo.savePrecomputeStatus({ year: 2026, asOfRound: status });
    }
    const deps = makeMinimalDeps({ watermark, status, repo, producer });
    const uc = new EnqueueDueScrapesUseCase(deps);
    await uc.execute({ scheduledTime: new Date('2026-05-20T06:00:00Z'), currentYear: 2026 });
  }

  function precomputeJobsPublished(): readonly ScrapeJob[] {
    return producer.published.filter((j) => j.type === 'precompute-projections');
  }

  it('fires when watermark > status.asOfRound', async () => {
    await runWithFixtures(12, 5);
    const jobs = precomputeJobsPublished();
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toEqual({ type: 'precompute-projections', version: 1, year: 2026, asOfRound: 12 });
  });

  it('fires when status is null (first-ever precompute)', async () => {
    await runWithFixtures(7, null);
    const jobs = precomputeJobsPublished();
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ type: 'precompute-projections', asOfRound: 7 });
  });

  it('does NOT fire when watermark equals status.asOfRound', async () => {
    await runWithFixtures(10, 10);
    expect(precomputeJobsPublished()).toHaveLength(0);
  });

  it('does NOT fire when watermark is 0 (no round complete yet)', async () => {
    await runWithFixtures(0, null);
    expect(precomputeJobsPublished()).toHaveLength(0);
  });

  it('does NOT fire when watermark is less than status (impossible-but-defensive)', async () => {
    await runWithFixtures(3, 10);
    expect(precomputeJobsPublished()).toHaveLength(0);
  });

  it('respects shadowMode (no jobs published)', async () => {
    await repo.savePrecomputeStatus({ year: 2026, asOfRound: 5 });
    const deps = makeMinimalDeps({ watermark: 12, status: 5, repo, producer });
    const uc = new EnqueueDueScrapesUseCase(deps);
    await uc.execute({ scheduledTime: new Date('2026-05-20T06:00:00Z'), currentYear: 2026, shadowMode: true });
    expect(producer.published).toHaveLength(0);
  });
});
