/**
 * Pure analytics functions for the Game Strength Rating (GSR) model.
 * Feature: 032-game-strength-rating
 *
 * All functions are pure (no I/O, no side effects).
 */

import type { ScoringCategory, TeamSeasonSupercoach } from '../domain/supercoach-score.js';
import type {
  TeamMatchEntry,
  TeamMatchHistory,
  CategoryStrengthDetail,
  TeamMatchGSR,
  MatchGSR,
  RoundGSR,
} from '../domain/game-strength.js';

export const DEFAULT_HALF_LIFE = 6;
export const DEFAULT_MIN_ROUNDS_FOR_RELIABILITY = 3;
/** Extra rounds of "virtual distance" added per season boundary crossed when computing
 *  recency weight. With default halfLife=6 and penalty=12, an entry from the previous season
 *  is treated as TWO halfLives older than its calendar-round position suggests (i.e. its
 *  weight is reduced by ~4× relative to its base recency weight).
 *
 *  Empirically tuned: a penalty of 12 restores predictive accuracy for rounds 2+ (68.8% SC
 *  winner prediction vs 70.0% with current-season-only history, vs 58.8% with no penalty).
 *  Lower penalties let prior-season data drown out in-season form; higher penalties make
 *  cross-season data effectively useless for rounds with even a small in-season sample. */
export const DEFAULT_SEASON_TRANSITION_PENALTY = 12;
const OFFENSE_WEIGHT = 0.5;

/** Return the effective roundDiff for a history entry, adding penalty rounds for each
 *  season boundary crossed between the entry's year and the year being predicted. */
function effectiveRoundDiff(entryYear: number, indexFromEnd: number, currentYear: number, penalty: number): number {
  const yearsBack = Math.max(0, currentYear - entryYear);
  return indexFromEnd + yearsBack * penalty;
}

const CATEGORY_ORDER: ScoringCategory[] = ['base', 'scoring', 'create', 'evade', 'defence', 'negative'];

const CATEGORY_LABELS: Record<ScoringCategory, string> = {
  base: 'Base (Tackles & Hitups)',
  scoring: 'Scoring',
  create: 'Create',
  evade: 'Evade',
  defence: 'Defence',
  negative: 'Negative',
};

export type NonByeFixture = {
  homeCode: string;
  awayCode: string;
  matchId: string;
};

/** weight = exp(-ln2 × roundDiff / halfLife). roundDiff 0 = most recent game. */
export function recencyWeight(roundDiff: number, halfLife: number): number {
  return Math.exp(-Math.LN2 * roundDiff / halfLife);
}

/** Recency-weighted average. Returns 0 when entries is empty or all weights are zero. */
export function weightedAverage(entries: ReadonlyArray<{ value: number; weight: number }>): number {
  if (entries.length === 0) return 0;
  let sumWeighted = 0;
  let sumWeights = 0;
  for (const { value, weight } of entries) {
    sumWeighted += value * weight;
    sumWeights += weight;
  }
  return sumWeights === 0 ? 0 : sumWeighted / sumWeights;
}

/**
 * Extract a team's match history from a TeamSeasonSupercoach.
 * Sums each player's categoryTotals to produce team-level category totals per match.
 */
