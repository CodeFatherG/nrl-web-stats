/**
 * Wire envelope for player-trends aggregates.
 *
 * Feature: 037-analytics-cache-replacement (T008).
 */

import { z } from 'zod';
import type { PlayerTrendsAggregate } from '../../domain/repositories/player-trends-repository.js';

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

export function decodePlayerTrendsAggregate(
  raw: string | null,
): PlayerTrendsAggregate | null {
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
    teamCode: env.payload.teamCode,
    asOfRound: env.asOfRound,
    computedAt: env.computedAt,
    trends: env.payload.trends as PlayerTrendsAggregate['trends'],
  };
}
