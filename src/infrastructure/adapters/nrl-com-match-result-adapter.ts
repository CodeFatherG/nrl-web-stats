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
import { resolveNrlComTeamId } from '../shared/nrl-team-id-map.js';

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
  venue: z.string().optional(),
  matchCentreUrl: z.string().optional(),
});

/** Minimal schema for match centre response (weather extraction only) */
const MatchCentreWeatherSchema = z.object({
  weather: z.string().optional(),
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

const NRL_COM_BASE = 'https://www.nrl.com';
const NRL_COM_DRAW_API = 'https://www.nrl.com/draw/data';

export class NrlComMatchResultAdapter implements MatchResultSource {
  /** Fetch weather from match centre page for a completed match */
  private async fetchWeather(matchCentreUrl: string): Promise<string | null> {
    try {
      const dataUrl = `${NRL_COM_BASE}${matchCentreUrl}data`;
      const response = await fetch(dataUrl, {
        headers: { 'User-Agent': 'NRL-Schedule-Scraper/1.0' },
      });
      if (!response.ok) return null;
      const json = await response.json();
      const parse = MatchCentreWeatherSchema.safeParse(json);
      return parse.success ? (parse.data.weather ?? null) : null;
    } catch {
      return null;
    }
  }

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

      // Pre-process fixtures: validate teams/rounds, separate completed vs scheduled
      interface ParsedFixture {
        fixture: NrlComMatchFixture;
        homeCode: string;
        awayCode: string;
        matchRound: number;
        matchId: string;
        isCompleted: boolean;
        stadium: string | null;
      }
      const parsed: ParsedFixture[] = [];

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

        const matchRound = round ?? parseRoundNumber(fixture.roundTitle);
        if (matchRound === null) {
          warnings.push({
            type: 'UNPARSEABLE_ROUND',
            message: `Cannot parse round from title: "${fixture.roundTitle}"`,
            context: { roundTitle: fixture.roundTitle },
          });
          continue;
        }

        parsed.push({
          fixture,
          homeCode,
          awayCode,
          matchRound,
          matchId: createMatchId(homeCode, awayCode, year, matchRound),
          isCompleted: fixture.matchState === 'FullTime' &&
            fixture.homeTeam.score !== undefined && fixture.awayTeam.score !== undefined,
          stadium: fixture.venue ?? null,
        });
      }

      // Fetch weather in parallel for completed matches that have match centre URLs
      const completedWithUrls = parsed.filter(p => p.isCompleted && p.fixture.matchCentreUrl);
      const weatherResults = await Promise.allSettled(
        completedWithUrls.map(p => this.fetchWeather(p.fixture.matchCentreUrl!))
      );
      const weatherByMatchId = new Map<string, string | null>();
      for (let i = 0; i < completedWithUrls.length; i++) {
        const weather = weatherResults[i].status === 'fulfilled' ? weatherResults[i].value : null;
        weatherByMatchId.set(completedWithUrls[i].matchId, weather);
      }

      // Build results
      for (const p of parsed) {
        if (p.isCompleted) {
          results.push({
            matchId: p.matchId,
            homeTeamCode: p.homeCode,
            awayTeamCode: p.awayCode,
            year,
            round: p.matchRound,
            homeScore: p.fixture.homeTeam.score!,
            awayScore: p.fixture.awayTeam.score!,
            status: MatchStatus.Completed,
            scheduledTime: p.fixture.clock.kickOffTimeLong,
            stadium: p.stadium,
            weather: weatherByMatchId.get(p.matchId) ?? null,
          });
        } else {
          results.push({
            matchId: p.matchId,
            homeTeamCode: p.homeCode,
            awayTeamCode: p.awayCode,
            year,
            round: p.matchRound,
            homeScore: 0,
            awayScore: 0,
            status: MatchStatus.Scheduled,
            scheduledTime: p.fixture.clock.kickOffTimeLong,
            stadium: p.stadium,
            weather: null,
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
