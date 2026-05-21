/**
 * KvPlayerMovementsRepository — Cloudflare Workers KV adapter for the
 * PlayerMovementsRepository port.
 *
 * All KV-specific concerns live here: key derivation, JSON envelope encoding,
 * quota-exhausted detection. The rest of the codebase imports only the domain
 * port (see src/domain/repositories/player-movements-repository.ts).
 *
 * Feature: 035-player-movements-artifact (T008).
 */

import type { PlayerMovementsResult } from '../../domain/player-movements.js';
import {
  PlayerMovementsStoreQuotaExhaustedError,
  type PlayerMovementsArtifact,
  type PlayerMovementsRepository,
} from '../../domain/repositories/player-movements-repository.js';
import {
  decodeArtifact,
  encodeArtifact,
  projectToPublic,
} from './player-movements-envelope.js';

// ── Key derivation (internal — no caller should depend on these strings) ─────

const KEY_PREFIX = 'player-movements:v1';

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

// ── Quota-exhausted detection (regex copied verbatim from spec-034) ──────────

/** Match KV's daily-write-limit-exceeded response. Conservative match on both
 *  signals so a generic 429 from a different cause doesn't get misclassified —
 *  and if we ARE wrong, the dispatcher's worst case is "terminal instead of
 *  retry," which is the safe direction (DLQ rather than burning retry slots). */
function isQuotaExhaustedError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message;
  if (!/429/.test(msg)) return false;
  return /daily limit|rate limit|quota/i.test(msg);
}

// ── Adapter ──────────────────────────────────────────────────────────────────

export class KvPlayerMovementsRepository
  implements PlayerMovementsRepository
{
  constructor(private readonly kv: KVNamespace) {}

  async findByYearAndRound(
    year: number,
    round: number,
  ): Promise<PlayerMovementsResult | null> {
    const raw = await this.kv.get(artifactKey(year, round));
    const artifact = decodeArtifact(raw);
    return artifact ? projectToPublic(artifact) : null;
  }

  async findMostRecentRound(year: number): Promise<number | null> {
    const rounds = await this.listCoveredRounds(year);
    if (rounds.size === 0) return null;
    let max = -Infinity;
    for (const r of rounds) if (r > max) max = r;
    return max === -Infinity ? null : max;
  }

  async listCoveredRounds(year: number): Promise<ReadonlySet<number>> {
    const prefix = yearPrefix(year);
    const rounds = new Set<number>();
    let cursor: string | undefined;
    for (;;) {
      const page = await this.kv.list({ prefix, cursor });
      for (const entry of page.keys) {
        const round = parseRoundFromKey(entry.name, prefix);
        if (round !== null) rounds.add(round);
      }
      if (page.list_complete) break;
      cursor = page.cursor;
      if (!cursor) break;
    }
    return rounds;
  }

  async save(artifact: PlayerMovementsArtifact): Promise<void> {
    const key = artifactKey(artifact.year, artifact.round);
    try {
      await this.kv.put(key, encodeArtifact(artifact));
    } catch (err) {
      if (isQuotaExhaustedError(err)) {
        throw new PlayerMovementsStoreQuotaExhaustedError(
          `KV daily write quota exhausted while writing ${key}`,
          err,
        );
      }
      throw err;
    }
  }
}
