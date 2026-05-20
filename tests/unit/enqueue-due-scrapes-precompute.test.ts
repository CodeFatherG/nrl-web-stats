/**
 * Tests for the precompute fan-out predicate in EnqueueDueScrapesUseCase.
 * Feature: 034-precomputed-projections (fan-out refactor).
 *
 * Discovery emits one `precompute-player-projection` per missing/stale player
 * + one `precompute-team-rankings` per missing (team, mode). On the tick that
 * observes full coverage at the watermark, discovery writes the status itself.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { EnqueueDueScrapesUseCase, type EnqueueDueScrapesDeps } from '../../src/application/use-cases/enqueue-due-scrapes.js';
import { InMemoryProjectionRepository } from '../../src/infrastructure/cache/in-memory-projection-repository.js';
import type { JobProducer, ScrapeJob } from '../../src/application/ports/job-queue.js';
import { VALID_TEAM_CODES } from '../../src/models/team.js';
import { ALL_RANKING_MODES } from '../../src/analytics/player-projection-types.js';

class StubProducer implements JobProducer {
  published: ScrapeJob[] = [];
  async publish(job: ScrapeJob) { this.published.push(job); }
  async publishBatch(jobs: readonly ScrapeJob[]) { this.published.push(...jobs); }
}

function fakeSummary(id: string) {
  return {
    playerId: id,
    playerName: `Player ${id}`,
    teamCode: 'BRI',
    position: 'PROP',
    gamesPlayed: 1,
    totalTries: 0,
    totalRunMetres: 0,
    totalTacklesMade: 0,
    totalPoints: 0,
    averageFantasyPoints: 0,
    totalTackleBreaks: 0,
    totalLineBreaks: 0,
  };
}

function makeMinimalDeps(opts: {
  watermark: number;
  expectedPlayerIds: string[];
  repo: InMemoryProjectionRepository;
  producer: JobProducer;
}): EnqueueDueScrapesDeps {
  return {
    matchRepository: { findByYear: async () => [], getLoadedYears: async () => [], findByYearAndRound: async () => [] } as any,
    playerRepository: {
      isRoundComplete: async () => false,
      countDistinctMatchesInRound: async () => 0,
      findAllSeasonSummaries: async () => opts.expectedPlayerIds.map(fakeSummary),
    } as any,
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

const TEAM_MODE_COUNT = VALID_TEAM_CODES.length * ALL_RANKING_MODES.length;

describe('EnqueueDueScrapesUseCase — precompute fan-out predicate', () => {
  let repo: InMemoryProjectionRepository;
  let producer: StubProducer;

  beforeEach(() => {
    repo = new InMemoryProjectionRepository();
    producer = new StubProducer();
  });

  async function runWith(opts: { watermark: number; expectedPlayerIds: string[]; status?: number; shadowMode?: boolean }) {
    if (opts.status !== undefined) {
      await repo.savePrecomputeStatus({ year: 2026, asOfRound: opts.status });
    }
    const deps = makeMinimalDeps({ watermark: opts.watermark, expectedPlayerIds: opts.expectedPlayerIds, repo, producer });
    const uc = new EnqueueDueScrapesUseCase(deps);
    await uc.execute({ scheduledTime: new Date('2026-05-20T06:00:00Z'), currentYear: 2026, shadowMode: opts.shadowMode });
  }

  function playerJobs() {
    return producer.published.filter(j => j.type === 'precompute-player-projection');
  }
  function teamJobs() {
    return producer.published.filter(j => j.type === 'precompute-team-rankings');
  }

  it('first tick (no status, empty repo) emits one sub-job per player + per (team, mode)', async () => {
    await runWith({ watermark: 12, expectedPlayerIds: ['p:1', 'p:2', 'p:3'] });
    expect(playerJobs()).toHaveLength(3);
    expect(teamJobs()).toHaveLength(TEAM_MODE_COUNT);
    // Status NOT advanced — full coverage not yet observed.
    expect(await repo.findPrecomputeStatus(2026)).toBeNull();
  });

  it('subsequent tick emits only the remainder when partial coverage exists', async () => {
    // p:1 already covered at watermark 12; BRO:composite team-mode already covered.
    await repo.savePlayerAggregate({
      playerId: 'p:1', year: 2026, asOfRound: 12, computedAt: 'x',
      baseProfile: {} as any, contextualProfile: {} as any,
    });
    await repo.saveTeamRankingsAggregate({
      year: 2026, teamCode: 'BRO', mode: 'composite', asOfRound: 12, computedAt: 'x',
      rankings: {} as any,
    });

    await runWith({ watermark: 12, expectedPlayerIds: ['p:1', 'p:2', 'p:3'] });

    const players = playerJobs();
    expect(players.map(j => (j as any).playerId).sort()).toEqual(['p:2', 'p:3']);
    expect(teamJobs()).toHaveLength(TEAM_MODE_COUNT - 1);
    expect(await repo.findPrecomputeStatus(2026)).toBeNull();
  });

  it('writes the status when full coverage is observed at the watermark', async () => {
    // Seed all expected coverage at watermark 7.
    for (const id of ['p:1', 'p:2']) {
      await repo.savePlayerAggregate({
        playerId: id, year: 2026, asOfRound: 7, computedAt: 'x',
        baseProfile: {} as any, contextualProfile: {} as any,
      });
    }
    for (const teamCode of VALID_TEAM_CODES) {
      for (const mode of ALL_RANKING_MODES) {
        await repo.saveTeamRankingsAggregate({
          year: 2026, teamCode, mode, asOfRound: 7, computedAt: 'x',
          rankings: {} as any,
        });
      }
    }

    await runWith({ watermark: 7, expectedPlayerIds: ['p:1', 'p:2'] });

    expect(producer.published.filter(j => j.type.startsWith('precompute-'))).toHaveLength(0);
    expect(await repo.findPrecomputeStatus(2026)).toEqual({ year: 2026, asOfRound: 7 });
  });

  it('publishes nothing once status.asOfRound >= watermark', async () => {
    await runWith({ watermark: 10, expectedPlayerIds: ['p:1'], status: 10 });
    expect(producer.published.filter(j => j.type.startsWith('precompute-'))).toHaveLength(0);
  });

  it('publishes nothing when watermark is 0', async () => {
    await runWith({ watermark: 0, expectedPlayerIds: ['p:1'] });
    expect(producer.published).toHaveLength(0);
  });

  it('treats stale aggregates (asOfRound < watermark) as missing', async () => {
    await repo.savePlayerAggregate({
      playerId: 'p:1', year: 2026, asOfRound: 5, computedAt: 'x',
      baseProfile: {} as any, contextualProfile: {} as any,
    });
    await runWith({ watermark: 12, expectedPlayerIds: ['p:1'] });
    expect(playerJobs()).toHaveLength(1);
  });

  it('respects shadowMode (no jobs published, status untouched)', async () => {
    await runWith({ watermark: 12, expectedPlayerIds: ['p:1'], status: 5, shadowMode: true });
    expect(producer.published).toHaveLength(0);
    // status untouched
    expect(await repo.findPrecomputeStatus(2026)).toEqual({ year: 2026, asOfRound: 5 });
  });
});
