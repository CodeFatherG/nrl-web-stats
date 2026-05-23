/**
 * Wire envelope for fixture artifacts persisted via the FixtureRepository
 * adapters. Identical JSON shape across KV and in-memory backends.
 *
 * Feature: 038-kv-fixture-repository.
 */

import { z } from 'zod';
import type { Fixture } from '../../models/fixture.js';
import type { FixtureArtifact } from '../../domain/repositories/fixture-repository.js';

/** Current envelope schema version. Bump on any backwards-incompatible
 *  change to the envelope or payload shape; older artifacts decode as
 *  `null` (miss) and the next scrape overwrites them. */
export const CURRENT_SCHEMA_VERSION = 1 as const;

// ── Envelope shape ───────────────────────────────────────────────────────────

export const FixtureEnvelopeSchema = z.object({
  schemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
  computedAt: z.string(),
  freshness: z.object({
    lastScrapedAt: z.string(),
  }),
  // Shallow validation: writers are trusted internal code, matching the
  // stance in player-movements-envelope.ts.
  payload: z.array(z.unknown()),
});

// ── Encode / decode ──────────────────────────────────────────────────────────

export function encodeArtifact(
  year: number,
  fixtures: readonly Fixture[],
): { value: string; metadata: { lastScrapedAt: string } } {
  const now = new Date().toISOString();
  const envelope = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    computedAt: now,
    freshness: { lastScrapedAt: now },
    payload: fixtures,
  };
  void year; // year is encoded in the KV key, not the envelope
  return {
    value: JSON.stringify(envelope),
    metadata: { lastScrapedAt: now },
  };
}

/**
 * Parse a stored envelope into a `FixtureArtifact`. Returns `null` on:
 *   - missing input (`raw === null`)
 *   - JSON parse failure
 *   - schema-version mismatch
 *   - envelope shape mismatch
 *
 * Treated as a miss; the next scrape overwrites the offending entry.
 */
export function decodeArtifact(
  year: number,
  raw: string | null,
): FixtureArtifact | null {
  if (raw === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const result = FixtureEnvelopeSchema.safeParse(parsed);
  if (!result.success) return null;
  const env = result.data;
  return {
    year,
    computedAt: env.computedAt,
    freshness: { lastScrapedAt: env.freshness.lastScrapedAt },
    payload: env.payload as readonly Fixture[],
  };
}

/**
 * Project an artifact to the public shape returned by the port. When
 * `teamCode` is provided, the payload is filtered to that team's rows.
 */
export function projectToPublic(
  artifact: FixtureArtifact,
  teamCode?: string,
): FixtureArtifact {
  if (teamCode === undefined) return artifact;
  const upper = teamCode.toUpperCase();
  return {
    ...artifact,
    payload: artifact.payload.filter(f => f.teamCode === upper),
  };
}
