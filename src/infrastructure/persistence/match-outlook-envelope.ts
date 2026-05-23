/**
 * Wire envelope for match-outlook aggregates.
 *
 * Feature: 037-analytics-cache-replacement (T007).
 */

import { z } from 'zod';
import type { MatchOutlookAggregate } from '../../domain/repositories/match-outlook-repository.js';

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

export function decodeMatchOutlookAggregate(
  raw: string | null,
): MatchOutlookAggregate | null {
  if (raw === null) return null;
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  const result = EnvelopeSchema.safeParse(json);
  if (!result.success) return null;
  const env = result.data;
  return {
    year: env.payload.year,
    round: env.payload.round,
    asOfRound: env.asOfRound,
    computedAt: env.computedAt,
    outlook: env.payload.outlook as MatchOutlookAggregate['outlook'],
  };
}
