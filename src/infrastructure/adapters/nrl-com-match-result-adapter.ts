/**
 * NrlComMatchResultAdapter — implements MatchResultSource port.
 * Fetches match results from nrl.com's public JSON draw API,
 * maps nrl.com team identifiers to canonical 3-letter codes,
 * and produces domain MatchResult objects.
 */

import { z } from 'zod';
import type { MatchResultSource, MatchResult } from '../../domain/ports/match-result-source.js';
import type { Result } from '../../domain/result.js';
import { success, failure } from '../../domain/result.js';
import { MatchStatus, createMatchId } from '../../domain/match.js';
import { logger } from '../../utils/logger.js';
import type { Warning } from '../../models/types.js';

// ---------------------------------------------------------------------------
// T004: Zod validation schemas for nrl.com draw API response
// ---------------------------------------------------------------------------

const NrlComTeamSchema = z.object({
  teamId: z.number(),
  nickName: z.string(),
  score: z.number().optional(),
  theme: z.object({
    key: z.string(),
  }),
});

const NrlComClockSchema = z.object({
  kickOffTimeLong: z.string(),
  gameTime: z.string().optional(),
});

const NrlComMatchFixtureSchema = z.object({
  type: z.literal('Match'),
  matchMode: z.string(),
  matchState: z.string(),
  roundTitle: z.string(),
  homeTeam: NrlComTeamSchema,
  awayTeam: NrlComTeamSchema,
  clock: NrlComClockSchema,
});

const NrlComByeFixtureSchema = z.object({
  type: z.literal('Bye'),
});

const NrlComFixtureSchema = z.discriminatedUnion('type', [
  NrlComMatchFixtureSchema,
  NrlComByeFixtureSchema,
]);

const NrlComDrawResponseSchema = z.object({
  fixtures: z.array(NrlComFixtureSchema),
});

type NrlComMatchFixture = z.infer<typeof NrlComMatchFixtureSchema>;

// ---------------------------------------------------------------------------
// T005: nrl.com teamId → canonical 3-letter code mapping
// ---------------------------------------------------------------------------

const TEAM_ID_MAP = new Map<number, string>([
  [500011, 'BRO'],
  [500010, 'BUL'],
  [500013, 'CBR'],
  [500723, 'DOL'],
  [500004, 'GCT'],
  [500021, 'MEL'],
  [500002, 'MNL'],
  [500003, 'NEW'],
  [500012, 'NQC'],
  [500032, 'NZL'],
  [500031, 'PAR'],
  [500014, 'PTH'],
  [500028, 'SHA'],
  [500022, 'STG'],
  [500005, 'STH'],
  [500001, 'SYD'],
  [500023, 'WST'],
]);

/** Resolve an nrl.com teamId to the canonical 3-letter code */
export function resolveNrlComTeamId(teamId: number): string | null {
  return TEAM_ID_MAP.get(teamId) ?? null;
}

/** Parse round number from roundTitle (e.g., "Round 1" → 1, "Finals Week 1" → 28) */
function parseRoundNumber(roundTitle: string): number | null {
  const roundMatch = roundTitle.match(/^Round\s+(\d+)$/i);
  if (roundMatch) {
    return parseInt(roundMatch[1], 10);
  }
  // Finals rounds
  const finalsMap: Record<string, number> = {
    'finals week 1': 28,
    'finals week 2': 29,
    'finals week 3': 30,
    'grand final': 31,
  };
  return finalsMap[roundTitle.toLowerCase()] ?? null;
}

// ---------------------------------------------------------------------------
// T007: NrlComMatchResultAdapter class
// ---------------------------------------------------------------------------

const NRL_COM_DRAW_API = 'https://www.nrl.com/draw/data';

