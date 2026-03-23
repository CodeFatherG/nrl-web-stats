/**
 * NrlComTeamListAdapter — implements TeamListSource port.
 * Fetches team list (lineup) data from nrl.com's match centre JSON API.
 *
 * Flow: draw API → matchCentreUrls → match centre data → TeamList[]
 */

import { z } from 'zod';
import type { TeamListSource } from '../../domain/ports/team-list-source.js';
import type { TeamList } from '../../domain/team-list.js';
import { createTeamList } from '../../domain/team-list.js';
import { createMatchId } from '../../domain/match.js';
import type { Result } from '../../domain/result.js';
import { success, failure } from '../../domain/result.js';
import { logger } from '../../utils/logger.js';
import type { Warning } from '../../models/types.js';
import { resolveNrlComTeamId } from '../shared/nrl-team-id-map.js';

// ---------------------------------------------------------------------------
// Zod schemas for nrl.com draw + match centre responses (team list extraction)
// ---------------------------------------------------------------------------

const DrawTeamSchema = z.object({
  teamId: z.number(),
  nickName: z.string(),
});

const DrawMatchFixtureSchema = z.object({
  type: z.literal('Match'),
  matchCentreUrl: z.string(),
  matchState: z.string(),
  homeTeam: DrawTeamSchema,
  awayTeam: DrawTeamSchema,
});

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

/** Player roster entry — extended with jersey number for team lists */
const TeamListPlayerSchema = z.object({
  playerId: z.number(),
  firstName: z.string(),
  lastName: z.string(),
  position: z.string(),
  number: z.number(),
});

const TeamListTeamSchema = z.object({
  teamId: z.number(),
  players: z.array(TeamListPlayerSchema),
});

const TeamListMatchCentreResponseSchema = z.object({
  matchId: z.union([z.number(), z.string()]).transform(String),
  matchState: z.string(),
  roundNumber: z.number(),
  homeTeam: TeamListTeamSchema,
  awayTeam: TeamListTeamSchema,
});

// ---------------------------------------------------------------------------
// Adapter implementation
// ---------------------------------------------------------------------------

const NRL_COM_BASE = 'https://www.nrl.com';
const NRL_COM_DRAW_API = 'https://www.nrl.com/draw/data';

export class NrlComTeamListAdapter implements TeamListSource {
  async fetchTeamLists(year: number, round: number): Promise<Result<TeamList[]>> {
    try {
      // Step 1: Fetch draw API to discover match centre URLs
      const drawUrl = new URL(NRL_COM_DRAW_API);
      drawUrl.searchParams.set('competition', '111');
      drawUrl.searchParams.set('season', String(year));
      drawUrl.searchParams.set('round', String(round));

      logger.info('Fetching draw for team lists', { url: drawUrl.toString(), year, round });

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

      const matchFixtures = drawParse.data.fixtures.filter(
        (f): f is DrawMatchFixture => f.type === 'Match'
      );

      if (matchFixtures.length === 0) {
        return success([]);
      }

      // Step 2: Fetch match centre data for each match in parallel
      const warnings: Warning[] = [];
      const allTeamLists: TeamList[] = [];

      const results = await Promise.allSettled(
        matchFixtures.map((fixture) => {
          const homeCode = resolveNrlComTeamId(fixture.homeTeam.teamId);
          const awayCode = resolveNrlComTeamId(fixture.awayTeam.teamId);
          if (!homeCode || !awayCode) {
            return Promise.reject(new Error(`Unknown team IDs: home=${fixture.homeTeam.teamId}, away=${fixture.awayTeam.teamId}`));
          }
          const matchId = createMatchId(homeCode, awayCode, year, round);
          return this.fetchMatchTeamList(fixture.matchCentreUrl, matchId, homeCode, awayCode, year, round);
        })
      );

      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        if (result.status === 'rejected') {
          const fixture = matchFixtures[i];
          warnings.push({
            type: 'TEAM_LIST_FETCH_FAILED',
            message: `Failed to fetch team list: ${fixture.matchCentreUrl}`,
            context: { url: fixture.matchCentreUrl, error: String(result.reason) },
          });
          continue;
        }
        allTeamLists.push(...result.value.teamLists);
        warnings.push(...result.value.warnings);
      }

      logger.info('Successfully fetched team lists from nrl.com', {
        year,
        round,
        matches: matchFixtures.length,
        teamLists: allTeamLists.length,
        warnings: warnings.length,
      });

      return success(allTeamLists, warnings);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to fetch team lists from nrl.com', { year, round, error: message });
      return failure(`Failed to fetch team lists: ${message}`);
    }
  }

  async fetchTeamListForMatch(
    matchCentreUrl: string,
    matchId: string,
    homeTeamCode: string,
    awayTeamCode: string,
    year: number,
    round: number
  ): Promise<Result<TeamList[]>> {
    try {
      const result = await this.fetchMatchTeamList(matchCentreUrl, matchId, homeTeamCode, awayTeamCode, year, round);
      return success(result.teamLists, result.warnings);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return failure(`Failed to fetch team list for match ${matchId}: ${message}`);
    }
  }

  private async fetchMatchTeamList(
    matchCentreUrl: string,
    matchId: string,
    homeTeamCode: string,
    awayTeamCode: string,
    year: number,
    round: number
  ): Promise<{ teamLists: TeamList[]; warnings: Warning[] }> {
    const dataUrl = `${NRL_COM_BASE}${matchCentreUrl}data`;
    const warnings: Warning[] = [];

    const response = await fetch(dataUrl, {
      headers: { 'User-Agent': 'NRL-Schedule-Scraper/1.0' },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} from ${dataUrl}`);
    }

    const json = await response.json();
    const parse = TeamListMatchCentreResponseSchema.safeParse(json);

    if (!parse.success) {
      throw new Error(`Validation failed for ${dataUrl}: ${parse.error.issues[0].message}`);
    }

    const match = parse.data;
    const now = new Date().toISOString();
    const teamLists: TeamList[] = [];

    // Process home team
    const homeList = this.extractTeamList(match.homeTeam, matchId, homeTeamCode, year, round, now);
    if (homeList) {
      teamLists.push(homeList);
    } else {
      warnings.push({
        type: 'EMPTY_TEAM_LIST',
        message: `No players in home team roster for ${matchId}`,
        context: { matchId, teamCode: homeTeamCode },
      });
    }

    // Process away team
    const awayList = this.extractTeamList(match.awayTeam, matchId, awayTeamCode, year, round, now);
    if (awayList) {
      teamLists.push(awayList);
    } else {
      warnings.push({
        type: 'EMPTY_TEAM_LIST',
        message: `No players in away team roster for ${matchId}`,
        context: { matchId, teamCode: awayTeamCode },
      });
    }

    return { teamLists, warnings };
  }

  private extractTeamList(
    team: z.infer<typeof TeamListTeamSchema>,
    matchId: string,
    teamCode: string,
    year: number,
    round: number,
    scrapedAt: string
  ): TeamList | null {
    // Filter to valid jersey numbers (>= 1)
    const squadPlayers = team.players.filter((p) => p.number >= 1);

    if (squadPlayers.length === 0) {
      return null;
    }

    return createTeamList({
      matchId,
      teamCode,
      year,
      round,
      scrapedAt,
      members: squadPlayers.map((p) => ({
        jerseyNumber: p.number,
        playerName: `${p.firstName} ${p.lastName}`,
        position: p.position,
        playerId: p.playerId,
      })),
    });
  }
}
