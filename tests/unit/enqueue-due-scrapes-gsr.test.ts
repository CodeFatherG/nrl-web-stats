/**
 * T025 (refactored for the unified port) — Tests for the GSR
 * provisional-fill predicate in EnqueueDueScrapesUseCase.
 *
 * Discovery emits ONE `recompute-game-strength` job per year per tick when:
 *   - There is at least one round in the year whose supp-stats are cached.
 *   - The set of (locked ∪ provisional) does NOT cover every round the
 *     season expects (per match data).
 *
 * After spec 036's refactor, both halves are queried through ONE
 * `GameStrengthRepository` port (`listLockedRounds` + `listProvisionalRounds`).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  EnqueueDueScrapesUseCase,
  type EnqueueDueScrapesDeps,
} from '../../src/application/use-cases/enqueue-due-scrapes.js';
import { InMemoryProjectionRepository } from '../../src/infrastructure/cache/in-memory-projection-repository.js';
import { InMemoryPlayerMovementsRepository } from '../../src/infrastructure/persistence/in-memory-player-movements-repository.js';
import { MatchStatus } from '../../src/domain/match.js';
import type { JobProducer, ScrapeJob } from '../../src/application/ports/job-queue.js';
import type { Match } from '../../src/domain/match.js';
import type { GameStrengthRepository } from '../../src/domain/repositories/game-strength-repository.js';

class StubProducer implements JobProducer {
  published: ScrapeJob[] = [];
  async publish(job: ScrapeJob) { this.published.push(job); }
  async publishBatch(jobs: readonly ScrapeJob[]) { this.published.push(...jobs); }
}

function makeMatch(year: number, round: number, completed = true): Match {
  return {
    id: `${year}-R${round}-A-B`,
    year,
    round,
    homeTeamCode: 'A',
    awayTeamCode: 'B',
    homeStrengthRating: null,
    awayStrengthRating: null,
    homeScore: null,
    awayScore: null,
    status: completed ? MatchStatus.Completed : MatchStatus.Scheduled,
    scheduledTime: null,
    stadium: null,
    weather: null,
  };
}

function makeRepo(opts: { locked: Set<number>; provisional: Set<number> }): GameStrengthRepository {
  return {
    read: async () => null,
    writeLocked: async () => {},
    writeProvisional: async () => {},
    deleteProvisional: async () => {},
    deleteAllProvisional: async () => {},
    listLockedRounds: async () => opts.locked,
    listProvisionalRounds: async () => opts.provisional,
  };
}

function makeMinimalDeps(opts: {
  matches: Match[];
  cachedSuppRounds: Set<number>;
  gameStrengthRepository: GameStrengthRepository;
  producer: JobProducer;
}): EnqueueDueScrapesDeps {
  return {
    matchRepository: {
      findByYear: async (_y: number) => opts.matches,
      getLoadedYears: async () => [2026],
      findByYearAndRound: async () => [],
    } as any,
    playerRepository: {
      isRoundComplete: async () => false,
      countDistinctMatchesInRound: async () => 0,
      findAllSeasonSummaries: async () => [],
    } as any,
    supplementaryRepo: {
      isRoundCached: async (_y: number, r: number) => opts.cachedSuppRounds.has(r),
      findRoundsWithNullPriceBreakEven: async () => [],
      findRoundsWithNullTeamCode: async () => [],
    },
    teamListRepository: {
      getRoundsWithTeamLists: async () => new Set<number>(),
      findRoundsWithCompleteTeamLists: async () => new Set<number>(),
      hasTeamList: async () => true,
    } as any,
    gameStrengthRepository: opts.gameStrengthRepository,
    matchResultSource: { isAvailable: async () => false } as any,
    playerStatsSource: { isAvailable: async () => false } as any,
    supplementaryStatsSource: { isAvailable: async () => false } as any,
    teamListSource: { isAvailable: async () => false } as any,
    casualtyWardSource: { isAvailable: async () => false } as any,
    producer: opts.producer,
    projectionRepository: new InMemoryProjectionRepository(),
    watermarkFn: async () => 0,
    playerMovementsRepository: new InMemoryPlayerMovementsRepository(),
  };
}

function countGsrJobs(producer: StubProducer): ScrapeJob[] {
  return producer.published.filter(j => j.type === 'recompute-game-strength');
}

describe('EnqueueDueScrapesUseCase — GSR provisional-fill predicate (unified port)', () => {
  let producer: StubProducer;

  beforeEach(() => {
    producer = new StubProducer();
  });

  it('publishes one recompute-game-strength job when a gap exists and supp-stats are cached', async () => {
    const matches = [
      makeMatch(2026, 1, true),
      makeMatch(2026, 2, true),
      makeMatch(2026, 3, true),
      makeMatch(2026, 4, false),
      makeMatch(2026, 5, false),
    ];
    // Locked {1, 2}, provisional {4, 5}; round 3 is the GAP.
    const deps = makeMinimalDeps({
      matches,
      cachedSuppRounds: new Set([1, 2, 3]),
      gameStrengthRepository: makeRepo({ locked: new Set([1, 2]), provisional: new Set([4, 5]) }),
      producer,
    });

    const useCase = new EnqueueDueScrapesUseCase(deps);
    await useCase.execute({ scheduledTime: new Date('2026-05-01T00:00:00Z'), currentYear: 2026 });

    const gsrJobs = countGsrJobs(producer);
    expect(gsrJobs).toHaveLength(1);
    expect(gsrJobs[0]).toEqual({
      type: 'recompute-game-strength',
      version: 1,
      year: 2026,
      completedRound: 3,
    });
  });

  it('publishes NO job when locked ∪ provisional already covers every round', async () => {
    const matches = [makeMatch(2026, 1, true), makeMatch(2026, 2, true), makeMatch(2026, 3, false)];
    const deps = makeMinimalDeps({
      matches,
      cachedSuppRounds: new Set([1, 2]),
      gameStrengthRepository: makeRepo({ locked: new Set([1, 2]), provisional: new Set([3]) }),
      producer,
    });

    const useCase = new EnqueueDueScrapesUseCase(deps);
    await useCase.execute({ scheduledTime: new Date('2026-05-01T00:00:00Z'), currentYear: 2026 });

    expect(countGsrJobs(producer)).toHaveLength(0);
  });

  it('publishes NO job when no supp-stats round is cached yet', async () => {
    const matches = [makeMatch(2026, 1, false), makeMatch(2026, 2, false)];
    const deps = makeMinimalDeps({
      matches,
      cachedSuppRounds: new Set<number>(),
      gameStrengthRepository: makeRepo({ locked: new Set(), provisional: new Set() }),
      producer,
    });

    const useCase = new EnqueueDueScrapesUseCase(deps);
    await useCase.execute({ scheduledTime: new Date('2026-05-01T00:00:00Z'), currentYear: 2026 });

    expect(countGsrJobs(producer)).toHaveLength(0);
  });

  it('uses the highest supp-stats-cached round as completedRound', async () => {
    const matches = [
      makeMatch(2026, 1, true),
      makeMatch(2026, 2, true),
      makeMatch(2026, 3, true),
      makeMatch(2026, 4, false),
    ];
    const deps = makeMinimalDeps({
      matches,
      cachedSuppRounds: new Set([1, 2, 3]),
      gameStrengthRepository: makeRepo({ locked: new Set(), provisional: new Set() }),
      producer,
    });

    const useCase = new EnqueueDueScrapesUseCase(deps);
    await useCase.execute({ scheduledTime: new Date('2026-05-01T00:00:00Z'), currentYear: 2026 });

    const gsrJobs = countGsrJobs(producer);
    expect(gsrJobs).toHaveLength(1);
    expect((gsrJobs[0] as any).completedRound).toBe(3);
  });

  it('publishes ONE job regardless of gap-set size (batched compute fills all in one invocation)', async () => {
    const matches = [
      makeMatch(2026, 1, true),
      makeMatch(2026, 2, true),
      makeMatch(2026, 3, false),
      makeMatch(2026, 4, false),
      makeMatch(2026, 5, false),
    ];
    const deps = makeMinimalDeps({
      matches,
      cachedSuppRounds: new Set([1, 2]),
      gameStrengthRepository: makeRepo({ locked: new Set([1]), provisional: new Set() }),
      producer,
    });

    const useCase = new EnqueueDueScrapesUseCase(deps);
    await useCase.execute({ scheduledTime: new Date('2026-05-01T00:00:00Z'), currentYear: 2026 });

    expect(countGsrJobs(producer)).toHaveLength(1);
  });
});
