/**
 * Supercoach analytics types.
 * Types used by the scoring service for merging and computing scores.
 */

import type { SupplementaryPlayerStats } from '../domain/ports/supplementary-stats-source.js';
import type { MatchConfidence } from '../domain/supercoach-score.js';

/** Primary stats relevant to Supercoach scoring, extracted from PlayerMatchStats */
export interface PrimaryScoringStats {
  readonly playerId: string;
  readonly playerName: string;
  readonly teamCode: string;
  readonly matchId: string;
  readonly year: number;
  readonly round: number;
  // Scoring
  readonly tries: number;
  readonly conversions: number;
  readonly penaltyGoals: number;
  readonly onePointFieldGoals: number;
  readonly twoPointFieldGoals: number;
  // Create
  readonly tryAssists: number;
  readonly lineBreakAssists: number;
  readonly forcedDropOutKicks: number;
  readonly fortyTwentyKicks: number;
  readonly twentyFortyKicks: number;
  readonly kicksDead: number;
  // Evade
  readonly tackleBreaks: number;
  readonly lineBreaks: number;
  readonly intercepts: number;
  // Base
  readonly tacklesMade: number;
  readonly missedTackles: number;
  // Negative
  readonly penalties: number;
  readonly errors: number;
  readonly sinBins: number;
  readonly sendOffs: number;
  // Cross-reference fields (not scored directly but used for validation)
  readonly offloads: number;
  readonly allRuns: number;
}

/** Merged primary + supplementary stats for a single player */
export interface MergedPlayerStats {
  readonly primary: PrimaryScoringStats;
  readonly supplementary: SupplementaryPlayerStats | null;
  readonly matchConfidence: MatchConfidence;
}

/** Extract primary scoring stats from a full PlayerMatchStats record */
export function extractPrimaryScoringStats(stats: {
  playerId: string;
  playerName: string;
  teamCode: string;
  matchId: string;
  year: number;
  round: number;
  tries: number;
  conversions: number;
  penaltyGoals: number;
  onePointFieldGoals: number;
  twoPointFieldGoals: number;
  tryAssists: number;
  lineBreakAssists: number;
  forcedDropOutKicks: number;
  fortyTwentyKicks: number;
  twentyFortyKicks: number;
  kicksDead: number;
  tackleBreaks: number;
  lineBreaks: number;
  intercepts: number;
  tacklesMade: number;
  missedTackles: number;
  penalties: number;
  errors: number;
  sinBins: number;
  sendOffs: number;
  offloads: number;
  allRuns: number;
}): PrimaryScoringStats {
  return {
    playerId: stats.playerId,
    playerName: stats.playerName,
    teamCode: stats.teamCode,
    matchId: stats.matchId,
    year: stats.year,
    round: stats.round,
    tries: stats.tries,
    conversions: stats.conversions,
    penaltyGoals: stats.penaltyGoals,
    onePointFieldGoals: stats.onePointFieldGoals,
    twoPointFieldGoals: stats.twoPointFieldGoals,
    tryAssists: stats.tryAssists,
    lineBreakAssists: stats.lineBreakAssists,
    forcedDropOutKicks: stats.forcedDropOutKicks,
    fortyTwentyKicks: stats.fortyTwentyKicks,
    twentyFortyKicks: stats.twentyFortyKicks,
    kicksDead: stats.kicksDead,
    tackleBreaks: stats.tackleBreaks,
    lineBreaks: stats.lineBreaks,
    intercepts: stats.intercepts,
    tacklesMade: stats.tacklesMade,
    missedTackles: stats.missedTackles,
    penalties: stats.penalties,
    errors: stats.errors,
    sinBins: stats.sinBins,
    sendOffs: stats.sendOffs,
    offloads: stats.offloads,
    allRuns: stats.allRuns,
  };
}
