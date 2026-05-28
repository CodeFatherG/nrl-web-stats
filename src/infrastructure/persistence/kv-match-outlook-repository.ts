/**
 * KvMatchOutlookRepository — Cloudflare Workers KV adapter for
 * MatchOutlookRepository.
 *
 * Feature: 037-analytics-cache-replacement (T011).
 */

import { z } from 'zod';
import {
  MatchOutlookStoreQuotaExhaustedError,
  type MatchOutlookAggregate,
  type MatchOutlookRepository,
} from '../../domain/repositories/match-outlook-repository.js';
import { parseEnvelopeJson } from './envelope.js';
import { wrapKvErrors } from './kv-errors.js';
import { pagedKvList } from './kv-list.js';

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

// ── Wire envelope (shape A2 RW-flat) ─────────────────────────────────────────

export const CURRENT_SCHEMA_VERSION = 1 as const;

const EnvelopeSchema = z.object({
  schemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
  asOfRound: z.number().int().nonnegative(),
  computedAt: z.string(),
  payload: z.object({
    year: z.number().int(),
    round: z.number().int(),
    outlook: z.unknown(),
  }),
});

export function encodeMatchOutlookAggregate(
  agg: MatchOutlookAggregate,
): string {
  return JSON.stringify({
    schemaVersion: CURRENT_SCHEMA_VERSION,
    asOfRound: agg.asOfRound,
    computedAt: agg.computedAt,
    payload: {
      year: agg.year,
      round: agg.round,
      outlook: agg.outlook,
    },
  });
}

function decodeMatchOutlookAggregate(
  raw: string | null,
): MatchOutlookAggregate | null {
  const env = parseEnvelopeJson(raw, EnvelopeSchema);
  if (!env) return null;
  return {
    year: env.payload.year,
    round: env.payload.round,
    asOfRound: env.asOfRound,
    computedAt: env.computedAt,
    outlook: env.payload.outlook as MatchOutlookAggregate['outlook'],
  };
}

// ── Adapter ──────────────────────────────────────────────────────────────────

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
    const entries = await pagedKvList<CoverageMetadata, [number, number]>({
      kv: this.kv,
      prefix,
      transform: (key, metadata) => {
        if (!metadata) return null;
        const round = parseRoundFromKey(key, prefix);
        return round === null ? null : [round, metadata.asOfRound];
      },
    });
    return new Map(entries);
  }

  async saveMatchOutlookAggregate(
    aggregate: MatchOutlookAggregate,
  ): Promise<void> {
    const key = aggregateKey(aggregate.year, aggregate.round);
    await wrapKvErrors({
      op: () =>
        this.kv.put(key, encodeMatchOutlookAggregate(aggregate), {
          metadata: { asOfRound: aggregate.asOfRound } satisfies CoverageMetadata,
        }),
      wrapQuotaAs: cause =>
        new MatchOutlookStoreQuotaExhaustedError(
          `KV daily write quota exhausted while writing ${key}`,
          cause,
        ),
    });
  }
}
