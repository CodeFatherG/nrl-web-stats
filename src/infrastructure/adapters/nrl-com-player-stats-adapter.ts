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
import { createMatchId } from '../../domain/match.js';

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
  allRunMetres: z.number().default(0),
  allRuns: z.number().default(0),
  bombKicks: z.number().default(0),
  crossFieldKicks: z.number().default(0),
  conversions: z.number().default(0),
  conversionAttempts: z.number().default(0),
  dummyHalfRuns: z.number().default(0),
  dummyHalfRunMetres: z.number().default(0),
  dummyPasses: z.number().default(0),
  errors: z.number().default(0),
  fantasyPointsTotal: z.number().default(0),
  fieldGoals: z.number().default(0),
  forcedDropOutKicks: z.number().default(0),
  fortyTwentyKicks: z.number().default(0),
  goals: z.number().default(0),
  goalConversionRate: z.number().default(0),
  grubberKicks: z.number().default(0),
  handlingErrors: z.number().default(0),
  hitUps: z.number().default(0),
  hitUpRunMetres: z.number().default(0),
  ineffectiveTackles: z.number().default(0),
  intercepts: z.number().default(0),
  kicks: z.number().default(0),
  kicksDead: z.number().default(0),
  kicksDefused: z.number().default(0),
  kickMetres: z.number().default(0),
  kickReturnMetres: z.number().default(0),
  lineBreakAssists: z.number().default(0),
  lineBreaks: z.number().default(0),
  lineEngagedRuns: z.number().default(0),
  minutesPlayed: z.number().default(0),
  missedTackles: z.number().default(0),
  offloads: z.number().default(0),
  offsideWithinTenMetres: z.number().default(0),
  oneOnOneLost: z.number().default(0),
  oneOnOneSteal: z.number().default(0),
  onePointFieldGoals: z.number().default(0),
  onReport: z.number().default(0),
  passesToRunRatio: z.number().default(0),
  passes: z.number().default(0),
  playTheBallTotal: z.number().default(0),
  playTheBallAverageSpeed: z.number().default(0),
  penalties: z.number().default(0),
  points: z.number().default(0),
  penaltyGoals: z.number().default(0),
  postContactMetres: z.number().default(0),
  receipts: z.number().default(0),
  ruckInfringements: z.number().default(0),
  sendOffs: z.number().default(0),
  sinBins: z.number().default(0),
  stintOne: z.number().default(0),
  tackleBreaks: z.number().default(0),
  tackleEfficiency: z.number().default(0),
  tacklesMade: z.number().default(0),
  tries: z.number().default(0),
  tryAssists: z.number().default(0),
  twentyFortyKicks: z.number().default(0),
  twoPointFieldGoals: z.number().default(0),
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
    const isComplete = match.matchState === 'FullTime';
    const matchWarnings: Warning[] = [];

    const stats: PlayerMatchStats[] = [];

    // Resolve both team codes upfront — required to compute the domain match ID.
    // If either is unmapped we cannot produce a valid internal ID, so skip this match.
    const homeCode = resolveNrlComTeamId(match.homeTeam.teamId);
    const awayCode = resolveNrlComTeamId(match.awayTeam.teamId);

    if (!homeCode || !awayCode) {
      const nrlMatchId = String(match.matchId);
      if (!homeCode) matchWarnings.push({ type: 'UNMAPPED_TEAM', message: `Unknown nrl.com teamId ${match.homeTeam.teamId}`, context: { teamId: match.homeTeam.teamId, nrlMatchId } });
      if (!awayCode) matchWarnings.push({ type: 'UNMAPPED_TEAM', message: `Unknown nrl.com teamId ${match.awayTeam.teamId}`, context: { teamId: match.awayTeam.teamId, nrlMatchId } });
      return { stats: [], matchWarnings };
    }

    const matchId = createMatchId(homeCode, awayCode, year, round);

    // Process both teams
    for (const side of ['homeTeam', 'awayTeam'] as const) {
      const team = match[side];
      const teamCode = side === 'homeTeam' ? homeCode : awayCode;

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
          allRunMetres: playerStat.allRunMetres,
          allRuns: playerStat.allRuns,
          bombKicks: playerStat.bombKicks,
          crossFieldKicks: playerStat.crossFieldKicks,
          conversions: playerStat.conversions,
          conversionAttempts: playerStat.conversionAttempts,
          dummyHalfRuns: playerStat.dummyHalfRuns,
          dummyHalfRunMetres: playerStat.dummyHalfRunMetres,
          dummyPasses: playerStat.dummyPasses,
          errors: playerStat.errors,
          fantasyPointsTotal: playerStat.fantasyPointsTotal,
          fieldGoals: playerStat.fieldGoals,
          forcedDropOutKicks: playerStat.forcedDropOutKicks,
          fortyTwentyKicks: playerStat.fortyTwentyKicks,
          goals: playerStat.goals,
          goalConversionRate: playerStat.goalConversionRate,
          grubberKicks: playerStat.grubberKicks,
          handlingErrors: playerStat.handlingErrors,
          hitUps: playerStat.hitUps,
          hitUpRunMetres: playerStat.hitUpRunMetres,
          ineffectiveTackles: playerStat.ineffectiveTackles,
          intercepts: playerStat.intercepts,
          kicks: playerStat.kicks,
          kicksDead: playerStat.kicksDead,
          kicksDefused: playerStat.kicksDefused,
          kickMetres: playerStat.kickMetres,
          kickReturnMetres: playerStat.kickReturnMetres,
          lineBreakAssists: playerStat.lineBreakAssists,
          lineBreaks: playerStat.lineBreaks,
          lineEngagedRuns: playerStat.lineEngagedRuns,
          minutesPlayed: playerStat.minutesPlayed,
          missedTackles: playerStat.missedTackles,
          offloads: playerStat.offloads,
          offsideWithinTenMetres: playerStat.offsideWithinTenMetres,
          oneOnOneLost: playerStat.oneOnOneLost,
          oneOnOneSteal: playerStat.oneOnOneSteal,
          onePointFieldGoals: playerStat.onePointFieldGoals,
          onReport: playerStat.onReport,
          passesToRunRatio: playerStat.passesToRunRatio,
          passes: playerStat.passes,
          playTheBallTotal: playerStat.playTheBallTotal,
          playTheBallAverageSpeed: playerStat.playTheBallAverageSpeed,
          penalties: playerStat.penalties,
          points: playerStat.points,
          penaltyGoals: playerStat.penaltyGoals,
          postContactMetres: playerStat.postContactMetres,
          receipts: playerStat.receipts,
          ruckInfringements: playerStat.ruckInfringements,
          sendOffs: playerStat.sendOffs,
          sinBins: playerStat.sinBins,
          stintOne: playerStat.stintOne,
          tackleBreaks: playerStat.tackleBreaks,
          tackleEfficiency: playerStat.tackleEfficiency,
          tacklesMade: playerStat.tacklesMade,
          tries: playerStat.tries,
          tryAssists: playerStat.tryAssists,
          twentyFortyKicks: playerStat.twentyFortyKicks,
          twoPointFieldGoals: playerStat.twoPointFieldGoals,
          isComplete,
        });
      }
    }

    return { stats, matchWarnings };
  }
}
