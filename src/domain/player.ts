/**
 * Player aggregate and MatchPerformance value object.
 * Core domain types for NRL player statistics.
 */

/** MatchPerformance value object — one player's stats for a single match */
export interface MatchPerformance {
  readonly matchId: string;
  readonly year: number;
  readonly round: number;
  readonly teamCode: string;
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

/** Input data for creating a MatchPerformance */
export interface MatchPerformanceData {
  readonly matchId: string;
  readonly year: number;
  readonly round: number;
  readonly teamCode: string;
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

/** Create a validated MatchPerformance value object */
export function createMatchPerformance(data: MatchPerformanceData): MatchPerformance {
  if (data.tries < 0 || data.goals < 0 || data.tacklesMade < 0 || data.allRunMetres < 0) {
    throw new Error(
      `Stats must be non-negative: tries=${data.tries}, goals=${data.goals}, tacklesMade=${data.tacklesMade}, allRunMetres=${data.allRunMetres}`
    );
  }
  return { ...data };
}

/** Player aggregate — individual NRL player with performance history */
export interface Player {
  readonly id: string;
  readonly name: string;
  readonly dateOfBirth: string | null;
  readonly teamCode: string;
  readonly position: string;
  readonly performances: readonly MatchPerformance[];
}


/** Generate a deterministic player ID from name and optional date of birth. */
export function createPlayerId(name: string, dateOfBirth?: string | null): string {
  const normalized = name.trim().replace(/\s+/g, ' ').toLowerCase().replace(/\s/g, '-');
  return dateOfBirth ? `${normalized}-${dateOfBirth}` : normalized;
}

/** Create a Player aggregate with no performance history. */
export function createPlayer(
  name: string,
  dateOfBirth: string | null,
  teamCode: string,
  position: string,
): Player {
  return {
    id: createPlayerId(name, dateOfBirth),
    name,
    dateOfBirth,
    teamCode,
    position,
    performances: [],
  };
}

/** Add a performance record to a Player. Returns a new Player (immutable). */
export function addPerformance(player: Player, performance: MatchPerformance): Player {
  return {
    ...player,
    performances: [...player.performances, performance],
  };
}
