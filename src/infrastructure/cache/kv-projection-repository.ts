/**
 * KvProjectionRepository — Cloudflare Workers KV adapter for the
 * ProjectionRepository port.
 *
 * All KV-specific concerns live here: key derivation, JSON envelope encoding,
 * quota-exhausted detection. The rest of the codebase imports only the domain
 * port (see src/domain/repositories/projection-repository.ts).
 *
 * Feature: 034-precomputed-projections (T010).
 */

import {
  ProjectionStoreQuotaExhaustedError,
  type PlayerProjectionAggregate,
  type PrecomputeStatus,
  type ProjectionRepository,
  type TeamRankingsAggregate,
} from '../../domain/repositories/projection-repository.js';
import type { RankingMode } from '../../analytics/player-projection-types.js';
import {
  decodePlayerAggregate,
  decodePrecomputeStatus,
  decodeTeamRankingsAggregate,
  encodePlayerAggregate,
  encodePrecomputeStatus,
  encodeTeamRankingsAggregate,
} from './projection-envelope.js';

// ── Key derivation (internal — no caller should depend on these strings) ─────

const KEY_PREFIX = 'projections:v1';

function playerPrefix(year: number): string {
  return `${KEY_PREFIX}:${year}:player:`;
}

function playerKey(year: number, playerId: string): string {
  return `${playerPrefix(year)}${playerId}`;
}

function teamRankingsPrefix(year: number): string {
  return `${KEY_PREFIX}:${year}:team-rankings:`;
}

function teamRankingsKey(year: number, teamCode: string, mode: RankingMode): string {
  return `${teamRankingsPrefix(year)}${teamCode}:${mode}`;
}

function statusKey(year: number): string {
  return `${KEY_PREFIX}:${year}:status`;
}

interface CoverageMetadata {
  readonly asOfRound: number;
}

// ── Quota-exhausted detection ────────────────────────────────────────────────

/** Match KV's daily-write-limit-exceeded response. Cloudflare's KV SDK throws
 *  with a message containing "429" and a body referencing the rate-limit /
 *  daily-limit. We match conservatively on both signals so a generic 429 from
 *  a different cause (e.g. burst rate limit) doesn't get misclassified — and
 *  if we ARE wrong, the dispatcher's worst case is "terminal instead of
 *  retry," which is the safe direction (DLQ rather than burning retry slots). */
function isQuotaExhaustedError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message;
  if (!/429/.test(msg)) return false;
  return /daily limit|rate limit|quota/i.test(msg);
}

// ── Adapter ──────────────────────────────────────────────────────────────────

export class KvProjectionRepository implements ProjectionRepository {
  constructor(private readonly kv: KVNamespace) {}

  // Read side -----------------------------------------------------------------

  async findPlayerAggregate(
    year: number,
    playerId: string,
  ): Promise<PlayerProjectionAggregate | null> {
    const raw = await this.kv.get(playerKey(year, playerId));
    return decodePlayerAggregate(raw);
  }

  async findTeamRankingsAggregate(
    year: number,
    teamCode: string,
    mode: RankingMode,
  ): Promise<TeamRankingsAggregate | null> {
    const raw = await this.kv.get(teamRankingsKey(year, teamCode, mode));
    return decodeTeamRankingsAggregate(raw);
  }

  async findPrecomputeStatus(year: number): Promise<PrecomputeStatus | null> {
    const raw = await this.kv.get(statusKey(year));
    return decodePrecomputeStatus(raw);
  }

  // Write side ----------------------------------------------------------------

  async listPlayerAggregateAsOfRounds(year: number): Promise<Map<string, number>> {
    return this.listCoverage(playerPrefix(year), key => key.slice(playerPrefix(year).length));
  }

  async listTeamRankingsAsOfRounds(year: number): Promise<Map<string, number>> {
    return this.listCoverage(teamRankingsPrefix(year), key => key.slice(teamRankingsPrefix(year).length));
  }

  // Write side ----------------------------------------------------------------

  async savePlayerAggregate(aggregate: PlayerProjectionAggregate): Promise<void> {
    await this.put(
      playerKey(aggregate.year, aggregate.playerId),
      encodePlayerAggregate(aggregate),
      { asOfRound: aggregate.asOfRound },
    );
  }

  async saveTeamRankingsAggregate(aggregate: TeamRankingsAggregate): Promise<void> {
    await this.put(
      teamRankingsKey(aggregate.year, aggregate.teamCode, aggregate.mode),
      encodeTeamRankingsAggregate(aggregate),
      { asOfRound: aggregate.asOfRound },
    );
  }

  async savePrecomputeStatus(status: PrecomputeStatus): Promise<void> {
    await this.put(statusKey(status.year), encodePrecomputeStatus(status));
  }

  // Internal helpers ---------------------------------------------------------

  private async put(key: string, value: string, metadata?: CoverageMetadata): Promise<void> {
    try {
      await this.kv.put(key, value, metadata ? { metadata } : undefined);
    } catch (err) {
      if (isQuotaExhaustedError(err)) {
        throw new ProjectionStoreQuotaExhaustedError(
          `KV daily write quota exhausted while writing ${key}`,
          err,
        );
      }
      throw err;
    }
  }

  /** Page through `kv.list({ prefix })` and project each entry to its
   *  asOfRound metadata. Entries without metadata are skipped (legacy writes
   *  pre-dating the coverage probe) — they'll be treated as "stale" by the
   *  predicate and re-precomputed on the next discovery tick. */
  private async listCoverage(
    prefix: string,
    keyToIdent: (key: string) => string,
  ): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    let cursor: string | undefined;
    for (;;) {
      const page = await this.kv.list<CoverageMetadata>({ prefix, cursor });
      for (const entry of page.keys) {
        if (!entry.metadata) continue;
        const ident = keyToIdent(entry.name);
        if (ident.length === 0) continue;
        out.set(ident, entry.metadata.asOfRound);
      }
      if (page.list_complete) break;
      cursor = page.cursor;
      if (!cursor) break;
    }
    return out;
  }
}
