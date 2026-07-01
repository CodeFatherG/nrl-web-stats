/**
 * T015 (refactored for the unified GameStrengthRepository port) — Unit
 * tests for GetGameStrengthUseCase.
 *
 * After the spec-036 refactor, the use case takes a single
 * `GameStrengthRepository` and:
 *   - default half-life: returns `repo.read(...)`'s `gsr` field, or null
 *   - custom half-life: bypasses the repo and computes on demand
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GetGameStrengthUseCase } from '../../../src/application/use-cases/get-game-strength.js';
import { DEFAULT_HALF_LIFE } from '../../../src/analytics/game-strength-service.js';
import type { RoundGSR } from '../../../src/domain/game-strength.js';
import type { GameStrengthArtifact, GameStrengthRepository } from '../../../src/domain/repositories/game-strength-repository.js';
import type { FixtureRepository } from '../../../src/domain/repositories/fixture-repository.js';
import type { GetSupercoachScoresUseCase } from '../../../src/application/use-cases/get-supercoach-scores.js';

function makeGSR(year = 2026, round = 5, label = 'default'): RoundGSR {
  return {
    year,
    round,
    leagueAvgTeamScore: label === 'locked' ? 1800 : label === 'provisional' ? 1900 : 1738,
    matches: [],
    methodology: {
      halfLifeRounds: 6,
      offenseWeight: 0.5,
      minRoundsForReliability: 3,
      seasonTransitionPenalty: 12,
      categoryWeightingMethod: 'dynamic',
    },
  };
}

function makeFakeRepo(readImpl: (y: number, r: number) => Promise<GameStrengthArtifact | null>): GameStrengthRepository {
  return {
    read: readImpl,
    writeLocked: vi.fn().mockResolvedValue(undefined),
    writeProvisional: vi.fn().mockResolvedValue(undefined),
    deleteProvisional: vi.fn().mockResolvedValue(undefined),
    deleteAllProvisional: vi.fn().mockResolvedValue(undefined),
    listLockedRounds: vi.fn().mockResolvedValue(new Set<number>()),
    listProvisionalRounds: vi.fn().mockResolvedValue(new Set<number>()),
  };
}

const noopFixtures = {
  findByYear: async () => null,
  findByYearAndTeam: async () => null,
  listScrapedYears: async () => new Map(),
  save: async () => {},
} as unknown as FixtureRepository;

const noopScScores = {} as GetSupercoachScoresUseCase;

describe('GetGameStrengthUseCase — default half-life read path', () => {
  it('returns the locked artifact when the repo reports locked=true', async () => {
    const locked = makeGSR(2026, 5, 'locked');
    const repo = makeFakeRepo(async () => ({ gsr: locked, locked: true, lockedAt: '2026-06-12T03:00:00Z' }));
    const useCase = new GetGameStrengthUseCase(noopScScores, noopFixtures, repo);
    const result = await useCase.execute(2026, 5);
    expect(result?.leagueAvgTeamScore).toBe(1800);
  });

  it('returns the provisional artifact when the repo reports locked=false', async () => {
    const prov = makeGSR(2026, 20, 'provisional');
    const repo = makeFakeRepo(async () => ({ gsr: prov, locked: false, lockedAt: null }));
    const useCase = new GetGameStrengthUseCase(noopScScores, noopFixtures, repo);
    const result = await useCase.execute(2026, 20);
    expect(result?.leagueAvgTeamScore).toBe(1900);
  });

  it('returns null when the repo reports a miss', async () => {
    const repo = makeFakeRepo(async () => null);
    const useCase = new GetGameStrengthUseCase(noopScScores, noopFixtures, repo);
    const result = await useCase.execute(2026, 27);
    expect(result).toBeNull();
  });

  it('does not invoke the on-demand compute path when default half-life misses', async () => {
    const repo = makeFakeRepo(async () => null);
    const findByYearSpy = vi.fn().mockResolvedValue(null);
    const fixtures: FixtureRepository = {
      findByYear: findByYearSpy,
      findByYearAndTeam: async () => null,
      listScrapedYears: async () => new Map(),
      save: async () => {},
    } as unknown as FixtureRepository;
    const useCase = new GetGameStrengthUseCase(noopScScores, fixtures, repo);
    const result = await useCase.execute(2026, 27);
    expect(result).toBeNull();
    // If the read path correctly short-circuits to null on miss, we never
    // reach the compute path for default half-life.
    expect(findByYearSpy).not.toHaveBeenCalled();
  });
});

describe('GetGameStrengthUseCase — custom half-life bypass', () => {
  it('bypasses the repo entirely when half-life differs from the default', async () => {
    const readSpy = vi.fn().mockResolvedValue(null);
    const repo = makeFakeRepo(readSpy as unknown as (y: number, r: number) => Promise<GameStrengthArtifact | null>);
    const useCase = new GetGameStrengthUseCase(noopScScores, noopFixtures, repo);

    let threw = false;
    try {
      await useCase.execute(2026, 5, DEFAULT_HALF_LIFE + 1);
    } catch {
      threw = true;
    }
    // computeOnDemand throws NO_FIXTURES_FOUND on empty fixtures — that's
    // expected here; we only care that the repo wasn't consulted.
    expect(threw).toBe(true);
    expect(readSpy).not.toHaveBeenCalled();
  });
});
