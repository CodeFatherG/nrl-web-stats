/**
 * Shared contract test suite for `PlayerMovementsRepository` implementations.
 *
 * Asserts the clauses in
 * specs/035-player-movements-artifact/contracts/player-movements-repository.md.
 * Run against both `InMemoryPlayerMovementsRepository` and
 * `KvPlayerMovementsRepository` (via Miniflare).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type {
  PlayerMovementsArtifact,
  PlayerMovementsRepository,
} from '../../../src/domain/repositories/player-movements-repository.js';

function makeArtifact(
  overrides: Partial<PlayerMovementsArtifact> = {},
): PlayerMovementsArtifact {
  return {
    year: 2026,
    round: 5,
    computedAt: '2026-05-21T10:00:00.000Z',
    season: 2026,
    injured: [],
    dropped: [],
    benched: [],
    returningFromInjury: [],
    coveringInjury: [],
    promoted: [],
    positionChanged: [],
    ...overrides,
  };
}

export function runPlayerMovementsRepositoryContractTests(
  label: string,
  makeRepo: () => Promise<PlayerMovementsRepository> | PlayerMovementsRepository,
): void {
  describe(`PlayerMovementsRepository contract — ${label}`, () => {
    let repo: PlayerMovementsRepository;

    beforeEach(async () => {
      repo = await makeRepo();
    });

    it('findByYearAndRound returns null on missing key (never throws)', async () => {
      await expect(repo.findByYearAndRound(2026, 5)).resolves.toBeNull();
    });

    it('findMostRecentRound returns null on empty repository', async () => {
      await expect(repo.findMostRecentRound(2026)).resolves.toBeNull();
    });

    it('listCoveredRounds returns empty set on empty repository', async () => {
      const rounds = await repo.listCoveredRounds(2026);
      expect(rounds.size).toBe(0);
    });

    it('save then findByYearAndRound returns the equal-by-value public payload', async () => {
      const artifact = makeArtifact({
        year: 2026,
        round: 7,
        injured: [
          {
            playerId: 1,
            playerName: 'A',
            teamCode: 'BRI',
            matchId: 'm1',
            lastJersey: 10,
            lastPosition: 'FB',
            injury: 'Concussion',
            expectedReturn: '2 weeks',
          },
        ],
      });
      await repo.save(artifact);
      const result = await repo.findByYearAndRound(2026, 7);
      expect(result).not.toBeNull();
      expect(result?.season).toBe(2026);
      expect(result?.round).toBe(7);
      expect(result?.injured).toHaveLength(1);
      expect(result?.injured[0]?.playerName).toBe('A');
      // Storage-internal fields are stripped:
      expect(result).not.toHaveProperty('computedAt');
      expect(result).not.toHaveProperty('year');
    });

    it('repeated save for same (year, round) is last-write-wins', async () => {
      await repo.save(makeArtifact({ year: 2026, round: 3, injured: [] }));
      await repo.save(
        makeArtifact({
          year: 2026,
          round: 3,
          injured: [
            {
              playerId: 99,
              playerName: 'Z',
              teamCode: 'PEN',
              matchId: 'm9',
              lastJersey: 1,
              lastPosition: 'FB',
              injury: 'Hamstring',
              expectedReturn: '1 week',
            },
          ],
        }),
      );
      const result = await repo.findByYearAndRound(2026, 3);
      expect(result?.injured).toHaveLength(1);
      expect(result?.injured[0]?.playerName).toBe('Z');
    });

    it('findMostRecentRound returns max(rounds) after inserts', async () => {
      await repo.save(makeArtifact({ year: 2026, round: 1 }));
      await repo.save(makeArtifact({ year: 2026, round: 9 }));
      await repo.save(makeArtifact({ year: 2026, round: 3 }));
      await expect(repo.findMostRecentRound(2026)).resolves.toBe(9);
    });

    it('listCoveredRounds returns exactly the inserted rounds for the year', async () => {
      await repo.save(makeArtifact({ year: 2026, round: 1 }));
      await repo.save(makeArtifact({ year: 2026, round: 4 }));
      await repo.save(makeArtifact({ year: 2025, round: 8 })); // different year
      const rounds = await repo.listCoveredRounds(2026);
      expect([...rounds].sort((a, b) => a - b)).toEqual([1, 4]);
    });

    it('findMostRecentRound is scoped to the requested year', async () => {
      await repo.save(makeArtifact({ year: 2025, round: 20 }));
      await repo.save(makeArtifact({ year: 2026, round: 2 }));
      await expect(repo.findMostRecentRound(2026)).resolves.toBe(2);
      await expect(repo.findMostRecentRound(2025)).resolves.toBe(20);
      await expect(repo.findMostRecentRound(2027)).resolves.toBeNull();
    });

    it('round-1 noPreviousRound: true artifact round-trips correctly', async () => {
      await repo.save(
        makeArtifact({ year: 2026, round: 1, noPreviousRound: true }),
      );
      const result = await repo.findByYearAndRound(2026, 1);
      expect(result?.noPreviousRound).toBe(true);
      expect(result?.season).toBe(2026);
      expect(result?.round).toBe(1);
    });
  });
}
