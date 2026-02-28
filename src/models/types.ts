/**
 * Shared types and interfaces for the NRL Schedule Scraper
 */

/** Warning types for malformed data during scraping */
export type WarningType = 'MALFORMED_CELL' | 'MISSING_DATA' | 'PARSE_ERROR';

/** Warning for malformed data during scraping */
export interface Warning {
  type: WarningType;
  message: string;
  context: Record<string, unknown>;
}

/** Result of a scraping operation */
export interface ScrapeResult {
  success: boolean;
  year: number;
  teamsLoaded: number;
  fixturesLoaded: number;
  warnings: Warning[];
  timestamp: string;
}

/** API error response format */
export interface ApiError {
  error: string;
  message: string;
  validOptions?: (string | number)[];
}

/** Query filter options for fixtures */
export interface QueryFilters {
  year?: number;
  team?: string;
  round?: number;
  roundStart?: number;
  roundEnd?: number;
  homeOnly?: boolean;
  awayOnly?: boolean;
  byesOnly?: boolean;
  opponent?: string;
}

/** Health check response */
export interface HealthResponse {
  status: 'ok';
  loadedYears: number[];
  totalFixtures: number;
}

/** Years response */
export interface YearsResponse {
  years: number[];
  lastUpdated: Record<string, string>;
}

/** Strength category based on percentile ranking */
export type StrengthCategory = 'hard' | 'medium' | 'easy';

/** Season-wide strength thresholds computed with IQR outlier removal */
export interface SeasonThresholds {
  /** Rating at or below which fixtures are categorised as 'hard' */
  p33: number;
  /** Rating at or below which fixtures are categorised as 'medium' (above p33) */
  p67: number;
  /** Lower fence for IQR outlier detection */
  lowerFence: number;
  /** Upper fence for IQR outlier detection */
  upperFence: number;
}

/** Team ranking for a specific round */
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

/** Team season ranking summary */
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
  /** Individual round rankings */
  rounds: TeamRoundRanking[];
}

/** Response for team round ranking endpoint */
export interface TeamRoundRankingResponse {
  team: { code: string; name: string };
  ranking: TeamRoundRanking;
}

/** Response for team season ranking endpoint */
export interface TeamSeasonRankingResponse {
  team: { code: string; name: string };
  ranking: TeamSeasonRanking;
}

/** Response for all teams season rankings */
export interface AllTeamsRankingResponse {
  year: number;
  thresholds: SeasonThresholds;
  rankings: Array<{
    team: { code: string; name: string };
    totalStrength: number;
    averageStrength: number;
    percentile: number;
    category: StrengthCategory;
    rank: number;
  }>;
}

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
  thresholds: SeasonThresholds;
  rounds: CompactRound[];
}

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
  team: { code: string; name: string };
  year: number;
  streaks: Streak[];
  summary: StreakSummary;
}
