/**
 * CompositionImpactRepository port — domain-layer interface for the
 * precomputed composition-impact store. Identity is (year, teamCode).
 *
 * Feature: 037-analytics-cache-replacement.
 *
 * Vocabulary rule (FR-001): no "cache", "TTL", "key", "KV", or any backend
 * name appears here.
 */

import type { CompositionImpact } from '../../analytics/types.js';

// ── Aggregate ────────────────────────────────────────────────────────────────

export interface CompositionImpactAggregate {
  readonly year: number;
  readonly teamCode: string;
  readonly asOfRound: number;
  readonly computedAt: string;
  readonly impact: CompositionImpact;
}

// ── Error ────────────────────────────────────────────────────────────────────

export class CompositionImpactStoreQuotaExhaustedError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'CompositionImpactStoreQuotaExhaustedError';
  }
}

// ── Port ─────────────────────────────────────────────────────────────────────

export interface CompositionImpactRepository {
  findCompositionImpactAggregate(
    year: number,
    teamCode: string,
  ): Promise<CompositionImpactAggregate | null>;

  listCompositionImpactAsOfRounds(year: number): Promise<Map<string, number>>;

  saveCompositionImpactAggregate(
    aggregate: CompositionImpactAggregate,
  ): Promise<void>;
}
