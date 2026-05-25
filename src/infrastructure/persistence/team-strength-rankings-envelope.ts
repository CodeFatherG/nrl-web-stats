/**
 * Wire envelope for team-strength-rankings sub-artifacts (feature 039).
 *
 * Mirrors the structural pattern of `team-form-envelope.ts` / spec 037; one
 * codec per sub-artifact subtype. Generalisation into a shared helper is a
 * deferred follow-up (spec non-goal).
 */

import { z } from 'zod';
import type {
  SeasonThresholds,
  StrengthCategory,
  TeamRoundRanking,
  TeamSeasonRanking,
} from '../../models/types.js';

export const CURRENT_SCHEMA_VERSION = 1 as const;

// ── Shared shapes ──────────────────────────────────────────────────────────

const StrengthCategoryEnum = z.enum(['hard', 'medium', 'easy']);

const SeasonThresholdsSchema = z.object({
  p33: z.number(),
  p67: z.number(),
  lowerFence: z.number(),
  upperFence: z.number(),
});

const TeamRoundRankingSchema = z.object({
  teamCode: z.string(),
  year: z.number().int(),
  round: z.number().int().positive(),
  strengthRating: z.number(),
  percentile: z.number(),
  category: StrengthCategoryEnum,
  opponentCode: z.string().nullable(),
  isHome: z.boolean(),
  isBye: z.boolean(),
});

const TeamSeasonRankingSchema = z.object({
  teamCode: z.string(),
  year: z.number().int(),
  totalStrength: z.number(),
  averageStrength: z.number(),
  matchCount: z.number().int().nonnegative(),
  byeCount: z.number().int().nonnegative(),
  percentile: z.number(),
  category: StrengthCategoryEnum,
  rounds: z.array(TeamRoundRankingSchema),
});

// ── Envelopes (per sub-artifact subtype) ──────────────────────────────────

const ThresholdsEnvelopeSchema = z.object({
  schemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
  computedAt: z.string(),
  asOfRound: z.number().int().nonnegative(),
  payload: SeasonThresholdsSchema,
});

const SeasonEnvelopeSchema = z.object({
  schemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
  computedAt: z.string(),
  asOfRound: z.number().int().nonnegative(),
  payload: z.array(z.tuple([z.string(), TeamSeasonRankingSchema])),
});

const RoundEnvelopeSchema = z.object({
  schemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
  computedAt: z.string(),
  asOfRound: z.number().int().nonnegative(),
  payload: z.array(z.tuple([z.string(), TeamRoundRankingSchema])),
});

// ── Encode / decode helpers ────────────────────────────────────────────────

export function encodeThresholdsEnvelope(
  asOfRound: number,
  computedAt: string,
  thresholds: SeasonThresholds,
): string {
  return JSON.stringify({
    schemaVersion: CURRENT_SCHEMA_VERSION,
    computedAt,
    asOfRound,
    payload: thresholds,
  });
}

export function decodeThresholdsEnvelope(raw: string | null): SeasonThresholds | null {
  if (raw === null) return null;
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  const result = ThresholdsEnvelopeSchema.safeParse(json);
  if (!result.success) return null;
  return result.data.payload;
}

export function encodeSeasonEnvelope(
  asOfRound: number,
  computedAt: string,
  season: ReadonlyMap<string, TeamSeasonRanking>,
): string {
  return JSON.stringify({
    schemaVersion: CURRENT_SCHEMA_VERSION,
    computedAt,
    asOfRound,
    payload: Array.from(season.entries()),
  });
}

export function decodeSeasonEnvelope(
  raw: string | null,
): ReadonlyMap<string, TeamSeasonRanking> | null {
  if (raw === null) return null;
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  const result = SeasonEnvelopeSchema.safeParse(json);
  if (!result.success) return null;
  const map = new Map<string, TeamSeasonRanking>();
  for (const [code, ranking] of result.data.payload) {
    map.set(code, {
      ...ranking,
      category: ranking.category as StrengthCategory,
      rounds: ranking.rounds.map(r => ({
        ...r,
        category: r.category as StrengthCategory,
      })),
    });
  }
  return map;
}

export function encodeRoundEnvelope(
  asOfRound: number,
  computedAt: string,
  rounds: ReadonlyMap<string, TeamRoundRanking>,
): string {
  return JSON.stringify({
    schemaVersion: CURRENT_SCHEMA_VERSION,
    computedAt,
    asOfRound,
    payload: Array.from(rounds.entries()),
  });
}

export function decodeRoundEnvelope(
  raw: string | null,
): ReadonlyMap<string, TeamRoundRanking> | null {
  if (raw === null) return null;
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  const result = RoundEnvelopeSchema.safeParse(json);
  if (!result.success) return null;
  const map = new Map<string, TeamRoundRanking>();
  for (const [code, ranking] of result.data.payload) {
    map.set(code, {
      ...ranking,
      category: ranking.category as StrengthCategory,
    });
  }
  return map;
}
