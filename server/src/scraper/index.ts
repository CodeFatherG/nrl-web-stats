/**
 * Scraper module exports
 */

import { fetchScheduleHtml } from './fetcher.js';
import { parseScheduleHtml } from './parser.js';
import { loadFixtures } from '../database/store.js';
import type { ScrapeResult } from '../models/types.js';
import { logger } from '../utils/logger.js';

export { fetchScheduleHtml } from './fetcher.js';
export { parseScheduleHtml } from './parser.js';
export { extractTeamCodeFromImage, isTeamCode } from './teams.js';

/**
 * Scrape and load schedule data for a specific year
 */
export async function scrapeAndLoadSchedule(year: number): Promise<ScrapeResult> {
  logger.info('Starting scrape operation', { year });

  // Fetch HTML
  const html = await fetchScheduleHtml(year);

  // Parse HTML
  const parseResult = parseScheduleHtml(html, year);

  // Load into database
  loadFixtures(year, parseResult.fixtures);

  const result: ScrapeResult = {
    success: true,
    year,
    teamsLoaded: parseResult.teamCount,
    fixturesLoaded: parseResult.fixtures.length,
    warnings: parseResult.warnings,
    timestamp: new Date().toISOString(),
  };

  logger.info('Scrape operation complete', {
    year,
    teamsLoaded: result.teamsLoaded,
    fixturesLoaded: result.fixturesLoaded,
    warningCount: result.warnings.length,
  });

  return result;
}
