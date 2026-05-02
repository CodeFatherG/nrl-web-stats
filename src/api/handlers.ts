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
import type { ScrapeSupplementaryStatsUseCase } from '../application/use-cases/scrape-supplementary-stats.js';
import type { GetSupercoachScoresUseCase } from '../application/use-cases/get-supercoach-scores.js';
import type { ScrapeTeamListsUseCase } from '../application/use-cases/scrape-team-lists.js';
import type { TeamListRepository } from '../domain/repositories/team-list-repository.js';
import type { ScrapeCasualtyWardUseCase } from '../application/use-cases/scrape-casualty-ward.js';
import type { CasualtyWardRepository } from '../domain/repositories/casualty-ward-repository.js';
import type { GetTeamFormUseCase } from '../application/use-cases/get-team-form.js';
import type { GetMatchOutlookUseCase } from '../application/use-cases/get-match-outlook.js';
import type { GetPlayerTrendsUseCase } from '../application/use-cases/get-player-trends.js';
import type { GetCompositionImpactUseCase } from '../application/use-cases/get-composition-impact.js';
import type { GetPlayerProjectionUseCase } from '../application/use-cases/get-player-projection.js';
import type { GetTeamProjectionRankingsUseCase } from '../application/use-cases/get-team-projection-rankings.js';
import type { GetContextualProjectionUseCase } from '../application/use-cases/get-contextual-projection.js';
import type { GetContextualProfileUseCase } from '../application/use-cases/get-contextual-profile.js';
import type { PlayerMovementsCache } from '../analytics/player-movements-cache.js';
import type { ComputePlayerMovementsUseCase } from '../application/use-cases/compute-player-movements.js';
import type { RankingMode } from '../analytics/player-projection-types.js';
import {
  getLastScrapeTimes,
  getAllTeamsFromDb,
  getTeamByCode,
} from '../database/store.js';
import { D1SupplementaryStatsRepository } from '../infrastructure/persistence/d1-supplementary-stats-repo.js';
import { D1PlayerNameLinkRepository } from '../infrastructure/persistence/d1-player-name-link-repo.js';
import { normalizeName, matchPlayerName } from '../config/player-name-matcher.js';
import type { MatchingContext } from '../config/player-name-matcher.js';
import type { SupplementaryPlayerStats } from '../domain/ports/supplementary-stats-source.js';
import { fixtures } from '../database/query.js';
import {
  getTeamRoundRanking,
  getTeamSeasonRanking,
  getAllTeamSeasonRankings,
  calculateSeasonThresholds,
} from '../database/rankings.js';
import { VALID_TEAM_CODES } from '../models/team.js';
import { VALID_VENUE_IDS } from '../config/venue-normalisation.js';
import { VALID_WEATHER_CATEGORIES } from '../config/weather-normalisation.js';
import type { WeatherCategory } from '../config/weather-normalisation.js';
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
  /** Factory to create a per-request ScrapeSupplementaryStatsUseCase from the DB binding */
  createScrapeSupplementaryStatsUseCase: (db: D1Database) => ScrapeSupplementaryStatsUseCase;
  /** Factory to create a per-request GetSupercoachScoresUseCase from the DB binding */
  createGetSupercoachScoresUseCase: (db: D1Database) => GetSupercoachScoresUseCase;
  /** Factory to create a per-request ScrapeTeamListsUseCase from the DB binding */
  createScrapeTeamListsUseCase: (db: D1Database) => ScrapeTeamListsUseCase;
  /** Factory to create a per-request TeamListRepository from the DB binding */
  createTeamListRepository: (db: D1Database) => TeamListRepository;
  /** Factory to create a per-request ScrapeCasualtyWardUseCase from the DB binding */
  createScrapeCasualtyWardUseCase: (db: D1Database) => ScrapeCasualtyWardUseCase;
  /** Factory to create a per-request CasualtyWardRepository from the DB binding */
  createCasualtyWardRepository: (db: D1Database) => CasualtyWardRepository;
  /** Factory to create a per-request GetPlayerProjectionUseCase from the DB binding */
  createGetPlayerProjectionUseCase: (db: D1Database) => GetPlayerProjectionUseCase;
  /** Factory to create a per-request GetTeamProjectionRankingsUseCase from the DB binding */
  createGetTeamProjectionRankingsUseCase: (db: D1Database) => GetTeamProjectionRankingsUseCase;
  /** Factory to create a per-request supplementary stats repository for lock checks */
  createSupplementaryStatsRepository: (db: D1Database) => { isRoundCached(season: number, round: number): Promise<boolean> };
  /** Factory to create a per-request GetContextualProjectionUseCase from the DB binding */
  createGetContextualProjectionUseCase: (db: D1Database) => GetContextualProjectionUseCase;
  /** Factory to create a per-request GetContextualProfileUseCase from the DB binding */
  createGetContextualProfileUseCase: (db: D1Database) => GetContextualProfileUseCase;
  /** In-memory cache for pre-computed player movements per round */
  playerMovementsCache: PlayerMovementsCache;
  /** Factory to create a per-request ComputePlayerMovementsUseCase from the DB binding */
  createComputePlayerMovementsUseCase: (db: D1Database) => ComputePlayerMovementsUseCase;
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
    const teamListRepo = deps.createTeamListRepository(c.env.DB);
    const result = await createGetRoundDetailsUseCase(deps.matchRepository, teamListRepo).execute(yearResult.data, roundResult.data);
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
 * GET /api/players/season/:year - Get all players with aggregated season stats
 */
