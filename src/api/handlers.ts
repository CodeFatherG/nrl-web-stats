/**
 * API request handlers for Hono
 */

import type { Context } from 'hono';
import { z } from 'zod';
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
  AnalyticsFormParamsSchema,
  AnalyticsFormQuerySchema,
  AnalyticsOutlookParamsSchema,
  AnalyticsOutlookQuerySchema,
  AnalyticsTrendsQuerySchema,
  AnalyticsCompositionParamsSchema,
} from '../models/schemas.js';
import type { MatchRepository } from '../domain/repositories/match-repository.js';
import type { PlayerRepository } from '../domain/repositories/player-repository.js';
import type { ScrapeDrawUseCase } from '../application/use-cases/scrape-draw.js';
import type { ScrapeMatchResultsUseCase } from '../application/use-cases/scrape-match-results.js';
import type { ScrapePlayerStatsUseCase } from '../application/use-cases/scrape-player-stats.js';
import type { GetTeamFormUseCase } from '../application/use-cases/get-team-form.js';
import type { GetMatchOutlookUseCase } from '../application/use-cases/get-match-outlook.js';
import type { GetPlayerTrendsUseCase } from '../application/use-cases/get-player-trends.js';
import type { GetCompositionImpactUseCase } from '../application/use-cases/get-composition-impact.js';
import {
  getLastScrapeTimes,
  getAllTeamsFromDb,
  getTeamByCode,
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

/** Dependencies injected from the composition root */
export interface HandlerDeps {
  scrapeDrawUseCase: ScrapeDrawUseCase;
  scrapeMatchResultsUseCase: ScrapeMatchResultsUseCase;
  matchRepository: MatchRepository;
  /** Factory to create a per-request D1PlayerRepository from the DB binding */
  createPlayerRepository: (db: D1Database) => PlayerRepository;
  /** Factory to create a per-request ScrapePlayerStatsUseCase from the DB binding */
  createScrapePlayerStatsUseCase: (db: D1Database) => ScrapePlayerStatsUseCase;
  /** Analytics use cases */
  getTeamFormUseCase: GetTeamFormUseCase;
  getMatchOutlookUseCase: GetMatchOutlookUseCase;
  getPlayerTrendsUseCase: GetPlayerTrendsUseCase;
  getCompositionImpactUseCase: GetCompositionImpactUseCase;
}

// Environment bindings type
interface Env {
  ASSETS: Fetcher;
  ENVIRONMENT: string;
  DB: D1Database;
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
export function getHealth(deps: HandlerDeps) {
  return async (c: ApiContext) => {
    const cacheStatus = cacheStore.getStatus();
    const response: HealthResponse & { cache: typeof cacheStatus } = {
      status: 'ok',
      loadedYears: await deps.matchRepository.getLoadedYears(),
      totalFixtures: await deps.matchRepository.getMatchCount(),
      cache: cacheStatus,
    };
    return c.json(response);
  };
}

/**
 * GET /api/years - List available years
 */
export function getYears(deps: HandlerDeps) {
  return async (c: ApiContext) => {
    const response: YearsResponse = {
      years: await deps.matchRepository.getLoadedYears(),
      lastUpdated: getLastScrapeTimes(),
    };
    return c.json(response);
  };
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
export function getTeamSchedule(deps: HandlerDeps) {
  return async (c: ApiContext) => {
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
    const result = await createGetTeamScheduleUseCase(deps.matchRepository).execute(code, year);
    return c.json({
      team,
      schedule: result.schedule,
      totalStrength: result.totalStrength,
      byeRounds: result.byeRounds,
      ...(result.thresholds && { thresholds: result.thresholds }),
    });
  };
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
export function getRoundDetails(deps: HandlerDeps) {
  return async (c: ApiContext) => {
    const yearResult = YearSchema.safeParse(c.req.param('year'));
    const roundResult = RoundSchema.safeParse(c.req.param('round'));
    if (!yearResult.success) {
      return errorResponse(c, 'INVALID_YEAR', 'Year must be 1998 or later', 400);
    }
    if (!roundResult.success) {
      return errorResponse(c, 'INVALID_ROUND', 'Round must be between 1 and 27', 400);
    }
    const result = await createGetRoundDetailsUseCase(deps.matchRepository).execute(yearResult.data, roundResult.data);
    return c.json(result);
  };
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
export function getSeasonSummary(deps: HandlerDeps) {
  return async (c: ApiContext) => {
    const parseResult = SeasonSummaryParamsSchema.safeParse({ year: c.req.param('year') });
    if (!parseResult.success) {
      return errorResponse(c, 'INVALID_YEAR', 'Year must be a valid integer (1998 or later)', 400);
    }
    const { year } = parseResult.data;
    if (!(await deps.matchRepository.isYearLoaded(year))) {
      const loadedYears = await deps.matchRepository.getLoadedYears();
      const validYearsStr = loadedYears.length > 0 ? ` (loaded years: ${loadedYears.join(', ')})` : '';
      return errorResponse(c, 'NOT_FOUND', `Season data for ${year} has not been loaded${validYearsStr}`, 404);
    }
    const result = await createGetSeasonSummaryUseCase(deps.matchRepository).execute(year);
    return c.json(result as SeasonSummaryResponse);
  };
}

// ============================================
// Scrape
// ============================================

/**
 * POST /api/scrape - Trigger scrape operation
 * Uses cache with request coalescing to prevent duplicate concurrent scrapes
 */
export function triggerScrape(deps: HandlerDeps) {
  return async (c: ApiContext) => {
    try {
      const body = await c.req.json();
      const parseResult = ScrapeRequestSchema.safeParse(body);
      if (!parseResult.success) {
        return errorResponse(c, 'INVALID_YEAR', 'Year must be 1998 or later', 400);
      }
      const { year, force } = parseResult.data;
      const result = await deps.scrapeDrawUseCase.execute(year, force);

      // After draw loads, also scrape match results so analytics have data
      try {
        await deps.scrapeMatchResultsUseCase.execute(year);
      } catch {
        // Match results are optional — don't fail the draw scrape
      }

      return c.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return errorResponse(c, 'SCRAPE_FAILED', message, 500);
    }
  };
}

// ============================================
// Player Statistics
// ============================================

const PlayerScrapeRequestSchema = z.object({
  year: z.number().int().min(2020).max(2030),
  round: z.number().int().min(1).max(31),
  force: z.boolean().optional().default(false),
});

const SeasonQuerySchema = z.coerce.number().int().min(2020).max(2030);

/**
 * GET /api/players/team/:teamCode - Get players for a team
 */
export function getTeamPlayers(deps: HandlerDeps) {
  return async (c: ApiContext) => {
    const teamCode = c.req.param('teamCode')?.toUpperCase();
    if (!teamCode || !VALID_TEAM_CODES.includes(teamCode)) {
      return errorResponse(c, 'Bad Request', `Invalid team code: ${teamCode}`, 400, VALID_TEAM_CODES);
    }

    const seasonParam = c.req.query('season');
    let season: number | undefined;
    if (seasonParam) {
      const parsed = SeasonQuerySchema.safeParse(seasonParam);
      if (!parsed.success) {
        return errorResponse(c, 'Bad Request', `Invalid season: ${seasonParam}`, 400);
      }
      season = parsed.data;
    }

    const repo = deps.createPlayerRepository(c.env.DB);
    const players = await repo.findByTeam(teamCode, season);

    const playerResults = [];
    for (const player of players) {
      const performances = await repo.findMatchPerformances(player.id, season ?? new Date().getFullYear());
      const aggregates = await repo.findSeasonAggregates(player.id, season ?? new Date().getFullYear());

      playerResults.push({
        id: player.id,
        name: player.name,
        position: player.position,
        seasonStats: aggregates ?? {
          matchesPlayed: 0,
          totalTries: 0,
          totalGoals: 0,
          totalTackles: 0,
          totalRunMetres: 0,
          totalFantasyPoints: 0,
        },
        performances: performances.map(p => ({
          matchId: p.matchId,
          round: p.round,
          teamCode: p.teamCode,
          tries: p.tries,
          goals: p.goals,
          tackles: p.tackles,
          runMetres: p.runMetres,
          fantasyPoints: p.fantasyPoints,
          isComplete: p.isComplete,
        })),
      });
    }

    return c.json({
      team: teamCode,
      season: season ?? null,
      players: playerResults,
    });
  };
}

/**
 * GET /api/players/:playerId - Get a single player
 */
export function getPlayer(deps: HandlerDeps) {
  return async (c: ApiContext) => {
    const playerId = c.req.param('playerId');
    if (!playerId) {
      return errorResponse(c, 'Bad Request', 'Missing playerId', 400);
    }

    const seasonParam = c.req.query('season');
    let seasonFilter: number | undefined;
    if (seasonParam) {
      const parsed = SeasonQuerySchema.safeParse(seasonParam);
      if (!parsed.success) {
        return errorResponse(c, 'Bad Request', `Invalid season: ${seasonParam}`, 400);
      }
      seasonFilter = parsed.data;
    }

    const repo = deps.createPlayerRepository(c.env.DB);
    const player = await repo.findById(playerId);

    if (!player) {
      return errorResponse(c, 'Not Found', `Player not found: ${playerId}`, 404);
    }

    // Group performances by season
    const seasons: Record<string, {
      matchesPlayed: number;
      totalTries: number;
      totalGoals: number;
      totalTackles: number;
      totalRunMetres: number;
      totalFantasyPoints: number;
      performances: Array<{
        matchId: string;
        round: number;
        teamCode: string;
        tries: number;
        goals: number;
        tackles: number;
        runMetres: number;
        fantasyPoints: number;
        isComplete: boolean;
      }>;
    }> = {};

    // Get unique seasons from performances
    const performanceSeasons = new Set(player.performances.map(p => p.year));
    const seasonsToQuery = seasonFilter ? [seasonFilter] : [...performanceSeasons];

    for (const year of seasonsToQuery) {
      const performances = await repo.findMatchPerformances(playerId, year);
      const aggregates = await repo.findSeasonAggregates(playerId, year);

      if (performances.length > 0 || aggregates) {
        seasons[String(year)] = {
          matchesPlayed: aggregates?.matchesPlayed ?? 0,
          totalTries: aggregates?.totalTries ?? 0,
          totalGoals: aggregates?.totalGoals ?? 0,
          totalTackles: aggregates?.totalTackles ?? 0,
          totalRunMetres: aggregates?.totalRunMetres ?? 0,
          totalFantasyPoints: aggregates?.totalFantasyPoints ?? 0,
          performances: performances.map(p => ({
            matchId: p.matchId,
            round: p.round,
            teamCode: p.teamCode,
            tries: p.tries,
            goals: p.goals,
            tackles: p.tackles,
            runMetres: p.runMetres,
            fantasyPoints: p.fantasyPoints,
            isComplete: p.isComplete,
          })),
        };
      }
    }

    return c.json({
      id: player.id,
      name: player.name,
      position: player.position,
      teamCode: player.teamCode,
      seasons,
    });
  };
}

/**
 * POST /api/scrape/players - Trigger player stats scrape
 */
export function triggerPlayerScrape(deps: HandlerDeps) {
  return async (c: ApiContext) => {
    try {
      const body = await c.req.json();
      const parseResult = PlayerScrapeRequestSchema.safeParse(body);

      if (!parseResult.success) {
        const issue = parseResult.error.issues[0];
        return errorResponse(c, 'Bad Request', `Missing required field: ${issue.path.join('.')}`, 400);
      }

      const { year, round, force } = parseResult.data;

      // Check if round is already complete before scraping
      if (!force) {
        const repo = deps.createPlayerRepository(c.env.DB);
        const isComplete = await repo.isRoundComplete(year, round);
        if (isComplete) {
          return errorResponse(
            c,
            'Bad Request',
            `Round ${round} is already complete. Use force: true to re-scrape.`,
            400
          );
        }
      }

      const useCase = deps.createScrapePlayerStatsUseCase(c.env.DB);
      const result = await useCase.execute(year, round, force);

      return c.json({
        success: true,
        year: result.year,
        round: result.round,
        playersProcessed: result.playersProcessed,
        matchesScraped: result.matchesScraped,
        created: result.created,
        updated: result.updated,
        skipped: result.skipped,
        warnings: result.warnings,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return errorResponse(c, 'Bad Gateway', message, 502 as unknown as 500);
    }
  };
}

// ============================================
// Analytics
// ============================================

/**
 * GET /api/analytics/form/:year/:teamCode - Team form trajectory
 */
export function getTeamForm(deps: HandlerDeps) {
  return async (c: ApiContext) => {
    const paramsResult = AnalyticsFormParamsSchema.safeParse({
      year: c.req.param('year'),
      teamCode: c.req.param('teamCode'),
    });
    if (!paramsResult.success) {
      const issue = paramsResult.error.issues[0];
      return errorResponse(c, 'VALIDATION_ERROR', issue.message, 400, VALID_TEAM_CODES);
    }

    const queryResult = AnalyticsFormQuerySchema.safeParse({
      window: c.req.query('window'),
    });
    if (!queryResult.success) {
      return errorResponse(c, 'VALIDATION_ERROR', 'Window must be between 1 and 27', 400);
    }

    const { year, teamCode } = paramsResult.data;
    const { window: windowSize } = queryResult.data;

    const trajectory = await deps.getTeamFormUseCase.execute(teamCode, year, windowSize);
    return c.json(trajectory);
  };
}

/**
 * GET /api/analytics/outlook/:year/:round - Match outlook for a round
 */
export function getMatchOutlook(deps: HandlerDeps) {
  return async (c: ApiContext) => {
    const paramsResult = AnalyticsOutlookParamsSchema.safeParse({
      year: c.req.param('year'),
      round: c.req.param('round'),
    });
    if (!paramsResult.success) {
      const issue = paramsResult.error.issues[0];
      return errorResponse(c, 'VALIDATION_ERROR', issue.message, 400);
    }

    const queryResult = AnalyticsOutlookQuerySchema.safeParse({
      window: c.req.query('window'),
    });
    if (!queryResult.success) {
      return errorResponse(c, 'VALIDATION_ERROR', 'Window must be between 1 and 27', 400);
    }

    const { year, round } = paramsResult.data;
    const { window: windowSize } = queryResult.data;

    const result = await deps.getMatchOutlookUseCase.execute(year, round, windowSize);
    return c.json(result);
  };
}

/**
 * GET /api/analytics/trends/:year/:teamCode - Player performance trends
 */
export function getPlayerTrends(deps: HandlerDeps) {
  return async (c: ApiContext) => {
    const paramsResult = AnalyticsFormParamsSchema.safeParse({
      year: c.req.param('year'),
      teamCode: c.req.param('teamCode'),
    });
    if (!paramsResult.success) {
      const issue = paramsResult.error.issues[0];
      return errorResponse(c, 'VALIDATION_ERROR', issue.message, 400, VALID_TEAM_CODES);
    }

    const queryResult = AnalyticsTrendsQuerySchema.safeParse({
      window: c.req.query('window'),
      significantOnly: c.req.query('significantOnly'),
    });
    if (!queryResult.success) {
      return errorResponse(c, 'VALIDATION_ERROR', 'Invalid query parameters', 400);
    }

    const { year, teamCode } = paramsResult.data;
    const { window: windowSize, significantOnly } = queryResult.data;

    const result = await deps.getPlayerTrendsUseCase.execute(
      c.env.DB, teamCode, year, windowSize, significantOnly
    );
    return c.json(result);
  };
}

/**
 * GET /api/analytics/composition/:year/:teamCode - Team composition impact
 */
export function getCompositionImpact(deps: HandlerDeps) {
  return async (c: ApiContext) => {
    const paramsResult = AnalyticsCompositionParamsSchema.safeParse({
      year: c.req.param('year'),
      teamCode: c.req.param('teamCode'),
    });
    if (!paramsResult.success) {
      const issue = paramsResult.error.issues[0];
      return errorResponse(c, 'VALIDATION_ERROR', issue.message, 400, VALID_TEAM_CODES);
    }

    const { year, teamCode } = paramsResult.data;

    const result = await deps.getCompositionImpactUseCase.execute(c.env.DB, teamCode, year);
    return c.json(result);
  };
}
