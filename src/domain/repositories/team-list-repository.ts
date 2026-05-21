/**
 * TeamListRepository port interface.
 * Collection-like access to TeamList value objects.
 * All methods are async to support persistent storage (D1).
 */

import type { TeamList } from '../team-list.js';

/** Repository interface for TeamList persistence */
export interface TeamListRepository {
  /** Save a team list, replacing any existing one for the same match+team. */
  save(teamList: TeamList): Promise<void>;

  /** Save multiple team lists in a batch. */
  saveAll(teamLists: TeamList[]): Promise<void>;

  /** Find team lists for a specific match (returns 0 or 2 team lists). */
  findByMatch(matchId: string): Promise<TeamList[]>;

  /** Find all team lists for a specific year and round. */
  findByYearAndRound(year: number, round: number): Promise<TeamList[]>;

  /** Check if a team list exists for a given match and team. */
  hasTeamList(matchId: string, teamCode: string): Promise<boolean>;

  /** Check if any team lists exist for a given match. */
  hasTeamListsForMatch(matchId: string): Promise<boolean>;

  /** Returns the set of round numbers that have any team list entries for the given year. */
  getRoundsWithTeamLists(year: number): Promise<Set<number>>;

  /**
   * Returns the set of round numbers for the given year where every team
   * expected to play in that round has a lineup present in `team_lists`.
   *
   * "Every team expected to play" is determined by the `matches` table:
   * a round needs `2 × COUNT(matches)` distinct `team_code` rows in
   * `team_lists` to count as complete.
   *
   * Used by the precompute-player-movements discovery predicate to enqueue
   * jobs for completed-but-not-yet-precomputed rounds (spec 035 FR-007).
   */
  findRoundsWithCompleteTeamLists(year: number): Promise<ReadonlySet<number>>;
}
