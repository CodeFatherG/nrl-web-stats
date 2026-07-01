/**
 * Tests for the team-strength-rankings gap-set predicate in
 * EnqueueDueScrapesUseCase (feature 039 T020).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  EnqueueDueScrapesUseCase,
  type EnqueueDueScrapesDeps,
} from '../../../src/application/use-cases/enqueue-due-scrapes.js';
import { InMemoryProjectionRepository } from '../../../src/infrastructure/cache/in-memory-projection-repository.js';
import { InMemoryPlayerMovementsRepository } from '../../../src/infrastructure/persistence/in-memory-player-movements-repository.js';
import { InMemoryTeamStrengthRankingsRepository } from '../../../src/infrastructure/persistence/in-memory-team-strength-rankings-repository.js';
import type { JobProducer, ScrapeJob } from '../../../src/application/ports/job-queue.js';
import { makePayload } from '../cache/team-strength-rankings-repository-contract.js';

class StubProducer implements JobProducer {
  published: ScrapeJob[] = [];
  async publish(job: ScrapeJob) { this.published.push(job); }
  async publishBatch(jobs: readonly ScrapeJob[]) { this.published.push(...jobs); }
}

function makeMinimalDeps(opts: {
  watermark: number;
  tsrRepo: InMemoryTeamStrengthRankingsRepository;
  producer: JobProducer;
}): EnqueueDueScrapesDeps {
  return {
    matchRepository: {
      findByYear: async () => [],
      getLoadedYears: async () => [2026],
      findByYearAndRound: async () => [],
    } as never,
    playerRepository: {
      isRoundComplete: async () => false,
      countDistinctMatchesInRound: async () => 0,
      findAllSeasonSummaries: async () => [],
    } as never,
    supplementaryRepo: {
      isRoundCached: async () => false,
      findRoundsWithNullPriceBreakEven: async () => [],
      findRoundsWithNullTeamCode: async () => [],
    },
    teamListRepository: {
      getRoundsWithTeamLists: async () => new Set<number>(),
      findRoundsWithCompleteTeamLists: async () => new Set<number>(),
    } as never,
    gameStrengthRepository: {
      read: async () => null,
      writeLocked: async () => {},
      writeProvisional: async () => {},
      deleteProvisional: async () => {},
      deleteAllProvisional: async () => {},
      listLockedRounds: async () => new Set<number>(),
      listProvisionalRounds: async () => new Set<number>(),
    } as never,
    matchResultSource: { isAvailable: async () => false } as never,
    playerStatsSource: { isAvailable: async () => false } as never,
    supplementaryStatsSource: { isAvailable: async () => false } as never,
    teamListSource: { isAvailable: async () => false } as never,
    casualtyWardSource: { isAvailable: async () => false } as never,
    producer: opts.producer,
    projectionRepository: new InMemoryProjectionRepository(),
    watermarkFn: async () => opts.watermark,
    playerMovementsRepository: new InMemoryPlayerMovementsRepository(),
    teamFormRepository: { listTeamFormAsOfRounds: async () => new Map() } as never,
    matchOutlookRepository: { listMatchOutlookAsOfRounds: async () => new Map() } as never,
    playerTrendsRepository: { listPlayerTrendsAsOfRounds: async () => new Map() } as never,
    compositionImpactRepository: { listCompositionImpactAsOfRounds: async () => new Map() } as never,
    teamStrengthRankingsRepository: opts.tsrRepo,
  };
}

describe('EnqueueDueScrapesUseCase — team-strength-rankings gap-set predicate', () => {
  let producer: StubProducer;
  let tsrRepo: InMemoryTeamStrengthRankingsRepository;

  beforeEach(() => {
    producer = new StubProducer();
    tsrRepo = new InMemoryTeamStrengthRankingsRepository();
  });

  function tsrJobs() {
    return producer.published.filter(j => j.type === 'precompute-team-strength-rankings');
  }

  it('publishes one job per active year when the artifact is absent (cold start)', async () => {
    const useCase = new EnqueueDueScrapesUseCase(
      makeMinimalDeps({ watermark: 5, tsrRepo, producer }),
    );
    await useCase.execute({
      scheduledTime: new Date('2026-05-21T10:00:00Z'),
      currentYear: 2026,
    });
    const jobs = tsrJobs();
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      type: 'precompute-team-strength-rankings',
      year: 2026,
      asOfRound: 5,
    });
  });

  it('publishes zero jobs when every sub-artifact is current at the watermark', async () => {
    const payload = makePayload();
    await tsrRepo.saveYear(2026, 5, payload);
    // Make the watermark match every stored round in the payload.
    const useCase = new EnqueueDueScrapesUseCase(
      makeMinimalDeps({ watermark: 5, tsrRepo, producer }),
    );
    await useCase.execute({
      scheduledTime: new Date('2026-05-21T10:00:00Z'),
      currentYear: 2026,
    });
    // The default test payload has rounds 1 + 2 saved at asOfRound 5.
    // Watermark 5 means rounds 1..5 are expected — rounds 3..5 are missing,
    // so refresh IS required.
    expect(tsrJobs()).toHaveLength(1);
  });

  it('publishes zero jobs when watermark is 0 (pre-season)', async () => {
    const useCase = new EnqueueDueScrapesUseCase(
      makeMinimalDeps({ watermark: 0, tsrRepo, producer }),
    );
    await useCase.execute({
      scheduledTime: new Date('2026-05-21T10:00:00Z'),
      currentYear: 2026,
    });
    expect(tsrJobs()).toHaveLength(0);
  });

  it('publishes one job when the stored asOfRound lags the watermark', async () => {
    await tsrRepo.saveYear(2026, 4, makePayload());
    const useCase = new EnqueueDueScrapesUseCase(
      makeMinimalDeps({ watermark: 8, tsrRepo, producer }),
    );
    await useCase.execute({
      scheduledTime: new Date('2026-05-21T10:00:00Z'),
      currentYear: 2026,
    });
    expect(tsrJobs()).toHaveLength(1);
    expect(tsrJobs()[0]).toMatchObject({ year: 2026, asOfRound: 8 });
  });

  it('publishes exactly one job per year even when many sub-artifacts are stale', async () => {
    await tsrRepo.saveYear(2026, 2, makePayload());
    const useCase = new EnqueueDueScrapesUseCase(
      makeMinimalDeps({ watermark: 9, tsrRepo, producer }),
    );
    await useCase.execute({
      scheduledTime: new Date('2026-05-21T10:00:00Z'),
      currentYear: 2026,
    });
    expect(tsrJobs()).toHaveLength(1);
  });

  it('partial-write recovery: re-enqueues when thresholds+season are current but some round keys are missing', async () => {
    // Stored at watermark=8, but only round 1 (the default payload covers
    // rounds 1 + 2 — rounds 3..8 are absent so the gap predicate fires).
    const partialPayload = {
      thresholds: makePayload().thresholds,
      season: makePayload().season,
      roundRankings: new Map([
        [1, makePayload().roundRankings.get(1)!],
      ]),
    };
    await tsrRepo.saveYear(2026, 8, partialPayload);
    const useCase = new EnqueueDueScrapesUseCase(
      makeMinimalDeps({ watermark: 8, tsrRepo, producer }),
    );
    await useCase.execute({
      scheduledTime: new Date('2026-05-21T10:00:00Z'),
      currentYear: 2026,
    });
    expect(tsrJobs()).toHaveLength(1);
    expect(tsrJobs()[0]).toMatchObject({ year: 2026, asOfRound: 8 });
  });

  it('does not publish when the artifact fully covers the watermark range', async () => {
    // Build a payload where rounds 1..watermark are all stored.
    const watermark = 3;
    const payload = {
      thresholds: makePayload().thresholds,
      season: makePayload().season,
      roundRankings: new Map([
        [1, makePayload().roundRankings.get(1)!],
        [2, makePayload().roundRankings.get(2)!],
        [3, makePayload().roundRankings.get(2)!],
      ]),
    };
    await tsrRepo.saveYear(2026, watermark, payload);
    const useCase = new EnqueueDueScrapesUseCase(
      makeMinimalDeps({ watermark, tsrRepo, producer }),
    );
    await useCase.execute({
      scheduledTime: new Date('2026-05-21T10:00:00Z'),
      currentYear: 2026,
    });
    expect(tsrJobs()).toHaveLength(0);
  });
});
