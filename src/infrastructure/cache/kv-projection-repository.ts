/**
 * KvProjectionRepository — Cloudflare Workers KV adapter for the
 * ProjectionRepository port.
 *
 * All KV-specific concerns live here: key derivation, JSON envelope encoding,
 * quota-exhausted detection. The rest of the codebase imports only the domain
 * port (see src/domain/repositories/projection-repository.ts).
 *
 * Feature: 034-precomputed-projections (T010).
 */

import { z } from 'zod';
import {
  ProjectionStoreQuotaExhaustedError,
  type PlayerProjectionAggregate,
  type PrecomputeStatus,
  type ProjectionRepository,
  type TeamRankingsAggregate,
} from '../../domain/repositories/projection-repository.js';
import type { RankingMode } from '../../analytics/player-projection-types.js';
import { parseEnvelopeJson } from '../persistence/envelope.js';
import { wrapKvErrors } from '../persistence/kv-errors.js';
import { pagedKvList } from '../persistence/kv-list.js';

// ── Key derivation (internal — no caller should depend on these strings) ─────

const KEY_PREFIX = 'projections:v1';

function playerPrefix(year: number): string {
  return `${KEY_PREFIX}:${year}:player:`;
}

function playerKey(year: number, playerId: string): string {
  return `${playerPrefix(year)}${playerId}`;
}

function teamRankingsPrefix(year: number): string {
  return `${KEY_PREFIX}:${year}:team-rankings:`;
}

function teamRankingsKey(year: number, teamCode: string, mode: RankingMode): string {
  return `${teamRankingsPrefix(year)}${teamCode}:${mode}`;
}

function statusKey(year: number): string {
  return `${KEY_PREFIX}:${year}:status`;
}

interface CoverageMetadata {
  readonly asOfRound: number;
}

// ── Wire envelopes (shape A2 RW-flat — three subtypes) ──────────────────────

/** Current envelope schema version. Bump when aggregate shapes evolve in
 *  a backwards-incompatible way; older artifacts will read as misses, and the
 *  next precompute will overwrite them. */
export const CURRENT_SCHEMA_VERSION = 1 as const;

const EnvelopeBaseSchema = z.object({
  schemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
  asOfRound: z.number().int().nonnegative(),
  computedAt: z.string(),
  // payload is validated by the caller using one of the payload schemas below.
  payload: z.unknown(),
});

// We do NOT redeclare the full PlayerProjectionProfile / ContextualProfileResult
// shapes here — they are already typed in the analytics module. We accept any
// object at the wire-validation layer; type safety on read is restored via the
// `as ...` casts after envelope validation succeeds.

const PlayerAggregatePayloadSchema = z.object({
  playerId: z.string(),
  year: z.number().int(),
  baseProfile: z.unknown(),
  contextualProfile: z.unknown(),
});

const TeamRankingsPayloadSchema = z.object({
  year: z.number().int(),
  teamCode: z.string(),
  mode: z.enum(['composite', 'captaincy', 'selection', 'trade']),
  rankings: z.unknown(),
});

const PrecomputeStatusPayloadSchema = z.object({
  year: z.number().int(),
  asOfRound: z.number().int().nonnegative(),
});

export function encodePlayerAggregate(agg: PlayerProjectionAggregate): string {
  return JSON.stringify({
    schemaVersion: CURRENT_SCHEMA_VERSION,
    asOfRound: agg.asOfRound,
    computedAt: agg.computedAt,
    payload: {
      playerId: agg.playerId,
      year: agg.year,
      baseProfile: agg.baseProfile,
      contextualProfile: agg.contextualProfile,
    },
  });
}

export function encodeTeamRankingsAggregate(agg: TeamRankingsAggregate): string {
  return JSON.stringify({
    schemaVersion: CURRENT_SCHEMA_VERSION,
    asOfRound: agg.asOfRound,
    computedAt: agg.computedAt,
    payload: {
      year: agg.year,
      teamCode: agg.teamCode,
      mode: agg.mode,
      rankings: agg.rankings,
    },
  });
}

export function encodePrecomputeStatus(status: PrecomputeStatus): string {
  return JSON.stringify({
    schemaVersion: CURRENT_SCHEMA_VERSION,
    asOfRound: status.asOfRound,
    computedAt: new Date().toISOString(),
    payload: {
      year: status.year,
      asOfRound: status.asOfRound,
    },
  });
}

function decodePlayerAggregate(raw: string | null): PlayerProjectionAggregate | null {
  const env = parseEnvelopeJson(raw, EnvelopeBaseSchema);
  if (!env) return null;
  const payload = PlayerAggregatePayloadSchema.safeParse(env.payload);
  if (!payload.success) return null;
  return {
    playerId: payload.data.playerId,
    year: payload.data.year,
    asOfRound: env.asOfRound,
    computedAt: env.computedAt,
    baseProfile: payload.data.baseProfile as PlayerProjectionAggregate['baseProfile'],
    contextualProfile: payload.data.contextualProfile as PlayerProjectionAggregate['contextualProfile'],
  };
}

