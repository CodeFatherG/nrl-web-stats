/**
 * KvCompositionImpactRepository — Cloudflare Workers KV adapter for
 * CompositionImpactRepository.
 *
 * Feature: 037-analytics-cache-replacement (T013).
 */

import { z } from 'zod';
import {
  CompositionImpactStoreQuotaExhaustedError,
  type CompositionImpactAggregate,
  type CompositionImpactRepository,
} from '../../domain/repositories/composition-impact-repository.js';
import { parseEnvelopeJson } from './envelope.js';
import { wrapKvErrors } from './kv-errors.js';
import { pagedKvList } from './kv-list.js';

const KEY_PREFIX = 'composition-impact:v1';

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
    impact: z.unknown(),
  }),
});

export function encodeCompositionImpactAggregate(
  agg: CompositionImpactAggregate,
): string {
  return JSON.stringify({
    schemaVersion: CURRENT_SCHEMA_VERSION,
    asOfRound: agg.asOfRound,
    computedAt: agg.computedAt,
    payload: {
      year: agg.year,
      teamCode: agg.teamCode,
      impact: agg.impact,
    },
  });
}

function decodeCompositionImpactAggregate(
  raw: string | null,
): CompositionImpactAggregate | null {
  const env = parseEnvelopeJson(raw, EnvelopeSchema);
  if (!env) return null;
  return {
    year: env.payload.year,
    teamCode: env.payload.teamCode,
    asOfRound: env.asOfRound,
    computedAt: env.computedAt,
    impact: env.payload.impact as CompositionImpactAggregate['impact'],
  };
}

// ── Adapter ──────────────────────────────────────────────────────────────────

export class KvCompositionImpactRepository
  implements CompositionImpactRepository
{
  constructor(private readonly kv: KVNamespace) {}

  async findCompositionImpactAggregate(
    year: number,
    teamCode: string,
  ): Promise<CompositionImpactAggregate | null> {
    const raw = await this.kv.get(aggregateKey(year, teamCode));
    return decodeCompositionImpactAggregate(raw);
  }

  async listCompositionImpactAsOfRounds(
    year: number,
  ): Promise<Map<string, number>> {
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

  async saveCompositionImpactAggregate(
    aggregate: CompositionImpactAggregate,
  ): Promise<void> {
    const key = aggregateKey(aggregate.year, aggregate.teamCode);
    await wrapKvErrors({
      op: () =>
        this.kv.put(key, encodeCompositionImpactAggregate(aggregate), {
          metadata: { asOfRound: aggregate.asOfRound } satisfies CoverageMetadata,
        }),
      wrapQuotaAs: cause =>
        new CompositionImpactStoreQuotaExhaustedError(
          `KV daily write quota exhausted while writing ${key}`,
          cause,
        ),
    });
  }
}
