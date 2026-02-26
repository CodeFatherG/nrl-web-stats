/**
 * Request handlers for API endpoints
 */

import type { Request, Response, NextFunction } from 'express';
import type {
  HealthResponse,
  YearsResponse,
  TeamRoundRankingResponse,
  TeamSeasonRankingResponse,
  AllTeamsRankingResponse,
} from '../models/types.js';
import { ScrapeRequestSchema, FixtureQuerySchema, YearSchema, RoundSchema } from '../models/schemas.js';
import { scrapeAndLoadSchedule } from '../scraper/index.js';
import {
  getLoadedYears,
  getLastScrapeTimes,
  getTotalFixtureCount,
  getAllTeams,
  getTeamByCode,
  getFixturesByRound,
} from '../database/store.js';
import { fixtures } from '../database/query.js';
import {
  getTeamRoundRanking,
  getTeamSeasonRanking,
  getAllTeamSeasonRankings,
} from '../database/rankings.js';
import { InvalidParameterError, NotFoundError } from '../utils/errors.js';
import { VALID_TEAM_CODES } from '../models/team.js';

// ============================================
// US1: Load NRL Schedule Data
// ============================================

/**
 * GET /api/health - Health check endpoint
 */
export async function healthCheck(_req: Request, res: Response): Promise<void> {
  const response: HealthResponse = {
    status: 'ok',
    loadedYears: getLoadedYears(),
    totalFixtures: getTotalFixtureCount(),
  };
  res.json(response);
}

/**
 * POST /api/scrape - Scrape schedule data for a year
 */
