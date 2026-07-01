/**
 * T013 — Unit tests for currentWatermark application service.
 * Feature: 034-precomputed-projections.
 */

import { describe, it, expect } from 'vitest';
import { currentWatermark } from '../../src/application/services/current-watermark.js';
import type { Match } from '../../src/domain/match.js';
import { MatchStatus } from '../../src/domain/match.js';
import type { MatchRepository } from '../../src/domain/repositories/match-repository.js';
import type { PlayerRepository } from '../../src/domain/repositories/player-repository.js';
import type { WatermarkSupplementaryRepo } from '../../src/application/services/current-watermark.js';

function fixture(round: number, idSuffix: string, status: MatchStatus = MatchStatus.Completed): Match {
  return {
    id: `2026-R${round}-${idSuffix}`,
    year: 2026,
    round,
    homeTeamCode: 'BRI',
    awayTeamCode: 'CBR',
    homeStrengthRating: null,
    awayStrengthRating: null,
    homeScore: null,
    awayScore: null,
    status,
    scheduledTime: null,
    stadium: null,
    weather: null,
  };
}

function makeMatchRepo(matches: Match[]): MatchRepository {
  return {
    findByYear: async () => matches,
    findByYearAndRound: async (_y: number, r: number) => matches.filter((m) => m.round === r),
  } as unknown as MatchRepository;
}

function makePlayerRepo(opts: {
  completeRounds?: Set<number>;
  matchCounts?: Map<number, number>;
}): PlayerRepository {
  return {
    isRoundComplete: async (_y: number, r: number) => opts.completeRounds?.has(r) ?? false,
    countDistinctMatchesInRound: async (_y: number, r: number) => opts.matchCounts?.get(r) ?? 0,
  } as unknown as PlayerRepository;
}

function makeSuppRepo(cachedRounds: Set<number>): WatermarkSupplementaryRepo {
  return {
    isRoundCached: async (_y: number, r: number) => cachedRounds.has(r),
  };
}

describe('currentWatermark', () => {
  it('returns 0 when no matches exist for the year', async () => {
    const wm = await currentWatermark(2026, {
      matchRepository: makeMatchRepo([]),
      playerRepository: makePlayerRepo({}),
      supplementaryRepo: makeSuppRepo(new Set()),
    });
    expect(wm).toBe(0);
  });

  it('returns 0 when no round satisfies all three conditions', async () => {
    // Round 1 has completed matches but no player stats.
    const wm = await currentWatermark(2026, {
      matchRepository: makeMatchRepo([fixture(1, 'a'), fixture(1, 'b')]),
      playerRepository: makePlayerRepo({ completeRounds: new Set() }),
      supplementaryRepo: makeSuppRepo(new Set([1])),
    });
    expect(wm).toBe(0);
  });

  it('returns the highest fully-complete round', async () => {
    // R1: complete. R2: complete. Both pass all three checks.
    const wm = await currentWatermark(2026, {
      matchRepository: makeMatchRepo([
        fixture(1, 'a'),
        fixture(1, 'b'),
        fixture(2, 'c'),
        fixture(2, 'd'),
      ]),
      playerRepository: makePlayerRepo({
        completeRounds: new Set([1, 2]),
        matchCounts: new Map([
          [1, 2],
          [2, 2],
        ]),
      }),
      supplementaryRepo: makeSuppRepo(new Set([1, 2])),
    });
    expect(wm).toBe(2);
  });

  it('skips partially-complete rounds (one fixture not Completed) — returns previous max', async () => {
    // R3 has one fixture still Scheduled; R2 is fully complete.
    const matches = [
      fixture(2, 'a'),
      fixture(2, 'b'),
      fixture(3, 'c'),
      fixture(3, 'd', MatchStatus.Scheduled),
    ];
    const wm = await currentWatermark(2026, {
      matchRepository: makeMatchRepo(matches),
      playerRepository: makePlayerRepo({
        completeRounds: new Set([2, 3]),
        matchCounts: new Map([
          [2, 2],
          [3, 2],
        ]),
      }),
      supplementaryRepo: makeSuppRepo(new Set([2, 3])),
    });
    expect(wm).toBe(2);
  });

  it('handles a gap in round numbering — returns the highest complete round, not "latest contiguous"', async () => {
    // Rounds 1, 3 exist (no R2). R3 is fully complete. Watermark = 3.
    const matches = [fixture(1, 'a'), fixture(3, 'b')];
    const wm = await currentWatermark(2026, {
      matchRepository: makeMatchRepo(matches),
      playerRepository: makePlayerRepo({
        completeRounds: new Set([3]),
        matchCounts: new Map([[3, 1]]),
      }),
      supplementaryRepo: makeSuppRepo(new Set([3])),
    });
    expect(wm).toBe(3);
  });

  it('requires supplementary stats — falls through to lower round when supp not cached', async () => {
    // R3: complete + player stats, but supp not cached. R2: all three OK.
    const matches = [fixture(2, 'a'), fixture(3, 'b')];
    const wm = await currentWatermark(2026, {
      matchRepository: makeMatchRepo(matches),
      playerRepository: makePlayerRepo({
        completeRounds: new Set([2, 3]),
        matchCounts: new Map([
          [2, 1],
          [3, 1],
        ]),
      }),
      supplementaryRepo: makeSuppRepo(new Set([2])), // R3 supp missing
    });
    expect(wm).toBe(2);
  });

  it('requires distinct match count to equal fixture count (catches missing team stats)', async () => {
    // R2 fixtures = 2, but only 1 distinct match in player stats → not complete.
    const matches = [fixture(2, 'a'), fixture(2, 'b')];
    const wm = await currentWatermark(2026, {
      matchRepository: makeMatchRepo(matches),
      playerRepository: makePlayerRepo({
        completeRounds: new Set([2]),
        matchCounts: new Map([[2, 1]]),
      }),
      supplementaryRepo: makeSuppRepo(new Set([2])),
    });
    expect(wm).toBe(0);
  });
});
