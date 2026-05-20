/**
 * T017 — Tests for GetPlayerProjectionUseCase repo-first read path.
 *
 * Covers:
 *  - Warm hit returns the seeded aggregate's baseProfile and does NOT invoke
 *    the live fallback path.
 *  - Miss (no aggregate) falls through to live computation.
 *  - Stale (aggregate.asOfRound < currentWatermark) falls through to live.
 *  - Read path never calls save… on the repository.
 *
 * Feature: 034-precomputed-projections (US1).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GetPlayerProjectionUseCase } from '../../src/application/use-cases/get-player-projection.js';
import { InMemoryProjectionRepository } from '../../src/infrastructure/cache/in-memory-projection-repository.js';
import { makePlayerAggregate } from './cache/projection-repository-contract.js';
import type { Player } from '../../src/domain/player.js';
import type { GetSupercoachScoresUseCase } from '../../src/application/use-cases/get-supercoach-scores.js';
import type { PlayerRepository } from '../../src/domain/repositories/player-repository.js';

function makeLivePlayerRepo(player: Player | null): PlayerRepository {
  return {
    findById: async () => player,
    findMatchPerformances: async () => [],
  } as unknown as PlayerRepository;
}

function makeLiveSupercoachUseCase(): GetSupercoachScoresUseCase {
  return {
    executeForPlayer: async () => null, // live path returns null → use case returns null
  } as unknown as GetSupercoachScoresUseCase;
}

function makePlayer(): Player {
  return {
    id: 'p:test:1',
    name: 'Test Player',
    teamCode: 'BRI',
    position: 'PROP',
    seasons: [],
  } as unknown as Player;
}

describe('GetPlayerProjectionUseCase — repo-first read path (US1)', () => {
  let repo: InMemoryProjectionRepository;
  let playerRepo: PlayerRepository;
  let scUseCase: GetSupercoachScoresUseCase;

  beforeEach(() => {
    repo = new InMemoryProjectionRepository();
    playerRepo = makeLivePlayerRepo(makePlayer());
    scUseCase = makeLiveSupercoachUseCase();
  });

  it('warm hit: returns aggregate.baseProfile and does NOT call the live path', async () => {
    const agg = makePlayerAggregate({ playerId: 'p:test:1', year: 2026, asOfRound: 12 });
    await repo.savePlayerAggregate(agg);

    const playerRepoSpy = makeLivePlayerRepo(makePlayer());
    const findByIdSpy = vi.spyOn(playerRepoSpy, 'findById');

    const uc = new GetPlayerProjectionUseCase(playerRepoSpy, scUseCase, repo, async () => 12);
    const result = await uc.execute(2026, 'p:test:1');

    expect(result).not.toBeNull();
    expect(result?.projectedTotal).toBe(agg.baseProfile.projectedTotal);
    // Live path would call playerRepository.findById; on a warm hit it must not.
    expect(findByIdSpy).not.toHaveBeenCalled();
  });

  it('miss: no aggregate present → falls back to live (returns null when player not in live)', async () => {
    const playerRepoMissing = makeLivePlayerRepo(null);
    const uc = new GetPlayerProjectionUseCase(playerRepoMissing, scUseCase, repo, async () => 12);

    const result = await uc.execute(2026, 'p:unknown');
    expect(result).toBeNull(); // live path returned null (player not found)
  });

  it('stale: aggregate older than watermark → falls back to live', async () => {
    const stale = makePlayerAggregate({ playerId: 'p:test:1', year: 2026, asOfRound: 5 });
    await repo.savePlayerAggregate(stale);

    // Live path: player exists but SC returns null → use case returns null.
    const playerRepoSpy = makeLivePlayerRepo(makePlayer());
    const findByIdSpy = vi.spyOn(playerRepoSpy, 'findById');

    const uc = new GetPlayerProjectionUseCase(playerRepoSpy, scUseCase, repo, async () => 12);
    const result = await uc.execute(2026, 'p:test:1');

    // Live path is invoked → findById was called.
    expect(findByIdSpy).toHaveBeenCalledWith('p:test:1');
    // Live returns null (no SC data) so the use case returns null.
    expect(result).toBeNull();
  });

  it('read path never calls save… on the repository', async () => {
    const savePlayerSpy = vi.spyOn(repo, 'savePlayerAggregate');
    const saveTeamSpy = vi.spyOn(repo, 'saveTeamRankingsAggregate');
    const saveStatusSpy = vi.spyOn(repo, 'savePrecomputeStatus');

    const uc = new GetPlayerProjectionUseCase(playerRepo, scUseCase, repo, async () => 12);
    await uc.execute(2026, 'p:test:1');

    expect(savePlayerSpy).not.toHaveBeenCalled();
    expect(saveTeamSpy).not.toHaveBeenCalled();
    expect(saveStatusSpy).not.toHaveBeenCalled();
  });

  it('repo throws on read → use case logs and falls back to live (does not surface error)', async () => {
    const broken: typeof repo = Object.assign(new InMemoryProjectionRepository(), {
      findPlayerAggregate: async () => {
        throw new Error('store unavailable');
      },
    });

    const uc = new GetPlayerProjectionUseCase(playerRepo, scUseCase, broken, async () => 12);
    // Should not throw — falls through to live, which returns null for this fixture.
    await expect(uc.execute(2026, 'p:test:1')).resolves.toBeNull();
  });
});
