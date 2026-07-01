/**
 * KvProvisionalGameStrengthRepository — Cloudflare Workers KV adapter for the
 * ProvisionalGameStrengthRepository port.
 *
 * All KV-specific concerns live here: key derivation, JSON envelope
 * encoding, quota-exhausted detection. The rest of the codebase imports
 * only the domain port (see
 * src/domain/repositories/provisional-game-strength-repository.ts).
 *
 * Feature: 036-game-strength-artifact (T007).
 */

import { z } from 'zod';
import type { RoundGSR } from '../../domain/game-strength.js';
import {
  ProvisionalGameStrengthStoreQuotaExhaustedError,
  type ProvisionalGameStrengthRepository,
} from '../../domain/repositories/provisional-game-strength-repository.js';
import { logger } from '../../utils/logger.js';
import { parseEnvelopeJson } from './envelope.js';
import { wrapKvErrors } from './kv-errors.js';
import { pagedKvList } from './kv-list.js';

// ── Key derivation (internal — no caller should depend on these strings) ─────

const KEY_PREFIX = 'gsr-provisional:v1';

function yearPrefix(year: number): string {
  return `${KEY_PREFIX}:${year}:`;
}

function artifactKey(year: number, round: number): string {
  return `${yearPrefix(year)}${round}`;
}

function parseRoundFromKey(key: string, prefix: string): number | null {
  const suffix = key.slice(prefix.length);
  if (suffix.length === 0) return null;
  const n = Number(suffix);
  return Number.isInteger(n) ? n : null;
}

// ── Wire envelope (shape A1 Immutable) ───────────────────────────────────────

/** Current envelope schema version. Bump when the artifact shape evolves
 *  in a backwards-incompatible way; older artifacts will read as misses,
 *  and the next recompute will overwrite them. */
export const CURRENT_SCHEMA_VERSION = 1 as const;

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

export function encode(gsr: RoundGSR): string {
  return JSON.stringify({
    schemaVersion: CURRENT_SCHEMA_VERSION,
    computedAt: new Date().toISOString(),
    payload: gsr,
  });
}

export function decode(raw: string | null): RoundGSR | null {
  const env = parseEnvelopeJson(raw, EnvelopeSchema);
  if (!env) return null;
  // Trust the writer to have produced a well-typed RoundGSR; the envelope
  // shape check above caught any structural drift.
  return env.payload as unknown as RoundGSR;
}

// ── Adapter ──────────────────────────────────────────────────────────────────

export class KvProvisionalGameStrengthRepository
  implements ProvisionalGameStrengthRepository
{
  constructor(private readonly kv: KVNamespace) {}

  async findByRound(year: number, round: number): Promise<RoundGSR | null> {
    const raw = await this.kv.get(artifactKey(year, round));
    return decode(raw);
  }

  async listProvisionalRounds(year: number): Promise<ReadonlySet<number>> {
    const prefix = yearPrefix(year);
    const rounds = await pagedKvList<unknown, number>({
      kv: this.kv,
      prefix,
      transform: key => {
        const round = parseRoundFromKey(key, prefix);
        if (round === null) {
          logger.warn('[GSR-provisional] Malformed key suffix in KV listing', {
            key,
            prefix,
          });
        }
        return round;
      },
    });
    return new Set(rounds);
  }

  async save(year: number, round: number, gsr: RoundGSR): Promise<void> {
    const key = artifactKey(year, round);
    await wrapKvErrors({
      op: () => this.kv.put(key, encode(gsr), { metadata: {} }),
      wrapQuotaAs: cause =>
        new ProvisionalGameStrengthStoreQuotaExhaustedError(
          `KV daily write quota exhausted while writing ${key}`,
          cause,
        ),
    });
  }

  async deleteByRound(year: number, round: number): Promise<void> {
    await this.kv.delete(artifactKey(year, round));
  }

  async deleteByYear(year: number): Promise<void> {
    const prefix = yearPrefix(year);
    let cursor: string | undefined;
    for (;;) {
      const page = await this.kv.list({ prefix, cursor });
      for (const entry of page.keys) {
        await this.kv.delete(entry.name);
      }
      if (page.list_complete) break;
      cursor = page.cursor;
      if (!cursor) break;
    }
  }
}
