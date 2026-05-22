/**
 * T024 — Tests for the publish-on-success behaviour added to
 * ScrapeSupplementaryStatsUseCase by spec 036.
 *
 * The use case publishes a `recompute-game-strength` job whenever a scrape
 * completes successfully (and an optional `producer` is wired). Publication
 * failure is logged but does NOT fail the scrape — the cron-discovery tick
 * is the safety net.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ScrapeSupplementaryStatsUseCase } from '../../../src/application/use-cases/scrape-supplementary-stats.js';
import type { JobProducer, ScrapeJob } from '../../../src/application/ports/job-queue.js';
import type { SupplementaryStatsSource } from '../../../src/domain/ports/supplementary-stats-source.js';
import type { D1SupplementaryStatsRepository } from '../../../src/infrastructure/persistence/d1-supplementary-stats-repo.js';

class StubProducer implements JobProducer {
  published: ScrapeJob[] = [];
  publishImpl: ((j: ScrapeJob) => Promise<void>) | null = null;
  async publish(job: ScrapeJob): Promise<void> {
    if (this.publishImpl) return this.publishImpl(job);
    this.published.push(job);
  }
  async publishBatch(jobs: readonly ScrapeJob[]): Promise<void> {
    this.published.push(...jobs);
  }
}

function makeSource(success: boolean): SupplementaryStatsSource {
  return {
    fetchSupplementaryStats: vi.fn().mockResolvedValue(
      success
        ? { success: true, data: [{ playerName: 'A' } as any], warnings: [] }
        : { success: false, error: 'simulated' },
    ),
  } as unknown as SupplementaryStatsSource;
}

function makeRepo(roundAlreadyCached = false): D1SupplementaryStatsRepository {
  return {
    isRoundCached: vi.fn().mockResolvedValue(roundAlreadyCached),
    deleteRound: vi.fn().mockResolvedValue(undefined),
    save: vi.fn().mockResolvedValue(undefined),
  } as unknown as D1SupplementaryStatsRepository;
}

describe('ScrapeSupplementaryStatsUseCase — recompute-game-strength publish-on-success', () => {
  let producer: StubProducer;

  beforeEach(() => {
    producer = new StubProducer();
  });

  it('publishes a recompute-game-strength job on successful scrape', async () => {
    const useCase = new ScrapeSupplementaryStatsUseCase(makeSource(true), makeRepo(false), producer);
    await useCase.execute(2026, 14, false);
    expect(producer.published).toHaveLength(1);
    expect(producer.published[0]).toEqual({
      type: 'recompute-game-strength',
      version: 1,
      year: 2026,
      completedRound: 14,
    });
  });

  it('does not publish when no producer is configured', async () => {
    const useCase = new ScrapeSupplementaryStatsUseCase(makeSource(true), makeRepo(false));
    await useCase.execute(2026, 14, false);
    // No producer wired = no error thrown, scrape succeeds
    expect(producer.published).toHaveLength(0);
  });

  it('does not publish when the scrape fails (fetchSupplementaryStats returns success=false)', async () => {
    const useCase = new ScrapeSupplementaryStatsUseCase(makeSource(false), makeRepo(false), producer);
    await expect(useCase.execute(2026, 14, false)).rejects.toThrow(/Failed to fetch supplementary stats/);
    expect(producer.published).toHaveLength(0);
  });

  it('does not publish when the scrape is skipped (already cached, not forced)', async () => {
    const useCase = new ScrapeSupplementaryStatsUseCase(makeSource(true), makeRepo(true), producer);
    const result = await useCase.execute(2026, 14, false);
    expect(result.cached).toBe(true);
    // The cached-skip path returns before the publish step
    expect(producer.published).toHaveLength(0);
  });

  it('publication failure is logged but does NOT propagate as a scrape failure', async () => {
    producer.publishImpl = async () => { throw new Error('queue down'); };
    const useCase = new ScrapeSupplementaryStatsUseCase(makeSource(true), makeRepo(false), producer);
    // Should NOT throw — scrape's primary contract is persistence; publish is best-effort
    const result = await useCase.execute(2026, 14, false);
    expect(result.cached).toBe(false);
    expect(result.playersScraped).toBe(1);
  });
});
