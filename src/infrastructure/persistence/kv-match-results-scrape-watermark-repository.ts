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
import { pagedKvList } from './kv-list.js';

interface WatermarkMetadata {
  readonly lastScrapedAt: string;
  readonly allCompleted: boolean;
}

// NOTE (FR-012, follow-up observation logged for spec 041 T055): this regex
// is strictly narrower than the canonical isQuotaExhaustedError in
// kv-errors.ts — it only matches "KV PUT failed: 429 ... Daily limit
// exceeded". Adopting the canonical predicate would slightly broaden quota
// detection (different behaviour), so the per-adapter try/catch and regex are
// preserved verbatim for byte-identity. (Plan T046's claim that this regex
// is byte-identical to the canonical one is incorrect — see contracts/kv-errors.md §4.)
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
    const entries = await pagedKvList<WatermarkMetadata, [number, MatchResultsScrapeWatermark]>({
      kv: this.kv,
      prefix,
      transform: (key, metadata) => {
        if (!metadata) return null;
        const tail = key.slice(prefix.length);
        const round = Number.parseInt(tail, 10);
        if (!Number.isFinite(round)) return null;
        return [
          round,
          {
            year,
            round,
            lastScrapedAt: metadata.lastScrapedAt,
            allCompleted: metadata.allCompleted,
          },
        ];
      },
    });
    return new Map(entries);
  }
}