export function getSeasonPlayers(deps: HandlerDeps) {
  return async (c: ApiContext) => {
    const yearParam = c.req.param('year');
    const parsed = YearSchema.safeParse(Number(yearParam));

    if (!parsed.success) {
      return errorResponse(c, 'Bad Request', 'Invalid year parameter', 400);
    }

    const year = parsed.data;
    const repo = deps.createPlayerRepository(c.env.DB);
    const summaries = await repo.findAllSeasonSummaries(year);

    if (summaries.length === 0) {
      return errorResponse(c, 'Not Found', `No player data for season ${year}`, 404);
    }

    return c.json({
      season: year,
      players: summaries,
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

    // Group performances by season — return full stats (same shape as match detail player stats)
    const seasons: Record<string, {
      matchesPlayed: number;
      totalTries: number;
      totalGoals: number;
      totalTackles: number;
      totalRunMetres: number;
      totalFantasyPoints: number;
      performances: Array<Record<string, unknown>>;
    }> = {};

    // Get unique seasons from performances
    const performanceSeasons = new Set(player.performances.map(p => p.year));
    const seasonsToQuery = seasonFilter ? [seasonFilter] : [...performanceSeasons];

    // Build opponent lookup from match_performances table
    // For each match_id, find the other team_code that participated
    const opponentMap = new Map<string, string>();
    const matchIdsForLookup = player.performances
      .filter(p => seasonsToQuery.includes(p.year))
      .map(p => p.matchId);
    if (matchIdsForLookup.length > 0) {
      const placeholders = matchIdsForLookup.map(() => '?').join(',');
      const oppResult = await c.env.DB
        .prepare(`SELECT DISTINCT match_id, team_code FROM match_performances WHERE match_id IN (${placeholders})`)
        .bind(...matchIdsForLookup)
        .all<{ match_id: string; team_code: string }>();
      // Group by match_id to find pairs
      const matchTeams = new Map<string, string[]>();
      for (const row of oppResult.results ?? []) {
        const teams = matchTeams.get(row.match_id) ?? [];
        if (!teams.includes(row.team_code)) teams.push(row.team_code);
        matchTeams.set(row.match_id, teams);
      }
      for (const [matchId, teamCodes] of matchTeams) {
        if (teamCodes.length === 2) {
          opponentMap.set(`${matchId}:${teamCodes[0]}`, teamCodes[1]!);
          opponentMap.set(`${matchId}:${teamCodes[1]}`, teamCodes[0]!);
        }
      }
    }

    // Build supplementary stats lookup using centralized name matcher
    const suppRepo = new D1SupplementaryStatsRepository(c.env.DB);
    const linkRepo = new D1PlayerNameLinkRepository(c.env.DB);

    // Load persisted links once
    const persistedLinks = new Map<string, string>();
    const allLinks = await linkRepo.findAll();
    for (const link of allLinks) {
      persistedLinks.set(link.playerId, link.supplementaryName);
    }

    const nameParts = player.name.trim().split(/\s+/);
    const lastName = nameParts.length > 1 ? nameParts.slice(-1).join(' ') : nameParts[0];
    const firstName = nameParts.length > 1 ? nameParts.slice(0, -1).join(' ') : '';
    let linkPersisted = false;

    for (const year of seasonsToQuery) {
      const performances = await repo.findMatchPerformances(playerId, year);
      const aggregates = await repo.findSeasonAggregates(playerId, year);

      if (performances.length > 0 || aggregates) {
        // Load supplementary stats for all rounds this player played
        const rounds = [...new Set(performances.map(p => p.round))];
        const suppByRound = new Map<number, SupplementaryPlayerStats>();
        for (const round of rounds) {
          const roundSupp = await suppRepo.findByRound(year, round);
          const supplementaryNames = roundSupp.map(s => s.playerName);
          const supplementaryTeamCodes = new Map<string, string>();
          for (const s of roundSupp) {
            if (s.teamCode) supplementaryTeamCodes.set(s.playerName, s.teamCode);
          }
          const ctx: MatchingContext = { persistedLinks, supplementaryTeamCodes };
          const identityMatch = matchPlayerName(playerId, firstName, lastName, player.teamCode, supplementaryNames, ctx);
          if (identityMatch) {
            const matched = roundSupp.find(s => s.playerName === identityMatch.supplementaryName);
            if (matched) suppByRound.set(round, matched);

            // Auto-persist new link on first discovery
            if (!linkPersisted && identityMatch.confidence !== 'linked') {
              linkPersisted = true;
              linkRepo.save({
                playerId, playerName: player.name, teamCode: player.teamCode,
                supplementaryName: identityMatch.supplementaryName,
                confidence: identityMatch.confidence, source: 'auto',
              }).catch(() => {}); // non-blocking
            }
          }
        }

        seasons[String(year)] = {
          matchesPlayed: aggregates?.matchesPlayed ?? 0,
          totalTries: aggregates?.totalTries ?? 0,
          totalGoals: aggregates?.totalGoals ?? 0,
          totalTackles: aggregates?.totalTackles ?? 0,
          totalRunMetres: aggregates?.totalRunMetres ?? 0,
          totalFantasyPoints: aggregates?.totalFantasyPoints ?? 0,
          performances: performances.map(p => {
            const { matchId, year: _y, ...stats } = p;
            const opponentTeamCode = opponentMap.get(`${matchId}:${p.teamCode}`) ?? null;
            const supp = suppByRound.get(p.round) ?? null;
            return {
              matchId, opponentTeamCode, ...stats,
              lastTouch: supp?.lastTouch ?? null,
              missedGoals: supp?.missedGoals ?? null,
              missedFieldGoals: supp?.missedFieldGoals ?? null,
              effectiveOffloads: supp?.effectiveOffloads ?? null,
              ineffectiveOffloads: supp?.ineffectiveOffloads ?? null,
              runsOver8m: supp?.runsOver8m ?? null,
              runsUnder8m: supp?.runsUnder8m ?? null,
              trySaves: supp?.trySaves ?? null,
              kickRegatherBreak: supp?.kickRegatherBreak ?? null,
              heldUpInGoal: supp?.heldUpInGoal ?? null,
              price: supp?.price ?? null,
              breakEven: supp?.breakEven ?? null,
            };
          }),
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

      // Check if round is locked by supplementary stats before scraping
      if (!force) {
        const suppRepo = deps.createSupplementaryStatsRepository(c.env.DB);
        const hasSuppStats = await suppRepo.isRoundCached(year, round);
        if (hasSuppStats) {
          return errorResponse(
            c,
            'Bad Request',
            `Round ${round} player stats are locked by supplementary stats. Use force: true to override.`,
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

// ============================================
// Supercoach
// ============================================

const SupercoachScrapeRequestSchema = z.object({
  year: z.number().int().min(2020).max(2030),
  round: z.number().int().min(1).max(27),
  force: z.boolean().optional().default(false),
});

/**
 * POST /api/scrape/supercoach - Trigger supplementary stats scrape
 */
export function triggerSupercoachScrape(deps: HandlerDeps) {
  return async (c: ApiContext) => {
    try {
      const body = await c.req.json();
      const parseResult = SupercoachScrapeRequestSchema.safeParse(body);

      if (!parseResult.success) {
        const issue = parseResult.error.issues[0];
        return errorResponse(c, 'VALIDATION_ERROR', `Invalid request body: ${issue.path.join('.')} ${issue.message}`, 400);
      }

      const { year, round, force } = parseResult.data;
      const useCase = deps.createScrapeSupplementaryStatsUseCase(c.env.DB);
      const result = await useCase.execute(year, round, force);

      return c.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return errorResponse(c, 'UPSTREAM_ERROR', `Failed to fetch supplementary stats: ${message}`, 502 as unknown as 500);
    }
  };
}

/** Zod schema for supercoach match ID: {year}-R{round}-{teamA}-{teamB} */
const SupercoachMatchIdSchema = z.string().regex(
  /^\d{4}-R\d{1,2}-[A-Z]{3}-[A-Z]{3}$/,
  'Invalid match ID format. Expected: {year}-R{round}-{teamA}-{teamB}'
);

/**
 * GET /api/supercoach/:year/match/:matchId — Supercoach scores for a single match
 */
export function getSupercoachByMatch(deps: HandlerDeps) {
  return async (c: ApiContext) => {
    const yearResult = YearSchema.safeParse(c.req.param('year'));
    if (!yearResult.success) {
      return errorResponse(c, 'INVALID_YEAR', 'Year must be 1998 or later', 400);
    }

    const matchIdParam = c.req.param('matchId');
    const matchIdResult = SupercoachMatchIdSchema.safeParse(matchIdParam);
    if (!matchIdResult.success) {
      return errorResponse(c, 'INVALID_MATCH_ID', 'Invalid match ID format. Expected: {year}-R{round}-{teamA}-{teamB}', 400);
    }

    const useCase = deps.createGetSupercoachScoresUseCase(c.env.DB);
    const result = await useCase.executeForMatch(matchIdResult.data);

    if (!result) {
      return errorResponse(c, 'MATCH_NOT_FOUND', `Match not found: ${matchIdResult.data}`, 404);
    }

    return c.json(result);
  };
}

/**
 * GET /api/supercoach/:year/:round — All matches in a round with team-grouped scores
 */
export function getSupercoachScores(deps: HandlerDeps) {
  return async (c: ApiContext) => {
    const yearResult = YearSchema.safeParse(c.req.param('year'));
    const roundResult = RoundSchema.safeParse(c.req.param('round'));

    if (!yearResult.success) {
      return errorResponse(c, 'INVALID_YEAR', 'Year must be 1998 or later', 400);
    }
    if (!roundResult.success) {
      return errorResponse(c, 'INVALID_ROUND', 'Round must be between 1 and 27', 400, Array.from({ length: 27 }, (_, i) => i + 1));
    }

    const useCase = deps.createGetSupercoachScoresUseCase(c.env.DB);
    const result = await useCase.executeForRound(yearResult.data, roundResult.data);

    return c.json(result);
  };
}

/**
 * GET /api/supercoach/:year/team/:teamCode — All matches a team played this year
 */
export function getSupercoachByTeam(deps: HandlerDeps) {
  return async (c: ApiContext) => {
    const yearResult = YearSchema.safeParse(c.req.param('year'));
    if (!yearResult.success) {
      return errorResponse(c, 'INVALID_YEAR', 'Year must be 1998 or later', 400);
    }

    const teamCode = c.req.param('teamCode')?.toUpperCase();
    if (!teamCode || !VALID_TEAM_CODES.includes(teamCode)) {
      return errorResponse(c, 'INVALID_TEAM_CODE', `Unknown team code: ${teamCode ?? ''}`, 400, VALID_TEAM_CODES);
    }

    const useCase = deps.createGetSupercoachScoresUseCase(c.env.DB);
    const result = await useCase.executeForTeamSeason(yearResult.data, teamCode);

    return c.json(result);
  };
}

/**
 * GET /api/supercoach/:year/player/:playerId — Player season Supercoach trend
 */
export function getPlayerSupercoachSeason(deps: HandlerDeps) {
  return async (c: ApiContext) => {
    const yearResult = YearSchema.safeParse(c.req.param('year'));
    if (!yearResult.success) {
      return errorResponse(c, 'INVALID_YEAR', 'Year must be 1998 or later', 400);
    }

    const playerId = c.req.param('playerId');
    if (!playerId) {
      return errorResponse(c, 'MISSING_PLAYER_ID', 'Player ID is required', 400);
    }

    const useCase = deps.createGetSupercoachScoresUseCase(c.env.DB);
    const result = await useCase.executeForPlayer(yearResult.data, playerId);

    if (!result) {
      return errorResponse(c, 'PLAYER_NOT_FOUND', `Player not found: ${playerId}`, 404);
    }

    return c.json(result);
  };
}

// ============================================
// Match Detail
// ============================================

/** Zod schema for match ID: {year}-R{round}-{teamA}-{teamB} */
const MatchIdSchema = z.string().regex(
  /^\d{4}-R\d{1,2}-[A-Z]{3}-[A-Z]{3}$/,
  'Invalid match ID format. Expected: {year}-R{round}-{teamA}-{teamB}'
);

/**
 * GET /api/matches/:matchId - Get match detail with player stats
 */
export function getMatchDetail(deps: HandlerDeps) {
  return async (c: ApiContext) => {
    const matchIdParam = c.req.param('matchId');
    const parseResult = MatchIdSchema.safeParse(matchIdParam);

    if (!parseResult.success) {
      return errorResponse(
        c,
        'Bad Request',
        'Invalid match ID format. Expected: {year}-R{round}-{teamA}-{teamB}',
        400
      );
    }

    const matchId = parseResult.data;
    const match = await deps.matchRepository.findById(matchId);

    if (!match) {
      return errorResponse(c, 'Not Found', `Match not found: ${matchId}`, 404);
    }

    // Resolve team names
    const homeTeam = match.homeTeamCode ? getTeamByCode(match.homeTeamCode) : null;
    const awayTeam = match.awayTeamCode ? getTeamByCode(match.awayTeamCode) : null;

    // Fetch player performances for both teams
    const repo = deps.createPlayerRepository(c.env.DB);
    const mapPerformance = (p: { playerName: string; position: string; playerId: string; performance: import('../domain/player').MatchPerformance }) => {
      const { matchId: _mid, year: _y, round: _r, teamCode: _tc, isComplete: _ic, ...stats } = p.performance;
      return { playerId: p.playerId, playerName: p.playerName, position: p.position, ...stats };
    };

    let homePlayerStats: ReturnType<typeof mapPerformance>[] = [];
    let awayPlayerStats: ReturnType<typeof mapPerformance>[] = [];

    if (match.homeTeamCode) {
      const homePerfs = await repo.findPerformancesByMatch(match.year, match.round, match.homeTeamCode);
      homePlayerStats = homePerfs.map(mapPerformance);
    }

    if (match.awayTeamCode) {
      const awayPerfs = await repo.findPerformancesByMatch(match.year, match.round, match.awayTeamCode);
      awayPlayerStats = awayPerfs.map(mapPerformance);
    }

    // Join supplementary stats (from nrlsupercoachstats.com) using centralized matcher
    const suppRepo = new D1SupplementaryStatsRepository(c.env.DB);
    const linkRepo = new D1PlayerNameLinkRepository(c.env.DB);
    const suppStats = await suppRepo.findByRound(match.year, match.round);
    const supplementaryNames = suppStats.map(s => s.playerName);
    const suppMap = new Map<string, SupplementaryPlayerStats>(
      suppStats.map(s => [s.playerName, s])
    );

    // Build matching context
    const persistedLinks = new Map<string, string>();
    const allLinks = await linkRepo.findAll();
    for (const link of allLinks) {
      persistedLinks.set(link.playerId, link.supplementaryName);
    }
    const supplementaryTeamCodes = new Map<string, string>();
    for (const s of suppStats) {
      if (s.teamCode) supplementaryTeamCodes.set(s.playerName, s.teamCode);
    }
    const matchCtx: MatchingContext = { persistedLinks, supplementaryTeamCodes };

    // Merge supplementary fields into player stats and auto-persist new links
    const linksToSave: Array<import('../infrastructure/persistence/d1-player-name-link-repo.js').PlayerNameLink> = [];
    const mergeSupp = (player: ReturnType<typeof mapPerformance>, teamCode: string) => {
      const parts = player.playerName.trim().split(/\s+/);
      const lastName = parts.length > 1 ? parts.slice(-1).join(' ') : parts[0];
      const firstName = parts.length > 1 ? parts.slice(0, -1).join(' ') : '';
      const identityMatch = matchPlayerName(player.playerId, firstName, lastName, teamCode, supplementaryNames, matchCtx);
      const supp = identityMatch ? (suppMap.get(identityMatch.supplementaryName) ?? null) : null;

      if (identityMatch && identityMatch.confidence !== 'linked') {
        linksToSave.push({
          playerId: player.playerId, playerName: player.playerName, teamCode,
          supplementaryName: identityMatch.supplementaryName,
          confidence: identityMatch.confidence, source: 'auto',
        });
      }

      return {
        ...player,
        lastTouch: supp?.lastTouch ?? null,
        missedGoals: supp?.missedGoals ?? null,
        missedFieldGoals: supp?.missedFieldGoals ?? null,
        effectiveOffloads: supp?.effectiveOffloads ?? null,
        ineffectiveOffloads: supp?.ineffectiveOffloads ?? null,
        runsOver8m: supp?.runsOver8m ?? null,
        runsUnder8m: supp?.runsUnder8m ?? null,
        trySaves: supp?.trySaves ?? null,
        kickRegatherBreak: supp?.kickRegatherBreak ?? null,
        heldUpInGoal: supp?.heldUpInGoal ?? null,
        price: supp?.price ?? null,
        breakEven: supp?.breakEven ?? null,
      };
    };

    const homeStats = homePlayerStats.map(p => mergeSupp(p, match.homeTeamCode ?? ''));
    const awayStats = awayPlayerStats.map(p => mergeSupp(p, match.awayTeamCode ?? ''));

    // Auto-persist new links (non-blocking)
    if (linksToSave.length > 0) {
      linkRepo.saveBatch(linksToSave).catch(() => {});
    }

    // Fetch team lists if available
    const teamListRepo = deps.createTeamListRepository(c.env.DB);
    const teamLists = await teamListRepo.findByMatch(match.id);
    const homeTeamList = teamLists.find(tl => tl.teamCode === match.homeTeamCode) ?? null;
    const awayTeamList = teamLists.find(tl => tl.teamCode === match.awayTeamCode) ?? null;

    const formatTeamList = (tl: typeof homeTeamList) =>
      tl
        ? {
            teamCode: tl.teamCode,
            scrapedAt: tl.scrapedAt,
            members: tl.members.map(m => ({
              jerseyNumber: m.jerseyNumber,
              playerName: m.playerName,
              position: m.position,
              playerId: m.playerId,
            })),
          }
        : null;

    return c.json({
      matchId: match.id,
      year: match.year,
      round: match.round,
      homeTeamCode: match.homeTeamCode ?? '',
      awayTeamCode: match.awayTeamCode ?? '',
      homeTeamName: homeTeam?.name ?? match.homeTeamCode ?? 'Unknown',
      awayTeamName: awayTeam?.name ?? match.awayTeamCode ?? 'Unknown',
      homeScore: match.homeScore,
      awayScore: match.awayScore,
      status: match.status,
      homeStrengthRating: match.homeStrengthRating,
      awayStrengthRating: match.awayStrengthRating,
      scheduledTime: match.scheduledTime,
      stadium: match.stadium,
      weather: match.weather,
      homeTeamList: formatTeamList(homeTeamList),
      awayTeamList: formatTeamList(awayTeamList),
      homePlayerStats: homeStats,
      awayPlayerStats: awayStats,
    });
  };
}

// ============================================
// Team List Scrape Trigger
// ============================================

const TeamListScrapeSchema = z.object({
  year: z.coerce.number().int().min(1998),
  round: z.coerce.number().int().min(1).max(30).optional(),
});

/**
 * POST /api/scrape/team-lists - Trigger team list scrape
 */
export function triggerTeamListScrape(deps: HandlerDeps) {
  return async (c: ApiContext) => {
    const body = await c.req.json().catch(() => ({}));
    const parseResult = TeamListScrapeSchema.safeParse(body);

    if (!parseResult.success) {
      return errorResponse(c, 'INVALID_REQUEST', 'Request must include a valid year', 400);
    }

    const { year, round } = parseResult.data;

    try {
      const useCase = deps.createScrapeTeamListsUseCase(c.env.DB);
      const result = await useCase.execute(year, round);

      if (round !== undefined) {
        try {
          const computeUseCase = deps.createComputePlayerMovementsUseCase(c.env.DB);
          await computeUseCase.execute(year, round);
        } catch (computeError) {
          const msg = computeError instanceof Error ? computeError.message : String(computeError);
          console.error(`Failed to compute player movements after team list scrape: ${msg}`);
        }
      }

      return c.json({
        success: result.success,
        scrapedCount: result.scrapedCount,
        skippedCount: result.skippedCount,
        backfilledCount: result.backfilledCount,
        warnings: result.warnings.map(w => w.message),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return errorResponse(c, 'SCRAPE_FAILED', `Failed to scrape team lists: ${message}`, 500);
    }
  };
}

// ============================================
// Casualty Ward
// ============================================

/**
 * POST /api/scrape/casualty-ward - Trigger casualty ward scrape
 */
export function triggerCasualtyWardScrape(deps: HandlerDeps) {
  return async (c: ApiContext) => {
    try {
      const useCase = deps.createScrapeCasualtyWardUseCase(c.env.DB);
      const result = await useCase.execute();

      return c.json({
        success: result.success,
        newEntries: result.newEntries,
        closedEntries: result.closedEntries,
        updatedEntries: result.updatedEntries,
        totalOpen: result.totalOpen,
        warnings: result.warnings.map(w => w.message),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return errorResponse(c, 'SCRAPE_FAILED', `Failed to scrape casualty ward: ${message}`, 500);
    }
  };
}

/**
 * GET /api/casualty-ward - Get all currently injured players
 */
export function getCasualtyWard(deps: HandlerDeps) {
  return async (c: ApiContext) => {
    try {
      const repo = deps.createCasualtyWardRepository(c.env.DB);
      const entries = await repo.findOpen();

      return c.json({
        entries: entries.map(e => ({
          id: e.id,
          firstName: e.firstName,
          lastName: e.lastName,
          playerName: `${e.firstName} ${e.lastName}`,
          teamCode: e.teamCode,
          injury: e.injury,
          expectedReturn: e.expectedReturn,
          startDate: e.startDate,
          endDate: e.endDate,
          playerId: e.playerId,
        })),
        count: entries.length,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return errorResponse(c, 'FETCH_FAILED', `Failed to fetch casualty ward: ${message}`, 500);
    }
  };
}

/**
 * GET /api/casualty-ward/player/:playerId - Get injury history for a player
 */
export function getPlayerInjuryHistory(deps: HandlerDeps) {
  return async (c: ApiContext) => {
    const playerId = c.req.param('playerId');

    if (!playerId) {
      return errorResponse(c, 'INVALID_PARAMS', 'Player ID is required', 400);
    }

    try {
      const repo = deps.createCasualtyWardRepository(c.env.DB);
      const entries = await repo.findByPlayerId(playerId);

      if (entries.length === 0) {
        return errorResponse(c, 'NOT_FOUND', `No casualty ward records found for player ${playerId}`, 404);
      }

      return c.json({
        playerId,
        entries: entries.map(e => ({
          id: e.id,
          firstName: e.firstName,
          lastName: e.lastName,
          playerName: `${e.firstName} ${e.lastName}`,
          teamCode: e.teamCode,
          injury: e.injury,
          expectedReturn: e.expectedReturn,
          startDate: e.startDate,
          endDate: e.endDate,
          playerId: e.playerId,
        })),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return errorResponse(c, 'FETCH_FAILED', `Failed to fetch player injury history: ${message}`, 500);
    }
  };
}

// ============================================
// Supercoach Player Projections
// ============================================

const VALID_RANKING_MODES: RankingMode[] = ['composite', 'captaincy', 'selection', 'trade'];

/**
 * GET /api/supercoach/:year/player/:playerId/projection
 */
export function getPlayerProjection(deps: HandlerDeps) {
  return async (c: ApiContext) => {
    const yearResult = YearSchema.safeParse(c.req.param('year'));
    if (!yearResult.success) {
      return errorResponse(c, 'INVALID_YEAR', 'Year must be 1998 or later', 400);
    }

    const playerId = c.req.param('playerId');
    if (!playerId) {
      return errorResponse(c, 'MISSING_PLAYER_ID', 'Player ID is required', 400);
    }

    const useCase = deps.createGetPlayerProjectionUseCase(c.env.DB);
    const profile = await useCase.execute(yearResult.data, playerId);

    if (!profile) {
      return errorResponse(c, 'PLAYER_NOT_FOUND', `Player not found: ${playerId}`, 404);
    }

    // Serialize Infinity as null (not valid JSON)
    return c.json({
      ...profile,
      spikeCv: isFinite(profile.spikeCv) ? profile.spikeCv : null,
      floorCv: profile.floorCv === null || isFinite(profile.floorCv) ? profile.floorCv : null,
    });
  };
}

/**
 * GET /api/supercoach/:year/team/:teamCode/rankings?mode=composite|captaincy|selection|trade
 */
export function getTeamProjectionRankings(deps: HandlerDeps) {
  return async (c: ApiContext) => {
    const yearResult = YearSchema.safeParse(c.req.param('year'));
    if (!yearResult.success) {
      return errorResponse(c, 'INVALID_YEAR', 'Year must be 1998 or later', 400);
    }

    const teamCode = c.req.param('teamCode')?.toUpperCase();
    if (!teamCode || !VALID_TEAM_CODES.includes(teamCode)) {
      return errorResponse(c, 'INVALID_TEAM_CODE', `Unknown team code: ${teamCode ?? ''}`, 400, VALID_TEAM_CODES);
    }

    const modeParam = c.req.query('mode') ?? 'composite';
    if (!VALID_RANKING_MODES.includes(modeParam as RankingMode)) {
      return errorResponse(c, 'INVALID_MODE', `Unknown ranking mode: ${modeParam}`, 400, VALID_RANKING_MODES);
    }
    const mode = modeParam as RankingMode;

    const useCase = deps.createGetTeamProjectionRankingsUseCase(c.env.DB);
    const rankings = await useCase.execute(yearResult.data, teamCode, mode);

    // Serialize Infinity → null in each player profile
    const serialized = {
      ...rankings,
      rankedPlayers: rankings.rankedPlayers.map(rp => ({
        ...rp,
        profile: {
          ...rp.profile,
          spikeCv: isFinite(rp.profile.spikeCv) ? rp.profile.spikeCv : null,
          floorCv: rp.profile.floorCv === null || isFinite(rp.profile.floorCv) ? rp.profile.floorCv : null,
        },
      })),
    };

    return c.json(serialized);
  };
}

/**
 * GET /api/supercoach/:year/player/:playerId/contextual-projection?opponent=BRI
 */
export function getContextualProjection(deps: HandlerDeps) {
  return async (c: ApiContext) => {
    const yearResult = YearSchema.safeParse(c.req.param('year'));
    if (!yearResult.success) {
      return errorResponse(c, 'INVALID_YEAR', 'Year must be 1998 or later', 400);
    }

    const playerId = c.req.param('playerId');
    if (!playerId) {
      return errorResponse(c, 'MISSING_PLAYER_ID', 'Player ID is required', 400);
    }

    const opponentRaw = c.req.query('opponent');
    const opponent = opponentRaw ? opponentRaw.toUpperCase() : undefined;
    if (opponent && !VALID_TEAM_CODES.includes(opponent)) {
      return errorResponse(c, 'INVALID_TEAM_CODE', `Unknown team code: ${opponentRaw}`, 400, VALID_TEAM_CODES);
    }

    const venueRaw = c.req.query('venue');
    if (venueRaw && !VALID_VENUE_IDS.includes(venueRaw)) {
      return errorResponse(c, 'INVALID_VENUE', `Unknown venue: '${venueRaw}'. Valid venue IDs can be found at GET /api/supercoach/venues`, 400, [...VALID_VENUE_IDS]);
    }
    const venue = venueRaw ?? undefined;

    const weatherRaw = c.req.query('weather');
    if (weatherRaw && !(VALID_WEATHER_CATEGORIES as readonly string[]).includes(weatherRaw)) {
      return errorResponse(c, 'INVALID_WEATHER_CATEGORY', `Unknown weather category: '${weatherRaw}'. Valid categories: ${VALID_WEATHER_CATEGORIES.join(', ')}`, 400, [...VALID_WEATHER_CATEGORIES]);
    }
    const weather = weatherRaw as WeatherCategory | undefined;

    const useCase = deps.createGetContextualProjectionUseCase(c.env.DB);
    const outcome = await useCase.execute(yearResult.data, playerId, opponent, venue, weather);

    if (outcome.kind === 'player_not_found') {
      return errorResponse(c, 'PLAYER_NOT_FOUND', `Player not found: ${playerId}`, 404);
    }
    if (outcome.kind === 'no_projection') {
      return errorResponse(c, 'PLAYER_PROJECTION_NOT_FOUND', `No projection data available for player: ${playerId}`, 404);
    }

    return c.json(outcome.result);
  };
}

/**
 * GET /api/supercoach/venues
 * Returns all canonical stadium records for API param discovery and UI dropdowns.
 */
export function getVenues(_deps: HandlerDeps) {
  return async (c: ApiContext) => {
    const result = await c.env.DB.prepare(
      'SELECT id, name, city FROM stadiums ORDER BY name ASC',
    ).all<{ id: string; name: string; city: string | null }>();

    return c.json({ venues: result.results });
  };
}

/**
 * GET /api/supercoach/:year/player/:playerId/contextual-profile
 * Returns multipliers for every opponent, venue, and weather category in one response.
 */
export function getContextualProfile(deps: HandlerDeps) {
  return async (c: ApiContext) => {
    const yearResult = YearSchema.safeParse(c.req.param('year'));
    if (!yearResult.success) {
      return errorResponse(c, 'INVALID_YEAR', 'Year must be 1998 or later', 400);
    }

    const playerId = c.req.param('playerId');
    if (!playerId) {
      return errorResponse(c, 'MISSING_PLAYER_ID', 'Player ID is required', 400);
    }

    const useCase = deps.createGetContextualProfileUseCase(c.env.DB);
    const outcome = await useCase.execute(yearResult.data, playerId);

    if (outcome.kind === 'player_not_found') {
      return errorResponse(c, 'PLAYER_NOT_FOUND', `Player not found: ${playerId}`, 404);
    }
    if (outcome.kind === 'no_projection') {
      return errorResponse(c, 'PLAYER_PROJECTION_NOT_FOUND', `No projection data available for player: ${playerId}`, 404);
    }

    return c.json(outcome.result);
  };
}

// ============================================
// Player Movements
// ============================================

const PlayerMovementsQuerySchema = z.object({
  season: z.coerce.number().int().optional(),
  round: z.coerce.number().int().optional(),
});

/**
 * GET /api/player-movements - Return pre-computed player movements for a round
 */
export function getPlayerMovements(deps: HandlerDeps) {
  return async (c: ApiContext) => {
    try {
      const parseResult = PlayerMovementsQuerySchema.safeParse(c.req.query());
      if (!parseResult.success) {
        return errorResponse(c, 'INVALID_PARAMS', 'Invalid season or round parameter', 400);
      }

      const years = await deps.matchRepository.getLoadedYears();
      const year: number | undefined = parseResult.data.season ?? years[0];
      if (year === undefined) return c.json({ pending: true });

      let round = parseResult.data.round;
      if (round === undefined) {
        const cached = deps.playerMovementsCache.getMostRecentCachedRound(year);
        if (cached !== null) {
          round = cached;
        } else {
          // Cache is cold (fresh deploy / isolate restart). Derive the current round
          // from match data and compute on-demand to warm the cache.
          const allMatches = await deps.matchRepository.findByYear(year);
          const now = new Date();
          const inProgressRounds = [...new Set(
            allMatches.filter(m => m.status === 'InProgress').map(m => m.round)
          )];
          let derivedRound: number | undefined;
          if (inProgressRounds.length > 0) {
            derivedRound = Math.max(...inProgressRounds);
          } else {
            const pastRounds = allMatches
              .filter(m => m.scheduledTime !== null && new Date(m.scheduledTime) <= now)
              .map(m => m.round);
            if (pastRounds.length > 0) derivedRound = Math.max(...pastRounds);
          }
          if (derivedRound === undefined) return c.json({ pending: true });
          round = derivedRound;

          const computeUseCase = deps.createComputePlayerMovementsUseCase(c.env.DB);
          await computeUseCase.execute(year, round);
        }
      }

      const result = deps.playerMovementsCache.get(year, round);
      return c.json(result ?? { pending: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return errorResponse(c, 'INTERNAL_ERROR', `Failed to get player movements: ${message}`, 500);
    }
  };
}
