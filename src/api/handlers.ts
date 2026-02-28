/**
 * API request handlers for Hono
 */

import type { Context } from 'hono';
import type {
  HealthResponse,
  YearsResponse,
  TeamRoundRankingResponse,
  TeamSeasonRankingResponse,
  AllTeamsRankingResponse,
  TeamStreaksResponse,
  SeasonSummaryResponse,
} from '../models/types.js';
import {
  ScrapeRequestSchema,
  FixtureQuerySchema,
  YearSchema,
  RoundSchema,
  SeasonSummaryParamsSchema,
} from '../models/schemas.js';
import {
  getLoadedYears,
  getLastScrapeTimes,
  getTotalFixtureCount,
  getAllTeamsFromDb,
  getTeamByCode,
  isYearLoaded,
} from '../database/store.js';
import { fixtures } from '../database/query.js';
import {
  getTeamRoundRanking,
  getTeamSeasonRanking,
  getAllTeamSeasonRankings,
  calculateSeasonThresholds,
} from '../database/rankings.js';
import { VALID_TEAM_CODES } from '../models/team.js';
import { cacheStore } from '../cache/store.js';
import { createGetTeamScheduleUseCase } from '../application/use-cases/get-team-schedule.js';
import { createGetSeasonSummaryUseCase } from '../application/use-cases/get-season-summary.js';
import { createGetRoundDetailsUseCase } from '../application/use-cases/get-round-details.js';
import { createAnalyseStreaksUseCase } from '../application/use-cases/analyse-streaks.js';
import { createScrapeDrawUseCase } from '../application/use-cases/scrape-draw.js';

// Environment bindings type
interface Env {
  ASSETS: Fetcher;
  ENVIRONMENT: string;
}

type ApiContext = Context<{ Bindings: Env }>;

// Helper to create error responses
function errorResponse(c: ApiContext, code: string, message: string, status: number, validOptions?: (string | number)[]) {
  return c.json({
    error: code,
    message,
    ...(validOptions && { validOptions }),
  }, status as 400 | 404 | 500);
}

// ============================================
// Health & Status
// ============================================

/**
 * GET /api/health - Health check
 */
