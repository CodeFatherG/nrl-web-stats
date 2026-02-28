/**
 * MatchRepository port interface.
 * Collection-like access to Match aggregates.
 */

import type { Match } from '../match.js';

/** Repository interface for Match aggregate persistence */
export interface MatchRepository {
  /** Save or update a match. Upsert semantics — if match ID exists, merge fields. */
  save(match: Match): void;

  /** Find all matches in a specific round */
  findByYearAndRound(year: number, round: number): Match[];

  /** Find all matches involving a team, optionally filtered by year */
  findByTeam(teamCode: string, year?: number): Match[];

  /** Find a single match by its deterministic ID */
  findById(id: string): Match | null;

  /** Find all matches for a given year */
  findByYear(year: number): Match[];
}
