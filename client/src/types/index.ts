// API Response Types (matching server/docs/API.md)

export interface Team {
  code: string;
  name: string;
}

export interface Fixture {
  id: string;
  year: number;
  round: number;
  teamCode: string;
  opponentCode: string | null;
  isHome: boolean;
  isBye: boolean;
  strengthRating: number;
}

export interface HealthResponse {
  status: 'ok';
  loadedYears: number[];
  totalFixtures: number;
}

export interface ScrapeResponse {
  success: boolean;
  year: number;
  teamsLoaded: number;
  fixturesLoaded: number;
  warnings: string[];
  timestamp: string;
}

export interface YearsResponse {
  years: number[];
  lastUpdated: Record<number, string>;
}

export interface TeamsResponse {
  teams: Team[];
}

export interface ScheduleFixture {
  round: number;
  year: number;
  opponent: string | null;
  isHome: boolean;
  isBye: boolean;
  strengthRating: number;
  category: StrengthCategory;
  scheduledTime?: string | null;
  stadium?: string | null;
  weather?: string | null;
  homeScore?: number | null;
  awayScore?: number | null;
  isComplete?: boolean;
}

export interface TeamScheduleResponse {
  team: Team;
  schedule: ScheduleFixture[];
  totalStrength: number;
  byeRounds: number[];
  thresholds?: StrengthThresholds;
}

export interface FixturesResponse {
  fixtures: Fixture[];
  count: number;
  filters: Record<string, unknown>;
}

export interface RoundMatch {
  homeTeam: string;
  awayTeam: string;
  homeStrength: number;
  awayStrength: number;
  homeScore?: number | null;
  awayScore?: number | null;
  scheduledTime?: string | null;
  isComplete?: boolean;
  stadium?: string | null;
  weather?: string | null;
}

export interface RoundResponse {
  year: number;
  round: number;
  matches: RoundMatch[];
  byeTeams: string[];
}

export interface ApiError {
  error: string;
  message: string;
  validOptions?: (string | number)[];
}

// Ranking Types

export interface TeamRoundRanking {
  teamCode: string;
  year: number;
  round: number;
  strengthRating: number;
  /** Percentile rank 0-1 (0 = hardest, 1 = easiest) */
  percentile: number;
  category: StrengthCategory;
  opponentCode: string | null;
  isHome: boolean;
  isBye: boolean;
}

export interface TeamSeasonRanking {
  teamCode: string;
  year: number;
  totalStrength: number;
  averageStrength: number;
  matchCount: number;
  byeCount: number;
  /** Percentile rank 0-1 across all teams (0 = hardest schedule, 1 = easiest) */
  percentile: number;
  category: StrengthCategory;
  rounds: TeamRoundRanking[];
}

export interface TeamSeasonRankingResponse {
  team: Team;
  ranking: TeamSeasonRanking;
}

export interface AllTeamsRankingResponse {
  year: number;
  thresholds?: StrengthThresholds;
  rankings: Array<{
    team: Team;
    totalStrength: number;
    averageStrength: number;
    percentile: number;
    category: StrengthCategory;
    rank: number;
  }>;
}

// UI State Types

export interface FilterState {
  roundStart: number;
  roundEnd: number;
  venueFilter: 'all' | 'home' | 'away';
}

export const DEFAULT_FILTERS: FilterState = {
  roundStart: 1,
  roundEnd: 27,
  venueFilter: 'all',
};

export interface StrengthThresholds {
  p33: number;
  p67: number;
  lowerFence?: number;
  upperFence?: number;
}

export type StrengthCategory = 'easy' | 'medium' | 'hard';

export type ActiveTab = 'team' | 'round' | 'bye';

export interface AppState {
  serverReady: boolean;
  dataLoaded: boolean;
  loadedYears: number[];
  activeTab: ActiveTab;
  selectedTeamCode: string | null;
  teamSchedule: TeamScheduleResponse | null;
  selectedYear: number;
  selectedRound: number;
  roundData: RoundResponse | null;
  filters: FilterState;
  teams: Team[];
  strengthThresholds: StrengthThresholds;
  loading: boolean;
  error: string | null;
}

// Compact Season View Types

/** Compact match data for season summary */
export interface CompactMatch {
  homeTeam: string;
  awayTeam: string;
  homeScore: number | null;
  awayScore: number | null;
  scheduledTime: string | null;
  isComplete: boolean;
  /** Strength rating for home team's fixture */
  homeStrength: number;
  /** Strength rating for away team's fixture */
  awayStrength: number;
}

/** Compact round data for season summary */
export interface CompactRound {
  round: number;
  matches: CompactMatch[];
  byeTeams: string[];
}

/** Season summary response for compact season view */
export interface SeasonSummaryResponse {
  year: number;
  thresholds?: StrengthThresholds;
  rounds: CompactRound[];
}

/** View mode for round tab */
export type RoundViewMode = 'compact' | 'detailed';

// Streak Analysis Types

/** Streak type discriminator */
export type StreakType = 'soft_draw' | 'rough_patch';

/** A consecutive sequence of rounds qualifying as a Soft Draw or Rough Patch */
export interface Streak {
  type: StreakType;
  /** First round number in the streak (inclusive) */
  startRound: number;
  /** Last round number in the streak (inclusive) */
  endRound: number;
  /** Total non-bye rounds in the streak */
  rounds: number;
  /** Number of favourable rounds (easy + medium category) */
  favourableCount: number;
  /** Number of unfavourable rounds (hard category) */
  unfavourableCount: number;
}

