/**
 * T011 — Integration test for KvProjectionRepository under Miniflare.
 *
 * Runs the shared contract suite (T008) against the KV adapter, plus
 * adapter-specific tests:
 *  - quota-exhausted detection wraps in ProjectionStoreQuotaExhaustedError
 *  - schema-version mismatch is treated as miss
 *
 * Feature: 034-precomputed-projections.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Miniflare } from 'miniflare';
import type { KVNamespace } from '@cloudflare/workers-types';
import { KvProjectionRepository } from '../../src/infrastructure/cache/kv-projection-repository.js';
import { ProjectionStoreQuotaExhaustedError } from '../../src/domain/repositories/projection-repository.js';
import {
  makePlayerAggregate,
  runProjectionRepositoryContractTests,
} from '../unit/cache/projection-repository-contract.js';

// ── Contract suite against the real KV adapter ──────────────────────────────

runProjectionRepositoryContractTests(async () => {
  const mf = new Miniflare({
    modules: true,
    script: 'export default { fetch() { return new Response("ok"); } }',
    kvNamespaces: ['CACHE'],
  });
  const kv = (await mf.getKVNamespace('CACHE')) as unknown as KVNamespace;
  return new KvProjectionRepository(kv);
});

// ── Adapter-specific behaviour ──────────────────────────────────────────────

describe('KvProjectionRepository — adapter-specific', () => {
  let mf: Miniflare;
  let kv: KVNamespace;
  let repo: KvProjectionRepository;

  beforeEach(async () => {
    mf = new Miniflare({
      modules: true,
      script: 'export default { fetch() { return new Response("ok"); } }',
      kvNamespaces: ['CACHE'],
    });
    kv = (await mf.getKVNamespace('CACHE')) as unknown as KVNamespace;
    repo = new KvProjectionRepository(kv);
  });

  it('schema-version mismatch is treated as miss (read returns null)', async () => {
    // Hand-craft a value with a future schema version we don't know how to read.
    await kv.put(
      'projections:v1:2026:player:p:test:1',
      JSON.stringify({
        schemaVersion: 99,
        asOfRound: 10,
        computedAt: '2026-05-20T00:00:00.000Z',
        payload: { playerId: 'p:test:1', year: 2026, baseProfile: {}, contextualProfile: {} },
      }),
    );

    const found = await repo.findPlayerAggregate(2026, 'p:test:1');
    expect(found).toBeNull();
  });

  it('malformed JSON in storage is treated as miss', async () => {
    await kv.put('projections:v1:2026:player:p:test:1', 'this is not JSON');
    const found = await repo.findPlayerAggregate(2026, 'p:test:1');
    expect(found).toBeNull();
  });

  it('quota-exhausted KV error is wrapped in ProjectionStoreQuotaExhaustedError', async () => {
    // Stub the put to throw a KV-style quota error.
    const stubKv = {
      get: async () => null,
      put: async () => {
        throw new Error('KV PUT failed: 429 Too Many Requests — daily limit exceeded');
      },
    } as unknown as KVNamespace;
    const stubRepo = new KvProjectionRepository(stubKv);

    let caught: unknown = null;
    try {
      await stubRepo.savePlayerAggregate(makePlayerAggregate());
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ProjectionStoreQuotaExhaustedError);
  });

  it('non-quota KV errors propagate unchanged (not wrapped)', async () => {
    const stubKv = {
      get: async () => null,
      put: async () => {
        throw new Error('KV PUT failed: 500 internal error');
      },
    } as unknown as KVNamespace;
    const stubRepo = new KvProjectionRepository(stubKv);

    let caught: unknown = null;
    try {
      await stubRepo.savePlayerAggregate(makePlayerAggregate());
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Error);
    expect(caught).not.toBeInstanceOf(ProjectionStoreQuotaExhaustedError);
    expect((caught as Error).message).toMatch(/500/);
  });
});
