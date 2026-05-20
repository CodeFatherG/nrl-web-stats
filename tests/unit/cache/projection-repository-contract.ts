/**
 * Shared contract test suite for ProjectionRepository implementations.
 *
 * Both the in-memory adapter (T009) and the KV adapter (T011, Miniflare)
 * call into this suite. The tests are the authoritative source of truth
 * for the contract — if they disagree with contracts/projection-repository.md,
 * the tests win and the doc gets fixed.
 *
 * Feature: 034-precomputed-projections (T008).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type {
  PlayerProjectionAggregate,
  PrecomputeStatus,
  ProjectionRepository,
  TeamRankingsAggregate,
} from '../../../src/domain/repositories/projection-repository.js';

/** Build a minimal but well-shaped PlayerProjectionAggregate for fixture data. */
export function makePlayerAggregate(overrides: Partial<PlayerProjectionAggregate> = {}): PlayerProjectionAggregate {
  return {
    playerId: 'p:test:1',
    year: 2026,
    asOfRound: 10,
    computedAt: '2026-05-20T00:00:00.000Z',
    baseProfile: {
      playerId: 'p:test:1',
      playerName: 'Test Player',
      teamCode: 'BRI',
      position: 'PROP',
      avgMinutes: 60,
      floorMean: 30,
      floorStd: 5,
      floorCv: 0.16,
      floorPerMinute: 0.5,
      spikeMean: 10,
      spikeStd: 4,
      spikeCv: 0.4,
      spikePerMinute: 0.16,
      spikeP25: 5,
      spikeP50: 8,
      spikeP75: 12,
      spikeP90: 18,
      spikeDistribution: {
        negative: { count: 0, frequency: 0 },
        nil: { count: 0, frequency: 0 },
        low: { count: 2, frequency: 0.2 },
        moderate: { count: 4, frequency: 0.4 },
        high: { count: 3, frequency: 0.3 },
        boom: { count: 1, frequency: 0.1 },
      },
      projectedTotal: 40,
      projectedFloor: 35,
      projectedCeiling: 48,
      gamesPlayed: 10,
      lowSampleWarning: false,
      noUsableData: false,
      games: [],
    },
    contextualProfile: {
      playerId: 'p:test:1',
      playerName: 'Test Player',
      teamCode: 'BRI',
      position: 'PROP',
      year: 2026,
      baseProjection: { total: 40, floor: 35, ceiling: 48 },
      opponents: {},
      venues: {},
      weather: {},
    },
    ...overrides,
  };
}

export function makeTeamRankingsAggregate(overrides: Partial<TeamRankingsAggregate> = {}): TeamRankingsAggregate {
  return {
    year: 2026,
    teamCode: 'BRI',
    mode: 'composite',
    asOfRound: 10,
    computedAt: '2026-05-20T00:00:00.000Z',
    rankings: {
      teamCode: 'BRI',
      year: 2026,
      mode: 'composite',
      rankedPlayers: [],
      excludedCount: 0,
    },
    ...overrides,
  };
}

export function makePrecomputeStatus(overrides: Partial<PrecomputeStatus> = {}): PrecomputeStatus {
  return { year: 2026, asOfRound: 10, ...overrides };
}

/**
 * Run the full contract suite against `makeRepo()`. Each test gets a fresh
 * repository instance.
 */
