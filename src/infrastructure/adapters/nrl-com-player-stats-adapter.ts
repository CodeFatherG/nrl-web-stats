/**
 * NrlComPlayerStatsAdapter — implements PlayerStatsSource port.
 * Fetches per-match player statistics from nrl.com's match centre JSON API.
 *
 * Flow: draw API → matchCentreUrls → match centre data → PlayerMatchStats[]
 */

import { z } from 'zod';
import type { PlayerStatsSource, PlayerMatchStats } from '../../domain/ports/player-stats-source.js';
import type { Result } from '../../domain/result.js';
import { success, failure } from '../../domain/result.js';
import { logger } from '../../utils/logger.js';
import type { Warning } from '../../models/types.js';
import { resolveNrlComTeamId } from '../shared/nrl-team-id-map.js';

// ---------------------------------------------------------------------------
// T013: Zod validation schemas for nrl.com draw + match centre responses
// ---------------------------------------------------------------------------

/** Team in draw API response */
const DrawTeamSchema = z.object({
  teamId: z.number(),
  nickName: z.string(),
});

/** Match fixture in draw API response */
const DrawMatchFixtureSchema = z.object({
  type: z.literal('Match'),
  matchCentreUrl: z.string(),
  matchState: z.string(),
  homeTeam: DrawTeamSchema,
  awayTeam: DrawTeamSchema,
});

/** Bye fixture in draw API response */
const DrawByeFixtureSchema = z.object({
  type: z.literal('Bye'),
});

const DrawFixtureSchema = z.discriminatedUnion('type', [
  DrawMatchFixtureSchema,
  DrawByeFixtureSchema,
]);

const DrawResponseSchema = z.object({
  fixtures: z.array(DrawFixtureSchema),
});

type DrawMatchFixture = z.infer<typeof DrawMatchFixtureSchema>;

/** Player identity from match centre roster */
const RosterPlayerSchema = z.object({
  playerId: z.number(),
  firstName: z.string(),
  lastName: z.string(),
  position: z.string(),
});

/** Player statistics from match centre stats */
const StatsPlayerSchema = z.object({
  playerId: z.number(),
  tries: z.number().default(0),
  conversions: z.number().default(0),
  penaltyGoals: z.number().default(0),
  tacklesMade: z.number().default(0),
  allRunMetres: z.number().default(0),
  fantasyPointsTotal: z.number().default(0),
});

/** Team with roster in match centre response */
const MatchCentreTeamSchema = z.object({
  teamId: z.number(),
  players: z.array(RosterPlayerSchema),
});

/** Match centre full response */
const MatchCentreResponseSchema = z.object({
  matchId: z.union([z.number(), z.string()]).transform(String),
  matchState: z.string(),
  roundNumber: z.number(),
  homeTeam: MatchCentreTeamSchema,
  awayTeam: MatchCentreTeamSchema,
  stats: z.object({
    players: z.object({
      homeTeam: z.array(StatsPlayerSchema),
      awayTeam: z.array(StatsPlayerSchema),
    }),
  }),
});

// ---------------------------------------------------------------------------
// T014: NrlComPlayerStatsAdapter implementation
// ---------------------------------------------------------------------------

const NRL_COM_BASE = 'https://www.nrl.com';
const NRL_COM_DRAW_API = 'https://www.nrl.com/draw/data';

