/**
 * Tests for the player-movements gap-set predicate in EnqueueDueScrapesUseCase.
 * Feature: 035-player-movements-artifact (T024).
 *
 * Discovery emits one `compute-player-movements` job per round where:
 *   - team_lists has every expected team present (FR-017 complete predicate), AND
 *   - the movements repository does NOT already cover that round.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  EnqueueDueScrapesUseCase,
  type EnqueueDueScrapesDeps,
} from '../../src/application/use-cases/enqueue-due-scrapes.js';
import { InMemoryProjectionRepository } from '../../src/infrastructure/cache/in-memory-projection-repository.js';
import { InMemoryPlayerMovementsRepository } from '../../src/infrastructure/persistence/in-memory-player-movements-repository.js';
import type { JobProducer, ScrapeJob } from '../../src/application/ports/job-queue.js';

class StubProducer implements JobProducer {
  published: ScrapeJob[] = [];
  async publish(job: ScrapeJob) { this.published.push(job); }
  async publishBatch(jobs: readonly ScrapeJob[]) { this.published.push(...jobs); }
}

function makeMinimalDeps(opts: {
  completedTeamListRounds: number[];
  movementsRepo: InMemoryPlayerMovementsRepository;
  producer: JobProducer;
}): EnqueueDueScrapesDeps {
  return {
    matchRepository: {
      findByYear: async () => [],
      getLoadedYears: async () => [2026],
      findByYearAndRound: async () => [],
    } as any,
    playerRepository: {
      isRoundComplete: async () => false,
      countDistinctMatchesInRound: async () => 0,
      findAllSeasonSummaries: async () => [],
    } as any,
    supplementaryRepo: {
      isRoundCached: async () => false,
      findRoundsWithNullPriceBreakEven: async () => [],
      findRoundsWithNullTeamCode: async () => [],
    },
    teamListRepository: {
      getRoundsWithTeamLists: async () => new Set<number>(),
      findRoundsWithCompleteTeamLists: async () =>
        new Set(opts.completedTeamListRounds),
    } as any,
    gameStrengthRepo: { findByRound: async () => null },
    matchResultSource: { isAvailable: async () => false } as any,
    playerStatsSource: { isAvailable: async () => false } as any,
    supplementaryStatsSource: { isAvailable: async () => false } as any,
    teamListSource: { isAvailable: async () => false } as any,
    casualtyWardSource: { isAvailable: async () => false } as any,
    producer: opts.producer,
    projectionRepository: new InMemoryProjectionRepository(),
    watermarkFn: async () => 0,
    playerMovementsRepository: opts.movementsRepo,
  };
}

function makeArtifact(year: number, round: number) {
  return {
    year,
    round,
    computedAt: '2026-05-21T10:00:00.000Z',
    season: year,
    injured: [],
    dropped: [],
    benched: [],
    returningFromInjury: [],
    coveringInjury: [],
    promoted: [],
    positionChanged: [],
  };
}

describe('EnqueueDueScrapesUseCase — player-movements gap-set predicate', () => {
  let producer: StubProducer;
  let movementsRepo: InMemoryPlayerMovementsRepository;

  beforeEach(() => {
    producer = new StubProducer();
    movementsRepo = new InMemoryPlayerMovementsRepository();
  });

  it('publishes one compute-player-movements job per complete-but-uncovered round', async () => {
    const deps = makeMinimalDeps({
      completedTeamListRounds: [1, 2, 3],
      movementsRepo,
      producer,
    });
    const useCase = new EnqueueDueScrapesUseCase(deps);
    await useCase.execute({
      scheduledTime: new Date('2026-05-21T10:00:00Z'),
      currentYear: 2026,
    });
    const movementJobs = producer.published.filter(
      j => j.type === 'compute-player-movements',
    );
    expect(movementJobs).toHaveLength(3);
    expect(movementJobs.map(j => (j as any).round).sort((a, b) => a - b)).toEqual([1, 2, 3]);
  });

  it('publishes zero jobs when every complete round is already covered', async () => {
    await movementsRepo.save(makeArtifact(2026, 1));
    await movementsRepo.save(makeArtifact(2026, 2));
    await movementsRepo.save(makeArtifact(2026, 3));
    const deps = makeMinimalDeps({
      completedTeamListRounds: [1, 2, 3],
      movementsRepo,
      producer,
    });
    const useCase = new EnqueueDueScrapesUseCase(deps);
    await useCase.execute({
      scheduledTime: new Date('2026-05-21T10:00:00Z'),
      currentYear: 2026,
    });
    const movementJobs = producer.published.filter(
      j => j.type === 'compute-player-movements',
    );
    expect(movementJobs).toHaveLength(0);
  });

  it('publishes only the gap when partial coverage exists', async () => {
    await movementsRepo.save(makeArtifact(2026, 1));
    await movementsRepo.save(makeArtifact(2026, 2));
    const deps = makeMinimalDeps({
      completedTeamListRounds: [1, 2, 3],
      movementsRepo,
      producer,
    });
    const useCase = new EnqueueDueScrapesUseCase(deps);
    await useCase.execute({
      scheduledTime: new Date('2026-05-21T10:00:00Z'),
      currentYear: 2026,
    });
    const movementJobs = producer.published.filter(
      j => j.type === 'compute-player-movements',
    );
    expect(movementJobs).toHaveLength(1);
    expect((movementJobs[0] as any).round).toBe(3);
  });
});
