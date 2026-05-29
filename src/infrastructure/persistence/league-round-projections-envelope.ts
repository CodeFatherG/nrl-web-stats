/**
 * Wire envelope for league-round-projections artifacts. Same shape pattern
 * as player-movements-envelope: schemaVersion + computedAt + payload.
 */

import { z } from 'zod';
import type { LeagueRoundProjectionsArtifact } from '../../domain/repositories/league-round-projections-repository.js';
import { parseEnvelopeJson } from './envelope.js';

export const CURRENT_SCHEMA_VERSION = 1 as const;

const BreakEvenRowSchema = z.object({
  playerId: z.string().nullable(),
  playerName: z.string(),
  teamCode: z.string(),
  scPosition: z.string().nullable(),
  price: z.number(),
  breakEven: z.number(),
});

const ProjectionRowSchema = z.object({
  playerId: z.string(),
  playerName: z.string(),
  teamCode: z.string(),
  position: z.string(),
  opponent: z.string(),
  venue: z.string().nullable(),
  baseTotal: z.number(),
  adjustedTotal: z.number(),
  adjustedFloor: z.number(),
  adjustedCeiling: z.number(),
  rank: z.number().int(),
});

const EnvelopeSchema = z.object({
  schemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
  computedAt: z.string(),
  payload: z.object({
    year: z.number().int(),
    round: z.number().int(),
    asOfRound: z.number().int(),
    breakEvens: z.object({
      top: z.array(BreakEvenRowSchema),
      bottom: z.array(BreakEvenRowSchema),
    }),
    scorers: z.array(ProjectionRowSchema),
    captains: z.array(ProjectionRowSchema),
  }),
});

export function encodeArtifact(artifact: LeagueRoundProjectionsArtifact): string {
  return JSON.stringify({
    schemaVersion: CURRENT_SCHEMA_VERSION,
    computedAt: artifact.computedAt,
    payload: {
      year: artifact.year,
      round: artifact.round,
      asOfRound: artifact.asOfRound,
      breakEvens: artifact.breakEvens,
      scorers: artifact.scorers,
      captains: artifact.captains,
    },
  });
}

export function decodeArtifact(raw: string | null): LeagueRoundProjectionsArtifact | null {
  const env = parseEnvelopeJson(raw, EnvelopeSchema);
  if (!env) return null;
  return {
    year: env.payload.year,
    round: env.payload.round,
    asOfRound: env.payload.asOfRound,
    computedAt: env.computedAt,
    breakEvens: env.payload.breakEvens,
    scorers: env.payload.scorers,
    captains: env.payload.captains,
  };
}
