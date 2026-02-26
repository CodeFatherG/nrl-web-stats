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
