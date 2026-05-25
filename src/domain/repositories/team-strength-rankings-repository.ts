/**
 * TeamStrengthRankingsRepository — domain port for the durable team-strength
 * rankings store (feature 039).
 *
 * Stores three sub-artifacts per year:
 *   1. Season thresholds         — `{year}:thresholds`
 *   2. Season rankings map       — `{year}:season`
 *   3. Round rankings maps       — `{year}:round:{round}`
 *
 * Naming: the `TeamStrengthRankings*` prefix disambiguates from the
 * pre-existing player-projection `PrecomputeTeamRankingsJob` /
 * `TeamRankingsAggregate` (see specs/039 research.md Risk 1).
 */

import type {
  SeasonThresholds,
  TeamRoundRanking,
  TeamSeasonRanking,
} from '../../models/types.js';

/** Aggregate payload handed to `saveYear`. The compute use case derives all
 *  three sub-artifacts from a single fixture-scan snapshot and writes them
 *  together under one `asOfRound` watermark. */
export interface RankingsYearPayload {
  readonly thresholds: SeasonThresholds;
  readonly season: ReadonlyMap<string, TeamSeasonRanking>;
  readonly roundRankings: ReadonlyMap<number, ReadonlyMap<string, TeamRoundRanking>>;
}

/** Thrown by `saveYear` when the underlying KV store reports daily-write-quota
 *  exhaustion. Classified terminal by `HandleScrapeJobUseCase.classifyError`
 *  (DLQ, not retry). In-memory adapter never throws this. */
export class TeamStrengthRankingsStoreQuotaExhaustedError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'TeamStrengthRankingsStoreQuotaExhaustedError';
  }
}

export interface TeamStrengthRankingsRepository {
  /** Read the stored season thresholds for `year`, or `null` on miss / decode
   *  failure. The caller is responsible for the watermark staleness check. */
  findSeasonThresholds(year: number): Promise<SeasonThresholds | null>;

  /** Read the stored season-rankings map for `year`, or `null` on miss /
   *  decode failure. */
  findSeasonRankings(year: number): Promise<ReadonlyMap<string, TeamSeasonRanking> | null>;

  /** Read the stored round-rankings map for `(year, round)`, or `null` on
   *  miss / decode failure. */
  findRoundRankings(year: number, round: number): Promise<ReadonlyMap<string, TeamRoundRanking> | null>;

  /** Coverage probe — keys-only list reading metadata. Returns `round →
   *  asOfRound` for every round-rankings sub-artifact present in storage for
   *  the year. Missing rounds do NOT appear in the result. */
  listCoveredRoundRankings(year: number): Promise<Map<number, number>>;

  /** Coverage probe — keys-only list reading metadata. Returns `year →
   *  asOfRound` for every year that has a thresholds sub-artifact stored.
   *  Used by the cron discovery loop to scope per-year staleness comparisons. */
  listYearsWithThresholds(): Promise<Map<number, number>>;

  /** Batched save. Writes thresholds → season → rounds (ascending) tagged
   *  with the same `asOfRound`. Rejects on first error without attempting
   *  later writes (partial state is tolerated by the discovery predicate).
   *  Wraps quota-exhaustion errors as
   *  `TeamStrengthRankingsStoreQuotaExhaustedError`. */
  saveYear(year: number, asOfRound: number, payload: RankingsYearPayload): Promise<void>;
}
