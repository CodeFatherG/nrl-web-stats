/**
 * Wire envelope + KV key layout for the match-results scrape watermark
 * (feature 040).
 *
 * Naming divergence from spec-037/038/039 precedents: those carry a
 * `payload` field of derived data; this watermark has no payload, only
 * state. The envelope therefore uses a `state` field. See spec 040
 * research.md §6 for the reasoning.
 */

import { z } from 'zod';

export const CURRENT_SCHEMA_VERSION = 1 as const;

const WatermarkStateSchema = z.object({
  lastScrapedAt: z.string(),
  allCompleted: z.boolean(),
});

const WatermarkEnvelopeSchema = z.object({
  schemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
  computedAt: z.string(),
  state: WatermarkStateSchema,
});

export interface WatermarkState {
  readonly lastScrapedAt: string;
  readonly allCompleted: boolean;
}

export function encodeWatermarkEnvelope(
  state: WatermarkState,
  computedAt: string,
): string {
  return JSON.stringify({
    schemaVersion: CURRENT_SCHEMA_VERSION,
    computedAt,
    state,
  });
}

export function decodeWatermarkEnvelope(raw: string | null): WatermarkState | null {
  if (raw === null) return null;
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  const result = WatermarkEnvelopeSchema.safeParse(json);
  if (!result.success) return null;
  return result.data.state;
}

// ── KV key layout ──────────────────────────────────────────────────────────

export const KEY_PREFIX = 'match-results-scrape:v1';

export function keyFor(year: number, round: number): string {
  return `${KEY_PREFIX}:${year}:${round}`;
}

export function keyPrefixForYear(year: number): string {
  return `${KEY_PREFIX}:${year}:`;
}
