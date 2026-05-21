/**
 * Wire envelope for player-movements artifacts stored via the
 * PlayerMovementsRepository adapters. The envelope is intentionally generic so
 * the same JSON works under any backend.
 *
 * The domain error class lives in
 * `src/domain/repositories/player-movements-repository.ts` — this file is
 * adapter-side and owns no contract-bearing types.
 *
 * Feature: 035-player-movements-artifact (T006).
 *
 * Note: this is a near-copy of `src/infrastructure/cache/projection-envelope.ts`.
 * Generalisation into a shared helper is intentionally deferred until a third
 * artifact type lands (plan §Out-of-scope).
 */

import { z } from 'zod';
import type { PlayerMovementsArtifact } from '../../domain/repositories/player-movements-repository.js';
import type { PlayerMovementsResult } from '../../domain/player-movements.js';

/** Current envelope schema version. Bump when the artifact shape evolves in
 *  a backwards-incompatible way; older artifacts will read as misses, and the
 *  next precompute will overwrite them. */
export const CURRENT_SCHEMA_VERSION = 1 as const;

// ── Envelope shape ───────────────────────────────────────────────────────────

const EnvelopeSchema = z.object({
  schemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
  computedAt: z.string(),
  // payload is shallow-validated here; the writer is our own trusted code, so
  // we don't deep-validate every record.
  payload: z.object({
    year: z.number().int(),
    round: z.number().int(),
    season: z.number().int(),
    noPreviousRound: z.boolean().optional(),
    injured: z.array(z.unknown()),
    dropped: z.array(z.unknown()),
    benched: z.array(z.unknown()),
    returningFromInjury: z.array(z.unknown()),
    coveringInjury: z.array(z.unknown()),
    promoted: z.array(z.unknown()),
    positionChanged: z.array(z.unknown()),
  }),
});

// ── Encode / decode ──────────────────────────────────────────────────────────

export function encodeArtifact(artifact: PlayerMovementsArtifact): string {
  return JSON.stringify({
    schemaVersion: CURRENT_SCHEMA_VERSION,
    computedAt: artifact.computedAt,
    payload: {
      year: artifact.year,
      round: artifact.round,
      season: artifact.season,
      ...(artifact.noPreviousRound !== undefined && {
        noPreviousRound: artifact.noPreviousRound,
      }),
      injured: artifact.injured,
      dropped: artifact.dropped,
      benched: artifact.benched,
      returningFromInjury: artifact.returningFromInjury,
      coveringInjury: artifact.coveringInjury,
      promoted: artifact.promoted,
      positionChanged: artifact.positionChanged,
    },
  });
}

/**
 * Parse a stored envelope and return the unwrapped artifact.
 *
 * Returns `null` on:
 *   - missing input (`raw === null`)
 *   - JSON parse failure
 *   - schema version mismatch
 *   - envelope shape mismatch
 *
 * These are treated as misses (FR-015) — the next precompute will overwrite
 * the offending entry.
 */
export function decodeArtifact(
  raw: string | null,
): PlayerMovementsArtifact | null {
  if (raw === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const result = EnvelopeSchema.safeParse(parsed);
  if (!result.success) return null;
  const env = result.data;
  // Re-cast the shallow-validated payload to the typed artifact. Safe because
  // writers always produce the typed shape; readers tolerant of unknown values
  // would already have failed the envelope schema check above.
  return {
    year: env.payload.year,
    round: env.payload.round,
    computedAt: env.computedAt,
    season: env.payload.season,
    ...(env.payload.noPreviousRound !== undefined && {
      noPreviousRound: env.payload.noPreviousRound,
    }),
    injured: env.payload.injured as PlayerMovementsArtifact['injured'],
    dropped: env.payload.dropped as PlayerMovementsArtifact['dropped'],
    benched: env.payload.benched as PlayerMovementsArtifact['benched'],
    returningFromInjury: env.payload.returningFromInjury as PlayerMovementsArtifact['returningFromInjury'],
    coveringInjury: env.payload.coveringInjury as PlayerMovementsArtifact['coveringInjury'],
    promoted: env.payload.promoted as PlayerMovementsArtifact['promoted'],
    positionChanged: env.payload.positionChanged as PlayerMovementsArtifact['positionChanged'],
  };
}

/**
 * Project an artifact to the public `PlayerMovementsResult` shape — strips
 * storage-internal fields (`computedAt`, the duplicate `year` identity
 * component). Used by both adapters' `findByYearAndRound`.
 */
export function projectToPublic(
  artifact: PlayerMovementsArtifact,
): PlayerMovementsResult {
  return {
    season: artifact.season,
    round: artifact.round,
    ...(artifact.noPreviousRound !== undefined && {
      noPreviousRound: artifact.noPreviousRound,
    }),
    injured: artifact.injured,
    dropped: artifact.dropped,
    benched: artifact.benched,
    returningFromInjury: artifact.returningFromInjury,
    coveringInjury: artifact.coveringInjury,
    promoted: artifact.promoted,
    positionChanged: artifact.positionChanged,
  };
}
