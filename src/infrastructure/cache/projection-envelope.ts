/**
 * Wire envelope for projection artifacts stored via the ProjectionRepository
 * adapters. The envelope is intentionally generic so the same JSON works under
 * any backend (Cloudflare KV today; Upstash or others tomorrow).
 *
 * The domain error class lives in `src/domain/repositories/projection-repository.ts`
 * — this file is adapter-side and owns no contract-bearing types.
 *
 * Feature: 034-precomputed-projections (T006).
 */

import { z } from 'zod';
import type {
  PlayerProjectionAggregate,
  TeamRankingsAggregate,
  PrecomputeStatus,
} from '../../domain/repositories/projection-repository.js';

/** Current envelope schema version. Bump when aggregate shapes evolve in
 *  a backwards-incompatible way; older artifacts will read as misses, and the
 *  next precompute will overwrite them. */
export const CURRENT_SCHEMA_VERSION = 1 as const;

// ── Envelope shape ───────────────────────────────────────────────────────────

const EnvelopeBaseSchema = z.object({
  schemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
  asOfRound: z.number().int().nonnegative(),
  computedAt: z.string(),
  // payload is validated by the caller using one of the payload schemas below.
  payload: z.unknown(),
});

type Envelope = z.infer<typeof EnvelopeBaseSchema>;

// ── Payload schemas ──────────────────────────────────────────────────────────
// We do NOT redeclare the full PlayerProjectionProfile / ContextualProfileResult
// shapes here — they are already typed in the analytics module. We accept any
// object at the wire-validation layer; type safety on read is restored via the
// `as PlayerProjectionAggregate` cast after envelope validation succeeds.
//
// The reason we do not deep-validate the payload: the writer is our own
// trusted code (the precompute use case), the payload is large, and a
// schema-mismatch on the envelope itself is the signal we use to invalidate
// old artifacts after a deploy.

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

// ── Encode helpers ───────────────────────────────────────────────────────────

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

// ── Decode helpers — return null on parse / schema-version failure ───────────

function parseEnvelope(raw: string | null): Envelope | null {
  if (raw === null) return null;
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  const result = EnvelopeBaseSchema.safeParse(json);
  return result.success ? result.data : null;
}

export function decodePlayerAggregate(raw: string | null): PlayerProjectionAggregate | null {
  const env = parseEnvelope(raw);
  if (!env) return null;
  const payload = PlayerAggregatePayloadSchema.safeParse(env.payload);
  if (!payload.success) return null;
  return {
    playerId: payload.data.playerId,
    year: payload.data.year,
    asOfRound: env.asOfRound,
    computedAt: env.computedAt,
    // Trust the writer; we only validated the envelope structure.
    baseProfile: payload.data.baseProfile as PlayerProjectionAggregate['baseProfile'],
    contextualProfile: payload.data.contextualProfile as PlayerProjectionAggregate['contextualProfile'],
  };
}

export function decodeTeamRankingsAggregate(raw: string | null): TeamRankingsAggregate | null {
  const env = parseEnvelope(raw);
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

export function decodePrecomputeStatus(raw: string | null): PrecomputeStatus | null {
  const env = parseEnvelope(raw);
  if (!env) return null;
  const payload = PrecomputeStatusPayloadSchema.safeParse(env.payload);
  if (!payload.success) return null;
  return {
    year: payload.data.year,
    asOfRound: payload.data.asOfRound,
  };
}
