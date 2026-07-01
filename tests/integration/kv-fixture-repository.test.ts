/**
 * Integration test for KvFixtureRepository under Miniflare — exercises the
 * full save→find→list path against Miniflare's KV mock, plus the
 * quota-exhausted case (wrapped error).
 *
 * Feature: 038-kv-fixture-repository (T027).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Miniflare } from 'miniflare';
import type { KVNamespace } from '@cloudflare/workers-types';
import { KvFixtureRepository } from '../../src/infrastructure/persistence/kv-fixture-repository.js';
import { FixtureStoreQuotaExhaustedError } from '../../src/domain/repositories/fixture-repository.js';
import { createFixture } from '../../src/models/fixture.js';

describe('KvFixtureRepository (Miniflare integration)', () => {
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

  it('round-trips save → findByYear → listScrapedYears', async () => {
    const fixtures = [
      createFixture(2026, 1, 'BRI', 'SYD', true, 100),
      createFixture(2026, 1, 'SYD', 'BRI', false, 90),
    ];
    await repo.save(2026, fixtures);

    const artifact = await repo.findByYear(2026);
    expect(artifact).not.toBeNull();
    expect(artifact!.payload).toEqual(fixtures);

    const years = await repo.listScrapedYears();
    expect(years.has(2026)).toBe(true);
    expect(typeof years.get(2026)).toBe('string');
  });

  it('wraps quota-exhausted PUT errors into FixtureStoreQuotaExhaustedError', async () => {
    const stubKv = {
      get: async () => null,
      list: async () => ({ keys: [], list_complete: true, cacheStatus: null }),
      put: async () => {
        throw new Error('KV PUT failed: 429 — daily limit exceeded');
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
});