/** Aggregate statistics about a team's streaks */
export interface StreakSummary {
  softDrawCount: number;
  roughPatchCount: number;
  /** Rounds in the longest soft draw, or null if none */
  longestSoftDraw: number | null;
  /** Rounds in the longest rough patch, or null if none */
  longestRoughPatch: number | null;
}

/** Response for team streaks endpoint */
export interface TeamStreaksResponse {
  team: Team;
  year: number;
  streaks: Streak[];
  summary: StreakSummary;
}

// Bye Overview Types

/**
 * Transformed data structure optimized for bye grid rendering.
 * Built from SeasonSummaryResponse.rounds and Team[].
 */
export interface ByeGridData {
  /** All teams sorted alphabetically by full name */
  teams: Team[];
  /** All round numbers from 1 to 27 */
  rounds: number[];
  /** Map from team code to set of round numbers where team has bye */
  byeMap: Map<string, Set<number>>;
  /** Map from round number to count of teams with byes */
  byeCountByRound: Map<number, number>;
  /** Maximum bye count in any single round */
  maxByeCount: number;
  /** Strength from 0-1 on a round's bye effect */
  columnStrengths: Map<number, number>;
  /** Strength from 0-1 on a team's bye effect */
  rowStrengths: Map<string, number>;
}

/**
 * Component state for the bye overview view.
 */
export interface ByeOverviewState {
  /** Currently highlighted team code, or null if no row highlighted */
  highlightedRow: string | null;
  /** Currently highlighted round number, or null if no column highlighted */
  highlightedColumn: number | null;
  /** Round range filter: [start, end] inclusive. Default: [1, 27] */
  roundRange: [number, number];
}

// Significant Bye Statistics Types

/**
 * Data for the significant bye statistics table.
 * Shows rounds with high bye concentration (>2 byes).
 */
export interface SignificantByeRound {
  /** Round number */
  round: number;
  /** Team codes with byes in this round (affected teams) */
  affectedTeams: string[];
  /** Team codes without byes in this round (unaffected teams) */
  unaffectedTeams: string[];
}

/**
 * Props for the SignificantByeStats component.
 */
export interface SignificantByeStatsProps {
  /** Significant rounds data (rounds with >2 byes) */
  significantRounds: SignificantByeRound[];
  /** Currently highlighted team code in the statistics table */
  highlightedTeam: string | null;
  /** Callback when a team chip is clicked */
  onTeamClick: (teamCode: string) => void;
}

/**
 * Props for the TeamChip component.
 */
export interface TeamChipProps {
  /** Team code to display */
  teamCode: string;
  /** Whether this chip should be highlighted */
  isHighlighted: boolean;
  /** Callback when chip is clicked */
  onClick: (teamCode: string) => void;
}

// Match Detail View Types

/** Player performance stats for a single match (all available fields) */
export interface PlayerMatchStats {
  playerName: string;
  position: string;
  minutesPlayed: number;
  tries: number;
  tryAssists: number;
  goals: number;
  goalConversionRate: number;
  fieldGoals: number;
  onePointFieldGoals: number;
  twoPointFieldGoals: number;
  conversions: number;
  conversionAttempts: number;
  penaltyGoals: number;
  points: number;
  allRuns: number;
  allRunMetres: number;
  hitUps: number;
  hitUpRunMetres: number;
  lineEngagedRuns: number;
  postContactMetres: number;
  lineBreaks: number;
  lineBreakAssists: number;
  tackleBreaks: number;
  offloads: number;
  receipts: number;
  passes: number;
  passesToRunRatio: number;
  dummyHalfRuns: number;
  dummyHalfRunMetres: number;
  dummyPasses: number;
  tacklesMade: number;
  missedTackles: number;
  ineffectiveTackles: number;
  tackleEfficiency: number;
  intercepts: number;
  oneOnOneSteal: number;
  oneOnOneLost: number;
  kicks: number;
  kickMetres: number;
  kickReturnMetres: number;
  kicksDefused: number;
  kicksDead: number;
  bombKicks: number;
  grubberKicks: number;
  crossFieldKicks: number;
  forcedDropOutKicks: number;
  fortyTwentyKicks: number;
  twentyFortyKicks: number;
  errors: number;
  handlingErrors: number;
  penalties: number;
  ruckInfringements: number;
  offsideWithinTenMetres: number;
  onReport: number;
  sinBins: number;
  sendOffs: number;
  playTheBallTotal: number;
  playTheBallAverageSpeed: number;
  stintOne: number;
  fantasyPointsTotal: number;
  // Supplementary stats from nrlsupercoachstats.com (null when unavailable)
  lastTouch: number | null;
  missedGoals: number | null;
  missedFieldGoals: number | null;
  effectiveOffloads: number | null;
  ineffectiveOffloads: number | null;
  runsOver8m: number | null;
  runsUnder8m: number | null;
  trySaves: number | null;
  kickRegatherBreak: number | null;
  heldUpInGoal: number | null;
}

/** Response from GET /api/matches/:matchId */
export interface MatchDetailResponse {
  matchId: string;
  year: number;
  round: number;
  homeTeamCode: string;
  awayTeamCode: string;
  homeTeamName: string;
  awayTeamName: string;
  homeScore: number | null;
  awayScore: number | null;
  status: 'Scheduled' | 'InProgress' | 'Completed';
  homeStrengthRating: number | null;
  awayStrengthRating: number | null;
  scheduledTime: string | null;
  stadium: string | null;
  weather: string | null;
  homePlayerStats: PlayerMatchStats[];
  awayPlayerStats: PlayerMatchStats[];
}
