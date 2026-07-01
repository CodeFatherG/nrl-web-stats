/**
 * Shared KV-envelope parse helper.
 *
 * Centralises the JSON.parse + safeParse + null-on-failure dance previously
 * duplicated across every artifact-repository envelope file. The caller's Zod
 * schema fully determines the on-disk wire shape — this helper is
 * shape-agnostic. See `specs/041-kv-envelope-extraction/contracts/envelope.md`.
 */

import type { z } from 'zod';

/**
 * Parse a JSON-encoded envelope through the caller's Zod schema. Returns
 * `null` on missing input, JSON.parse failure, or schema-validation failure
 * (including `schemaVersion` mismatch when the caller's schema uses
 * `z.literal(N)`). Never throws.
 */
export function parseEnvelopeJson<T>(
  raw: string | null,
  schema: z.ZodType<T>,
): T | null {
  if (raw === null) return null;
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  const result = schema.safeParse(json);
  return result.success ? result.data : null;
}
