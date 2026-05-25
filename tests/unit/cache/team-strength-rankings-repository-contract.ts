/**
 * Shared contract test suite for TeamStrengthRankingsRepository implementations
 * (feature 039). Both the in-memory adapter and the KV adapter call this.
 *
 * Mirrors the structure of projection-repository-contract.ts.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type {
  RankingsYearPayload,
  TeamStrengthRankingsRepository,
} from '../../../src/domain/repositories/team-strength-rankings-repository.js';
import type {
  SeasonThresholds,
  TeamRoundRanking,
  TeamSeasonRanking,
} from '../../../src/models/types.js';

export function makeThresholds(
  overrides: Partial<SeasonThresholds> = {},
): SeasonThresholds {
  return { p33: 300, p67: 400, lowerFence: 200, upperFence: 500, ...overrides };
}

export function makeRoundRanking(
  teamCode: string,
  round: number,
  overrides: Partial<TeamRoundRanking> = {},
): TeamRoundRanking {
  return {
    teamCode,
    year: 2026,
    round,
    strengthRating: 350,
    percentile: 0.5,
    category: 'medium',
    opponentCode: 'OPP',
    isHome: true,
    isBye: false,
    ...overrides,
  };
}

export function makeSeasonRanking(
  teamCode: string,
  overrides: Partial<TeamSeasonRanking> = {},
): TeamSeasonRanking {
  return {
    teamCode,
    year: 2026,
    totalStrength: 3500,
    averageStrength: 350,
    matchCount: 10,
    byeCount: 1,
    percentile: 0.5,
    category: 'medium',
    rounds: [makeRoundRanking(teamCode, 1)],
    ...overrides,
  };
}

export function makePayload(
  overrides: Partial<RankingsYearPayload> = {},
): RankingsYearPayload {
  const season = new Map<string, TeamSeasonRanking>([
    ['BRI', makeSeasonRanking('BRI')],
    ['SYD', makeSeasonRanking('SYD', { averageStrength: 360 })],
  ]);
  const roundRankings = new Map<number, ReadonlyMap<string, TeamRoundRanking>>([
    [
      1,
      new Map([
        ['BRI', makeRoundRanking('BRI', 1)],
        ['SYD', makeRoundRanking('SYD', 1, { opponentCode: 'BRI', isHome: false })],
      ]),
    ],
    [
      2,
      new Map([
        ['BRI', makeRoundRanking('BRI', 2, { category: 'hard', percentile: 0.2 })],
      ]),
    ],
  ]);
  return {
    thresholds: makeThresholds(),
    season,
    roundRankings,
    ...overrides,
  };
}

export function runTeamStrengthRankingsRepositoryContractTests(
  makeRepo: () => TeamStrengthRankingsRepository | Promise<TeamStrengthRankingsRepository>,
): void {
  describe('TeamStrengthRankingsRepository contract', () => {
    let repo: TeamStrengthRankingsRepository;

    beforeEach(async () => {
      repo = await makeRepo();
    });

    describe('absent reads', () => {
      it('findSeasonThresholds returns null when nothing has been saved', async () => {
        expect(await repo.findSeasonThresholds(2026)).toBeNull();
      });

      it('findSeasonRankings returns null when nothing has been saved', async () => {
        expect(await repo.findSeasonRankings(2026)).toBeNull();
      });

      it('findRoundRankings returns null when nothing has been saved', async () => {
        expect(await repo.findRoundRankings(2026, 5)).toBeNull();
      });

      it('listCoveredRoundRankings returns empty map for an untouched year', async () => {
        const out = await repo.listCoveredRoundRankings(2026);
        expect(out.size).toBe(0);
      });

      it('listYearsWithThresholds returns empty map when nothing has been saved', async () => {
        const out = await repo.listYearsWithThresholds();
        expect(out.size).toBe(0);
      });
    });

    describe('round-trip', () => {
      it('saveYear → findSeasonThresholds returns the same thresholds', async () => {
        const payload = makePayload({ thresholds: makeThresholds({ p33: 310 }) });
        await repo.saveYear(2026, 8, payload);
        const found = await repo.findSeasonThresholds(2026);
        expect(found?.p33).toBe(310);
        expect(found?.p67).toBe(400);
      });

      it('saveYear → findSeasonRankings returns the same season payload', async () => {
        const payload = makePayload();
        await repo.saveYear(2026, 8, payload);
        const found = await repo.findSeasonRankings(2026);
        expect(found).not.toBeNull();
        expect(found?.get('BRI')?.averageStrength).toBe(350);
        expect(found?.get('SYD')?.averageStrength).toBe(360);
      });

      it('saveYear → findRoundRankings returns the same round payload for every stored round', async () => {
        const payload = makePayload();
        await repo.saveYear(2026, 8, payload);
        const round1 = await repo.findRoundRankings(2026, 1);
        const round2 = await repo.findRoundRankings(2026, 2);
        expect(round1?.get('BRI')?.round).toBe(1);
        expect(round1?.get('SYD')?.isHome).toBe(false);
        expect(round2?.get('BRI')?.category).toBe('hard');
      });

      it('findRoundRankings returns null for rounds not in the saved payload', async () => {
        await repo.saveYear(2026, 8, makePayload());
        expect(await repo.findRoundRankings(2026, 99)).toBeNull();
      });
    });

    describe('coverage probes', () => {
      it('listCoveredRoundRankings returns rounds and their asOfRound after a full save', async () => {
        await repo.saveYear(2026, 8, makePayload());
        const coverage = await repo.listCoveredRoundRankings(2026);
        expect(coverage.size).toBe(2);
        expect(coverage.get(1)).toBe(8);
        expect(coverage.get(2)).toBe(8);
      });

      it('listYearsWithThresholds tracks every year that has been saved', async () => {
        await repo.saveYear(2025, 7, makePayload());
        await repo.saveYear(2026, 4, makePayload());
        const years = await repo.listYearsWithThresholds();
        expect(years.size).toBe(2);
        expect(years.get(2025)).toBe(7);
        expect(years.get(2026)).toBe(4);
      });
    });

    describe('last-write-wins', () => {
      it('overwrites every sub-artifact on a subsequent saveYear with a newer watermark', async () => {
        await repo.saveYear(2026, 5, makePayload({ thresholds: makeThresholds({ p33: 100 }) }));
        const newPayload = makePayload({ thresholds: makeThresholds({ p33: 999 }) });
        await repo.saveYear(2026, 9, newPayload);

        const thresholds = await repo.findSeasonThresholds(2026);
        expect(thresholds?.p33).toBe(999);

        const coverage = await repo.listCoveredRoundRankings(2026);
        for (const value of coverage.values()) {
          expect(value).toBe(9);
        }

        const years = await repo.listYearsWithThresholds();
        expect(years.get(2026)).toBe(9);
      });
    });
  });
}
