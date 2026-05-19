import type { ScoringCategory } from './supercoach-score.js';

export interface TeamMatchEntry {
  matchId: string;
  year: number;
  round: number;
  /** This team's total score in the match */
  teamTotal: number;
  /** This team's per-category totals */
  categoryTotals: Record<ScoringCategory, number>;
  /** Opponent's total score (used to compute "points scored against this team") */
  opponentTotal: number;
  /** Opponent's per-category totals */
  opponentCategoryTotals: Record<ScoringCategory, number>;
  isComplete: boolean;
  opponentCode: string;
}

export interface TeamMatchHistory {
  teamCode: string;
  /** Sorted by (year, round) ascending. */
  entries: TeamMatchEntry[];
}

export interface CategoryStrengthDetail {
  category: ScoringCategory;
  label: string;
  weightedAvgScored: number;
  weightedAvgAllowed: number;
  combinedStrength: number;
  leagueWeight: number;
}

export interface TeamMatchGSR {
  teamCode: string;
  opponentCode: string;
  weightedAvgScored: number;
  weightedAvgAllowed: number;
  overallGSR: number;
  normalizedOverallGSR: number;
  categoricalGSR: number;
  normalizedCategoricalGSR: number;
  /** Fixed order: base, scoring, create, evade, defence, negative */
  categoryStrengths: CategoryStrengthDetail[];
  teamSamplesUsed: number;
  opponentSamplesUsed: number;
  sampleSizeWarning: boolean;
}

export interface MatchGSR {
  matchId: string;
  year: number;
  round: number;
  homeTeam: TeamMatchGSR;
  awayTeam: TeamMatchGSR;
}

export interface GSRMethodology {
  halfLifeRounds: number;
  offenseWeight: number;
  minRoundsForReliability: number;
  /** Extra rounds of decay applied per season boundary crossed in the history. */
  seasonTransitionPenalty: number;
  categoryWeightingMethod: 'dynamic';
}

export interface RoundGSR {
  year: number;
  round: number;
  leagueAvgTeamScore: number;
  matches: MatchGSR[];
  methodology: GSRMethodology;
}
