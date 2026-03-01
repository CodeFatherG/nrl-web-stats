/**
 * API route definitions using Hono
 */

import { Hono } from 'hono';
import { corsMiddleware } from './middleware/cors.js';
import { loggerMiddleware, errorLoggerMiddleware } from './middleware/logger.js';
import type { HandlerDeps } from './handlers.js';
import * as handlers from './handlers.js';

// Environment bindings type
interface Env {
  ASSETS: Fetcher;
  ENVIRONMENT: string;
}

/**
 * Create API routes with injected dependencies
 */
export function createApiRoutes(deps: HandlerDeps): Hono<{ Bindings: Env }> {
  const api = new Hono<{ Bindings: Env }>();

  // Apply middleware
  api.use('*', errorLoggerMiddleware);
  api.use('*', loggerMiddleware);
  api.use('*', corsMiddleware);

  // Health & Status (use injected deps for metadata)
  api.get('/health', handlers.getHealth(deps));

  // Years (use injected deps for metadata)
  api.get('/years', handlers.getYears(deps));

  // Teams
  api.get('/teams', handlers.getTeams);
  api.get('/teams/:code/schedule', handlers.getTeamSchedule);

  // Fixtures
  api.get('/fixtures', handlers.getFixtures);

  // Rounds
  api.get('/rounds/:year/:round', handlers.getRoundDetails);

  // Rankings
  api.get('/rankings/:year', handlers.getAllTeamsRanking);
  api.get('/rankings/:year/:code', handlers.getTeamRanking);
  api.get('/rankings/:year/:code/:round', handlers.getTeamRoundRankingHandler);

  // Streaks
  api.get('/streaks/:year/:code', handlers.getTeamStreaks);

  // Season Summary (use injected deps for metadata)
  api.get('/season/:year/summary', handlers.getSeasonSummary(deps));

  // Scrape trigger (use injected use case)
  api.post('/scrape', handlers.triggerScrape(deps));

  return api;
}
