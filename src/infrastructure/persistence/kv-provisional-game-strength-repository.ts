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

import type { RoundGSR } from '../../domain/game-strength.js';
import {
  ProvisionalGameStrengthStoreQuotaExhaustedError,
  type ProvisionalGameStrengthRepository,
} from '../../domain/repositories/provisional-game-strength-repository.js';
import { decode, encode } from './provisional-game-strength-envelope.js';
import { logger } from '../../utils/logger.js';

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

// ── Quota-exhausted detection (regex copied verbatim from spec-034/035) ──────

function isQuotaExhaustedError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message;
  if (!/429/.test(msg)) return false;
  return /daily limit|rate limit|quota/i.test(msg);
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
    const rounds = new Set<number>();
    let cursor: string | undefined;
    for (;;) {
      const page = await this.kv.list({ prefix, cursor });
      for (const entry of page.keys) {
        const round = parseRoundFromKey(entry.name, prefix);
        if (round !== null) {
          rounds.add(round);
        } else {
          logger.warn('[GSR-provisional] Malformed key suffix in KV listing', {
            key: entry.name,
            prefix,
          });
        }
      }
      if (page.list_complete) break;
      cursor = page.cursor;
      if (!cursor) break;
    }
    return rounds;
  }

  async save(year: number, round: number, gsr: RoundGSR): Promise<void> {
    const key = artifactKey(year, round);
    try {
      await this.kv.put(key, encode(gsr), { metadata: {} });
    } catch (err) {
      if (isQuotaExhaustedError(err)) {
        throw new ProvisionalGameStrengthStoreQuotaExhaustedError(
          `KV daily write quota exhausted while writing ${key}`,
          err,
        );
      }
      throw err;
    }
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
