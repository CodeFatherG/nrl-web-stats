/**
 * HTTP fetcher module for scraping NRL schedule data
 */

import { ScrapeError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

const BASE_URL = 'https://www.nrlsupercoachstats.com/drawV2.php';

/**
 * Fetch HTML content from the NRL SuperCoach stats website
 */
export async function fetchScheduleHtml(year: number): Promise<string> {
  const url = `${BASE_URL}?year=${year}`;

  logger.info('Fetching schedule data', { url, year });

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'NRL-Schedule-Scraper/1.0',
        'Accept': 'text/html',
      },
    });

    if (!response.ok) {
      throw new ScrapeError(
        `Failed to fetch schedule data: HTTP ${response.status} ${response.statusText}`
      );
    }

    const html = await response.text();

    if (!html || html.length < 1000) {
      throw new ScrapeError('Received empty or invalid response from source');
    }

    logger.info('Successfully fetched schedule data', {
      year,
      contentLength: html.length
    });

    return html;
  } catch (error) {
    if (error instanceof ScrapeError) {
      throw error;
    }

    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to fetch schedule data', { year, error: message });
    throw new ScrapeError(`Failed to fetch schedule data: ${message}`);
  }
}
