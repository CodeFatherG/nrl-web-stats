/**
 * Miniflare-backed contract suite + adapter-specific tests for
 * KvMatchResultsScrapeWatermarkRepository (feature 040 T009).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Miniflare } from 'miniflare';
import type { KVNamespace } from '@cloudflare/workers-types';
import { KvMatchResultsScrapeWatermarkRepository } from '../../src/infrastructure/persistence/kv-match-results-scrape-watermark-repository.js';
import { MatchResultsScrapeWatermarkStoreQuotaExhaustedError } from '../../src/domain/repositories/match-results-scrape-watermark-repository.js';
import { runMatchResultsScrapeWatermarkRepositoryContractTests } from '../unit/cache/match-results-scrape-watermark-repository-contract.js';

runMatchResultsScrapeWatermarkRepositoryContractTests(async () => {
  const mf = new Miniflare({
    modules: true,
    script: 'export default { fetch() { return new Response("ok"); } }',
    kvNamespaces: ['CACHE'],
  });
  const kv = (await mf.getKVNamespace('CACHE')) as unknown as KVNamespace;
  return new KvMatchResultsScrapeWatermarkRepository(kv);
});

describe('KvMatchResultsScrapeWatermarkRepository — adapter-specific', () => {
  let mf: Miniflare;
  let kv: KVNamespace;
  let repo: KvMatchResultsScrapeWatermarkRepository;

  beforeEach(async () => {
    mf = new Miniflare({
      modules: true,
      script: 'export default { fetch() { return new Response("ok"); } }',
      kvNamespaces: ['CACHE'],
    });
    kv = (await mf.getKVNamespace('CACHE')) as unknown as KVNamespace;
    repo = new KvMatchResultsScrapeWatermarkRepository(kv);
  });

  it('quota-exhausted PUT is wrapped as MatchResultsScrapeWatermarkStoreQuotaExhaustedError', async () => {
    const stubKv = {
      get: async () => null,
      list: async () => ({ keys: [], list_complete: true, cacheStatus: null }),
      put: async () => {
        throw new Error('KV PUT failed: 429 Too Many Requests — Daily limit exceeded');
      },
    } as unknown as KVNamespace;
    const stubRepo = new KvMatchResultsScrapeWatermarkRepository(stubKv);

    let caught: unknown = null;
    try {
      await stubRepo.markScraped(2026, 5, false);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(MatchResultsScrapeWatermarkStoreQuotaExhaustedError);
  });

  it('raw 429 without daily-limit text propagates unwrapped', async () => {
    const stubKv = {
      get: async () => null,
      list: async () => ({ keys: [], list_complete: true, cacheStatus: null }),
      put: async () => {
        throw new Error('429 Too Many Requests');
      },
    } as unknown as KVNamespace;
    const stubRepo = new KvMatchResultsScrapeWatermarkRepository(stubKv);

    let caught: unknown = null;
    try {
      await stubRepo.markScraped(2026, 5, false);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Error);
    expect(caught).not.toBeInstanceOf(MatchResultsScrapeWatermarkStoreQuotaExhaustedError);
  });

  it('markScraped attaches {lastScrapedAt, allCompleted} as KV metadata so listScrapedRounds is keys-only', async () => {
    await repo.markScraped(2026, 7, true);

    // Probe KV directly to confirm the metadata round-trip.
    const page = await kv.list<{ lastScrapedAt: string; allCompleted: boolean }>({
      prefix: 'match-results-scrape:v1:2026:',
    });
    expect(page.keys.length).toBe(1);
    const entry = page.keys[0];
    expect(entry.name).toBe('match-results-scrape:v1:2026:7');
    expect(entry.metadata?.allCompleted).toBe(true);
    expect(typeof entry.metadata?.lastScrapedAt).toBe('string');
  });

  it('listScrapedRounds uses keys-only listing (no value reads) and returns the right watermark per round', async () => {
    await repo.markScraped(2026, 1, false);
    await repo.markScraped(2026, 2, true);
    await repo.markScraped(2025, 9, true);

    const out2026 = await repo.listScrapedRounds(2026);
    expect(out2026.size).toBe(2);
    expect(out2026.get(1)?.allCompleted).toBe(false);
    expect(out2026.get(2)?.allCompleted).toBe(true);

    const out2025 = await repo.listScrapedRounds(2025);
    expect(out2025.size).toBe(1);
    expect(out2025.get(9)?.allCompleted).toBe(true);
  });
});
