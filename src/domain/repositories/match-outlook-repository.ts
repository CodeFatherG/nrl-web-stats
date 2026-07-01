/**
 * MatchOutlookRepository port — domain-layer interface for the precomputed
 * match-outlook store. Identity is (year, round).
 *
 * Feature: 037-analytics-cache-replacement.
 *
 * Vocabulary rule (FR-001): no "cache", "TTL", "key", "KV", or any backend
 * name appears here.
 */

import type {
  CompletedMatchResult,
  MatchOutlook,
} from '../../analytics/types.js';

// ── Aggregate ────────────────────────────────────────────────────────────────

/** Payload shape — matches the existing `OutlookResult` interface in
 *  get-match-outlook.ts. */
export interface MatchOutlookPayload {
  readonly year: number;
  readonly round: number;
  readonly matches: readonly MatchOutlook[];
  readonly completedMatches: readonly CompletedMatchResult[];
}

export interface MatchOutlookAggregate {
  readonly year: number;
  readonly round: number;
  readonly asOfRound: number;
  readonly computedAt: string;
  readonly outlook: MatchOutlookPayload;
}

// ── Error ────────────────────────────────────────────────────────────────────

export class MatchOutlookStoreQuotaExhaustedError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'MatchOutlookStoreQuotaExhaustedError';
  }
}

// ── Port ─────────────────────────────────────────────────────────────────────

export interface MatchOutlookRepository {
  findMatchOutlookAggregate(
    year: number,
    round: number,
  ): Promise<MatchOutlookAggregate | null>;

  /** Coverage probe — returns round → asOfRound for every stored aggregate
   *  in the year. Listing-only. */
  listMatchOutlookAsOfRounds(year: number): Promise<Map<number, number>>;

  saveMatchOutlookAggregate(aggregate: MatchOutlookAggregate): Promise<void>;
}
