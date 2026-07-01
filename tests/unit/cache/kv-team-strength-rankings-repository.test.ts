/**
 * Miniflare-backed contract suite + adapter-specific tests for
 * KvTeamStrengthRankingsRepository (feature 039 T009 + T027).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Miniflare } from 'miniflare';
import type { KVNamespace } from '@cloudflare/workers-types';
import { KvTeamStrengthRankingsRepository } from '../../../src/infrastructure/persistence/kv-team-strength-rankings-repository.js';
import { TeamStrengthRankingsStoreQuotaExhaustedError } from '../../../src/domain/repositories/team-strength-rankings-repository.js';
import {
  makePayload,
  runTeamStrengthRankingsRepositoryContractTests,
} from './team-strength-rankings-repository-contract.js';

runTeamStrengthRankingsRepositoryContractTests(async () => {
  const mf = new Miniflare({
    modules: true,
    script: 'export default { fetch() { return new Response("ok"); } }',
    kvNamespaces: ['CACHE'],
  });
  const kv = (await mf.getKVNamespace('CACHE')) as unknown as KVNamespace;
  return new KvTeamStrengthRankingsRepository(kv);
});

describe('KvTeamStrengthRankingsRepository — adapter-specific', () => {
  let mf: Miniflare;
  let kv: KVNamespace;
  let repo: KvTeamStrengthRankingsRepository;

  beforeEach(async () => {
    mf = new Miniflare({
      modules: true,
      script: 'export default { fetch() { return new Response("ok"); } }',
      kvNamespaces: ['CACHE'],
    });
    kv = (await mf.getKVNamespace('CACHE')) as unknown as KVNamespace;
    repo = new KvTeamStrengthRankingsRepository(kv);
  });

  it('quota-exhausted PUT is wrapped as TeamStrengthRankingsStoreQuotaExhaustedError', async () => {
    const stubKv = {
      get: async () => null,
      list: async () => ({ keys: [], list_complete: true, cacheStatus: null }),
      put: async () => {
        throw new Error('KV PUT failed: 429 Too Many Requests — Daily limit exceeded');
      },
    } as unknown as KVNamespace;
    const stubRepo = new KvTeamStrengthRankingsRepository(stubKv);

    let caught: unknown = null;
    try {
      await stubRepo.saveYear(2026, 5, makePayload());
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(TeamStrengthRankingsStoreQuotaExhaustedError);
  });

  it('raw 429 without daily-limit text propagates unwrapped', async () => {
    const stubKv = {
      get: async () => null,
      list: async () => ({ keys: [], list_complete: true, cacheStatus: null }),
      put: async () => {
        throw new Error('429 Too Many Requests');
      },
    } as unknown as KVNamespace;
    const stubRepo = new KvTeamStrengthRankingsRepository(stubKv);

    let caught: unknown = null;
    try {
      await stubRepo.saveYear(2026, 5, makePayload());
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Error);
    expect(caught).not.toBeInstanceOf(TeamStrengthRankingsStoreQuotaExhaustedError);
  });

  it('partial write: a failure after thresholds + season leaves prior writes visible and round keys absent', async () => {
    // Wrap the real Miniflare KV so the first round-key write throws.
    let putCount = 0;
    const wrappedKv = new Proxy(kv, {
      get(target, prop, receiver) {
        if (prop === 'put') {
          return async (
            key: string,
            value: string,
            opts?: { metadata?: unknown },
          ) => {
            putCount += 1;
            if (key.includes(':round:')) {
              throw new Error('simulated transient error before round write');
            }
            // Forward to the real KV.
            return (target as KVNamespace).put(key, value, opts as KVNamespacePutOptions);
          };
        }
        return Reflect.get(target, prop, receiver);
      },
    }) as unknown as KVNamespace;

    const partialRepo = new KvTeamStrengthRankingsRepository(wrappedKv);
    let caught: unknown = null;
    try {
      await partialRepo.saveYear(2026, 8, makePayload());
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Error);
    expect(putCount).toBeGreaterThanOrEqual(3); // thresholds + season + the failing round attempt

    // Read-back uses the unwrapped kv. Thresholds + season landed; rounds did not.
    const probe = new KvTeamStrengthRankingsRepository(kv);
    expect(await probe.findSeasonThresholds(2026)).not.toBeNull();
    expect(await probe.findSeasonRankings(2026)).not.toBeNull();
    expect(await probe.findRoundRankings(2026, 1)).toBeNull();
    const coverage = await probe.listCoveredRoundRankings(2026);
    expect(coverage.size).toBe(0);
  });
});
