/**
 * T029 — Tests for PrecomputeProjectionsUseCase.
 * Feature: 034-precomputed-projections (US4).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PrecomputeProjectionsUseCase } from '../../src/application/use-cases/precompute-projections.js';
import { InMemoryProjectionRepository } from '../../src/infrastructure/cache/in-memory-projection-repository.js';
import { ProjectionStoreQuotaExhaustedError } from '../../src/domain/repositories/projection-repository.js';
import type { PlayerRepository } from '../../src/domain/repositories/player-repository.js';
import { VALID_TEAM_CODES } from '../../src/models/team.js';

function fakePlayerRepo(playerIds: string[]): PlayerRepository {
  return {
    findAllSeasonSummaries: async () => playerIds.map((id) => ({
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
    })),
  } as unknown as PlayerRepository;
}

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

describe('PrecomputeProjectionsUseCase (US4)', () => {
  let repo: InMemoryProjectionRepository;

  beforeEach(() => {
    repo = new InMemoryProjectionRepository();
  });

  it('writes one player aggregate per active player and one team-rankings aggregate per (team, mode)', async () => {
    const uc = new PrecomputeProjectionsUseCase({
      projectionRepository: repo,
      playerRepository: fakePlayerRepo(['p:1', 'p:2', 'p:3']),
      playerProjectionLive: { computeLive: async (_y, id) => fakeBaseProfile(id) as any },
      contextualProfileLive: { computeLive: async (_y, id) => ({ kind: 'ok', result: fakeContextualProfile(id) as any }) },
      teamRankingsLive: { computeLive: async (year, teamCode, mode) => ({ year, teamCode, mode, rankedPlayers: [], excludedCount: 0 } as any) },
    });

    const summary = await uc.execute({ year: 2026, asOfRound: 12 });

    expect(summary.playersWritten).toBe(3);
    expect(summary.teamRankingsWritten).toBe(VALID_TEAM_CODES.length * 4);
    // Status is written.
    const status = await repo.findPrecomputeStatus(2026);
    expect(status).toEqual({ year: 2026, asOfRound: 12 });
  });

  it('PrecomputeStatus is written LAST (after all aggregates)', async () => {
    const writes: string[] = [];
    const trackingRepo = {
      ...repo,
      savePlayerAggregate: vi.fn(async (a) => { writes.push(`player:${a.playerId}`); await repo.savePlayerAggregate(a); }),
      saveTeamRankingsAggregate: vi.fn(async (a) => { writes.push(`team:${a.teamCode}:${a.mode}`); await repo.saveTeamRankingsAggregate(a); }),
      savePrecomputeStatus: vi.fn(async (s) => { writes.push(`status:${s.year}`); await repo.savePrecomputeStatus(s); }),
      findPlayerAggregate: repo.findPlayerAggregate.bind(repo),
      findTeamRankingsAggregate: repo.findTeamRankingsAggregate.bind(repo),
      findPrecomputeStatus: repo.findPrecomputeStatus.bind(repo),
    };

    const uc = new PrecomputeProjectionsUseCase({
      projectionRepository: trackingRepo as any,
      playerRepository: fakePlayerRepo(['p:1']),
      playerProjectionLive: { computeLive: async (_y, id) => fakeBaseProfile(id) as any },
      contextualProfileLive: { computeLive: async (_y, id) => ({ kind: 'ok', result: fakeContextualProfile(id) as any }) },
      teamRankingsLive: { computeLive: async (year, teamCode, mode) => ({ year, teamCode, mode, rankedPlayers: [], excludedCount: 0 } as any) },
    });
    await uc.execute({ year: 2026, asOfRound: 12 });

    expect(writes[writes.length - 1]).toBe('status:2026');
  });

  it('fail-fast on first save error: status NOT advanced', async () => {
    const brokenRepo = {
      ...repo,
      savePlayerAggregate: vi.fn(async () => { throw new Error('disk full'); }),
      saveTeamRankingsAggregate: repo.saveTeamRankingsAggregate.bind(repo),
      savePrecomputeStatus: vi.fn(async () => { throw new Error('should not be called'); }),
      findPlayerAggregate: repo.findPlayerAggregate.bind(repo),
      findTeamRankingsAggregate: repo.findTeamRankingsAggregate.bind(repo),
      findPrecomputeStatus: repo.findPrecomputeStatus.bind(repo),
    };

    const uc = new PrecomputeProjectionsUseCase({
      projectionRepository: brokenRepo as any,
      playerRepository: fakePlayerRepo(['p:1']),
      playerProjectionLive: { computeLive: async (_y, id) => fakeBaseProfile(id) as any },
      contextualProfileLive: { computeLive: async (_y, id) => ({ kind: 'ok', result: fakeContextualProfile(id) as any }) },
      teamRankingsLive: { computeLive: async () => ({ year: 2026, teamCode: 'BRI', mode: 'composite', rankedPlayers: [], excludedCount: 0 } as any) },
    });

    await expect(uc.execute({ year: 2026, asOfRound: 12 })).rejects.toThrow(/disk full/);
    expect(brokenRepo.savePrecomputeStatus).not.toHaveBeenCalled();
  });

  it('ProjectionStoreQuotaExhaustedError propagates unchanged (consumer classifies as terminal)', async () => {
    const quotaErr = new ProjectionStoreQuotaExhaustedError('quota exhausted');
    const quotaRepo = {
      ...repo,
      savePlayerAggregate: vi.fn(async () => { throw quotaErr; }),
      saveTeamRankingsAggregate: repo.saveTeamRankingsAggregate.bind(repo),
      savePrecomputeStatus: repo.savePrecomputeStatus.bind(repo),
      findPlayerAggregate: repo.findPlayerAggregate.bind(repo),
      findTeamRankingsAggregate: repo.findTeamRankingsAggregate.bind(repo),
      findPrecomputeStatus: repo.findPrecomputeStatus.bind(repo),
    };

    const uc = new PrecomputeProjectionsUseCase({
      projectionRepository: quotaRepo as any,
      playerRepository: fakePlayerRepo(['p:1']),
      playerProjectionLive: { computeLive: async (_y, id) => fakeBaseProfile(id) as any },
      contextualProfileLive: { computeLive: async (_y, id) => ({ kind: 'ok', result: fakeContextualProfile(id) as any }) },
      teamRankingsLive: { computeLive: async () => ({ year: 2026, teamCode: 'BRI', mode: 'composite', rankedPlayers: [], excludedCount: 0 } as any) },
    });

    await expect(uc.execute({ year: 2026, asOfRound: 12 })).rejects.toBeInstanceOf(ProjectionStoreQuotaExhaustedError);
  });

  it('skips players whose live computation returns null (no usable data)', async () => {
    const uc = new PrecomputeProjectionsUseCase({
      projectionRepository: repo,
      playerRepository: fakePlayerRepo(['p:1', 'p:2', 'p:3']),
      playerProjectionLive: { computeLive: async (_y, id) => id === 'p:2' ? null : fakeBaseProfile(id) as any },
      contextualProfileLive: { computeLive: async (_y, id) => ({ kind: 'ok', result: fakeContextualProfile(id) as any }) },
      teamRankingsLive: { computeLive: async (year, teamCode, mode) => ({ year, teamCode, mode, rankedPlayers: [], excludedCount: 0 } as any) },
    });

    const summary = await uc.execute({ year: 2026, asOfRound: 12 });
    expect(summary.playersWritten).toBe(2); // p:1 + p:3
  });
});
