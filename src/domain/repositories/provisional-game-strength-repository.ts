/**
 * ProvisionalGameStrengthRepository port — domain-layer interface for the
 * durable provisional game-strength-rating store.
 *
 * Feature: 036-game-strength-artifact. See:
 *   specs/036-game-strength-artifact/contracts/provisional-game-strength-repository.md
 *
 * Vocabulary rule (FR-015): no "cache", "TTL", "namespace", "prefix",
 * "metadata", or any backend name appears here. Everything is in domain
 * terms — years, rounds, ratings.
 *
 * Only PROVISIONAL artifacts live behind this port. Locked artifacts remain
 * in the existing D1 `game_strength_ratings` table and are accessed via
 * `D1GameStrengthRepository`. See spec Clarification Q2 (2026-05-21) for
 * the storage-split rationale.
 */

import type { RoundGSR } from '../game-strength.js';

// ── Error type (domain-named, both KV and any future adapter raise this) ─────

/**
 * Thrown by `save` when the underlying store cannot accept more writes for
 * the current quota period. Domain-named so the contract names no
 * infrastructure type; `HandleScrapeJobUseCase.classifyError` matches on
 * this type and classifies as terminal (FR-023 → DLQ, not retry).
 */
export class ProvisionalGameStrengthStoreQuotaExhaustedError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'ProvisionalGameStrengthStoreQuotaExhaustedError';
  }
}

// ── Port ────────────────────────────────────────────────────────────────────

export interface ProvisionalGameStrengthRepository {
  /**
   * Read the provisional rating for (year, round). Returns `null` on
   * absence, on schema drift, or on store unavailability. Never throws to
   * signal absence.
   */
  findByRound(year: number, round: number): Promise<RoundGSR | null>;

  /**
   * Return the set of round numbers for which a provisional rating exists
   * in the given year. Implementations MUST compute this without reading
   * artifact bodies (listing-only).
   */
  listProvisionalRounds(year: number): Promise<ReadonlySet<number>>;

  /**
   * Write a provisional rating, overwriting any existing entry at the same
   * (year, round). Last-write-wins — provisional ratings are by definition
   * overwriteable. May throw
   * `ProvisionalGameStrengthStoreQuotaExhaustedError` on quota exhaustion;
   * transient backend errors propagate untouched.
   */
  save(year: number, round: number, gsr: RoundGSR): Promise<void>;

  /**
   * Remove the provisional entry for (year, round) if it exists. Absent
   * entry is a no-op (does not throw).
   */
  deleteByRound(year: number, round: number): Promise<void>;

  /**
   * Remove every provisional entry for the given year. Used at the start
   * of a recompute cycle to clear stale entries before the rebuild loop
   * re-populates the year.
   */
  deleteByYear(year: number): Promise<void>;
}