export function extractTeamHistory(
  season: TeamSeasonSupercoach,
  teamCode: string
): TeamMatchHistory {
  const entries: TeamMatchEntry[] = [];

  for (const match of season.matches) {
    const isHome = match.homeTeam.teamCode === teamCode;
    const teamGroup = isHome ? match.homeTeam : match.awayTeam;
    const opponentGroup = isHome ? match.awayTeam : match.homeTeam;

    if (teamGroup.teamCode !== teamCode) continue;

    // Skip future/unplayed matches — they're included in the season fixture list with
    // teamTotal = 0 / opponentTotal = 0 placeholders. Including them in the weighted
    // average would dilute every team's WAS toward zero (and worse, future matches sort
    // as "most recent" so they'd dominate the recency weighting).
    if (teamGroup.teamTotal === 0 && opponentGroup.teamTotal === 0) continue;

    const categoryTotals = {} as Record<ScoringCategory, number>;
    const opponentCategoryTotals = {} as Record<ScoringCategory, number>;
    for (const cat of CATEGORY_ORDER) {
      categoryTotals[cat] = teamGroup.players.reduce(
        (sum, p) => sum + (p.categoryTotals[cat] ?? 0),
        0
      );
      opponentCategoryTotals[cat] = opponentGroup.players.reduce(
        (sum, p) => sum + (p.categoryTotals[cat] ?? 0),
        0
      );
    }

    entries.push({
      matchId: match.matchId,
      year: match.year,
      round: match.round,
      teamTotal: teamGroup.teamTotal,
      categoryTotals,
      opponentTotal: opponentGroup.teamTotal,
      opponentCategoryTotals,
      isComplete: match.isComplete,
      opponentCode: opponentGroup.teamCode,
    });
  }

  return { teamCode, entries };
}

/**
 * Compute per-category league averages and weights from all participating team histories.
 * leagueAvgs[c] = mean recency-weighted average of category c across all teams.
 * leagueWeights[c] = leagueAvgs[c] / sum(leagueAvgs[c'] for all c')
 * Weights sum to 1.0. Falls back to equal weights if no history exists.
 */
export function computeLeagueCategoryWeights(
  histories: ReadonlyArray<TeamMatchHistory>,
  halfLife: number,
  currentYear: number,
  seasonTransitionPenalty: number
): { weights: Record<ScoringCategory, number>; averages: Record<ScoringCategory, number> } {
  const categorySums = {} as Record<ScoringCategory, number>;
  for (const cat of CATEGORY_ORDER) categorySums[cat] = 0;

  let teamsWithHistory = 0;
  for (const history of histories) {
    const { entries } = history;
    if (entries.length === 0) continue;
    teamsWithHistory++;
    const n = entries.length;
    for (const cat of CATEGORY_ORDER) {
      categorySums[cat] += weightedAverage(
        entries.map((e, i) => ({
          value: e.categoryTotals[cat],
          weight: recencyWeight(effectiveRoundDiff(e.year, n - 1 - i, currentYear, seasonTransitionPenalty), halfLife),
        }))
      );
    }
  }

  const equalWeight = 1 / CATEGORY_ORDER.length;
  if (teamsWithHistory === 0) {
    return {
      weights: Object.fromEntries(CATEGORY_ORDER.map(c => [c, equalWeight])) as Record<ScoringCategory, number>,
      averages: Object.fromEntries(CATEGORY_ORDER.map(c => [c, 0])) as Record<ScoringCategory, number>,
    };
  }

  let totalAvg = 0;
  const averages = {} as Record<ScoringCategory, number>;
  for (const cat of CATEGORY_ORDER) {
    averages[cat] = categorySums[cat] / teamsWithHistory;
    totalAvg += averages[cat];
  }

  if (totalAvg === 0) {
    return {
      weights: Object.fromEntries(CATEGORY_ORDER.map(c => [c, equalWeight])) as Record<ScoringCategory, number>,
      averages,
    };
  }

  const weights = Object.fromEntries(
    CATEGORY_ORDER.map(c => [c, averages[c] / totalAvg])
  ) as Record<ScoringCategory, number>;
  return { weights, averages };
}

type PreNormTeamGSR = Omit<TeamMatchGSR, 'normalizedOverallGSR' | 'normalizedCategoricalGSR'>;

/**
 * Compute a single team's GSR from its history and its opponent's history.
 *
 * weightedAvgScored(team) = recency-weighted avg of team's own scoring
 * weightedAvgAllowed(opponent) = recency-weighted avg of points scored AGAINST the opponent
 *                                 (i.e. opponent.entries[i].opponentTotal — what teams put up on the opponent)
 *
 * normalizedOverallGSR and normalizedCategoricalGSR are filled by computeRoundGSR
 * after the round's league averages are known.
 */
