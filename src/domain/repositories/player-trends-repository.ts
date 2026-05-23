/**
 * PlayerTrendsRepository port — domain-layer interface for the precomputed
 * player-trends store. Identity is (year, teamCode) — the existing analytics
 * use case computes team-wide trend signals across the team's players, not
 * per-player.
 *
 * Feature: 037-analytics-cache-replacement.
 *
 * Vocabulary rule (FR-001): no "cache", "TTL", "key", "KV", or any backend
 * name appears here.
 */

import type { PlayerTrend } from '../../analytics/types.js';

// ── Aggregate ────────────────────────────────────────────────────────────────

/** Payload shape — matches the existing `TrendsResult` interface in
 *  get-player-trends.ts. */
export interface PlayerTrendsPayload {
  readonly teamCode: string;
  readonly teamName: string;
  readonly year: number;
  readonly windowSize: number;
  readonly players: readonly PlayerTrend[];
}

export interface PlayerTrendsAggregate {
  readonly year: number;
  readonly teamCode: string;
  readonly asOfRound: number;
  readonly computedAt: string;
  readonly trends: PlayerTrendsPayload;
}

// ── Error ────────────────────────────────────────────────────────────────────

export class PlayerTrendsStoreQuotaExhaustedError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'PlayerTrendsStoreQuotaExhaustedError';
  }
}

// ── Port ─────────────────────────────────────────────────────────────────────

export interface PlayerTrendsRepository {
  findPlayerTrendsAggregate(
    year: number,
    teamCode: string,
  ): Promise<PlayerTrendsAggregate | null>;

  listPlayerTrendsAsOfRounds(year: number): Promise<Map<string, number>>;

  savePlayerTrendsAggregate(aggregate: PlayerTrendsAggregate): Promise<void>;
}