export function runProjectionRepositoryContractTests(
  makeRepo: () => ProjectionRepository | Promise<ProjectionRepository>,
): void {
  describe('ProjectionRepository contract', () => {
    let repo: ProjectionRepository;

    beforeEach(async () => {
      repo = await makeRepo();
    });

    describe('miss semantics', () => {
      it('findPlayerAggregate returns null for unknown (year, playerId)', async () => {
        expect(await repo.findPlayerAggregate(2026, 'unknown')).toBeNull();
      });

      it('findTeamRankingsAggregate returns null for unknown identity', async () => {
        expect(await repo.findTeamRankingsAggregate(2026, 'ZZZ', 'composite')).toBeNull();
      });

      it('findPrecomputeStatus returns null when no status has been written', async () => {
        expect(await repo.findPrecomputeStatus(2026)).toBeNull();
      });

      it('does not throw on miss', async () => {
        // Already covered above, but explicit so failure mode is obvious.
        await expect(repo.findPlayerAggregate(2026, 'unknown')).resolves.toBeNull();
        await expect(repo.findTeamRankingsAggregate(2026, 'ZZZ', 'composite')).resolves.toBeNull();
        await expect(repo.findPrecomputeStatus(9999)).resolves.toBeNull();
      });
    });

    describe('round-trip', () => {
      it('savePlayerAggregate then find returns the same aggregate', async () => {
        const agg = makePlayerAggregate();
        await repo.savePlayerAggregate(agg);
        const found = await repo.findPlayerAggregate(agg.year, agg.playerId);
        expect(found).not.toBeNull();
        expect(found?.playerId).toBe(agg.playerId);
        expect(found?.year).toBe(agg.year);
        expect(found?.asOfRound).toBe(agg.asOfRound);
        expect(found?.baseProfile.projectedTotal).toBe(40);
      });

      it('saveTeamRankingsAggregate then find returns the same aggregate per (year, teamCode, mode)', async () => {
        const composite = makeTeamRankingsAggregate({ mode: 'composite' });
        const captaincy = makeTeamRankingsAggregate({ mode: 'captaincy' });
        await repo.saveTeamRankingsAggregate(composite);
        await repo.saveTeamRankingsAggregate(captaincy);

        const foundComposite = await repo.findTeamRankingsAggregate(2026, 'BRI', 'composite');
        const foundCaptaincy = await repo.findTeamRankingsAggregate(2026, 'BRI', 'captaincy');
        const foundOther = await repo.findTeamRankingsAggregate(2026, 'BRI', 'selection');

        expect(foundComposite?.mode).toBe('composite');
        expect(foundCaptaincy?.mode).toBe('captaincy');
        expect(foundOther).toBeNull();
      });

      it('savePrecomputeStatus then find returns the same status', async () => {
        const status = makePrecomputeStatus({ year: 2026, asOfRound: 7 });
        await repo.savePrecomputeStatus(status);
        const found = await repo.findPrecomputeStatus(2026);
        expect(found).toEqual({ year: 2026, asOfRound: 7 });
      });
    });

    describe('last-writer-wins', () => {
      it('savePlayerAggregate overwrites previous aggregate for same (year, playerId)', async () => {
        const v1 = makePlayerAggregate({ asOfRound: 5 });
        const v2 = makePlayerAggregate({ asOfRound: 10 });
        await repo.savePlayerAggregate(v1);
        await repo.savePlayerAggregate(v2);
        const found = await repo.findPlayerAggregate(v2.year, v2.playerId);
        expect(found?.asOfRound).toBe(10);
      });

      it('savePrecomputeStatus overwrites previous status for same year', async () => {
        await repo.savePrecomputeStatus(makePrecomputeStatus({ year: 2026, asOfRound: 5 }));
        await repo.savePrecomputeStatus(makePrecomputeStatus({ year: 2026, asOfRound: 11 }));
        const found = await repo.findPrecomputeStatus(2026);
        expect(found?.asOfRound).toBe(11);
      });
    });

    describe('identity preservation', () => {
      it('findPlayerAggregate returns only aggregates with matching (year, playerId)', async () => {
        await repo.savePlayerAggregate(makePlayerAggregate({ playerId: 'p:a', year: 2026 }));
        await repo.savePlayerAggregate(makePlayerAggregate({ playerId: 'p:b', year: 2026 }));
        await repo.savePlayerAggregate(makePlayerAggregate({ playerId: 'p:a', year: 2025 }));

        const a26 = await repo.findPlayerAggregate(2026, 'p:a');
        const b26 = await repo.findPlayerAggregate(2026, 'p:b');
        const a25 = await repo.findPlayerAggregate(2025, 'p:a');

        expect(a26?.playerId).toBe('p:a');
        expect(a26?.year).toBe(2026);
        expect(b26?.playerId).toBe('p:b');
        expect(a25?.year).toBe(2025);
      });
    });
  });
}
