/**
 * Unit tests for GetTeamStrengthRankingsUseCase (feature 039 T010).
 *
 * Asserts:
 *  - null on miss
 *  - payload on hit with matching watermark
 *  - null on watermark mismatch (stored asOfRound != current watermark)
 *  - no live-compute fallback ever invoked
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { GetTeamStrengthRankingsUseCase } from '../../../src/application/use-cases/get-team-strength-rankings.js';
import { InMemoryTeamStrengthRankingsRepository } from '../../../src/infrastructure/persistence/in-memory-team-strength-rankings-repository.js';
import { makePayload } from '../cache/team-strength-rankings-repository-contract.js';

describe('GetTeamStrengthRankingsUseCase', () => {
  let repo: InMemoryTeamStrengthRankingsRepository;
  let watermark: number;
  let watermarkCalls: number;
  let useCase: GetTeamStrengthRankingsUseCase;

  beforeEach(() => {
    repo = new InMemoryTeamStrengthRankingsRepository();
    watermark = 8;
    watermarkCalls = 0;
    useCase = new GetTeamStrengthRankingsUseCase({
      repository: repo,
      watermarkFn: async (_year: number) => {
        watermarkCalls += 1;
        return watermark;
      },
    });
  });

  describe('cold-start (nothing stored)', () => {
    it('getSeasonThresholds returns null', async () => {
      expect(await useCase.getSeasonThresholds(2026)).toBeNull();
    });

    it('getSeasonRanking returns null', async () => {
      expect(await useCase.getSeasonRanking(2026, 'BRI')).toBeNull();
    });

    it('getRoundRanking returns null', async () => {
      expect(await useCase.getRoundRanking(2026, 1, 'BRI')).toBeNull();
    });

    it('getAllSeasonRankings returns null', async () => {
      expect(await useCase.getAllSeasonRankings(2026)).toBeNull();
    });
  });

  describe('hit at current watermark', () => {
    beforeEach(async () => {
      await repo.saveYear(2026, watermark, makePayload());
    });

    it('getSeasonThresholds returns the stored thresholds', async () => {
      const t = await useCase.getSeasonThresholds(2026);
      expect(t?.p33).toBe(300);
    });

    it('getSeasonRanking returns the team ranking (case-insensitive code)', async () => {
      const ranking = await useCase.getSeasonRanking(2026, 'bri');
      expect(ranking?.teamCode).toBe('BRI');
    });

    it('getRoundRanking returns the team round ranking (case-insensitive code)', async () => {
      const ranking = await useCase.getRoundRanking(2026, 1, 'syd');
      expect(ranking?.teamCode).toBe('SYD');
      expect(ranking?.round).toBe(1);
    });

    it('getAllSeasonRankings returns descending averageStrength with positional rank', async () => {
      const list = await useCase.getAllSeasonRankings(2026);
      expect(list).not.toBeNull();
      expect(list![0].rank).toBe(1);
      expect(list![0].ranking.averageStrength).toBeGreaterThanOrEqual(list![1].ranking.averageStrength);
    });
  });

  describe('watermark mismatch', () => {
    beforeEach(async () => {
      await repo.saveYear(2026, 5, makePayload()); // stored at 5, current watermark is 8
    });

    it('getSeasonThresholds returns null on staleness', async () => {
      expect(await useCase.getSeasonThresholds(2026)).toBeNull();
    });

    it('getSeasonRanking returns null on staleness', async () => {
      expect(await useCase.getSeasonRanking(2026, 'BRI')).toBeNull();
    });

    it('getRoundRanking returns null on staleness', async () => {
      expect(await useCase.getRoundRanking(2026, 1, 'BRI')).toBeNull();
    });

    it('getAllSeasonRankings returns null on staleness', async () => {
      expect(await useCase.getAllSeasonRankings(2026)).toBeNull();
    });
  });

  it('never re-derives values when the artifact is fresh — read path consults the repository, not a computer', async () => {
    await repo.saveYear(2026, watermark, makePayload());
    await useCase.getSeasonRanking(2026, 'BRI');
    // The use case has no compute dependency to inject; the lack of a
    // live-compute service in its dep surface is the structural guarantee.
    expect(watermarkCalls).toBeGreaterThan(0);
  });
});
