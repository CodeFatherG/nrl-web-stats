export interface ScrapeDrawResult {
  success: boolean;
  year: number;
  fixturesLoaded: number;
  fromCache: boolean;
  isStale: boolean;
  warning?: string;
}
