/**
 * Wire envelope for team-form aggregates. Structural copy of
 * `src/infrastructure/cache/projection-envelope.ts` — generalisation into a
 * shared helper is deferred (spec non-goal).
 *
 * Feature: 037-analytics-cache-replacement (T006).
 */

import { z } from 'zod';
import type { TeamFormAggregate } from '../../domain/repositories/team-form-repository.js';

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

export function decodeTeamFormAggregate(
  raw: string | null,
): TeamFormAggregate | null {
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
    trajectory: env.payload.trajectory as TeamFormAggregate['trajectory'],
  };
}
