/**
 * Integration test: ScrapeSupplementaryStatsUseCase emits the spec-039
 * precompute-team-strength-rankings job on every successful scrape
 * (feature 039 T021).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ScrapeSupplementaryStatsUseCase } from '../../src/application/use-cases/scrape-supplementary-stats.js';
import type { JobProducer, ScrapeJob, PrecomputeTeamStrengthRankingsJob } from '../../src/application/ports/job-queue.js';
import type { SupplementaryStatsSource } from '../../src/domain/ports/supplementary-stats-source.js';
import type { D1SupplementaryStatsRepository } from '../../src/infrastructure/persistence/d1-supplementary-stats-repo.js';

class InMemoryProducer implements JobProducer {
  published: ScrapeJob[] = [];
  async publish(job: ScrapeJob) { this.published.push(job); }
  async publishBatch(jobs: readonly ScrapeJob[]) { this.published.push(...jobs); }
}

function makeSource(): SupplementaryStatsSource {
  return {
    fetchSupplementaryStats: vi.fn().mockResolvedValue({
      success: true,
      data: [{ playerName: 'Player A' } as never],
      warnings: [],
    }),
  } as unknown as SupplementaryStatsSource;
}

function makeRepo(): D1SupplementaryStatsRepository {
  return {
    isRoundCached: vi.fn().mockResolvedValue(false),
    deleteRound: vi.fn().mockResolvedValue(undefined),
    save: vi.fn().mockResolvedValue(undefined),
  } as unknown as D1SupplementaryStatsRepository;
}

describe('ScrapeSupplementaryStatsUseCase — spec 039 precompute signal', () => {
  let producer: InMemoryProducer;

  beforeEach(() => {
    producer = new InMemoryProducer();
  });

  it('publishes exactly one precompute-team-strength-rankings job per successful scrape with asOfRound = completed round', async () => {
    const useCase = new ScrapeSupplementaryStatsUseCase(
      makeSource(),
      makeRepo(),
      producer,
    );

    await useCase.execute(2026, 11, false);

    const tsrJobs = producer.published.filter(
      (j): j is PrecomputeTeamStrengthRankingsJob =>
        j.type === 'precompute-team-strength-rankings',
    );
    expect(tsrJobs).toHaveLength(1);
    expect(tsrJobs[0]).toEqual({
      type: 'precompute-team-strength-rankings',
      version: 1,
      year: 2026,
      asOfRound: 11,
    });
  });

  it('does not publish the precompute job when the producer is absent', async () => {
    const useCase = new ScrapeSupplementaryStatsUseCase(makeSource(), makeRepo());
    await useCase.execute(2026, 11, false);
    expect(producer.published).toHaveLength(0);
  });
});