export class NrlComPlayerStatsAdapter implements PlayerStatsSource {
  async fetchPlayerStats(year: number, round: number): Promise<Result<PlayerMatchStats[]>> {
    try {
      // Step 1: Fetch draw API to discover match centre URLs
      const drawUrl = new URL(NRL_COM_DRAW_API);
      drawUrl.searchParams.set('competition', '111');
      drawUrl.searchParams.set('season', String(year));
      drawUrl.searchParams.set('round', String(round));

      logger.info('Fetching draw for player stats', { url: drawUrl.toString(), year, round });

      const drawResponse = await fetch(drawUrl.toString(), {
        headers: { 'User-Agent': 'NRL-Schedule-Scraper/1.0' },
      });

      if (!drawResponse.ok) {
        return failure(`nrl.com draw API returned HTTP ${drawResponse.status}`);
      }

      const drawJson = await drawResponse.json();
      const drawParse = DrawResponseSchema.safeParse(drawJson);

      if (!drawParse.success) {
        return failure(`Draw response validation failed: ${drawParse.error.issues[0].message}`);
      }

      // Filter to Match fixtures only
      const matchFixtures = drawParse.data.fixtures.filter(
        (f): f is DrawMatchFixture => f.type === 'Match'
      );

      if (matchFixtures.length === 0) {
        return success([]); // No matches (e.g. all byes)
      }

      // Step 2: Fetch match centre data for each match in parallel
      const warnings: Warning[] = [];
      const allPlayerStats: PlayerMatchStats[] = [];

      const matchResults = await Promise.allSettled(
        matchFixtures.map(fixture => this.fetchMatchData(fixture, year, round))
      );

      for (let i = 0; i < matchResults.length; i++) {
        const result = matchResults[i];
        if (result.status === 'rejected') {
          const fixture = matchFixtures[i];
          warnings.push({
            type: 'MATCH_FETCH_FAILED',
            message: `Failed to fetch match data: ${fixture.matchCentreUrl}`,
            context: { url: fixture.matchCentreUrl, error: String(result.reason) },
          });
          continue;
        }

        const { stats, matchWarnings } = result.value;
        allPlayerStats.push(...stats);
        warnings.push(...matchWarnings);
      }

      logger.info('Successfully fetched player stats from nrl.com', {
        year,
        round,
        matches: matchFixtures.length,
        players: allPlayerStats.length,
        warnings: warnings.length,
      });

      return success(allPlayerStats, warnings);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to fetch player stats from nrl.com', { year, round, error: message });
      return failure(`Failed to fetch player stats: ${message}`);
    }
  }

  private async fetchMatchData(
    fixture: DrawMatchFixture,
    year: number,
    round: number
  ): Promise<{ stats: PlayerMatchStats[]; matchWarnings: Warning[] }> {
    const dataUrl = `${NRL_COM_BASE}${fixture.matchCentreUrl}data`;

    const response = await fetch(dataUrl, {
      headers: { 'User-Agent': 'NRL-Schedule-Scraper/1.0' },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} from ${dataUrl}`);
    }

    const json = await response.json();
    const parse = MatchCentreResponseSchema.safeParse(json);

    if (!parse.success) {
      throw new Error(`Validation failed for ${dataUrl}: ${parse.error.issues[0].message}`);
    }

    const match = parse.data;
    const matchId = String(match.matchId);
    const isComplete = match.matchState === 'FullTime';
    const matchWarnings: Warning[] = [];

    const stats: PlayerMatchStats[] = [];

    // Process both teams
    for (const side of ['homeTeam', 'awayTeam'] as const) {
      const team = match[side];
      const teamCode = resolveNrlComTeamId(team.teamId);

      if (!teamCode) {
        matchWarnings.push({
          type: 'UNMAPPED_TEAM',
          message: `Unknown nrl.com teamId ${team.teamId}`,
          context: { teamId: team.teamId, matchId },
        });
        continue;
      }

      // Build playerId → roster info lookup
      const rosterMap = new Map(
        team.players.map(p => [p.playerId, p])
      );

      // Join stats with roster identity
      const teamStats = match.stats.players[side];
      for (const playerStat of teamStats) {
        const rosterPlayer = rosterMap.get(playerStat.playerId);

        if (!rosterPlayer) {
          matchWarnings.push({
            type: 'PLAYER_NOT_IN_ROSTER',
            message: `Player ${playerStat.playerId} in stats but not in roster`,
            context: { playerId: playerStat.playerId, matchId, teamCode },
          });
          continue;
        }

        stats.push({
          playerId: String(playerStat.playerId),
          playerName: `${rosterPlayer.firstName} ${rosterPlayer.lastName}`,
          teamCode,
          dateOfBirth: null, // Not available from nrl.com
          position: rosterPlayer.position,
          matchId,
          year,
          round,
          tries: playerStat.tries,
          goals: playerStat.conversions + playerStat.penaltyGoals,
          tackles: playerStat.tacklesMade,
          runMetres: playerStat.allRunMetres,
          fantasyPoints: playerStat.fantasyPointsTotal,
          isComplete,
        });
      }
    }

    return { stats, matchWarnings };
  }
}
