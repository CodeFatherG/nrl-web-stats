/**
 * Domain types for Supercoach score reconstruction.
 * All score types are computed — never persisted to storage.
 */

/** Six scoring categories in the Supercoach system */
export type ScoringCategory = 'scoring' | 'create' | 'evade' | 'base' | 'defence' | 'negative';

/** All valid scoring categories */
export const SCORING_CATEGORIES: readonly ScoringCategory[] = [
  'scoring', 'create', 'evade', 'base', 'defence', 'negative',
] as const;

/** A single stat's contribution to the total score */
export interface StatContribution {
  readonly statName: string;
  readonly displayName: string;
  readonly rawValue: number;
  readonly pointsPerUnit: number;
  readonly contribution: number;
}

/** Cross-reference discrepancy between primary and supplementary data */
export interface ValidationWarning {
  readonly type: 'offload_mismatch' | 'run_count_mismatch' | 'unmatched_player';
  readonly message: string;
  readonly primaryValue: number | null;
  readonly supplementaryValue: number | null;
}

/** Identity match confidence level */
export type MatchConfidence = 'linked' | 'exact' | 'normalized' | 'team_lastname' | 'override' | 'unmatched';

/** Score contributions grouped by category */
export type CategoryBreakdown = Record<ScoringCategory, StatContribution[]>;

/** Category subtotals */
export type CategoryTotals = Record<ScoringCategory, number>;

/** Computed Supercoach score for a single player in a single round */
export interface SupercoachScore {
  readonly playerId: string;
  readonly playerName: string;
  readonly teamCode: string;
  readonly matchId: string;
  readonly year: number;
  readonly round: number;
  readonly isComplete: boolean;
  readonly matchConfidence: MatchConfidence;
  readonly categories: CategoryBreakdown;
  readonly categoryTotals: CategoryTotals;
  readonly totalScore: number;
  readonly validationWarnings: ValidationWarning[];
}

/** Aggregated Supercoach data for a single player across a season */
export interface PlayerSeasonSupercoach {
  readonly playerId: string;
  readonly playerName: string;
  readonly teamCode: string;
  readonly year: number;
  readonly seasonTotal: number;
  readonly seasonAverage: number;
  readonly matchesPlayed: number;
  readonly matches: PlayerMatchSupercoach[];
}

// ============================================================
// New types for match-grouped Supercoach API endpoints
// ============================================================

/** One team's Supercoach contribution within a single match */
export interface TeamSupercoachGroup {
  readonly teamCode: string;
  readonly teamName: string;
  /** Sum of all players[n].totalScore — computed, never stored */
  readonly teamTotal: number;
  /** false if any player in this group has isComplete: false */
  readonly isComplete: boolean;
  readonly players: SupercoachScore[];
}

/** Supercoach scores for a single match — the shared building block across all endpoints */
export interface MatchSupercoachResult {
  readonly matchId: string;
  readonly year: number;
  readonly round: number;
  /** false if either team group has isComplete: false */
  readonly isComplete: boolean;
  readonly homeTeam: TeamSupercoachGroup;
  readonly awayTeam: TeamSupercoachGroup;
}

/** Round-level response: all matches in a round (replaces RoundSupercoachSummary) */
export interface RoundSupercoachResult {
  readonly year: number;
  readonly round: number;
  readonly isComplete: boolean;
  readonly matchCount: number;
  readonly matches: MatchSupercoachResult[];
}

/** All matches a team played in a year */
export interface TeamSeasonSupercoach {
  readonly year: number;
  readonly teamCode: string;
  readonly teamName: string;
  /** Ordered by round ascending */
  readonly matches: MatchSupercoachResult[];
}

/** Per-match entry in the player season endpoint — the player's own data only */
export interface PlayerMatchSupercoach {
  /** Resolves against GET /api/supercoach/:year/match/:matchId */
  readonly matchId: string;
  readonly round: number;
  /** Opposing team code */
  readonly opponent: string;
  readonly totalScore: number;
  readonly isComplete: boolean;
  readonly matchConfidence: MatchConfidence;
  readonly categories: CategoryBreakdown;
  readonly categoryTotals: CategoryTotals;
  readonly validationWarnings: ValidationWarning[];
}
