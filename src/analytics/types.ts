/**
 * Analytics engine value object types.
 * All types are computed, never persisted — derived on-demand from existing domain aggregates.
 */

/** A team's calculated form for a single completed round */
export interface TeamFormSnapshot {
  readonly round: number;
  readonly result: 'win' | 'loss' | 'draw';
  readonly margin: number;
  readonly opponentCode: string;
  readonly opponentStrengthRating: number | null;
  readonly formScore: number;
}

/** Form classification based on rolling form rating thresholds */
export type FormClassification = 'outperforming' | 'meeting' | 'underperforming';

/** An ordered collection of form snapshots with aggregate classification */
export interface FormTrajectory {
  readonly teamCode: string;
  readonly teamName: string;
  readonly year: number;
  readonly windowSize: number;
  readonly snapshots: TeamFormSnapshot[];
  readonly rollingFormRating: number | null;
  readonly classification: FormClassification | null;
  readonly sampleSizeWarning: boolean;
}

/** Tracked stat names for player trend analysis */
export type TrackedStatName = 'tries' | 'tackles' | 'runMetres' | 'fantasyPoints';

/** Trend direction for a single stat */
export type TrendDirection = 'up' | 'down' | 'stable';

/** Trend data for a single player statistic */
export interface PlayerStatTrend {
  readonly statName: TrackedStatName;
  readonly seasonAverage: number;
  readonly windowAverage: number;
  readonly deviationPercent: number;
  readonly direction: TrendDirection;
}

/** A player's recent performance compared to their season baseline */
export interface PlayerTrend {
  readonly playerId: string;
  readonly playerName: string;
  readonly roundsPlayed: number;
  readonly isSignificant: boolean;
  readonly sampleSizeWarning: boolean;
  readonly stats: PlayerStatTrend[];
}

/** Categorical difficulty label for match outlook */
export type OutlookLabel = 'Easy' | 'Competitive' | 'Tough' | 'Upset Alert';

/** Historical matchup summary between two teams */
export interface HeadToHeadRecord {
  readonly totalMatches: number;
  readonly homeWins: number;
  readonly awayWins: number;
  readonly draws: number;
  readonly homeWinRate: number;
}

/** A predictive assessment for an upcoming match */
export interface MatchOutlook {
  readonly matchId: string;
  readonly homeTeamCode: string;
  readonly awayTeamCode: string;
  readonly homeFormRating: number | null;
  readonly awayFormRating: number | null;
  readonly headToHead: HeadToHeadRecord;
  readonly strengthRating: number | null;
  readonly compositeScore: number;
  readonly label: OutlookLabel;
  readonly factorsAvailable: number;
}

/** A completed match returned alongside outlook data */
export interface CompletedMatchResult {
  readonly matchId: string;
  readonly homeTeamCode: string;
  readonly awayTeamCode: string;
  readonly homeScore: number;
  readonly awayScore: number;
  readonly status: 'Completed';
}

/** How a player's impact was calculated */
export type ImpactMethod = 'availability' | 'correlation';

/** A single player's impact on their team's results */
export interface PlayerImpact {
  readonly playerId: string;
  readonly playerName: string;
  readonly matchesPlayed: number;
  readonly matchesMissed: number;
  readonly winRateWith: number;
  readonly winRateWithout: number | null;
  readonly impactScore: number;
  readonly method: ImpactMethod;
}

/** Ranked assessment of individual players' impact on team outcomes */
export interface CompositionImpact {
  readonly teamCode: string;
  readonly teamName: string;
  readonly year: number;
  readonly totalMatches: number;
  readonly sampleSizeWarning: boolean;
  readonly playerImpacts: PlayerImpact[];
}
