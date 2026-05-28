/**
 * KvMatchResultsScrapeWatermarkRepository — Cloudflare Workers KV adapter for
 * `MatchResultsScrapeWatermarkRepository` (feature 040).
 *
 * Key layout: `match-results-scrape:v1:{year}:{round}`
 *
 * Each key carries `{ lastScrapedAt, allCompleted }` metadata so coverage
 * probes (`kv.list({ metadata: true })`) can read the watermark without
 * fetching the value. Quota-exhausted writes are wrapped as
 * `MatchResultsScrapeWatermarkStoreQuotaExhaustedError`.
 *
 * Mirrors the structural pattern of `kv-team-strength-rankings-repository.ts`
 * (spec 039). Envelope helper extraction across this and the nine prior
 * repositories is the next dedicated step in the migration arc — explicitly
 * deferred from this feature (see plan.md §"Complexity Tracking").
 */

import {
  MatchResultsScrapeWatermarkStoreQuotaExhaustedError,
  type MatchResultsScrapeWatermark,
  type MatchResultsScrapeWatermarkRepository,
} from '../../domain/repositories/match-results-scrape-watermark-repository.js';
import {
  decodeWatermarkEnvelope,
  encodeWatermarkEnvelope,
  keyFor,
  keyPrefixForYear,
} from './match-results-scrape-watermark-envelope.js';

interface WatermarkMetadata {
  readonly lastScrapedAt: string;
  readonly allCompleted: boolean;
}

function isQuotaExhaustedError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return /KV PUT failed: 429.*Daily limit exceeded/i.test(err.message);
}

export class KvMatchResultsScrapeWatermarkRepository
  implements MatchResultsScrapeWatermarkRepository {
  constructor(private readonly kv: KVNamespace) {}

  async findByRound(year: number, round: number): Promise<MatchResultsScrapeWatermark | null> {
    const raw = await this.kv.get(keyFor(year, round));
    const state = decodeWatermarkEnvelope(raw);
    if (state === null) return null;
    return {
      year,
      round,
      lastScrapedAt: state.lastScrapedAt,
      allCompleted: state.allCompleted,
    };
  }

  async markScraped(year: number, round: number, allCompleted: boolean): Promise<void> {
    const lastScrapedAt = new Date().toISOString();
    const computedAt = lastScrapedAt;
    const metadata: WatermarkMetadata = { lastScrapedAt, allCompleted };
    const value = encodeWatermarkEnvelope({ lastScrapedAt, allCompleted }, computedAt);
    try {
      await this.kv.put(keyFor(year, round), value, { metadata });
    } catch (err) {
      if (isQuotaExhaustedError(err)) {
        throw new MatchResultsScrapeWatermarkStoreQuotaExhaustedError(
          `KV daily write quota exhausted while writing match-results scrape watermark for ${year}/${round}`,
          err,
        );
      }
      throw err;
    }
  }

  async listScrapedRounds(year: number): Promise<Map<number, MatchResultsScrapeWatermark>> {
    const prefix = keyPrefixForYear(year);
    const out = new Map<number, MatchResultsScrapeWatermark>();
    let cursor: string | undefined;
    for (;;) {
      const page = await this.kv.list<WatermarkMetadata>({ prefix, cursor });
      for (const entry of page.keys) {
        if (!entry.metadata) continue;
        const tail = entry.name.slice(prefix.length);
        const round = Number.parseInt(tail, 10);
        if (!Number.isFinite(round)) continue;
        out.set(round, {
          year,
          round,
          lastScrapedAt: entry.metadata.lastScrapedAt,
          allCompleted: entry.metadata.allCompleted,
        });
      }
      if (page.list_complete) break;
      cursor = page.cursor;
      if (!cursor) break;
    }
    return out;
  }
}
