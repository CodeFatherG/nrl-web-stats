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

  /** Replace all matches for a year atomically. Clears existing year data and inserts replacements. */
  loadForYear(year: number, matches: Match[]): void;

  /** Return sorted array of years that have loaded match data */
  getLoadedYears(): number[];

  /** Check whether any matches exist for the given year */
  isYearLoaded(year: number): boolean;

  /** Total match count across all loaded years */
  getMatchCount(): number;
}
