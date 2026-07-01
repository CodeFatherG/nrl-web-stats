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
import { wrapKvErrors } from './kv-errors.js';
import { pagedKvList } from './kv-list.js';

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
    const rounds = await pagedKvList<unknown, number>({
      kv: this.kv,
      prefix,
      transform: key => parseRoundFromKey(key, prefix),
    });
    return new Set(rounds);
  }

  async save(artifact: PlayerMovementsArtifact): Promise<void> {
    const key = artifactKey(artifact.year, artifact.round);
    await wrapKvErrors({
      op: () => this.kv.put(key, encodeArtifact(artifact)),
      wrapQuotaAs: cause =>
        new PlayerMovementsStoreQuotaExhaustedError(
          `KV daily write quota exhausted while writing ${key}`,
          cause,
        ),
    });
  }
}
