/**
 * TeamFormRepository port — domain-layer interface for the precomputed
 * team-form store.
 *
 * Feature: 037-analytics-cache-replacement. See:
 *   specs/037-analytics-cache-replacement/contracts/team-form-repository.md
 *
 * Vocabulary rule (FR-001): no "cache", "TTL", "key", "KV", or any backend
 * name appears here. Everything is in domain terms — years, teams, aggregates.
 */

import type { FormTrajectory } from '../../analytics/types.js';

// ── Aggregate ────────────────────────────────────────────────────────────────

/**
 * Precomputed team-form data for one (year, teamCode). The identity is
 * (year, teamCode); windowSize is NOT part of the key — non-default windowSize
 * requests bypass this repository and live-compute (FR-016).
 */
export interface TeamFormAggregate {
  readonly year: number;
  readonly teamCode: string;
  /** Watermark this aggregate was computed against. Compared against the
   *  current watermark by the discovery predicate. */
  readonly asOfRound: number;
  /** ISO 8601 timestamp — informational only, not used for staleness checks. */
  readonly computedAt: string;
  readonly trajectory: FormTrajectory;
}

// ── Error type (domain-named, both KV and any future adapter raise this) ─────

/**
 * Thrown by `saveTeamFormAggregate` when the underlying store cannot accept
 * more writes for the current quota period. Classified terminal by
 * `HandleScrapeJobUseCase.classifyError` (DLQ, not retry).
 */
export class TeamFormStoreQuotaExhaustedError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'TeamFormStoreQuotaExhaustedError';
  }
}

// ── Port ────────────────────────────────────────────────────────────────────

export interface TeamFormRepository {
  /**
   * Read the aggregate for (year, teamCode). Returns `null` on absence, on
   * schema drift, or on store unavailability. Never throws to signal absence.
   */
  findTeamFormAggregate(
    year: number,
    teamCode: string,
  ): Promise<TeamFormAggregate | null>;

  /**
   * Cheap coverage probe for the precompute discovery predicate.
   * Returns teamCode → asOfRound for every aggregate present in the year.
   * MUST use listing-only access (no aggregate-body reads).
   */
  listTeamFormAsOfRounds(year: number): Promise<Map<string, number>>;

  /**
   * Write an aggregate, overwriting any existing aggregate at the same
   * (year, teamCode). May throw `TeamFormStoreQuotaExhaustedError` on quota
   * exhaustion; transient backend errors propagate.
   */
  saveTeamFormAggregate(aggregate: TeamFormAggregate): Promise<void>;
}
