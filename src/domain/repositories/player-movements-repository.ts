/**
 * PlayerMovementsRepository port — domain-layer interface for the precomputed
 * player-movements store.
 *
 * Feature: 035-player-movements-artifact. See:
 *   specs/035-player-movements-artifact/contracts/player-movements-repository.md
 *
 * Vocabulary rule (FR-011): no "cache", "TTL", "key", "KV", "metadata", or any
 * backend name appears here. Everything is in domain terms — years, rounds,
 * artifacts.
 */

import type {
  InjuredRecord,
  DroppedRecord,
  BenchedRecord,
  PromotedRecord,
  CoveringInjuryRecord,
  ReturningFromInjuryRecord,
  PositionChangedRecord,
  PlayerMovementsResult,
} from '../player-movements.js';

// ── Aggregate ────────────────────────────────────────────────────────────────

/**
 * Durably stored result of one player-movements computation for one
 * (year, round). The (year, round) pair is the artifact's identity; freshness
 * is maintained on the write path (re-trigger on team-list change), so the
 * artifact carries no per-instance freshness fields in its body.
 *
 * `computedAt` and the `year` identity component are storage-internal and MUST
 * NOT appear on the wire — the API handler projects this artifact to the
 * public `PlayerMovementsResult` shape (see plan.md §Read path).
 */
export interface PlayerMovementsArtifact {
  readonly year: number;
  readonly round: number;
  /** ISO 8601 timestamp — informational only, not used for staleness checks. */
  readonly computedAt: string;
  // Public payload — equal to PlayerMovementsResult.
  readonly noPreviousRound?: boolean;
  readonly season: number;
  readonly injured: InjuredRecord[];
  readonly dropped: DroppedRecord[];
  readonly benched: BenchedRecord[];
  readonly returningFromInjury: ReturningFromInjuryRecord[];
  readonly coveringInjury: CoveringInjuryRecord[];
  readonly promoted: PromotedRecord[];
  readonly positionChanged: PositionChangedRecord[];
}

// ── Error type (domain-named, both KV and any future adapter raise this) ─────

/**
 * Thrown by `save` when the underlying store cannot accept more writes for the
 * current quota period. Domain-named so the contract names no infrastructure
 * type; `HandleScrapeJobUseCase.classifyError` matches on this type and
 * classifies as terminal (FR-018 → DLQ, not retry).
 */
export class PlayerMovementsStoreQuotaExhaustedError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'PlayerMovementsStoreQuotaExhaustedError';
  }
}

// ── Port ────────────────────────────────────────────────────────────────────

export interface PlayerMovementsRepository {
  /**
   * Read the artifact for (year, round). Returns `null` on absence, on schema
   * drift, or on store unavailability. Never throws to signal absence.
   *
   * Returned object is the unwrapped public payload (PlayerMovementsResult);
   * storage-internal fields (envelope wrapper, identity components) are stripped.
   */
  findByYearAndRound(
    year: number,
    round: number,
  ): Promise<PlayerMovementsResult | null>;

  /**
   * Return the highest round number for which an artifact exists in the given
   * year, or `null` if no artifacts exist. Implementations MUST compute this
   * without reading artifact bodies (listing-only).
   */
  findMostRecentRound(year: number): Promise<number | null>;

  /**
   * Enumerate every round in the year that has an artifact. Used by the
   * precompute discovery predicate to compute gaps. Listing-only.
   */
  listCoveredRounds(year: number): Promise<ReadonlySet<number>>;

  /**
   * Write an artifact, overwriting any existing artifact at the same
   * (year, round). May throw `PlayerMovementsStoreQuotaExhaustedError` on
   * quota exhaustion; transient backend errors propagate untouched.
   */
  save(artifact: PlayerMovementsArtifact): Promise<void>;
}
