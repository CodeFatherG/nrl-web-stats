/**
 * PlayerRepository port interface.
 * Collection-like access to Player aggregates.
 */

import type { Player } from '../player.js';
import type { MatchPerformance } from '../player.js';

/** Repository interface for Player aggregate persistence */
export interface PlayerRepository {
  /** Save or update a player. Upsert by player ID. */
  save(player: Player): void;

  /** Find players on a team, optionally for a specific season */
  findByTeam(teamCode: string, season?: number): Player[];

  /** Find a single player by their deterministic ID */
  findById(id: string): Player | null;

  /** Find a player's match performances for a specific season */
  findMatchPerformances(playerId: string, season: number): MatchPerformance[];
}
