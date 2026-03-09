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
  readonly allRunMetres: number;
  readonly allRuns: number;
  readonly bombKicks: number;
  readonly crossFieldKicks: number;
  readonly conversions: number;
  readonly conversionAttempts: number;
  readonly dummyHalfRuns: number;
  readonly dummyHalfRunMetres: number;
  readonly dummyPasses: number;
  readonly errors: number;
  readonly fantasyPointsTotal: number;
  readonly fieldGoals: number;
  readonly forcedDropOutKicks: number;
  readonly fortyTwentyKicks: number;
  readonly goals: number;
  readonly goalConversionRate: number;
  readonly grubberKicks: number;
  readonly handlingErrors: number;
  readonly hitUps: number;
  readonly hitUpRunMetres: number;
  readonly ineffectiveTackles: number;
  readonly intercepts: number;
  readonly kicks: number;
  readonly kicksDead: number;
  readonly kicksDefused: number;
  readonly kickMetres: number;
  readonly kickReturnMetres: number;
  readonly lineBreakAssists: number;
  readonly lineBreaks: number;
  readonly lineEngagedRuns: number;
  readonly minutesPlayed: number;
  readonly missedTackles: number;
  readonly offloads: number;
  readonly offsideWithinTenMetres: number;
  readonly oneOnOneLost: number;
  readonly oneOnOneSteal: number;
  readonly onePointFieldGoals: number;
  readonly onReport: number;
  readonly passesToRunRatio: number;
  readonly passes: number;
  readonly playTheBallTotal: number;
  readonly playTheBallAverageSpeed: number;
  readonly penalties: number;
  readonly points: number;
  readonly penaltyGoals: number;
  readonly postContactMetres: number;
  readonly receipts: number;
  readonly ruckInfringements: number;
  readonly sendOffs: number;
  readonly sinBins: number;
  readonly stintOne: number;
  readonly tackleBreaks: number;
  readonly tackleEfficiency: number;
  readonly tacklesMade: number;
  readonly tries: number;
  readonly tryAssists: number;
  readonly twentyFortyKicks: number;
  readonly twoPointFieldGoals: number;
  readonly isComplete: boolean;
}

/** Port for fetching player match statistics */
export interface PlayerStatsSource {
  /** Fetch player statistics for a specific round in a season. */
  fetchPlayerStats(year: number, round: number): Promise<Result<PlayerMatchStats[]>>;
}
