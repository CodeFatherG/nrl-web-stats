/**
 * TeamListSource port interface.
 * Defines how team list data enters the domain from external sources.
 */

import type { TeamList } from '../team-list.js';
import type { Result } from '../result.js';

/** Data needed to discover match centre URLs for a round */
export interface MatchFixtureInfo {
  readonly matchCentreUrl: string;
  readonly homeTeamCode: string;
  readonly awayTeamCode: string;
  readonly matchId: string;
}

/** Port for fetching team list data */
export interface TeamListSource {
  /** Fetch team lists for all matches in a round via match centre endpoints. */
  fetchTeamLists(year: number, round: number): Promise<Result<TeamList[]>>;

  /** Fetch team lists for a single match via its match centre URL. */
  fetchTeamListForMatch(
    matchCentreUrl: string,
    matchId: string,
    homeTeamCode: string,
    awayTeamCode: string,
    year: number,
    round: number
  ): Promise<Result<TeamList[]>>;
}
