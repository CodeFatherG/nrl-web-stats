/**
 * T024 — Tests for GetContextualProfileUseCase repo-first whole-profile return.
 * Feature: 034-precomputed-projections (US3).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GetContextualProfileUseCase } from '../../src/application/use-cases/get-contextual-profile.js';
import { InMemoryProjectionRepository } from '../../src/infrastructure/cache/in-memory-projection-repository.js';
import { makePlayerAggregate } from './cache/projection-repository-contract.js';
import type { PlayerRepository } from '../../src/domain/repositories/player-repository.js';
import type { MatchRepository } from '../../src/domain/repositories/match-repository.js';
import type { GetSupercoachScoresUseCase } from '../../src/application/use-cases/get-supercoach-scores.js';
import type { GetPlayerProjectionUseCase } from '../../src/application/use-cases/get-player-projection.js';
import { AnalyticsCache } from '../../src/analytics/analytics-cache.js';

function makePlayerRepo(): PlayerRepository {
  return {
    findById: async () => ({ id: 'p:test:1', name: 'Test', teamCode: 'BRI', position: 'PROP', seasons: [] }) as any,
  } as unknown as PlayerRepository;
}

function makeMatchRepo(): MatchRepository {
  return {
    findByYear: async () => [],
    getLoadedYears: async () => [],
  } as unknown as MatchRepository;
}

function makeScUseCase(): GetSupercoachScoresUseCase {
  return { executeForPlayer: async () => null } as unknown as GetSupercoachScoresUseCase;
}

function makeLiveProjectionUseCase(): GetPlayerProjectionUseCase {
  return { execute: async () => null } as unknown as GetPlayerProjectionUseCase;
}

describe('GetContextualProfileUseCase — repo-first (US3)', () => {
  let repo: InMemoryProjectionRepository;

  beforeEach(() => {
    repo = new InMemoryProjectionRepository();
  });

  it('warm hit: returns the entire contextualProfile from the aggregate', async () => {
    const agg = makePlayerAggregate({ playerId: 'p:test:1', year: 2026, asOfRound: 12 });
    (agg.contextualProfile as any).opponents = { CBR: { multiplier: 1.2, confidence: 1, sampleN: 5, defenseFactor: 1.2, defenseConfidence: 1, h2hRpi: 1, h2hConfidence: 1 } };
    await repo.savePlayerAggregate(agg);

    const playerRepoSpy = makePlayerRepo();
    const findByIdSpy = vi.spyOn(playerRepoSpy, 'findById');

    const uc = new GetContextualProfileUseCase(
      playerRepoSpy, makeScUseCase(), makeLiveProjectionUseCase(),
      makeMatchRepo(), new AnalyticsCache(), repo, async () => 12,
    );

    const result = await uc.execute(2026, 'p:test:1');
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') throw new Error('unreachable');
    expect(result.result.opponents.CBR?.multiplier).toBe(1.2);
    expect(findByIdSpy).not.toHaveBeenCalled();
  });

  it('miss: falls back to live', async () => {
    const playerRepoSpy = makePlayerRepo();
    const findByIdSpy = vi.spyOn(playerRepoSpy, 'findById');

    const uc = new GetContextualProfileUseCase(
      playerRepoSpy, makeScUseCase(), makeLiveProjectionUseCase(),
      makeMatchRepo(), new AnalyticsCache(), repo, async () => 12,
    );

    await uc.execute(2026, 'p:test:1');
    expect(findByIdSpy).toHaveBeenCalled();
  });

  it('stale: aggregate older than watermark → live fallback', async () => {
    const stale = makePlayerAggregate({ playerId: 'p:test:1', year: 2026, asOfRound: 5 });
    await repo.savePlayerAggregate(stale);

    const playerRepoSpy = makePlayerRepo();
    const findByIdSpy = vi.spyOn(playerRepoSpy, 'findById');

    const uc = new GetContextualProfileUseCase(
      playerRepoSpy, makeScUseCase(), makeLiveProjectionUseCase(),
      makeMatchRepo(), new AnalyticsCache(), repo, async () => 12,
    );

    await uc.execute(2026, 'p:test:1');
    expect(findByIdSpy).toHaveBeenCalled();
  });

  // SPEC-034-READTHROUGH: warm hits still never write; miss/stale may write
  // a PlayerProjectionAggregate (opt-in cache population).
  it('warm hit does NOT call save (no need to repopulate fresh data)', async () => {
    await repo.savePlayerAggregate({
      playerId: 'p:test:1', year: 2026, asOfRound: 12, computedAt: '2026-05-20T00:00:00.000Z',
      baseProfile: {} as any, contextualProfile: {} as any,
    });
    const saveAggSpy = vi.spyOn(repo, 'savePlayerAggregate');

    const uc = new GetContextualProfileUseCase(
      makePlayerRepo(), makeScUseCase(), makeLiveProjectionUseCase(),
      makeMatchRepo(), new AnalyticsCache(), repo, async () => 12,
    );
    await uc.execute(2026, 'p:test:1');
    expect(saveAggSpy).not.toHaveBeenCalled();
  });

  it('read-through write failures are swallowed (do not propagate to the user)', async () => {
    // Force the read-through path: ensure live fallback returns ok, and saving throws.
    const liveProjection = makeLiveProjectionUseCase();
    (liveProjection as any).execute = async () => ({
      playerId: 'p:test:1', playerName: 'Test', teamCode: 'BRI', position: 'PROP',
      projectedTotal: 40, projectedFloor: 35, projectedCeiling: 48,
    } as any);
    const brokenRepo = Object.assign(new InMemoryProjectionRepository(), {
      savePlayerAggregate: async () => { throw new Error('store unavailable'); },
    });
    const uc = new GetContextualProfileUseCase(
      makePlayerRepo(), makeScUseCase(), liveProjection, makeMatchRepo(), new AnalyticsCache(),
      brokenRepo as any, async () => 12,
    );
    // Must not throw despite the save failure.
    await expect(uc.execute(2026, 'p:test:1')).resolves.toBeDefined();
  });
});
