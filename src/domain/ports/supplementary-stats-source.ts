/**
 * SupplementaryStatsSource port interface.
 * Defines how supplementary Supercoach statistics enter the domain from external sources.
 * These are the 8+ stats not available from the primary nrl.com match centre API.
 */

import type { Result } from '../result.js';

/** Per-player supplementary statistics from nrlsupercoachstats.com */
export interface SupplementaryPlayerStats {
  readonly playerName: string;     // "{LastName}, {FirstName}" format
  readonly season: number;
  readonly round: number;
  readonly lastTouch: number;      // LT — last touch / try contribution
  readonly missedGoals: number;    // MG
  readonly missedFieldGoals: number; // MF
  readonly effectiveOffloads: number; // OL — offload to hand
  readonly ineffectiveOffloads: number; // IO — offload to ground
  readonly runsOver8m: number;     // H8
  readonly runsUnder8m: number;    // HU
  readonly trySaves: number;      // TS
  readonly kickRegatherBreak: number; // KB
  readonly heldUpInGoal: number;   // HG
}

/** Port for fetching supplementary player statistics */
export interface SupplementaryStatsSource {
  /** Fetch supplementary statistics for all players in a specific round. */
  fetchSupplementaryStats(
    year: number,
    round: number
  ): Promise<Result<SupplementaryPlayerStats[]>>;
}
