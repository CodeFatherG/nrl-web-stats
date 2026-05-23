/**
 * KvPlayerTrendsRepository — Cloudflare Workers KV adapter for
 * PlayerTrendsRepository.
 *
 * Feature: 037-analytics-cache-replacement (T012).
 */

import {
  PlayerTrendsStoreQuotaExhaustedError,
  type PlayerTrendsAggregate,
  type PlayerTrendsRepository,
} from '../../domain/repositories/player-trends-repository.js';
import {
  decodePlayerTrendsAggregate,
  encodePlayerTrendsAggregate,
} from './player-trends-envelope.js';

const KEY_PREFIX = 'player-trends:v1';

function yearPrefix(year: number): string {
  return `${KEY_PREFIX}:${year}:`;
}

function aggregateKey(year: number, teamCode: string): string {
  return `${yearPrefix(year)}${teamCode}`;
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

export class KvPlayerTrendsRepository implements PlayerTrendsRepository {
  constructor(private readonly kv: KVNamespace) {}

  async findPlayerTrendsAggregate(
    year: number,
    teamCode: string,
  ): Promise<PlayerTrendsAggregate | null> {
    const raw = await this.kv.get(aggregateKey(year, teamCode));
    return decodePlayerTrendsAggregate(raw);
  }

  async listPlayerTrendsAsOfRounds(year: number): Promise<Map<string, number>> {
    const prefix = yearPrefix(year);
    const out = new Map<string, number>();
    let cursor: string | undefined;
    for (;;) {
      const page = await this.kv.list<CoverageMetadata>({ prefix, cursor });
      for (const entry of page.keys) {
        if (!entry.metadata) continue;
        const ident = entry.name.slice(prefix.length);
        if (ident.length === 0) continue;
        out.set(ident, entry.metadata.asOfRound);
      }
      if (page.list_complete) break;
      cursor = page.cursor;
      if (!cursor) break;
    }
    return out;
  }

  async savePlayerTrendsAggregate(
    aggregate: PlayerTrendsAggregate,
  ): Promise<void> {
    const key = aggregateKey(aggregate.year, aggregate.teamCode);
    try {
      await this.kv.put(key, encodePlayerTrendsAggregate(aggregate), {
        metadata: { asOfRound: aggregate.asOfRound } satisfies CoverageMetadata,
      });
    } catch (err) {
      if (isQuotaExhaustedError(err)) {
        throw new PlayerTrendsStoreQuotaExhaustedError(
          `KV daily write quota exhausted while writing ${key}`,
          err,
        );
      }
      throw err;
    }
  }
}
