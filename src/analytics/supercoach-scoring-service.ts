/**
 * Supercoach scoring service — pure function that computes per-player Supercoach scores.
 *
 * Maps each stat to its ScoringEntry, computes contribution (rawValue × pointsPerUnit),
 * groups by category, sums totals. Handles missing supplementary data (isComplete=false).
 */

import type { ScoringConfig, ScoringEntry } from '../config/supercoach-scoring-config.js';
import type { PrimaryScoringStats, MergedPlayerStats } from './supercoach-types.js';
import type { SupplementaryPlayerStats } from '../domain/ports/supplementary-stats-source.js';
import type {
  SupercoachScore,
  StatContribution,
  CategoryBreakdown,
  CategoryTotals,
  ScoringCategory,
  ValidationWarning,
} from '../domain/supercoach-score.js';
import { SCORING_CATEGORIES } from '../domain/supercoach-score.js';

/** Map stat names to the field on primary stats */
const PRIMARY_STAT_MAP: Record<string, keyof PrimaryScoringStats> = {
  tries: 'tries',
  goals: 'conversions',
  penaltyGoals: 'penaltyGoals',
  onePointFieldGoals: 'onePointFieldGoals',
  twoPointFieldGoals: 'twoPointFieldGoals',
  tryAssists: 'tryAssists',
  lineBreakAssists: 'lineBreakAssists',
  forcedDropOutKicks: 'forcedDropOutKicks',
  fortyTwentyKicks: 'fortyTwentyKicks',
  twentyFortyKicks: 'twentyFortyKicks',
  kicksDead: 'kicksDead',
  tackleBreaks: 'tackleBreaks',
  lineBreaks: 'lineBreaks',
  intercepts: 'intercepts',
  tacklesMade: 'tacklesMade',
  missedTackles: 'missedTackles',
  penalties: 'penalties',
  errors: 'errors',
  sinBins: 'sinBins',
  sendOffs: 'sendOffs',
};

/** Map stat names to the field on supplementary stats */
const SUPPLEMENTARY_STAT_MAP: Record<string, keyof SupplementaryPlayerStats> = {
  lastTouch: 'lastTouch',
  missedGoals: 'missedGoals',
  missedFieldGoals: 'missedFieldGoals',
  effectiveOffloads: 'effectiveOffloads',
  ineffectiveOffloads: 'ineffectiveOffloads',
  runsOver8m: 'runsOver8m',
  runsUnder8m: 'runsUnder8m',
  trySaves: 'trySaves',
  kickRegatherBreak: 'kickRegatherBreak',
  heldUpInGoal: 'heldUpInGoal',
};

/**
 * Compute a single player's Supercoach score from merged stats and scoring config.
 */
export function computePlayerScore(merged: MergedPlayerStats, config: ScoringConfig): SupercoachScore {
  const categories: CategoryBreakdown = {
    scoring: [],
    create: [],
    evade: [],
    base: [],
    defence: [],
    negative: [],
  };

  for (const entry of config.stats) {
    const rawValue = getStatValue(entry, merged.primary, merged.supplementary);
    if (rawValue === null) continue; // Stat source unavailable

    const contribution: StatContribution = {
      statName: entry.statName,
      displayName: entry.displayName,
      rawValue,
      pointsPerUnit: entry.points,
      contribution: rawValue * entry.points,
    };

    categories[entry.category as ScoringCategory].push(contribution);
  }

  const categoryTotals = {} as Record<ScoringCategory, number>;
  for (const cat of SCORING_CATEGORIES) {
    categoryTotals[cat] = categories[cat].reduce((sum, c) => sum + c.contribution, 0);
  }

  const totalScore = Object.values(categoryTotals).reduce((sum, v) => sum + v, 0);

  const validationWarnings = merged.supplementary
    ? validateMergedData(merged.primary, merged.supplementary)
    : [];

  return {
    playerId: merged.primary.playerId,
    playerName: merged.primary.playerName,
    teamCode: merged.primary.teamCode,
    matchId: merged.primary.matchId,
    year: merged.primary.year,
    round: merged.primary.round,
    isComplete: merged.supplementary !== null,
    matchConfidence: merged.matchConfidence,
    categories,
    categoryTotals,
    totalScore,
    validationWarnings,
  };
}

/**
 * Get the raw stat value from the appropriate source (primary or supplementary).
 * Returns null if the stat requires supplementary data that isn't available.
 */
function getStatValue(
  entry: ScoringEntry,
  primary: PrimaryScoringStats,
  supplementary: SupplementaryPlayerStats | null
): number | null {
  const primaryField = PRIMARY_STAT_MAP[entry.statName];
  if (primaryField) {
    return primary[primaryField] as number;
  }

  const suppField = SUPPLEMENTARY_STAT_MAP[entry.statName];
  if (suppField) {
    if (!supplementary) return null;
    return supplementary[suppField] as number;
  }

  return null;
}

/**
 * Cross-validate primary and supplementary data.
 * Generates warnings for discrepancies.
 */
function validateMergedData(
  primary: PrimaryScoringStats,
  supplementary: SupplementaryPlayerStats,
): ValidationWarning[] {
  const warnings: ValidationWarning[] = [];

  // Offload validation: OL + IO should equal primary offloads
  const suppOffloads = supplementary.effectiveOffloads + supplementary.ineffectiveOffloads;
  if (suppOffloads !== primary.offloads) {
    warnings.push({
      type: 'offload_mismatch',
      message: `Offload mismatch: supplementary (${suppOffloads}) vs primary (${primary.offloads})`,
      primaryValue: primary.offloads,
      supplementaryValue: suppOffloads,
    });
  }

  // Run count validation: H8 + HU vs primary allRuns (flag if diff > 5)
  const suppRuns = supplementary.runsOver8m + supplementary.runsUnder8m;
  const runDiff = Math.abs(suppRuns - primary.allRuns);
  if (runDiff > 5) {
    warnings.push({
      type: 'run_count_mismatch',
      message: `Run count mismatch: supplementary (${suppRuns}) vs primary (${primary.allRuns}), diff=${runDiff}`,
      primaryValue: primary.allRuns,
      supplementaryValue: suppRuns,
    });
  }

  return warnings;
}
