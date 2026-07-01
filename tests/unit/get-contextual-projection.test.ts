/**
 * T023 — Tests for GetContextualProjectionUseCase repo-first slicing behavior.
 * Feature: 034-precomputed-projections (US3).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GetContextualProjectionUseCase } from '../../src/application/use-cases/get-contextual-projection.js';
import { InMemoryProjectionRepository } from '../../src/infrastructure/cache/in-memory-projection-repository.js';
import { makePlayerAggregate } from './cache/projection-repository-contract.js';
import type { PlayerRepository } from '../../src/domain/repositories/player-repository.js';
import type { MatchRepository } from '../../src/domain/repositories/match-repository.js';
import type { GetSupercoachScoresUseCase } from '../../src/application/use-cases/get-supercoach-scores.js';
import type { GetPlayerProjectionUseCase } from '../../src/application/use-cases/get-player-projection.js';
import type { OpponentAdjustment, VenueAdjustment, WeatherAdjustment } from '../../src/analytics/contextual-projection-types.js';

function makeRepo() {
  return new InMemoryProjectionRepository();
}

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

const opp = (multiplier: number): OpponentAdjustment => ({
  multiplier,
  confidence: 1,
  sampleN: 5,
  defenseFactor: multiplier,
  defenseConfidence: 1,
  h2hRpi: 1,
  h2hConfidence: 1,
});
const ven = (multiplier: number): VenueAdjustment => ({
  stadiumId: 'suncorp', multiplier, confidence: 1, sampleN: 5,
});
const wea = (multiplier: number): WeatherAdjustment => ({
  category: 'sunny' as any, multiplier, confidence: 1, sampleN: 5,
});

describe('GetContextualProjectionUseCase — repo-first slicing (US3)', () => {
  let repo: InMemoryProjectionRepository;

  beforeEach(() => {
    repo = makeRepo();
  });

  it('warm hit: slices opponent + venue from contextualProfile in memory', async () => {
    const agg = makePlayerAggregate({
      playerId: 'p:test:1',
      year: 2026,
      asOfRound: 12,
    });
    // Patch the contextualProfile with concrete entries we can slice.
    (agg.contextualProfile as any).opponents = { CBR: opp(1.2), NZL: opp(0.9) };
    (agg.contextualProfile as any).venues = { suncorp: ven(1.1) };
    (agg.contextualProfile as any).weather = { sunny: wea(1.0) };

    await repo.savePlayerAggregate(agg);

    const playerRepoSpy = makePlayerRepo();
    const findByIdSpy = vi.spyOn(playerRepoSpy, 'findById');

    const liveSpy = makeLiveProjectionUseCase();
    const liveExecSpy = vi.spyOn(liveSpy, 'execute');

    const uc = new GetContextualProjectionUseCase(
      playerRepoSpy,
      makeScUseCase(),
      liveSpy,
      makeMatchRepo(),
      repo,
      async () => 12,
    );

    const result = await uc.execute(2026, 'p:test:1', 'CBR', 'suncorp', 'sunny' as any);

    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') throw new Error('unreachable');
    expect(result.result.adjustments.opponent?.multiplier).toBe(1.2);
    expect(result.result.adjustments.venue?.multiplier).toBe(1.1);
    expect(result.result.adjustments.weather?.multiplier).toBe(1.0);
    // adjustedProjection = base × opponent × venue (weather not applied)
    expect(result.result.adjustedProjection.total).toBeCloseTo(40 * 1.2 * 1.1, 5);

    // Live path never invoked.
    expect(findByIdSpy).not.toHaveBeenCalled();
    expect(liveExecSpy).not.toHaveBeenCalled();
  });

  it('warm hit with no query params: returns baseProjection (no multipliers applied)', async () => {
    const agg = makePlayerAggregate({ playerId: 'p:test:1', year: 2026, asOfRound: 12 });
    await repo.savePlayerAggregate(agg);

    const uc = new GetContextualProjectionUseCase(
      makePlayerRepo(), makeScUseCase(), makeLiveProjectionUseCase(),
      makeMatchRepo(), repo, async () => 12,
    );

    const result = await uc.execute(2026, 'p:test:1');
    if (result.kind !== 'ok') throw new Error('unreachable');
    expect(result.result.baseProjection.total).toBe(40);
    expect(result.result.adjustedProjection.total).toBe(40); // no multipliers
    expect(result.result.adjustments).toEqual({});
  });

  it('miss: no aggregate → falls back to live', async () => {
    const playerRepoSpy = makePlayerRepo();
    const findByIdSpy = vi.spyOn(playerRepoSpy, 'findById');
    const liveSpy = makeLiveProjectionUseCase();
    const liveExecSpy = vi.spyOn(liveSpy, 'execute').mockResolvedValue(null);

    const uc = new GetContextualProjectionUseCase(
      playerRepoSpy, makeScUseCase(), liveSpy,
      makeMatchRepo(), repo, async () => 12,
    );

    const result = await uc.execute(2026, 'p:test:1', 'CBR');
    // Live path's findById was called → fall-through fired.
    expect(findByIdSpy).toHaveBeenCalled();
    expect(liveExecSpy).toHaveBeenCalled();
    // Live path returned null (no projection), so the use case returns no_projection
    expect(result.kind).toBe('no_projection');
  });

  it('stale: aggregate.asOfRound < watermark → falls back to live', async () => {
    const stale = makePlayerAggregate({ playerId: 'p:test:1', year: 2026, asOfRound: 5 });
    await repo.savePlayerAggregate(stale);

    const playerRepoSpy = makePlayerRepo();
    const findByIdSpy = vi.spyOn(playerRepoSpy, 'findById');

    const uc = new GetContextualProjectionUseCase(
      playerRepoSpy, makeScUseCase(), makeLiveProjectionUseCase(),
      makeMatchRepo(), repo, async () => 12,
    );

    await uc.execute(2026, 'p:test:1', 'CBR');
    expect(findByIdSpy).toHaveBeenCalled();
  });

  it('read path never calls save…', async () => {
    const saveAggSpy = vi.spyOn(repo, 'savePlayerAggregate');
    const saveTeamSpy = vi.spyOn(repo, 'saveTeamRankingsAggregate');
    const saveStatusSpy = vi.spyOn(repo, 'savePrecomputeStatus');

    const uc = new GetContextualProjectionUseCase(
      makePlayerRepo(), makeScUseCase(), makeLiveProjectionUseCase(),
      makeMatchRepo(), repo, async () => 12,
    );
    await uc.execute(2026, 'p:test:1');

    expect(saveAggSpy).not.toHaveBeenCalled();
    expect(saveTeamSpy).not.toHaveBeenCalled();
    expect(saveStatusSpy).not.toHaveBeenCalled();
  });
});
