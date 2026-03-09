/**
 * MatchRepository port interface.
 * Collection-like access to Match aggregates.
 * All methods are async to support persistent storage (D1).
 */

import type { Match } from '../match.js';

/** Repository interface for Match aggregate persistence */
export interface MatchRepository {
  /** Save or update a match. Upsert semantics — if match ID exists, merge fields. */
  save(match: Match): Promise<void>;

  /** Batch upsert multiple matches. Replaces loadForYear(). */
  saveAll(matches: Match[]): Promise<void>;

  /** Find all matches in a specific round */
  findByYearAndRound(year: number, round: number): Promise<Match[]>;

  /** Find all matches involving a team, optionally filtered by year */
  findByTeam(teamCode: string, year?: number): Promise<Match[]>;

  /** Find a single match by its deterministic ID */
  findById(id: string): Promise<Match | null>;

  /** Find all matches for a given year */
  findByYear(year: number): Promise<Match[]>;

  /** Return sorted array of years that have match data */
  getLoadedYears(): Promise<number[]>;

  /** Check whether any matches exist for the given year */
  isYearLoaded(year: number): Promise<boolean>;

  /** Total match count across all loaded years */
  getMatchCount(): Promise<number>;
}