export function computeTeamGSR(
  teamCode: string,
  opponentCode: string,
  team: TeamMatchHistory,
  opponent: TeamMatchHistory,
  leagueWeights: Record<ScoringCategory, number>,
  leagueAverages: Record<ScoringCategory, number>,
  halfLife: number,
  minRoundsForReliability: number,
  currentYear: number,
  seasonTransitionPenalty: number
): PreNormTeamGSR {
  const tn = team.entries.length;
  const on = opponent.entries.length;

  // Pre-compute per-entry weights with the season-transition penalty applied so we don't
  // recompute the effective-diff math for every category.
  const teamWeights = team.entries.map((e, i) =>
    recencyWeight(effectiveRoundDiff(e.year, tn - 1 - i, currentYear, seasonTransitionPenalty), halfLife)
  );
  const opponentWeights = opponent.entries.map((e, i) =>
    recencyWeight(effectiveRoundDiff(e.year, on - 1 - i, currentYear, seasonTransitionPenalty), halfLife)
  );

  const weightedAvgScored = weightedAverage(
    team.entries.map((e, i) => ({ value: e.teamTotal, weight: teamWeights[i] }))
  );

  // "Allowed" = what other teams have scored on this opponent (their opponentTotal in each match)
  const weightedAvgAllowed = weightedAverage(
    opponent.entries.map((e, i) => ({ value: e.opponentTotal, weight: opponentWeights[i] }))
  );

  const overallGSR = OFFENSE_WEIGHT * weightedAvgScored + (1 - OFFENSE_WEIGHT) * weightedAvgAllowed;

  const categoryStrengths: CategoryStrengthDetail[] = CATEGORY_ORDER.map(cat => {
    const was = weightedAverage(
      team.entries.map((e, i) => ({ value: e.categoryTotals[cat], weight: teamWeights[i] }))
    );
    // Per-category "allowed" uses opponent's opponentCategoryTotals (what was scored against them per-category)
    const waa = weightedAverage(
      opponent.entries.map((e, i) => ({ value: e.opponentCategoryTotals[cat], weight: opponentWeights[i] }))
    );
    return {
      category: cat,
      label: CATEGORY_LABELS[cat],
      weightedAvgScored: was,
      weightedAvgAllowed: waa,
      combinedStrength: OFFENSE_WEIGHT * was + (1 - OFFENSE_WEIGHT) * waa,
      leagueWeight: leagueWeights[cat],
    };
  });

  // categoricalGSR = Σ leagueWeight[c] × (combined[c] / leagueAvg[c]) × leagueAvgTotal
  // This is per-category-normalised then re-scaled to the same units as overallGSR,
  // so a team scoring exactly the league average in every category gets categoricalGSR == overallGSR == leagueAvg.
  // Done in two steps: compute the dimensionless ratio here (Σ weight × strength/leagueAvg[c]),
  // then computeRoundGSR multiplies by the round's league avg total to give comparable units.
  const categoricalRatio = categoryStrengths.reduce((sum, c) => {
    const denom = leagueAverages[c.category];
    if (denom === 0) return sum;
    return sum + c.leagueWeight * (c.combinedStrength / denom);
  }, 0);

  return {
    teamCode,
    opponentCode,
    weightedAvgScored,
    weightedAvgAllowed,
    overallGSR,
    categoricalGSR: categoricalRatio, // dimensionless ratio; computeRoundGSR scales to absolute value
    categoryStrengths,
    teamSamplesUsed: tn,
    opponentSamplesUsed: on,
    sampleSizeWarning: tn < minRoundsForReliability || on < minRoundsForReliability,
  };
}

/**
 * Compute RoundGSR for all non-bye fixtures.
 *
 * teamHistories is a Map<teamCode, TeamMatchHistory> — lightweight per-team match entries.
 * Callers should call extractTeamHistory() immediately after fetching TeamSeasonSupercoach and
 * pass the extracted result here. This keeps memory bounded (the heavy player breakdown data
 * in TeamSeasonSupercoach can be GC'd as soon as extraction is done).
 */
