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
  rankings: Array<{
    team: { code: string; name: string };
    totalStrength: number;
    averageStrength: number;
    percentile: number;
    category: StrengthCategory;
    rank: number;
  }>;
}
