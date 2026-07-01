/**
 * KvTeamFormRepository — Cloudflare Workers KV adapter for TeamFormRepository.
 *
 * Feature: 037-analytics-cache-replacement (T010).
 */

import { z } from 'zod';
import {
  TeamFormStoreQuotaExhaustedError,
  type TeamFormAggregate,
  type TeamFormRepository,
} from '../../domain/repositories/team-form-repository.js';
import { parseEnvelopeJson } from './envelope.js';
import { wrapKvErrors } from './kv-errors.js';
import { pagedKvList } from './kv-list.js';

const KEY_PREFIX = 'team-form:v1';

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
    trajectory: z.unknown(),
  }),
});

export function encodeTeamFormAggregate(agg: TeamFormAggregate): string {
  return JSON.stringify({
    schemaVersion: CURRENT_SCHEMA_VERSION,
    asOfRound: agg.asOfRound,
    computedAt: agg.computedAt,
    payload: {
      year: agg.year,
      teamCode: agg.teamCode,
      trajectory: agg.trajectory,
    },
  });
}

function decodeTeamFormAggregate(raw: string | null): TeamFormAggregate | null {
  const env = parseEnvelopeJson(raw, EnvelopeSchema);
  if (!env) return null;
  return {
    year: env.payload.year,
    teamCode: env.payload.teamCode,
    asOfRound: env.asOfRound,
    computedAt: env.computedAt,
    trajectory: env.payload.trajectory as TeamFormAggregate['trajectory'],
  };
}

// ── Adapter ──────────────────────────────────────────────────────────────────

export class KvTeamFormRepository implements TeamFormRepository {
  constructor(private readonly kv: KVNamespace) {}

  async findTeamFormAggregate(
    year: number,
    teamCode: string,
  ): Promise<TeamFormAggregate | null> {
    const raw = await this.kv.get(aggregateKey(year, teamCode));
    return decodeTeamFormAggregate(raw);
  }

  async listTeamFormAsOfRounds(year: number): Promise<Map<string, number>> {
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

  async saveTeamFormAggregate(aggregate: TeamFormAggregate): Promise<void> {
    const key = aggregateKey(aggregate.year, aggregate.teamCode);
    await wrapKvErrors({
      op: () =>
        this.kv.put(key, encodeTeamFormAggregate(aggregate), {
          metadata: { asOfRound: aggregate.asOfRound } satisfies CoverageMetadata,
        }),
      wrapQuotaAs: cause =>
        new TeamFormStoreQuotaExhaustedError(
          `KV daily write quota exhausted while writing ${key}`,
          cause,
        ),
    });
  }
}
