/**
 * KvPlayerTrendsRepository — Cloudflare Workers KV adapter for
 * PlayerTrendsRepository.
 *
 * Feature: 037-analytics-cache-replacement (T012).
 */

import { z } from 'zod';
import {
  PlayerTrendsStoreQuotaExhaustedError,
  type PlayerTrendsAggregate,
  type PlayerTrendsRepository,
} from '../../domain/repositories/player-trends-repository.js';
import { parseEnvelopeJson } from './envelope.js';
import { wrapKvErrors } from './kv-errors.js';
import { pagedKvList } from './kv-list.js';

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

// ── Wire envelope (shape A2 RW-flat) ─────────────────────────────────────────

export const CURRENT_SCHEMA_VERSION = 1 as const;

const EnvelopeSchema = z.object({
  schemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
  asOfRound: z.number().int().nonnegative(),
  computedAt: z.string(),
  payload: z.object({
    year: z.number().int(),
    teamCode: z.string(),
    trends: z.unknown(),
  }),
});

export function encodePlayerTrendsAggregate(
  agg: PlayerTrendsAggregate,
): string {
  return JSON.stringify({
    schemaVersion: CURRENT_SCHEMA_VERSION,
    asOfRound: agg.asOfRound,
    computedAt: agg.computedAt,
    payload: {
      year: agg.year,
      teamCode: agg.teamCode,
      trends: agg.trends,
    },
  });
}

function decodePlayerTrendsAggregate(
  raw: string | null,
): PlayerTrendsAggregate | null {
  const env = parseEnvelopeJson(raw, EnvelopeSchema);
  if (!env) return null;
  return {
    year: env.payload.year,
    teamCode: env.payload.teamCode,
    asOfRound: env.asOfRound,
    computedAt: env.computedAt,
    trends: env.payload.trends as PlayerTrendsAggregate['trends'],
  };
}

// ── Adapter ──────────────────────────────────────────────────────────────────

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
    const entries = await pagedKvList<CoverageMetadata, [string, number]>({
      kv: this.kv,
      prefix,
      transform: (key, metadata) => {
        if (!metadata) return null;
        const ident = key.slice(prefix.length);
        return ident.length === 0 ? null : [ident, metadata.asOfRound];
      },
    });
    return new Map(entries);
  }

  async savePlayerTrendsAggregate(
    aggregate: PlayerTrendsAggregate,
  ): Promise<void> {
    const key = aggregateKey(aggregate.year, aggregate.teamCode);
    await wrapKvErrors({
      op: () =>
        this.kv.put(key, encodePlayerTrendsAggregate(aggregate), {
          metadata: { asOfRound: aggregate.asOfRound } satisfies CoverageMetadata,
        }),
      wrapQuotaAs: cause =>
        new PlayerTrendsStoreQuotaExhaustedError(
          `KV daily write quota exhausted while writing ${key}`,
          cause,
        ),
    });
  }
}