export async function scrapeSchedule(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parseResult = ScrapeRequestSchema.safeParse(req.body);

    if (!parseResult.success) {
      throw new InvalidParameterError(
        'Year must be between 2010 and 2030'
      );
    }

    const { year } = parseResult.data;
    const result = await scrapeAndLoadSchedule(year);

    res.json(result);
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/years - Get loaded years
 */
export async function getYears(_req: Request, res: Response): Promise<void> {
  const response: YearsResponse = {
    years: getLoadedYears(),
    lastUpdated: getLastScrapeTimes(),
  };
  res.json(response);
}

// ============================================
// US2: Query Schedule by Team
// ============================================

/**
 * GET /api/teams - Get all teams
 */
export async function getTeams(_req: Request, res: Response): Promise<void> {
  const teams = getAllTeams();
  res.json({ teams });
}

/**
 * GET /api/teams/:code/schedule - Get team schedule
 */
export async function getTeamSchedule(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const code = req.params.code?.toUpperCase();

    if (!code || !VALID_TEAM_CODES.includes(code)) {
      throw new InvalidParameterError(
        `Unknown team code: ${code}`,
        VALID_TEAM_CODES
      );
    }

    const team = getTeamByCode(code);
    if (!team) {
      throw new NotFoundError(`Team not found: ${code}`);
    }

    // Get year filter if provided
    const yearParam = req.query.year;
    let query = fixtures().team(code);

    if (yearParam) {
      const yearResult = YearSchema.safeParse(yearParam);
      if (yearResult.success) {
        query = query.year(yearResult.data);
      }
    }

    const teamFixtures = query.execute();

    // Sort by round
    teamFixtures.sort((a, b) => a.round - b.round);

    // Calculate totals
    const totalStrength = teamFixtures.reduce((sum, f) => sum + f.strengthRating, 0);
    const byeRounds = teamFixtures.filter(f => f.isBye).map(f => f.round);

    // Transform to schedule format
    const schedule = teamFixtures.map(f => ({
      round: f.round,
      year: f.year,
      opponent: f.opponentCode,
      isHome: f.isHome,
      isBye: f.isBye,
      strengthRating: f.strengthRating,
    }));

    res.json({
      team,
      schedule,
      totalStrength,
      byeRounds,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/fixtures - Query fixtures with filters
 */
export async function getFixtures(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parseResult = FixtureQuerySchema.safeParse(req.query);

    if (!parseResult.success) {
      throw new InvalidParameterError('Invalid query parameters');
    }

    const params = parseResult.data;

    // Validate team code if provided
    if (params.team && !VALID_TEAM_CODES.includes(params.team)) {
      throw new InvalidParameterError(
        `Unknown team code: ${params.team}`,
        VALID_TEAM_CODES
      );
    }

    // Validate opponent code if provided
    if (params.opponent && !VALID_TEAM_CODES.includes(params.opponent)) {
      throw new InvalidParameterError(
        `Unknown team code: ${params.opponent}`,
        VALID_TEAM_CODES
      );
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

    res.json({
      fixtures: fixtureList,
      count: fixtureList.length,
      filters: query.getFilters(),
    });
  } catch (error) {
    next(error);
  }
}

// ============================================
// US3: Query Schedule by Round
// ============================================

/**
 * GET /api/rounds/:year/:round - Get round details
 */
export async function getRoundDetails(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const yearResult = YearSchema.safeParse(req.params.year);
    const roundResult = RoundSchema.safeParse(req.params.round);

    if (!yearResult.success) {
      throw new InvalidParameterError('Year must be between 2010 and 2030');
    }
    if (!roundResult.success) {
      throw new InvalidParameterError(
        'Round must be between 1 and 27',
        Array.from({ length: 27 }, (_, i) => i + 1)
      );
    }

    const year = yearResult.data;
    const round = roundResult.data;

    const roundFixtures = getFixturesByRound(year, round);

    // Group fixtures into matches and byes
    const byeTeams: string[] = [];
    const matchMap = new Map<string, { homeTeam: string; awayTeam: string; homeStrength: number; awayStrength: number }>();

    for (const fixture of roundFixtures) {
      if (fixture.isBye) {
        byeTeams.push(fixture.teamCode);
      } else if (fixture.isHome && fixture.opponentCode) {
        // Only process home fixtures to avoid duplicates
        const awayFixture = roundFixtures.find(
          f => f.teamCode === fixture.opponentCode && f.opponentCode === fixture.teamCode
        );

        matchMap.set(`${fixture.teamCode}-${fixture.opponentCode}`, {
          homeTeam: fixture.teamCode,
          awayTeam: fixture.opponentCode,
          homeStrength: fixture.strengthRating,
          awayStrength: awayFixture?.strengthRating ?? 0,
        });
      }
    }

    res.json({
      year,
      round,
      matches: Array.from(matchMap.values()),
      byeTeams,
    });
  } catch (error) {
    next(error);
  }
}

// ============================================
// US4: Team Rankings
// ============================================

/**
 * GET /api/rankings/:year/:code - Get team season ranking
 */
export async function getTeamRanking(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const yearResult = YearSchema.safeParse(req.params.year);
    const code = req.params.code?.toUpperCase();

    if (!yearResult.success) {
      throw new InvalidParameterError('Year must be between 2010 and 2030');
    }

    if (!code || !VALID_TEAM_CODES.includes(code)) {
      throw new InvalidParameterError(
        `Unknown team code: ${code}`,
        VALID_TEAM_CODES
      );
    }

    const year = yearResult.data;
    const team = getTeamByCode(code);
    if (!team) {
      throw new NotFoundError(`Team not found: ${code}`);
    }

    const ranking = getTeamSeasonRanking(year, code);
    if (!ranking) {
      throw new NotFoundError(`No data found for ${code} in ${year}`);
    }

    const response: TeamSeasonRankingResponse = {
      team,
      ranking,
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/rankings/:year/:code/:round - Get team ranking for specific round
 */
export async function getTeamRoundRankingHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const yearResult = YearSchema.safeParse(req.params.year);
    const roundResult = RoundSchema.safeParse(req.params.round);
    const code = req.params.code?.toUpperCase();

    if (!yearResult.success) {
      throw new InvalidParameterError('Year must be between 2010 and 2030');
    }
    if (!roundResult.success) {
      throw new InvalidParameterError(
        'Round must be between 1 and 27',
        Array.from({ length: 27 }, (_, i) => i + 1)
      );
    }

    if (!code || !VALID_TEAM_CODES.includes(code)) {
      throw new InvalidParameterError(
        `Unknown team code: ${code}`,
        VALID_TEAM_CODES
      );
    }

    const year = yearResult.data;
    const round = roundResult.data;
    const team = getTeamByCode(code);
    if (!team) {
      throw new NotFoundError(`Team not found: ${code}`);
    }

    const ranking = getTeamRoundRanking(year, code, round);
    if (!ranking) {
      throw new NotFoundError(`No data found for ${code} in round ${round} of ${year}`);
    }

    const response: TeamRoundRankingResponse = {
      team,
      ranking,
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/rankings/:year - Get all teams rankings for a year
 */
export async function getAllTeamsRanking(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const yearResult = YearSchema.safeParse(req.params.year);

    if (!yearResult.success) {
      throw new InvalidParameterError('Year must be between 2010 and 2030');
    }

    const year = yearResult.data;
    const rankedTeams = getAllTeamSeasonRankings(year);

    if (rankedTeams.length === 0) {
      throw new NotFoundError(`No data found for ${year}`);
    }

    const response: AllTeamsRankingResponse = {
      year,
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

    res.json(response);
  } catch (error) {
    next(error);
  }
}