export function computeRoundGSR(
  fixtures: ReadonlyArray<NonByeFixture>,
  teamHistories: ReadonlyMap<string, TeamMatchHistory>,
  options: {
    halfLife: number;
    minRoundsForReliability: number;
    year: number;
    round: number;
    /** Extra rounds added per season boundary crossed. Defaults to DEFAULT_SEASON_TRANSITION_PENALTY. */
    seasonTransitionPenalty?: number;
  }
): RoundGSR {
  const { halfLife, minRoundsForReliability, year, round } = options;
  const seasonTransitionPenalty = options.seasonTransitionPenalty ?? DEFAULT_SEASON_TRANSITION_PENALTY;

  const getHistory = (code: string): TeamMatchHistory =>
    teamHistories.get(code) ?? { teamCode: code, entries: [] };

  // Collect all histories for league weight computation
  const allHistories: TeamMatchHistory[] = [];
  for (const { homeCode, awayCode } of fixtures) {
    allHistories.push(getHistory(homeCode), getHistory(awayCode));
  }
  const { weights: leagueWeights, averages: leagueAverages } = computeLeagueCategoryWeights(
    allHistories, halfLife, year, seasonTransitionPenalty
  );

  // Compute per-team GSR (pre-normalization)
  const preNormMatches: Array<{
    matchId: string;
    homeTeam: PreNormTeamGSR;
    awayTeam: PreNormTeamGSR;
  }> = [];

  for (const { homeCode, awayCode, matchId } of fixtures) {
    const homeHistory = getHistory(homeCode);
    const awayHistory = getHistory(awayCode);

    preNormMatches.push({
      matchId,
      homeTeam: computeTeamGSR(homeCode, awayCode, homeHistory, awayHistory, leagueWeights, leagueAverages, halfLife, minRoundsForReliability, year, seasonTransitionPenalty),
      awayTeam: computeTeamGSR(awayCode, homeCode, awayHistory, homeHistory, leagueWeights, leagueAverages, halfLife, minRoundsForReliability, year, seasonTransitionPenalty),
    });
  }

  // Compute league average team score for normalization
  const allScores = preNormMatches.flatMap(m => [
    m.homeTeam.weightedAvgScored,
    m.awayTeam.weightedAvgScored,
  ]);
  const leagueAvgTeamScore =
    allScores.length > 0 ? allScores.reduce((s, v) => s + v, 0) / allScores.length : 0;

  const safeAvg = leagueAvgTeamScore === 0 ? 1 : leagueAvgTeamScore;

  // Build final matches with normalized values
  // categoricalGSR was computed as a dimensionless ratio (1.0 = league-average across all categories);
  // multiply by leagueAvgTeamScore to express in the same units as overallGSR for the absolute field,
  // and the normalized field is just the ratio itself.
  const matches: MatchGSR[] = preNormMatches.map(({ matchId, homeTeam, awayTeam }) => ({
    matchId,
    year,
    round,
    homeTeam: {
      ...homeTeam,
      categoricalGSR: homeTeam.categoricalGSR * leagueAvgTeamScore,
      normalizedOverallGSR: homeTeam.overallGSR / safeAvg,
      normalizedCategoricalGSR: homeTeam.categoricalGSR, // already a ratio
    },
    awayTeam: {
      ...awayTeam,
      categoricalGSR: awayTeam.categoricalGSR * leagueAvgTeamScore,
      normalizedOverallGSR: awayTeam.overallGSR / safeAvg,
      normalizedCategoricalGSR: awayTeam.categoricalGSR,
    },
  }));

  return {
    year,
    round,
    leagueAvgTeamScore,
    matches,
    methodology: {
      halfLifeRounds: halfLife,
      offenseWeight: OFFENSE_WEIGHT,
      minRoundsForReliability,
      seasonTransitionPenalty,
      categoryWeightingMethod: 'dynamic',
    },
  };
}