function decodeTeamRankingsAggregate(raw: string | null): TeamRankingsAggregate | null {
  const env = parseEnvelopeJson(raw, EnvelopeBaseSchema);
  if (!env) return null;
  const payload = TeamRankingsPayloadSchema.safeParse(env.payload);
  if (!payload.success) return null;
  return {
    year: payload.data.year,
    teamCode: payload.data.teamCode,
    mode: payload.data.mode,
    asOfRound: env.asOfRound,
    computedAt: env.computedAt,
    rankings: payload.data.rankings as TeamRankingsAggregate['rankings'],
  };
}

function decodePrecomputeStatus(raw: string | null): PrecomputeStatus | null {
  const env = parseEnvelopeJson(raw, EnvelopeBaseSchema);
  if (!env) return null;
  const payload = PrecomputeStatusPayloadSchema.safeParse(env.payload);
  if (!payload.success) return null;
  return {
    year: payload.data.year,
    asOfRound: payload.data.asOfRound,
  };
}

// ── Adapter ──────────────────────────────────────────────────────────────────

export class KvProjectionRepository implements ProjectionRepository {
  constructor(private readonly kv: KVNamespace) {}

  // Read side -----------------------------------------------------------------

  async findPlayerAggregate(
    year: number,
    playerId: string,
  ): Promise<PlayerProjectionAggregate | null> {
    const raw = await this.kv.get(playerKey(year, playerId));
    return decodePlayerAggregate(raw);
  }

  async findTeamRankingsAggregate(
    year: number,
    teamCode: string,
    mode: RankingMode,
  ): Promise<TeamRankingsAggregate | null> {
    const raw = await this.kv.get(teamRankingsKey(year, teamCode, mode));
    return decodeTeamRankingsAggregate(raw);
  }

  async findPrecomputeStatus(year: number): Promise<PrecomputeStatus | null> {
    const raw = await this.kv.get(statusKey(year));
    return decodePrecomputeStatus(raw);
  }

  // Write side ----------------------------------------------------------------

  async listPlayerAggregateAsOfRounds(year: number): Promise<Map<string, number>> {
    return this.listCoverage(playerPrefix(year), key => key.slice(playerPrefix(year).length));
  }

  async listTeamRankingsAsOfRounds(year: number): Promise<Map<string, number>> {
    return this.listCoverage(teamRankingsPrefix(year), key => key.slice(teamRankingsPrefix(year).length));
  }

  // Write side ----------------------------------------------------------------

  async savePlayerAggregate(aggregate: PlayerProjectionAggregate): Promise<void> {
    await this.put(
      playerKey(aggregate.year, aggregate.playerId),
      encodePlayerAggregate(aggregate),
      { asOfRound: aggregate.asOfRound },
    );
  }

  async saveTeamRankingsAggregate(aggregate: TeamRankingsAggregate): Promise<void> {
    await this.put(
      teamRankingsKey(aggregate.year, aggregate.teamCode, aggregate.mode),
      encodeTeamRankingsAggregate(aggregate),
      { asOfRound: aggregate.asOfRound },
    );
  }

  async savePrecomputeStatus(status: PrecomputeStatus): Promise<void> {
    await this.put(statusKey(status.year), encodePrecomputeStatus(status));
  }

  // Internal helpers ---------------------------------------------------------

  private async put(key: string, value: string, metadata?: CoverageMetadata): Promise<void> {
    await wrapKvErrors({
      op: () => this.kv.put(key, value, metadata ? { metadata } : undefined),
      wrapQuotaAs: cause =>
        new ProjectionStoreQuotaExhaustedError(
          `KV daily write quota exhausted while writing ${key}`,
          cause,
        ),
    });
  }

  /** Page through `kv.list({ prefix })` and project each entry to its
   *  asOfRound metadata. Entries without metadata are skipped (legacy writes
   *  pre-dating the coverage probe) — they'll be treated as "stale" by the
   *  predicate and re-precomputed on the next discovery tick. */
  private async listCoverage(
    prefix: string,
    keyToIdent: (key: string) => string,
  ): Promise<Map<string, number>> {
    const entries = await pagedKvList<CoverageMetadata, [string, number]>({
      kv: this.kv,
      prefix,
      transform: (key, metadata) => {
        if (!metadata) return null;
        const ident = keyToIdent(key);
        return ident.length === 0 ? null : [ident, metadata.asOfRound];
      },
    });
    return new Map(entries);
  }
}
