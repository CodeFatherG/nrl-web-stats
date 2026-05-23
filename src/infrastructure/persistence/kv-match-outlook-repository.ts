/**
 * KvMatchOutlookRepository — Cloudflare Workers KV adapter for
 * MatchOutlookRepository.
 *
 * Feature: 037-analytics-cache-replacement (T011).
 */

import {
  MatchOutlookStoreQuotaExhaustedError,
  type MatchOutlookAggregate,
  type MatchOutlookRepository,
} from '../../domain/repositories/match-outlook-repository.js';
import {
  decodeMatchOutlookAggregate,
  encodeMatchOutlookAggregate,
} from './match-outlook-envelope.js';

const KEY_PREFIX = 'match-outlook:v1';

function yearPrefix(year: number): string {
  return `${KEY_PREFIX}:${year}:`;
}

function aggregateKey(year: number, round: number): string {
  return `${yearPrefix(year)}${round}`;
}

function parseRoundFromKey(key: string, prefix: string): number | null {
  const suffix = key.slice(prefix.length);
  if (suffix.length === 0) return null;
  const n = Number(suffix);
  return Number.isInteger(n) ? n : null;
}

interface CoverageMetadata {
  readonly asOfRound: number;
}

function isQuotaExhaustedError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message;
  if (!/429/.test(msg)) return false;
  return /daily limit|rate limit|quota/i.test(msg);
}

export class KvMatchOutlookRepository implements MatchOutlookRepository {
  constructor(private readonly kv: KVNamespace) {}

  async findMatchOutlookAggregate(
    year: number,
    round: number,
  ): Promise<MatchOutlookAggregate | null> {
    const raw = await this.kv.get(aggregateKey(year, round));
    return decodeMatchOutlookAggregate(raw);
  }

  async listMatchOutlookAsOfRounds(year: number): Promise<Map<number, number>> {
    const prefix = yearPrefix(year);
    const out = new Map<number, number>();
    let cursor: string | undefined;
    for (;;) {
      const page = await this.kv.list<CoverageMetadata>({ prefix, cursor });
      for (const entry of page.keys) {
        if (!entry.metadata) continue;
        const round = parseRoundFromKey(entry.name, prefix);
        if (round === null) continue;
        out.set(round, entry.metadata.asOfRound);
      }
      if (page.list_complete) break;
      cursor = page.cursor;
      if (!cursor) break;
    }
    return out;
  }

  async saveMatchOutlookAggregate(
    aggregate: MatchOutlookAggregate,
  ): Promise<void> {
    const key = aggregateKey(aggregate.year, aggregate.round);
    try {
      await this.kv.put(key, encodeMatchOutlookAggregate(aggregate), {
        metadata: { asOfRound: aggregate.asOfRound } satisfies CoverageMetadata,
      });
    } catch (err) {
      if (isQuotaExhaustedError(err)) {
        throw new MatchOutlookStoreQuotaExhaustedError(
          `KV daily write quota exhausted while writing ${key}`,
          err,
        );
      }
      throw err;
    }
  }
}