export async function getHealth(c: ApiContext) {
  const cacheStatus = cacheStore.getStatus();
  const response: HealthResponse & { cache: typeof cacheStatus } = {
    status: 'ok',
    loadedYears: getLoadedYears(),
    totalFixtures: getTotalFixtureCount(),
    cache: cacheStatus,
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

// ============================================
// Teams
// ============================================

/**
 * GET /api/teams - List all teams
 */
export async function getTeams(c: ApiContext) {
  return c.json({ teams: getAllTeamsFromDb() });
}

/**
 * GET /api/teams/:code/schedule - Get team schedule
 */
export async function getTeamSchedule(c: ApiContext) {
  const code = c.req.param('code')?.toUpperCase();
  if (!code || !VALID_TEAM_CODES.includes(code)) {
    return errorResponse(c, 'INVALID_TEAM', `Unknown team code: ${code}`, 400, VALID_TEAM_CODES);
  }
  const team = getTeamByCode(code);
  if (!team) {
    return errorResponse(c, 'TEAM_NOT_FOUND', `Team not found: ${code}`, 404, VALID_TEAM_CODES);
  }
  const yearParam = c.req.query('year');
  const year = yearParam ? YearSchema.safeParse(yearParam).data : undefined;
  const result = createGetTeamScheduleUseCase().execute(code, year);
  return c.json({
    team,
    schedule: result.schedule,
    totalStrength: result.totalStrength,
    byeRounds: result.byeRounds,
    ...(result.thresholds && { thresholds: result.thresholds }),
  });
}

// ============================================
// Fixtures
// ============================================

/**
 * GET /api/fixtures - Query fixtures with filters
 */
export async function getFixtures(c: ApiContext) {
  const queryParams = {
    year: c.req.query('year'),
    team: c.req.query('team'),
    round: c.req.query('round'),
    roundStart: c.req.query('roundStart'),
    roundEnd: c.req.query('roundEnd'),
    home: c.req.query('homeOnly'),
    away: c.req.query('awayOnly'),
    byes: c.req.query('byesOnly'),
    opponent: c.req.query('opponent'),
  };

  const parseResult = FixtureQuerySchema.safeParse(queryParams);

  if (!parseResult.success) {
    return errorResponse(c, 'INVALID_PARAMETER', 'Invalid query parameters', 400);
  }

  const params = parseResult.data;

  // Validate team code if provided
  if (params.team && !VALID_TEAM_CODES.includes(params.team)) {
    return errorResponse(c, 'INVALID_TEAM', `Unknown team code: ${params.team}`, 400, VALID_TEAM_CODES);
  }

  // Validate opponent code if provided
  if (params.opponent && !VALID_TEAM_CODES.includes(params.opponent)) {
    return errorResponse(c, 'INVALID_TEAM', `Unknown team code: ${params.opponent}`, 400, VALID_TEAM_CODES);
  }

  // Build query
  let query = fixtures();

  if (params.year) {
    query = query.year(params.year);
  }
  if (params.team) {
    query = query.team(params.team);
  }
  if (params.round) {
    query = query.round(params.round);
  }
  if (params.roundStart !== undefined && params.roundEnd !== undefined) {
    query = query.roundRange(params.roundStart, params.roundEnd);
  } else if (params.roundStart !== undefined) {
    query = query.roundRange(params.roundStart, 27);
  } else if (params.roundEnd !== undefined) {
    query = query.roundRange(1, params.roundEnd);
  }
  if (params.home) {
    query = query.homeOnly();
  }
  if (params.away) {
    query = query.awayOnly();
  }
  if (params.byes) {
    query = query.byesOnly();
  }
  if (params.opponent) {
    query = query.opponent(params.opponent);
  }

  const fixtureList = query.execute();

  return c.json(fixtureList);
}

// ============================================
// Rounds
// ============================================

/**
 * GET /api/rounds/:year/:round - Get round details
 */
export async function getRoundDetails(c: ApiContext) {
  const yearResult = YearSchema.safeParse(c.req.param('year'));
  const roundResult = RoundSchema.safeParse(c.req.param('round'));
  if (!yearResult.success) {
    return errorResponse(c, 'INVALID_YEAR', 'Year must be 1998 or later', 400);
  }
  if (!roundResult.success) {
    return errorResponse(c, 'INVALID_ROUND', 'Round must be between 1 and 27', 400);
  }
  const result = createGetRoundDetailsUseCase().execute(yearResult.data, roundResult.data);
  return c.json(result);
}

// ============================================
// Rankings
// ============================================

/**
 * GET /api/rankings/:year - Get all teams ranking for year
 */
export async function getAllTeamsRanking(c: ApiContext) {
  const yearResult = YearSchema.safeParse(c.req.param('year'));

  if (!yearResult.success) {
    return errorResponse(c, 'INVALID_YEAR', 'Year must be 1998 or later', 400);
  }

  const year = yearResult.data;
  const rankedTeams = getAllTeamSeasonRankings(year);

  if (rankedTeams.length === 0) {
    return errorResponse(c, 'NOT_FOUND', `No data found for ${year}`, 404);
  }

  const response: AllTeamsRankingResponse = {
    year,
    thresholds: calculateSeasonThresholds(year),
    rankings: rankedTeams.map(({ teamCode, ranking, rank }) => {
      const team = getTeamByCode(teamCode);
      return {
        team: team || { code: teamCode, name: teamCode },
        totalStrength: ranking.totalStrength,
        averageStrength: ranking.averageStrength,
        percentile: ranking.percentile,
        category: ranking.category,
        rank,
      };
    }),
  };

  return c.json(response);
}

/**
 * GET /api/rankings/:year/:code - Get team season ranking
 */
export async function getTeamRanking(c: ApiContext) {
  const yearResult = YearSchema.safeParse(c.req.param('year'));
  const code = c.req.param('code')?.toUpperCase();

  if (!yearResult.success) {
    return errorResponse(c, 'INVALID_YEAR', 'Year must be 1998 or later', 400);
  }

  if (!code || !VALID_TEAM_CODES.includes(code)) {
    return errorResponse(c, 'INVALID_TEAM', `Unknown team code: ${code}`, 400, VALID_TEAM_CODES);
  }

  const year = yearResult.data;
  const team = getTeamByCode(code);
  if (!team) {
    return errorResponse(c, 'TEAM_NOT_FOUND', `Team not found: ${code}`, 404, VALID_TEAM_CODES);
  }

  const ranking = getTeamSeasonRanking(year, code);
  if (!ranking) {
    return errorResponse(c, 'NOT_FOUND', `No data found for ${code} in ${year}`, 404);
  }

  const response: TeamSeasonRankingResponse = {
    team,
    ranking,
  };

  return c.json(response);
}

/**
 * GET /api/rankings/:year/:code/:round - Get team round ranking
 */
export async function getTeamRoundRankingHandler(c: ApiContext) {
  const yearResult = YearSchema.safeParse(c.req.param('year'));
  const roundResult = RoundSchema.safeParse(c.req.param('round'));
  const code = c.req.param('code')?.toUpperCase();

  if (!yearResult.success) {
    return errorResponse(c, 'INVALID_YEAR', 'Year must be 1998 or later', 400);
  }
  if (!roundResult.success) {
    return errorResponse(c, 'INVALID_ROUND', 'Round must be between 1 and 27', 400);
  }

  if (!code || !VALID_TEAM_CODES.includes(code)) {
    return errorResponse(c, 'INVALID_TEAM', `Unknown team code: ${code}`, 400, VALID_TEAM_CODES);
  }

  const year = yearResult.data;
  const round = roundResult.data;
  const team = getTeamByCode(code);
  if (!team) {
    return errorResponse(c, 'TEAM_NOT_FOUND', `Team not found: ${code}`, 404, VALID_TEAM_CODES);
  }

  const ranking = getTeamRoundRanking(year, code, round);
  if (!ranking) {
    return errorResponse(c, 'NOT_FOUND', `No data found for ${code} in round ${round} of ${year}`, 404);
  }

  const response: TeamRoundRankingResponse = {
    team,
    ranking,
  };

  return c.json(response);
}

// ============================================
// Streaks
// ============================================

/**
 * GET /api/streaks/:year/:code - Get team streak analysis
 */
export async function getTeamStreaks(c: ApiContext) {
  const yearResult = YearSchema.safeParse(c.req.param('year'));
  const code = c.req.param('code')?.toUpperCase();
  if (!yearResult.success) {
    return errorResponse(c, 'INVALID_YEAR', 'Year must be 1998 or later', 400);
  }
  if (!code || !VALID_TEAM_CODES.includes(code)) {
    return errorResponse(c, 'INVALID_TEAM', `Unknown team code: ${code}`, 400, VALID_TEAM_CODES);
  }
  const year = yearResult.data;
  const team = getTeamByCode(code);
  if (!team) {
    return errorResponse(c, 'TEAM_NOT_FOUND', `Team not found: ${code}`, 404, VALID_TEAM_CODES);
  }
  const result = createAnalyseStreaksUseCase().execute(year, code);
  if (!result) {
    return errorResponse(c, 'NOT_FOUND', `No data found for ${code} in ${year}`, 404);
  }
  const response: TeamStreaksResponse = { team, year, streaks: result.streaks, summary: result.summary };
  return c.json(response);
}

// ============================================
// Season Summary
// ============================================

/**
 * GET /api/season/:year/summary - Get season summary
 */
export async function getSeasonSummary(c: ApiContext) {
  const parseResult = SeasonSummaryParamsSchema.safeParse({ year: c.req.param('year') });
  if (!parseResult.success) {
    return errorResponse(c, 'INVALID_YEAR', 'Year must be a valid integer (1998 or later)', 400);
  }
  const { year } = parseResult.data;
  if (!isYearLoaded(year)) {
    const loadedYears = getLoadedYears();
    const validYearsStr = loadedYears.length > 0 ? ` (loaded years: ${loadedYears.join(', ')})` : '';
    return errorResponse(c, 'NOT_FOUND', `Season data for ${year} has not been loaded${validYearsStr}`, 404);
  }
  const result = createGetSeasonSummaryUseCase().execute(year);
  return c.json(result as SeasonSummaryResponse);
}

// ============================================
// Scrape
// ============================================

/**
 * POST /api/scrape - Trigger scrape operation
 * Uses cache with request coalescing to prevent duplicate concurrent scrapes
 */
export async function triggerScrape(c: ApiContext) {
  try {
    const body = await c.req.json();
    const parseResult = ScrapeRequestSchema.safeParse(body);
    if (!parseResult.success) {
      return errorResponse(c, 'INVALID_YEAR', 'Year must be 1998 or later', 400);
    }
    const { year, force } = parseResult.data;
    const result = await createScrapeDrawUseCase().execute(year, force);
    return c.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return errorResponse(c, 'SCRAPE_FAILED', message, 500);
  }
}
