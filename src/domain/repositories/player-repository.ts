/**
 * PlayerRepository port interface.
 * Collection-like access to Player aggregates.
 */

import type { Player } from '../player.js';
import type { MatchPerformance } from '../player.js';

/** Aggregated season statistics for a player */
export interface SeasonAggregates {
  readonly matchesPlayed: number;
  readonly totalTries: number;
  readonly totalGoals: number;
  readonly totalTackles: number;
  readonly totalRunMetres: number;
  readonly totalFantasyPoints: number;
}

/** Repository interface for Player aggregate persistence */
export interface PlayerRepository {
  /** Save or update a player and their match performances. Upsert by player ID. */
  save(player: Player): Promise<void>;

  /** Find players on a team, optionally for a specific season */
  findByTeam(teamCode: string, season?: number): Promise<Player[]>;

  /** Find a single player by their deterministic ID */
  findById(id: string): Promise<Player | null>;

  /** Find a player's match performances for a specific season */
  findMatchPerformances(playerId: string, season: number): Promise<MatchPerformance[]>;

  /** Get aggregated season statistics for a player */
  findSeasonAggregates(playerId: string, season: number): Promise<SeasonAggregates | null>;

  /** Check if a round has been fully scraped (all performances are complete) */
  isRoundComplete(season: number, round: number): Promise<boolean>;

  /** Find all player performances for a specific team in a specific match (by year and round) */
  findPerformancesByMatch(
    year: number,
    round: number,
    teamCode: string
  ): Promise<Array<{ playerName: string; position: string; performance: MatchPerformance }>>;
}
