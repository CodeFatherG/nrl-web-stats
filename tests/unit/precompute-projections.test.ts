/**
 * Tests for the two leaf precompute use cases.
 * Feature: 034-precomputed-projections (fan-out refactor).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PrecomputePlayerProjectionUseCase } from '../../src/application/use-cases/precompute-player-projection.js';
import { PrecomputeTeamRankingsUseCase } from '../../src/application/use-cases/precompute-team-rankings.js';
import { InMemoryProjectionRepository } from '../../src/infrastructure/cache/in-memory-projection-repository.js';
import { ProjectionStoreQuotaExhaustedError } from '../../src/domain/repositories/projection-repository.js';

function fakeBaseProfile(playerId: string) {
  return {
    playerId,
    playerName: `Player ${playerId}`,
    teamCode: 'BRI',
    position: 'PROP',
    projectedTotal: 40,
    projectedFloor: 35,
    projectedCeiling: 48,
    avgMinutes: 60,
    floorMean: 30, floorStd: 5, floorCv: 0.16, floorPerMinute: 0.5,
    spikeMean: 10, spikeStd: 4, spikeCv: 0.4, spikePerMinute: 0.16,
    spikeP25: 5, spikeP50: 8, spikeP75: 12, spikeP90: 18,
    spikeDistribution: { negative:{count:0,frequency:0}, nil:{count:0,frequency:0}, low:{count:0,frequency:0}, moderate:{count:0,frequency:0}, high:{count:0,frequency:0}, boom:{count:0,frequency:0} },
    gamesPlayed: 10, lowSampleWarning: false, noUsableData: false, games: [],
  };
}

function fakeContextualProfile(playerId: string) {
  return {
    playerId,
    playerName: `Player ${playerId}`,
    teamCode: 'BRI',
    position: 'PROP',
    year: 2026,
    baseProjection: { total: 40, floor: 35, ceiling: 48 },
    opponents: {},
    venues: {},
    weather: {},
  };
}

describe('PrecomputePlayerProjectionUseCase', () => {
  let repo: InMemoryProjectionRepository;

  beforeEach(() => {
    repo = new InMemoryProjectionRepository();
  });

  it('computes baseProfile once and passes it to contextual.computeLive', async () => {
    const contextualSpy = vi.fn(async (_y: number, id: string, opts?: { baseProfile?: any }) => ({
      kind: 'ok' as const,
      result: fakeContextualProfile(id) as any,
      _capturedBaseProfile: opts?.baseProfile,
    }));
    const playerSpy = vi.fn(async (_y: number, id: string) => fakeBaseProfile(id) as any);

    const uc = new PrecomputePlayerProjectionUseCase({
      projectionRepository: repo,
      playerProjectionLive: { computeLive: playerSpy },
      contextualProfileLive: { computeLive: contextualSpy as any },
    });

    const result = await uc.execute({ year: 2026, asOfRound: 12, playerId: 'p:1' });

    expect(result.written).toBe(true);
    expect(playerSpy).toHaveBeenCalledTimes(1);
    expect(contextualSpy).toHaveBeenCalledTimes(1);
    // The opts arg must carry the same baseProfile object — proves the dedup.
    expect(contextualSpy.mock.calls[0][2]).toEqual({ baseProfile: fakeBaseProfile('p:1') });

    const stored = await repo.findPlayerAggregate(2026, 'p:1');
    expect(stored).not.toBeNull();
    expect(stored!.asOfRound).toBe(12);
    expect(stored!.baseProfile.playerId).toBe('p:1');
  });

  it('skips write when baseProfile is null (no usable data)', async () => {
    const uc = new PrecomputePlayerProjectionUseCase({
      projectionRepository: repo,
      playerProjectionLive: { computeLive: async () => null },
      contextualProfileLive: { computeLive: async () => ({ kind: 'ok', result: {} as any }) },
    });

    const result = await uc.execute({ year: 2026, asOfRound: 12, playerId: 'p:1' });
    expect(result.written).toBe(false);
    expect(result.skipReason).toBe('no-base-profile');
    expect(await repo.findPlayerAggregate(2026, 'p:1')).toBeNull();
  });

  it('skips write when contextual outcome is not ok', async () => {
    const uc = new PrecomputePlayerProjectionUseCase({
      projectionRepository: repo,
      playerProjectionLive: { computeLive: async (_y, id) => fakeBaseProfile(id) as any },
      contextualProfileLive: { computeLive: async () => ({ kind: 'no_projection' as const }) },
    });

    const result = await uc.execute({ year: 2026, asOfRound: 12, playerId: 'p:1' });
    expect(result.written).toBe(false);
    expect(result.skipReason).toBe('no-contextual-profile');
    expect(await repo.findPlayerAggregate(2026, 'p:1')).toBeNull();
  });

  it('propagates ProjectionStoreQuotaExhaustedError unchanged', async () => {
    const quotaErr = new ProjectionStoreQuotaExhaustedError('quota exhausted');
    const brokenRepo = {
      ...repo,
      savePlayerAggregate: vi.fn(async () => { throw quotaErr; }),
      saveTeamRankingsAggregate: repo.saveTeamRankingsAggregate.bind(repo),
      savePrecomputeStatus: repo.savePrecomputeStatus.bind(repo),
      findPlayerAggregate: repo.findPlayerAggregate.bind(repo),
      findTeamRankingsAggregate: repo.findTeamRankingsAggregate.bind(repo),
      findPrecomputeStatus: repo.findPrecomputeStatus.bind(repo),
      listPlayerAggregateAsOfRounds: repo.listPlayerAggregateAsOfRounds.bind(repo),
      listTeamRankingsAsOfRounds: repo.listTeamRankingsAsOfRounds.bind(repo),
    };

    const uc = new PrecomputePlayerProjectionUseCase({
      projectionRepository: brokenRepo as any,
      playerProjectionLive: { computeLive: async (_y, id) => fakeBaseProfile(id) as any },
      contextualProfileLive: { computeLive: async (_y, id) => ({ kind: 'ok', result: fakeContextualProfile(id) as any }) },
    });

    await expect(uc.execute({ year: 2026, asOfRound: 12, playerId: 'p:1' }))
      .rejects.toBeInstanceOf(ProjectionStoreQuotaExhaustedError);
  });
});

describe('PrecomputeTeamRankingsUseCase', () => {
  let repo: InMemoryProjectionRepository;

  beforeEach(() => {
    repo = new InMemoryProjectionRepository();
  });

  it('writes a team-rankings aggregate for (year, teamCode, mode)', async () => {
    const uc = new PrecomputeTeamRankingsUseCase({
      projectionRepository: repo,
      teamRankingsLive: { computeLive: async (year, teamCode, mode) =>
        ({ year, teamCode, mode, rankedPlayers: [], excludedCount: 0 } as any) },
    });

    await uc.execute({ year: 2026, asOfRound: 12, teamCode: 'BRI', mode: 'composite' });

    const stored = await repo.findTeamRankingsAggregate(2026, 'BRI', 'composite');
    expect(stored).not.toBeNull();
    expect(stored!.asOfRound).toBe(12);
    expect(stored!.teamCode).toBe('BRI');
    expect(stored!.mode).toBe('composite');
  });

  it('propagates ProjectionStoreQuotaExhaustedError unchanged', async () => {
    const quotaErr = new ProjectionStoreQuotaExhaustedError('quota exhausted');
    const brokenRepo = {
      ...repo,
      savePlayerAggregate: repo.savePlayerAggregate.bind(repo),
      saveTeamRankingsAggregate: vi.fn(async () => { throw quotaErr; }),
      savePrecomputeStatus: repo.savePrecomputeStatus.bind(repo),
      findPlayerAggregate: repo.findPlayerAggregate.bind(repo),
      findTeamRankingsAggregate: repo.findTeamRankingsAggregate.bind(repo),
      findPrecomputeStatus: repo.findPrecomputeStatus.bind(repo),
      listPlayerAggregateAsOfRounds: repo.listPlayerAggregateAsOfRounds.bind(repo),
      listTeamRankingsAsOfRounds: repo.listTeamRankingsAsOfRounds.bind(repo),
    };

    const uc = new PrecomputeTeamRankingsUseCase({
      projectionRepository: brokenRepo as any,
      teamRankingsLive: { computeLive: async (year, teamCode, mode) =>
        ({ year, teamCode, mode, rankedPlayers: [], excludedCount: 0 } as any) },
    });

    await expect(uc.execute({ year: 2026, asOfRound: 12, teamCode: 'BRI', mode: 'composite' }))
      .rejects.toBeInstanceOf(ProjectionStoreQuotaExhaustedError);
  });
});