export class NrlComMatchResultAdapter implements MatchResultSource {
  async fetchResults(year: number, round?: number): Promise<Result<MatchResult[]>> {
    try {
      const url = new URL(NRL_COM_DRAW_API);
      url.searchParams.set('competition', '111');
      url.searchParams.set('season', String(year));
      if (round !== undefined) {
        url.searchParams.set('round', String(round));
      }

      logger.info('Fetching match results from nrl.com', { url: url.toString(), year, round });

      const response = await fetch(url.toString(), {
        headers: { 'User-Agent': 'NRL-Schedule-Scraper/1.0' },
      });

      if (!response.ok) {
        return failure(`nrl.com API returned HTTP ${response.status} ${response.statusText}`);
      }

      const json = await response.json();
      const parseResult = NrlComDrawResponseSchema.safeParse(json);

      if (!parseResult.success) {
        logger.error('nrl.com response validation failed', {
          errors: parseResult.error.issues.map(i => `${i.path.join('.')}: ${i.message}`),
        });
        return failure(`nrl.com response validation failed: ${parseResult.error.issues[0].message}`);
      }

      const { fixtures } = parseResult.data;
      const results: MatchResult[] = [];
      const warnings: Warning[] = [];

      // Filter to Match entries only (Byes are excluded by discriminatedUnion)
      const matchFixtures = fixtures.filter(
        (f): f is NrlComMatchFixture => f.type === 'Match'
      );

      for (const fixture of matchFixtures) {
        const homeCode = resolveNrlComTeamId(fixture.homeTeam.teamId);
        const awayCode = resolveNrlComTeamId(fixture.awayTeam.teamId);

        if (!homeCode) {
          warnings.push({
            type: 'UNMAPPED_TEAM',
            message: `Unknown nrl.com teamId ${fixture.homeTeam.teamId} (${fixture.homeTeam.nickName})`,
            context: { teamId: fixture.homeTeam.teamId, nickName: fixture.homeTeam.nickName },
          });
          continue;
        }
        if (!awayCode) {
          warnings.push({
            type: 'UNMAPPED_TEAM',
            message: `Unknown nrl.com teamId ${fixture.awayTeam.teamId} (${fixture.awayTeam.nickName})`,
            context: { teamId: fixture.awayTeam.teamId, nickName: fixture.awayTeam.nickName },
          });
          continue;
        }

        // Parse round from roundTitle if not provided as parameter
        const matchRound = round ?? parseRoundNumber(fixture.roundTitle);
        if (matchRound === null) {
          warnings.push({
            type: 'UNPARSEABLE_ROUND',
            message: `Cannot parse round from title: "${fixture.roundTitle}"`,
            context: { roundTitle: fixture.roundTitle },
          });
          continue;
        }

        const matchId = createMatchId(homeCode, awayCode, year, matchRound);
        const isCompleted = fixture.matchState === 'FullTime';

        if (isCompleted && fixture.homeTeam.score !== undefined && fixture.awayTeam.score !== undefined) {
          results.push({
            matchId,
            homeTeamCode: homeCode,
            awayTeamCode: awayCode,
            year,
            round: matchRound,
            homeScore: fixture.homeTeam.score,
            awayScore: fixture.awayTeam.score,
            status: MatchStatus.Completed,
            scheduledTime: fixture.clock.kickOffTimeLong,
          });
        } else {
          // Upcoming/non-completed — include scheduledTime but no scores
          results.push({
            matchId,
            homeTeamCode: homeCode,
            awayTeamCode: awayCode,
            year,
            round: matchRound,
            homeScore: 0,
            awayScore: 0,
            status: MatchStatus.Scheduled,
            scheduledTime: fixture.clock.kickOffTimeLong,
          });
        }
      }

      if (warnings.length > 0) {
        logger.warn('nrl.com result scrape produced warnings', {
          year,
          round,
          warningCount: warnings.length,
          warnings: warnings.map(w => w.message),
        });
      }

      logger.info('Successfully fetched match results from nrl.com', {
        year,
        round,
        totalFixtures: matchFixtures.length,
        completedMatches: results.filter(r => r.status === MatchStatus.Completed).length,
        scheduledMatches: results.filter(r => r.status === MatchStatus.Scheduled).length,
      });

      return success(results, warnings);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to fetch match results from nrl.com', { year, round, error: message });
      return failure(`Failed to fetch match results from nrl.com: ${message}`);
    }
  }
}
