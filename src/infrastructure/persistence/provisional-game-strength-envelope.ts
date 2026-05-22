/**
 * Wire envelope for provisional game-strength artifacts stored via the
 * ProvisionalGameStrengthRepository adapters. The envelope is intentionally
 * generic so the same JSON works under any backend.
 *
 * Feature: 036-game-strength-artifact (T005).
 *
 * Note: this is a near-copy of `player-movements-envelope.ts`.
 * Generalisation into a shared helper is intentionally deferred — three
 * concrete cases (specs 034/035/036) is the threshold under discussion but
 * not yet acted on (plan §Out-of-scope).
 */

import { z } from 'zod';
import type { RoundGSR } from '../../domain/game-strength.js';

/** Current envelope schema version. Bump when the artifact shape evolves
 *  in a backwards-incompatible way; older artifacts will read as misses,
 *  and the next recompute will overwrite them. */
export const CURRENT_SCHEMA_VERSION = 1 as const;

// ── Envelope shape ───────────────────────────────────────────────────────────

const EnvelopeSchema = z.object({
  schemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
  computedAt: z.string(),
  // payload is shallow-validated — RoundGSR is produced by our own trusted
  // code; we don't deep-validate every field, just confirm it's a typed
  // object with the identity components present.
  payload: z.object({
    year: z.number().int(),
    round: z.number().int(),
    leagueAvgTeamScore: z.number(),
    matches: z.array(z.unknown()),
    methodology: z.object({}).passthrough(),
  }).passthrough(),
});

// ── Encode / decode ──────────────────────────────────────────────────────────

export function encode(gsr: RoundGSR): string {
  return JSON.stringify({
    schemaVersion: CURRENT_SCHEMA_VERSION,
    computedAt: new Date().toISOString(),
    payload: gsr,
  });
}

/**
 * Parse a stored envelope and return the unwrapped RoundGSR payload.
 *
 * Returns `null` on:
 *   - missing input (`raw === null`)
 *   - JSON parse failure
 *   - schema version mismatch
 *   - envelope shape mismatch
 *
 * These are treated as misses (FR-020) — the next recompute will overwrite
 * the offending entry.
 */
export function decode(raw: string | null): RoundGSR | null {
  if (raw === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const result = EnvelopeSchema.safeParse(parsed);
  if (!result.success) return null;
  // Trust the writer to have produced a well-typed RoundGSR; the envelope
  // shape check above caught any structural drift.
  return result.data.payload as unknown as RoundGSR;
}
