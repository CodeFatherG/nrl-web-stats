/**
 * T010 — Integration test for KvProvisionalGameStrengthRepository under
 * Miniflare.
 *
 * Runs the shared contract suite against the KV adapter, plus
 * adapter-specific tests: schema-version mismatch is a miss, malformed JSON
 * is a miss, quota-exhausted PUT is wrapped in
 * ProvisionalGameStrengthStoreQuotaExhaustedError, non-quota errors
 * propagate unchanged.
 *
 * Feature: 036-game-strength-artifact.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Miniflare } from 'miniflare';
import type { KVNamespace } from '@cloudflare/workers-types';
import { KvProvisionalGameStrengthRepository } from '../../src/infrastructure/persistence/kv-provisional-game-strength-repository.js';
import { ProvisionalGameStrengthStoreQuotaExhaustedError } from '../../src/domain/repositories/provisional-game-strength-repository.js';
import type { RoundGSR } from '../../src/domain/game-strength.js';
import { runProvisionalGameStrengthRepositoryContractTests } from '../unit/persistence/provisional-game-strength-repository-contract.js';

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

// ── Contract suite against the real KV adapter ──────────────────────────────

runProvisionalGameStrengthRepositoryContractTests(
  'KvProvisionalGameStrengthRepository (Miniflare)',
  async () => {
    const mf = new Miniflare({
      modules: true,
      script: 'export default { fetch() { return new Response("ok"); } }',
      kvNamespaces: ['CACHE'],
    });
    const kv = (await mf.getKVNamespace('CACHE')) as unknown as KVNamespace;
    return new KvProvisionalGameStrengthRepository(kv);
  },
);

// ── Adapter-specific behaviour ──────────────────────────────────────────────

describe('KvProvisionalGameStrengthRepository — adapter-specific', () => {
  let mf: Miniflare;
  let kv: KVNamespace;
  let repo: KvProvisionalGameStrengthRepository;

  beforeEach(async () => {
    mf = new Miniflare({
      modules: true,
      script: 'export default { fetch() { return new Response("ok"); } }',
      kvNamespaces: ['CACHE'],
    });
    kv = (await mf.getKVNamespace('CACHE')) as unknown as KVNamespace;
    repo = new KvProvisionalGameStrengthRepository(kv);
  });

  it('schema-version mismatch is treated as miss (read returns null)', async () => {
    await kv.put(
      'gsr-provisional:v1:2026:5',
      JSON.stringify({
        schemaVersion: 999,
        computedAt: '2026-05-21T10:00:00.000Z',
        payload: {
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
        },
      }),
    );
    await expect(repo.findByRound(2026, 5)).resolves.toBeNull();
  });

  it('malformed JSON in storage is treated as miss', async () => {
    await kv.put('gsr-provisional:v1:2026:5', 'this is not JSON');
    await expect(repo.findByRound(2026, 5)).resolves.toBeNull();
  });

  it('quota-exhausted KV error is wrapped in ProvisionalGameStrengthStoreQuotaExhaustedError', async () => {
    const stubKv = {
      get: async () => null,
      list: async () => ({ keys: [], list_complete: true, cacheStatus: null }),
      put: async () => {
        throw new Error('KV PUT failed: 429 Too Many Requests — daily limit exceeded');
      },
      delete: async () => {},
    } as unknown as KVNamespace;
    const stubRepo = new KvProvisionalGameStrengthRepository(stubKv);

    let caught: unknown = null;
    try {
      await stubRepo.save(2026, 5, makeGSR());
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ProvisionalGameStrengthStoreQuotaExhaustedError);
  });

  it('non-quota KV errors propagate unchanged (not wrapped)', async () => {
    const stubKv = {
      get: async () => null,
      list: async () => ({ keys: [], list_complete: true, cacheStatus: null }),
      put: async () => {
        throw new Error('KV PUT failed: 500 internal error');
      },
      delete: async () => {},
    } as unknown as KVNamespace;
    const stubRepo = new KvProvisionalGameStrengthRepository(stubKv);

    let caught: unknown = null;
    try {
      await stubRepo.save(2026, 5, makeGSR());
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Error);
    expect(caught).not.toBeInstanceOf(ProvisionalGameStrengthStoreQuotaExhaustedError);
    expect((caught as Error).message).toMatch(/500/);
  });

  it('listProvisionalRounds pages through prefix entries correctly', async () => {
    await repo.save(2026, 1, makeGSR({ year: 2026, round: 1 }));
    await repo.save(2026, 5, makeGSR({ year: 2026, round: 5 }));
    await repo.save(2026, 12, makeGSR({ year: 2026, round: 12 }));
    await repo.save(2025, 27, makeGSR({ year: 2025, round: 27 }));
    const rounds = await repo.listProvisionalRounds(2026);
    expect([...rounds].sort((a, b) => a - b)).toEqual([1, 5, 12]);
  });

  it('deleteByYear removes all entries for the year via list+delete', async () => {
    await repo.save(2026, 14, makeGSR({ year: 2026, round: 14 }));
    await repo.save(2026, 15, makeGSR({ year: 2026, round: 15 }));
    await repo.save(2027, 14, makeGSR({ year: 2027, round: 14 }));
    await repo.deleteByYear(2026);
    const rounds2026 = await repo.listProvisionalRounds(2026);
    expect(rounds2026.size).toBe(0);
    const rounds2027 = await repo.listProvisionalRounds(2027);
    expect([...rounds2027]).toEqual([14]);
  });
});
