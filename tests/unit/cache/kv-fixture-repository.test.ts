/**
 * Integration test for KvFixtureRepository under Miniflare.
 *
 * Runs the shared contract suite, plus adapter-specific tests: schema-version
 * mismatch and malformed JSON are misses, corrupted envelope is a miss,
 * quota-exhausted PUT is wrapped, non-quota 429 propagates unwrapped.
 *
 * Feature: 038-kv-fixture-repository (T009).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Miniflare } from 'miniflare';
import type { KVNamespace } from '@cloudflare/workers-types';
import { KvFixtureRepository } from '../../../src/infrastructure/persistence/kv-fixture-repository.js';
import { FixtureStoreQuotaExhaustedError } from '../../../src/domain/repositories/fixture-repository.js';
import { createFixture } from '../../../src/models/fixture.js';
import { runFixtureRepositoryContract } from './fixture-repository-contract.js';

runFixtureRepositoryContract(async () => {
  const mf = new Miniflare({
    modules: true,
    script: 'export default { fetch() { return new Response("ok"); } }',
    kvNamespaces: ['CACHE'],
  });
  const kv = (await mf.getKVNamespace('CACHE')) as unknown as KVNamespace;
  return new KvFixtureRepository(kv);
});

describe('KvFixtureRepository — adapter-specific', () => {
  let mf: Miniflare;
  let kv: KVNamespace;
  let repo: KvFixtureRepository;

  beforeEach(async () => {
    mf = new Miniflare({
      modules: true,
      script: 'export default { fetch() { return new Response("ok"); } }',
      kvNamespaces: ['CACHE'],
    });
    kv = (await mf.getKVNamespace('CACHE')) as unknown as KVNamespace;
    repo = new KvFixtureRepository(kv);
  });

  it('schema-version mismatch decodes as null (miss)', async () => {
    await kv.put(
      'fixtures:v1:2026',
      JSON.stringify({
        schemaVersion: 99,
        computedAt: '2026-05-21T10:00:00.000Z',
        freshness: { lastScrapedAt: '2026-05-21T10:00:00.000Z' },
        payload: [],
      }),
    );
    await expect(repo.findByYear(2026)).resolves.toBeNull();
  });

  it('corrupted (non-JSON) envelope decodes as null (miss)', async () => {
    await kv.put('fixtures:v1:2026', 'this is not JSON');
    await expect(repo.findByYear(2026)).resolves.toBeNull();
  });

  it('quota-exhausted PUT is wrapped in FixtureStoreQuotaExhaustedError', async () => {
    const stubKv = {
      get: async () => null,
      list: async () => ({ keys: [], list_complete: true, cacheStatus: null }),
      put: async () => {
        throw new Error('KV PUT failed: 429 Too Many Requests — daily limit exceeded');
      },
    } as unknown as KVNamespace;
    const stubRepo = new KvFixtureRepository(stubKv);

    let caught: unknown = null;
    try {
      await stubRepo.save(2026, [createFixture(2026, 1, 'BRI', 'SYD', true, 100)]);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(FixtureStoreQuotaExhaustedError);
  });

  it('raw 429 (no quota/daily-limit text) propagates unwrapped', async () => {
    const stubKv = {
      get: async () => null,
      list: async () => ({ keys: [], list_complete: true, cacheStatus: null }),
      put: async () => {
        throw new Error('429 Too Many Requests');
      },
    } as unknown as KVNamespace;
    const stubRepo = new KvFixtureRepository(stubKv);

    let caught: unknown = null;
    try {
      await stubRepo.save(2026, [createFixture(2026, 1, 'BRI', 'SYD', true, 100)]);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Error);
    expect(caught).not.toBeInstanceOf(FixtureStoreQuotaExhaustedError);
  });

  it('listScrapedYears returns metadata-stamped years', async () => {
    await repo.save(2025, [createFixture(2025, 1, 'BRI', 'SYD', true, 100)]);
    await repo.save(2026, [createFixture(2026, 1, 'MEL', 'BRI', true, 100)]);
    const result = await repo.listScrapedYears();
    expect(result.size).toBe(2);
    expect(result.has(2025)).toBe(true);
    expect(result.has(2026)).toBe(true);
  });
});
