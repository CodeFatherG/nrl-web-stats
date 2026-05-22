/**
 * Shared contract test suite for `ProvisionalGameStrengthRepository`
 * implementations.
 *
 * Asserts the clauses in
 * specs/036-game-strength-artifact/contracts/provisional-game-strength-repository.md.
 * Run against both `InMemoryProvisionalGameStrengthRepository` and
 * `KvProvisionalGameStrengthRepository` (via Miniflare).
 *
 * Feature: 036-game-strength-artifact (T008).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { RoundGSR } from '../../../src/domain/game-strength.js';
import type { ProvisionalGameStrengthRepository } from '../../../src/domain/repositories/provisional-game-strength-repository.js';

function makeGSR(overrides: Partial<RoundGSR> = {}): RoundGSR {
  return {
    year: 2026,
    round: 5,
    leagueAvgTeamScore: 400,
    matches: [],
    methodology: {
      halfLifeRounds: 6,
      offenseWeight: 0.5,
      minRoundsForReliability: 3,
      seasonTransitionPenalty: 0,
      categoryWeightingMethod: 'dynamic',
    },
    ...overrides,
  };
}

export function runProvisionalGameStrengthRepositoryContractTests(
  label: string,
  makeRepo: () =>
    | Promise<ProvisionalGameStrengthRepository>
    | ProvisionalGameStrengthRepository,
): void {
  describe(`ProvisionalGameStrengthRepository contract — ${label}`, () => {
    let repo: ProvisionalGameStrengthRepository;

    beforeEach(async () => {
      repo = await makeRepo();
    });

    it('findByRound returns null on missing key (never throws)', async () => {
      await expect(repo.findByRound(2026, 5)).resolves.toBeNull();
    });

    it('listProvisionalRounds returns empty set on empty repository', async () => {
      const rounds = await repo.listProvisionalRounds(2026);
      expect(rounds.size).toBe(0);
    });

    it('save then findByRound returns the equal-by-value RoundGSR', async () => {
      const gsr = makeGSR({ year: 2026, round: 7, leagueAvgTeamScore: 425 });
      await repo.save(2026, 7, gsr);
      const result = await repo.findByRound(2026, 7);
      expect(result).not.toBeNull();
      expect(result?.year).toBe(2026);
      expect(result?.round).toBe(7);
      expect(result?.leagueAvgTeamScore).toBe(425);
    });

    it('repeated save for same (year, round) is last-write-wins', async () => {
      await repo.save(2026, 3, makeGSR({ year: 2026, round: 3, leagueAvgTeamScore: 400 }));
      await repo.save(2026, 3, makeGSR({ year: 2026, round: 3, leagueAvgTeamScore: 450 }));
      const result = await repo.findByRound(2026, 3);
      expect(result?.leagueAvgTeamScore).toBe(450);
    });

    it('listProvisionalRounds returns exactly the inserted rounds for the year', async () => {
      await repo.save(2026, 1, makeGSR({ year: 2026, round: 1 }));
      await repo.save(2026, 4, makeGSR({ year: 2026, round: 4 }));
      await repo.save(2025, 8, makeGSR({ year: 2025, round: 8 })); // different year
      const rounds = await repo.listProvisionalRounds(2026);
      expect([...rounds].sort((a, b) => a - b)).toEqual([1, 4]);
    });

    it('listProvisionalRounds scopes to the requested year', async () => {
      await repo.save(2025, 20, makeGSR({ year: 2025, round: 20 }));
      await repo.save(2026, 2, makeGSR({ year: 2026, round: 2 }));
      const r2026 = await repo.listProvisionalRounds(2026);
      const r2025 = await repo.listProvisionalRounds(2025);
      const r2027 = await repo.listProvisionalRounds(2027);
      expect([...r2026]).toEqual([2]);
      expect([...r2025]).toEqual([20]);
      expect(r2027.size).toBe(0);
    });

    it('deleteByRound removes the entry; subsequent read returns null', async () => {
      await repo.save(2026, 14, makeGSR({ year: 2026, round: 14 }));
      await repo.deleteByRound(2026, 14);
      await expect(repo.findByRound(2026, 14)).resolves.toBeNull();
      const rounds = await repo.listProvisionalRounds(2026);
      expect(rounds.has(14)).toBe(false);
    });

    it('deleteByRound on absent key is a no-op (does not throw)', async () => {
      await expect(repo.deleteByRound(2026, 99)).resolves.toBeUndefined();
    });

    it('deleteByYear wipes all rounds for the year and preserves other years', async () => {
      await repo.save(2026, 14, makeGSR({ year: 2026, round: 14 }));
      await repo.save(2026, 15, makeGSR({ year: 2026, round: 15 }));
      await repo.save(2027, 14, makeGSR({ year: 2027, round: 14 }));
      await repo.deleteByYear(2026);
      const rounds2026 = await repo.listProvisionalRounds(2026);
      expect(rounds2026.size).toBe(0);
      const result2027 = await repo.findByRound(2027, 14);
      expect(result2027?.year).toBe(2027);
    });
  });
}
