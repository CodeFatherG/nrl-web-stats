/**
 * End-to-end integration test for the precompute write-path (fan-out version).
 *
 * Flow:
 *   1. Seed minimal "complete round" state in fakes.
 *   2. EnqueueDueScrapesUseCase emits N `precompute-player-projection` +
 *      M `precompute-team-rankings` sub-jobs (no status write yet).
 *   3. HandleScrapeJobUseCase dispatches each sub-job to its leaf use case.
 *   4. After every leaf job runs, the next discovery tick observes full
 *      coverage and writes the PrecomputeStatus itself.
 *   5. The read-side use cases now serve from the repo (warm hit).
 *
 * Uses the in-memory projection adapter; the KV adapter is exercised
 * separately in tests/integration/kv-projection-repository.test.ts.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { EnqueueDueScrapesUseCase } from '../../src/application/use-cases/enqueue-due-scrapes.js';
import { HandleScrapeJobUseCase } from '../../src/application/use-cases/handle-scrape-job.js';
import { PrecomputePlayerProjectionUseCase } from '../../src/application/use-cases/precompute-player-projection.js';
import { PrecomputeTeamRankingsUseCase } from '../../src/application/use-cases/precompute-team-rankings.js';
import { GetPlayerProjectionUseCase } from '../../src/application/use-cases/get-player-projection.js';
import { GetContextualProfileUseCase } from '../../src/application/use-cases/get-contextual-profile.js';
import { GetTeamProjectionRankingsUseCase } from '../../src/application/use-cases/get-team-projection-rankings.js';
import { InMemoryProjectionRepository } from '../../src/infrastructure/cache/in-memory-projection-repository.js';
import { AnalyticsCache } from '../../src/analytics/analytics-cache.js';
import type { JobBatch, JobHandle, JobProducer, ScrapeJob } from '../../src/application/ports/job-queue.js';
import { VALID_TEAM_CODES } from '../../src/models/team.js';
import { ALL_RANKING_MODES } from '../../src/analytics/player-projection-types.js';

class CapturingProducer implements JobProducer {
  published: ScrapeJob[] = [];
  async publish(j: ScrapeJob) { this.published.push(j); }
  async publishBatch(j: readonly ScrapeJob[]) { this.published.push(...j); }
}

function makeHandle(body: ScrapeJob): JobHandle<ScrapeJob> {
  return {
    body,
    attemptCount: 1,
    ack() {},
    retry() {},
  };
}

function makeBatch(body: ScrapeJob): JobBatch<ScrapeJob> {
  return {
    handles: [makeHandle(body)],
    ackAll() {},
    retryAll() {},
  };
}

describe('End-to-end precompute flow (fan-out)', () => {
  let repo: InMemoryProjectionRepository;

  beforeEach(() => {
    repo = new InMemoryProjectionRepository();
  });

  it('discovery emits sub-jobs; dispatcher runs them; next tick writes status; reads warm-hit', async () => {
    // ── Fakes ──────────────────────────────────────────────────────────
    const watermark = 5;
    const player = { id: 'p:1', name: 'Test', teamCode: 'BRO', position: 'PROP', seasons: [] };
    const baseProfile = {
      playerId: 'p:1', playerName: 'Test', teamCode: 'BRO', position: 'PROP',
      projectedTotal: 40, projectedFloor: 35, projectedCeiling: 48,
      avgMinutes: 60, floorMean: 30, floorStd: 5, floorCv: 0.16, floorPerMinute: 0.5,
      spikeMean: 10, spikeStd: 4, spikeCv: 0.4, spikePerMinute: 0.16,
      spikeP25: 5, spikeP50: 8, spikeP75: 12, spikeP90: 18,
      spikeDistribution: { negative: { count: 0, frequency: 0 }, nil: { count: 0, frequency: 0 }, low: { count: 0, frequency: 0 }, moderate: { count: 0, frequency: 0 }, high: { count: 0, frequency: 0 }, boom: { count: 0, frequency: 0 } },
      gamesPlayed: 5, lowSampleWarning: false, noUsableData: false, games: [],
    };
    const contextualProfile = {
      playerId: 'p:1', playerName: 'Test', teamCode: 'BRO', position: 'PROP', year: 2026,
      baseProjection: { total: 40, floor: 35, ceiling: 48 },
      opponents: {}, venues: {}, weather: {},
    };

    const playerRepo: any = {
      findById: async (id: string) => id === 'p:1' ? player : null,
      findByTeam: async () => [player],
      findMatchPerformances: async () => [],
      findAllSeasonSummaries: async () => [{
        playerId: 'p:1', playerName: 'Test', teamCode: 'BRO', position: 'PROP',
        gamesPlayed: 5, totalTries: 0, totalRunMetres: 0, totalTacklesMade: 0,
        totalPoints: 0, averageFantasyPoints: 0, totalTackleBreaks: 0, totalLineBreaks: 0,
      }],
      findAllSeasonPerformancesSummary: async () => [],
      isRoundComplete: async () => true,
      countDistinctMatchesInRound: async () => 1,
    };
    const matchRepo: any = {
      findByYear: async () => [],
      getLoadedYears: async () => [],
      findByYearAndRound: async () => [],
    };
    const scUseCase: any = {
      executeForPlayer: async () => ({
        playerId: 'p:1', year: 2026, matches: [],
      }),
    };
    const playerProjectionUC = new GetPlayerProjectionUseCase(
      playerRepo, scUseCase, repo, async () => watermark,
    );
    playerProjectionUC.computeLive = async () => baseProfile as any;
    const contextualProfileUC = new GetContextualProfileUseCase(
      playerRepo, scUseCase, playerProjectionUC, matchRepo, new AnalyticsCache(), repo, async () => watermark,
    );
    contextualProfileUC.computeLive = async () => ({ kind: 'ok', result: contextualProfile as any });
    const teamRankingsUC = new GetTeamProjectionRankingsUseCase(
      playerRepo, scUseCase, repo, async () => watermark,
    );
    teamRankingsUC.computeLive = async (year, teamCode, mode) =>
      ({ year, teamCode, mode, rankedPlayers: [], excludedCount: 0 } as any);

    const precomputePlayerUC = new PrecomputePlayerProjectionUseCase({
      projectionRepository: repo,
      playerProjectionLive: playerProjectionUC,
      contextualProfileLive: contextualProfileUC,
    });
    const precomputeTeamUC = new PrecomputeTeamRankingsUseCase({
      projectionRepository: repo,
      teamRankingsLive: teamRankingsUC,
    });

    // ── Step 1: discovery emits sub-jobs (no status write yet) ────────
    const producer = new CapturingProducer();
    const enqueueUC = new EnqueueDueScrapesUseCase({
      matchRepository: matchRepo,
      playerRepository: playerRepo,
      supplementaryRepo: { isRoundCached: async () => true, findRoundsWithNullPriceBreakEven: async () => [], findRoundsWithNullTeamCode: async () => [] },
      teamListRepository: {
        hasTeamList: async () => true,
        findRoundsWithCompleteTeamLists: async () => new Set<number>(),
      } as any,
      gameStrengthRepo: { findByRound: async () => null },
      matchResultSource: { isAvailable: async () => false } as any,
      playerStatsSource: { isAvailable: async () => false } as any,
      supplementaryStatsSource: { isAvailable: async () => false } as any,
      teamListSource: { isAvailable: async () => false } as any,
      casualtyWardSource: { isAvailable: async () => false } as any,
      producer,
      projectionRepository: repo,
      watermarkFn: async () => watermark,
      playerMovementsRepository: {
        findByYearAndRound: async () => null,
        findMostRecentRound: async () => null,
        listCoveredRounds: async () => new Set<number>(),
        save: async () => {},
      },
    });
    await enqueueUC.execute({ scheduledTime: new Date('2026-05-20T06:00:00Z'), currentYear: 2026 });

    const playerJobs = producer.published.filter(j => j.type === 'precompute-player-projection');
    const teamJobs = producer.published.filter(j => j.type === 'precompute-team-rankings');
    expect(playerJobs).toHaveLength(1);
    expect(teamJobs).toHaveLength(VALID_TEAM_CODES.length * ALL_RANKING_MODES.length);
    // Status NOT written yet — only sub-jobs published.
    expect(await repo.findPrecomputeStatus(2026)).toBeNull();

    // ── Step 2: dispatcher runs every sub-job ─────────────────────────
    const dispatcher = new HandleScrapeJobUseCase({
      scrapeMatchResults: {} as any,
      scrapePlayerStats: {} as any,
      scrapeSupplementaryStats: {} as any,
      scrapeTeamLists: {} as any,
      scrapeCasualtyWard: {} as any,
      computePlayerMovements: {} as any,
      lockGameStrength: {} as any,
      precomputePlayerProjection: precomputePlayerUC,
      precomputeTeamRankings: precomputeTeamUC,
    });
    for (const job of [...playerJobs, ...teamJobs]) {
      await dispatcher.handle(makeBatch(job));
    }

    // ── Step 3: aggregates persisted, status STILL not written ────────
    const playerAgg = await repo.findPlayerAggregate(2026, 'p:1');
    expect(playerAgg).not.toBeNull();
    expect(playerAgg?.asOfRound).toBe(watermark);
    const composite = await repo.findTeamRankingsAggregate(2026, 'BRO', 'composite');
    expect(composite).not.toBeNull();
    // Status is the responsibility of discovery on the next tick.
    expect(await repo.findPrecomputeStatus(2026)).toBeNull();

    // ── Step 4: next discovery tick observes full coverage → writes status
    producer.published = [];
    await enqueueUC.execute({ scheduledTime: new Date('2026-05-20T07:00:00Z'), currentYear: 2026 });
    expect(producer.published.filter(j => j.type.startsWith('precompute-'))).toHaveLength(0);
    const status = await repo.findPrecomputeStatus(2026);
    expect(status).toEqual({ year: 2026, asOfRound: watermark });

    // ── Step 5: read-side use cases now serve from the repo (warm) ────
    const warmProfile = await playerProjectionUC.execute(2026, 'p:1');
    expect(warmProfile?.projectedTotal).toBe(baseProfile.projectedTotal);
    const warmContextual = await contextualProfileUC.execute(2026, 'p:1');
    expect(warmContextual.kind).toBe('ok');
    const warmRankings = await teamRankingsUC.execute(2026, 'BRO', 'composite');
    expect(warmRankings.teamCode).toBe('BRO');

    // ── Step 6: a third tick is a complete no-op (status >= watermark) ─
    producer.published = [];
    await enqueueUC.execute({ scheduledTime: new Date('2026-05-20T08:00:00Z'), currentYear: 2026 });
    expect(producer.published.filter(j => j.type.startsWith('precompute-'))).toHaveLength(0);
  });
});
