/**
 * PlayerStatsSource port interface.
 * Defines how player statistics data enters the domain from external sources.
 */

import type { Result } from '../result.js';

/** Per-match player statistics from an external source */
export interface PlayerMatchStats {
  readonly playerId: string;
  readonly playerName: string;
  readonly teamCode: string;
  readonly dateOfBirth: string | null;
  readonly position: string;
  readonly matchId: string;
  readonly year: number;
  readonly round: number;
  readonly tries: number;
  readonly goals: number;
  readonly tackles: number;
  readonly runMetres: number;
  readonly fantasyPoints: number;
  readonly isComplete: boolean;
}

/** Port for fetching player match statistics */
export interface PlayerStatsSource {
  /** Fetch player statistics for a specific round in a season. */
  fetchPlayerStats(year: number, round: number): Promise<Result<PlayerMatchStats[]>>;
}
