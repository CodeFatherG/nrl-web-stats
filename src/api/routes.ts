/**
 * API route definitions using Hono
 */

import { Hono } from 'hono';
import { corsMiddleware } from './middleware/cors.js';
import { loggerMiddleware, errorLoggerMiddleware } from './middleware/logger.js';
import * as handlers from './handlers.js';

// Environment bindings type
interface Env {
  ASSETS: Fetcher;
  ENVIRONMENT: string;
}

/**
 * Create API routes
 */
export function createApiRoutes(): Hono<{ Bindings: Env }> {
  const api = new Hono<{ Bindings: Env }>();

  // Apply middleware
  api.use('*', errorLoggerMiddleware);
  api.use('*', loggerMiddleware);
  api.use('*', corsMiddleware);

  // Health & Status
  api.get('/health', handlers.getHealth);

  // Years
  api.get('/years', handlers.getYears);

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

  // Season Summary
  api.get('/season/:year/summary', handlers.getSeasonSummary);

  // Scrape trigger
  api.post('/scrape', handlers.triggerScrape);

  return api;
}
