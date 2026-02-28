/**
 * MatchResultSource port interface.
 * Defines how match result data enters the domain from external sources.
 */

import type { MatchStatus } from '../match.js';
import type { Result } from '../result.js';

/** Match result data for enriching existing Match aggregates */
export interface MatchResult {
  readonly matchId: string;
  readonly homeScore: number;
  readonly awayScore: number;
  readonly status: MatchStatus;
  readonly scheduledTime: string | null;
}

/** Port for fetching match results */
export interface MatchResultSource {
  /** Fetch match results for a season year, optionally filtered by round. */
  fetchResults(year: number, round?: number): Promise<Result<MatchResult[]>>;
}
