/**
 * T011 — Integration test for KvPlayerMovementsRepository under Miniflare.
 *
 * Runs the shared contract suite against the KV adapter, plus adapter-specific
 * tests: schema-version mismatch is a miss, malformed JSON is a miss,
 * quota-exhausted PUT is wrapped in PlayerMovementsStoreQuotaExhaustedError,
 * non-quota errors propagate unchanged.
 *
 * Feature: 035-player-movements-artifact.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Miniflare } from 'miniflare';
import type { KVNamespace } from '@cloudflare/workers-types';
import { KvPlayerMovementsRepository } from '../../src/infrastructure/persistence/kv-player-movements-repository.js';
import {
  PlayerMovementsStoreQuotaExhaustedError,
  type PlayerMovementsArtifact,
} from '../../src/domain/repositories/player-movements-repository.js';
import { runPlayerMovementsRepositoryContractTests } from '../unit/persistence/player-movements-repository-contract.js';

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

// ── Contract suite against the real KV adapter ──────────────────────────────

runPlayerMovementsRepositoryContractTests(
  'KvPlayerMovementsRepository (Miniflare)',
  async () => {
    const mf = new Miniflare({
      modules: true,
      script: 'export default { fetch() { return new Response("ok"); } }',
      kvNamespaces: ['CACHE'],
    });
    const kv = (await mf.getKVNamespace('CACHE')) as unknown as KVNamespace;
    return new KvPlayerMovementsRepository(kv);
  },
);

// ── Adapter-specific behaviour ──────────────────────────────────────────────

describe('KvPlayerMovementsRepository — adapter-specific', () => {
  let mf: Miniflare;
  let kv: KVNamespace;
  let repo: KvPlayerMovementsRepository;

  beforeEach(async () => {
    mf = new Miniflare({
      modules: true,
      script: 'export default { fetch() { return new Response("ok"); } }',
      kvNamespaces: ['CACHE'],
    });
    kv = (await mf.getKVNamespace('CACHE')) as unknown as KVNamespace;
    repo = new KvPlayerMovementsRepository(kv);
  });

  it('schema-version mismatch is treated as miss (read returns null)', async () => {
    await kv.put(
      'player-movements:v1:2026:5',
      JSON.stringify({
        schemaVersion: 999,
        computedAt: '2026-05-21T10:00:00.000Z',
        payload: {
          year: 2026,
          round: 5,
          season: 2026,
          injured: [],
          dropped: [],
          benched: [],
          returningFromInjury: [],
          coveringInjury: [],
          promoted: [],
          positionChanged: [],
        },
      }),
    );
    await expect(repo.findByYearAndRound(2026, 5)).resolves.toBeNull();
  });

  it('malformed JSON in storage is treated as miss', async () => {
    await kv.put('player-movements:v1:2026:5', 'this is not JSON');
    await expect(repo.findByYearAndRound(2026, 5)).resolves.toBeNull();
  });

  it('quota-exhausted KV error is wrapped in PlayerMovementsStoreQuotaExhaustedError', async () => {
    const stubKv = {
      get: async () => null,
      list: async () => ({ keys: [], list_complete: true, cacheStatus: null }),
      put: async () => {
        throw new Error('KV PUT failed: 429 Too Many Requests — daily limit exceeded');
      },
    } as unknown as KVNamespace;
    const stubRepo = new KvPlayerMovementsRepository(stubKv);

    let caught: unknown = null;
    try {
      await stubRepo.save(makeArtifact());
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(PlayerMovementsStoreQuotaExhaustedError);
  });

  it('non-quota KV errors propagate unchanged (not wrapped)', async () => {
    const stubKv = {
      get: async () => null,
      list: async () => ({ keys: [], list_complete: true, cacheStatus: null }),
      put: async () => {
        throw new Error('KV PUT failed: 500 internal error');
      },
    } as unknown as KVNamespace;
    const stubRepo = new KvPlayerMovementsRepository(stubKv);

    let caught: unknown = null;
    try {
      await stubRepo.save(makeArtifact());
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Error);
    expect(caught).not.toBeInstanceOf(PlayerMovementsStoreQuotaExhaustedError);
    expect((caught as Error).message).toMatch(/500/);
  });

  it('listCoveredRounds pages through prefix entries correctly', async () => {
    await repo.save(makeArtifact({ year: 2026, round: 1 }));
    await repo.save(makeArtifact({ year: 2026, round: 5 }));
    await repo.save(makeArtifact({ year: 2026, round: 12 }));
    await repo.save(makeArtifact({ year: 2025, round: 27 }));
    const rounds = await repo.listCoveredRounds(2026);
    expect([...rounds].sort((a, b) => a - b)).toEqual([1, 5, 12]);
  });
});
