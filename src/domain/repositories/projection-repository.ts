/**
 * ProjectionRepository port — domain-layer interface for the precomputed
 * projection store.
 *
 * Feature: 034-precomputed-projections. See:
 *   specs/034-precomputed-projections/contracts/projection-repository.md
 *
 * Vocabulary rule (FR-012): no "cache", "TTL", "key", "KV", "Redis", or any
 * backend name appears here. Everything is in domain terms — aggregates, years,
 * players, teams, rounds.
 */

import type {
  PlayerProjectionProfile,
  RankingMode,
  TeamProjectionRankings,
} from '../../analytics/player-projection-types.js';
import type { ContextualProfileResult } from '../../analytics/contextual-projection-types.js';

// ── Aggregates ───────────────────────────────────────────────────────────────

/** Precomputed projection data for one (player, year). Serves three endpoints:
 *  player projection, contextual projection (live slice), contextual profile. */
export interface PlayerProjectionAggregate {
  readonly playerId: string;
  readonly year: number;
  /** The watermark this aggregate was computed against. Compared against the
   *  current watermark by the read path to decide hit-vs-stale. */
  readonly asOfRound: number;
  /** ISO 8601 timestamp — informational only, not used for staleness checks. */
  readonly computedAt: string;
  readonly baseProfile: PlayerProjectionProfile;
  readonly contextualProfile: ContextualProfileResult;
}

/** Precomputed team rankings for one (year, teamCode, mode). */
export interface TeamRankingsAggregate {
  readonly year: number;
  readonly teamCode: string;
  readonly mode: RankingMode;
  readonly asOfRound: number;
  readonly computedAt: string;
  readonly rankings: TeamProjectionRankings;
}

/** Monotonic high-watermark of the most recent successful precompute run.
 *  Written LAST by the precompute use case; read by the discovery predicate. */
export interface PrecomputeStatus {
  readonly year: number;
  readonly asOfRound: number;
}

// ── Error type (domain-named, both KV and Upstash adapters raise this) ───────

/**
 * Thrown by `save…` methods when the underlying store cannot accept more
 * writes for the current quota period. Domain-named so the contract names no
 * infrastructure type; `HandleScrapeJobUseCase.classifyError` matches on this
 * type and classifies as terminal (Q4 → DLQ, not retry).
 */
export class ProjectionStoreQuotaExhaustedError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'ProjectionStoreQuotaExhaustedError';
  }
}

// ── Port ────────────────────────────────────────────────────────────────────

export interface ProjectionRepository {
  // Read side — `null` means miss (never throw to signal absence).

  findPlayerAggregate(
    year: number,
    playerId: string,
  ): Promise<PlayerProjectionAggregate | null>;

  findTeamRankingsAggregate(
    year: number,
    teamCode: string,
    mode: RankingMode,
  ): Promise<TeamRankingsAggregate | null>;

  findPrecomputeStatus(year: number): Promise<PrecomputeStatus | null>;

  // Write side — may throw `ProjectionStoreQuotaExhaustedError` on quota
  // exhaustion; transient backend errors propagate.

  savePlayerAggregate(aggregate: PlayerProjectionAggregate): Promise<void>;
  saveTeamRankingsAggregate(aggregate: TeamRankingsAggregate): Promise<void>;
  savePrecomputeStatus(status: PrecomputeStatus): Promise<void>;
}
