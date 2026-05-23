/**
 * Wire envelope for composition-impact aggregates.
 *
 * Feature: 037-analytics-cache-replacement (T009).
 */

import { z } from 'zod';
import type { CompositionImpactAggregate } from '../../domain/repositories/composition-impact-repository.js';

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

export function decodeCompositionImpactAggregate(
  raw: string | null,
): CompositionImpactAggregate | null {
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
    impact: env.payload.impact as CompositionImpactAggregate['impact'],
  };
}
