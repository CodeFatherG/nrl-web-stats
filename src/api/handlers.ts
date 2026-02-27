/**
 * API request handlers
 * Stubs for Phase 2 - will be implemented in Phase 4 (US2)
 */

import type { Context } from 'hono';
import type { HealthResponse, YearsResponse } from '../models/types.js';
import { getAllTeams } from '../models/team.js';
import { getLoadedYears, getTotalFixtureCount, getLastScrapeTimes, getAllTeamsFromDb } from '../database/store.js';

// Environment bindings type
interface Env {
  ASSETS: Fetcher;
  ENVIRONMENT: string;
}

type ApiContext = Context<{ Bindings: Env }>;

/**
 * GET /api/health - Health check
 */
export async function getHealth(c: ApiContext) {
  const response: HealthResponse = {
    status: 'ok',
    loadedYears: getLoadedYears(),
    totalFixtures: getTotalFixtureCount(),
  };
  return c.json(response);
}

/**
 * GET /api/years - List available years
 */
export async function getYears(c: ApiContext) {
  const response: YearsResponse = {
    years: getLoadedYears(),
    lastUpdated: getLastScrapeTimes(),
  };
  return c.json(response);
}

/**
 * GET /api/teams - List all teams
 */
export async function getTeams(c: ApiContext) {
  return c.json(getAllTeamsFromDb());
}

/**
 * GET /api/teams/:code/schedule - Get team schedule
 * TODO: Implement in Phase 4
 */
export async function getTeamSchedule(c: ApiContext) {
  const code = c.req.param('code');
  return c.json({ message: `Team schedule for ${code} - not implemented yet` }, 501);
}

/**
 * GET /api/fixtures - Query fixtures with filters
 * TODO: Implement in Phase 4
 */
export async function getFixtures(c: ApiContext) {
  return c.json({ message: 'Fixtures endpoint - not implemented yet' }, 501);
}

/**
 * GET /api/rounds/:year/:round - Get round details
 * TODO: Implement in Phase 4
 */
export async function getRoundDetails(c: ApiContext) {
  const year = c.req.param('year');
  const round = c.req.param('round');
  return c.json({ message: `Round ${round} of ${year} - not implemented yet` }, 501);
}

/**
 * GET /api/rankings/:year - Get all teams ranking for year
 * TODO: Implement in Phase 4
 */
export async function getAllTeamsRanking(c: ApiContext) {
  const year = c.req.param('year');
  return c.json({ message: `Rankings for ${year} - not implemented yet` }, 501);
}

/**
 * GET /api/rankings/:year/:code - Get team season ranking
 * TODO: Implement in Phase 4
 */
export async function getTeamRanking(c: ApiContext) {
  const year = c.req.param('year');
  const code = c.req.param('code');
  return c.json({ message: `Rankings for ${code} in ${year} - not implemented yet` }, 501);
}

/**
 * GET /api/rankings/:year/:code/:round - Get team round ranking
 * TODO: Implement in Phase 4
 */
export async function getTeamRoundRankingHandler(c: ApiContext) {
  const year = c.req.param('year');
  const code = c.req.param('code');
  const round = c.req.param('round');
  return c.json({ message: `Rankings for ${code} in ${year} round ${round} - not implemented yet` }, 501);
}

/**
 * GET /api/season/:year/summary - Get season summary
 * TODO: Implement in Phase 4
 */
export async function getSeasonSummary(c: ApiContext) {
  const year = c.req.param('year');
  return c.json({ message: `Season summary for ${year} - not implemented yet` }, 501);
}

/**
 * POST /api/scrape - Trigger scrape operation
 * TODO: Implement in Phase 4
 */
export async function triggerScrape(c: ApiContext) {
  return c.json({ message: 'Scrape endpoint - not implemented yet' }, 501);
}
