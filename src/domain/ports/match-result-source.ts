/**
 * MatchResultSource port interface.
 * Defines how match result data enters the domain from external sources.
 */

import type { MatchStatus } from '../match.js';
import type { Result } from '../result.js';

/** Match result data for enriching existing Match aggregates */
export interface MatchResult {
  readonly matchId: string;
  readonly homeTeamCode: string;
  readonly awayTeamCode: string;
  readonly year: number;
  readonly round: number;
  readonly homeScore: number;
  readonly awayScore: number;
  readonly status: MatchStatus;
  readonly scheduledTime: string | null;
  readonly stadium: string | null;
  readonly weather: string | null;
}

/** Port for fetching match results */
export interface MatchResultSource {
  /** Fetch match results for a season year, optionally filtered by round. */
  fetchResults(year: number, round?: number): Promise<Result<MatchResult[]>>;

  /**
   * Cheap upstream-availability probe. Returns true if data for (year, round) is
   * likely fetchable; false if the upstream signals unavailability (404, empty,
   * pre-publication window). Implementations MUST swallow exceptions and return
   * false rather than throwing — discovery treats throws as bugs.
   * Default semantics: sources that publish immediately on round completion may
   * return true unconditionally.
   */
  isAvailable(year: number, round: number): Promise<boolean>;
}
