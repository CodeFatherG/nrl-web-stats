/**
 * T020 — Tests for GetTeamProjectionRankingsUseCase repo-first read path.
 * Feature: 034-precomputed-projections (US2).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GetTeamProjectionRankingsUseCase } from '../../src/application/use-cases/get-team-projection-rankings.js';
import { InMemoryProjectionRepository } from '../../src/infrastructure/cache/in-memory-projection-repository.js';
import { makeTeamRankingsAggregate } from './cache/projection-repository-contract.js';
import type { GetSupercoachScoresUseCase } from '../../src/application/use-cases/get-supercoach-scores.js';
import type { PlayerRepository } from '../../src/domain/repositories/player-repository.js';

function makeLivePlayerRepo(): PlayerRepository {
  return {
    // Returning empty triggers the early-return path (zero ranked players); live
    // path is still invoked but produces an empty result we can distinguish.
    findByTeam: async () => [],
    findMatchPerformances: async () => [],
  } as unknown as PlayerRepository;
}

function makeLiveSupercoachUseCase(): GetSupercoachScoresUseCase {
  return {
    executeForPlayer: async () => null,
  } as unknown as GetSupercoachScoresUseCase;
}

describe('GetTeamProjectionRankingsUseCase — repo-first read path (US2)', () => {
  let repo: InMemoryProjectionRepository;
  let playerRepo: PlayerRepository;
  let scUseCase: GetSupercoachScoresUseCase;

  beforeEach(() => {
    repo = new InMemoryProjectionRepository();
    playerRepo = makeLivePlayerRepo();
    scUseCase = makeLiveSupercoachUseCase();
  });

  it('warm hit per-mode: returns seeded aggregate for the requested mode only', async () => {
    const composite = makeTeamRankingsAggregate({ mode: 'composite', asOfRound: 12 });
    const captaincy = makeTeamRankingsAggregate({
      mode: 'captaincy',
      asOfRound: 12,
      rankings: {
        teamCode: 'BRI',
        year: 2026,
        mode: 'captaincy',
        rankedPlayers: [],
        excludedCount: 99, // distinctive marker
      },
    });
    await repo.saveTeamRankingsAggregate(composite);
    await repo.saveTeamRankingsAggregate(captaincy);

    const uc = new GetTeamProjectionRankingsUseCase(playerRepo, scUseCase, repo, async () => 12);

    const compositeResult = await uc.execute(2026, 'BRI', 'composite');
    const captaincyResult = await uc.execute(2026, 'BRI', 'captaincy');

    expect(compositeResult.mode).toBe('composite');
    expect(compositeResult.excludedCount).toBe(0); // from default fixture
    expect(captaincyResult.mode).toBe('captaincy');
    expect(captaincyResult.excludedCount).toBe(99);
  });

  it('miss for one mode falls through to live; warm hit for another stays warm', async () => {
    // Seed only composite.
    await repo.saveTeamRankingsAggregate(makeTeamRankingsAggregate({ mode: 'composite', asOfRound: 12 }));

    const playerRepoSpy = makeLivePlayerRepo();
    const findByTeamSpy = vi.spyOn(playerRepoSpy, 'findByTeam');
    const uc = new GetTeamProjectionRankingsUseCase(playerRepoSpy, scUseCase, repo, async () => 12);

    await uc.execute(2026, 'BRI', 'composite');
    expect(findByTeamSpy).not.toHaveBeenCalled(); // warm hit

    await uc.execute(2026, 'BRI', 'selection');
    expect(findByTeamSpy).toHaveBeenCalledWith('BRI', 2026); // fell through to live
  });

  it('stale: aggregate older than watermark → falls back to live', async () => {
    await repo.saveTeamRankingsAggregate(makeTeamRankingsAggregate({ mode: 'composite', asOfRound: 5 }));

    const playerRepoSpy = makeLivePlayerRepo();
    const findByTeamSpy = vi.spyOn(playerRepoSpy, 'findByTeam');
    const uc = new GetTeamProjectionRankingsUseCase(playerRepoSpy, scUseCase, repo, async () => 12);

    await uc.execute(2026, 'BRI', 'composite');
    expect(findByTeamSpy).toHaveBeenCalled();
  });

  it('read path never calls save… on the repository', async () => {
    const saveTeamSpy = vi.spyOn(repo, 'saveTeamRankingsAggregate');
    const savePlayerSpy = vi.spyOn(repo, 'savePlayerAggregate');
    const saveStatusSpy = vi.spyOn(repo, 'savePrecomputeStatus');

    const uc = new GetTeamProjectionRankingsUseCase(playerRepo, scUseCase, repo, async () => 12);
    await uc.execute(2026, 'BRI', 'composite');

    expect(saveTeamSpy).not.toHaveBeenCalled();
    expect(savePlayerSpy).not.toHaveBeenCalled();
    expect(saveStatusSpy).not.toHaveBeenCalled();
  });
});
