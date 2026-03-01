/**
 * SuperCoachStatsAdapter — DrawDataSource implementation backed by
 * nrlsupercoachstats.com HTML scraping.
 *
 * Fetches raw HTML via fetchScheduleHtml, parses it to Fixture records via
 * parseScheduleHtml, then pairs fixtures within each (year, round) group to
 * produce Match aggregates.
 */

import type { DrawDataSource } from '../../domain/ports/draw-data-source.js';
import type { Match } from '../../domain/match.js';
import type { Result } from '../../domain/result.js';
import { success, failure } from '../../domain/result.js';
import { createMatchFromSchedule } from '../../domain/match.js';
import type { Fixture } from '../../models/fixture.js';
import type { Warning } from '../../models/types.js';
import { fetchScheduleHtml } from '../../scraper/fetcher.js';
import { parseScheduleHtml } from '../../scraper/parser.js';

export class SuperCoachStatsAdapter implements DrawDataSource {
  async fetchDraw(year: number): Promise<Result<Match[]>> {
    try {
      const html = await fetchScheduleHtml(year);
      const { fixtures, warnings } = parseScheduleHtml(html, year);

      // Filter out bye fixtures
      const activeFixtures = fixtures.filter((f) => !f.isBye);

      // Group fixtures by round
      const byRound = new Map<number, Fixture[]>();
      for (const fixture of activeFixtures) {
        const group = byRound.get(fixture.round);
        if (group === undefined) {
          byRound.set(fixture.round, [fixture]);
        } else {
          group.push(fixture);
        }
      }

      const matches: Match[] = [];
      const allWarnings: Warning[] = [...warnings];

      for (const [round, roundFixtures] of byRound) {
        const pairedIds = new Set<string>();

        for (const fixture of roundFixtures) {
          if (pairedIds.has(fixture.id)) {
            continue;
          }

          // Find the mirror fixture: the opponent's entry for this same match
          const pair = roundFixtures.find(
            (other) =>
              !pairedIds.has(other.id) &&
              other.id !== fixture.id &&
              fixture.teamCode === other.opponentCode &&
              other.teamCode === fixture.opponentCode
          );

          if (pair === undefined) {
            allWarnings.push({
              type: 'UNPAIRED_FIXTURE' as Warning['type'],
              message: `No matching pair found for fixture: ${fixture.teamCode} vs ${fixture.opponentCode} in round ${round}`,
              context: {
                year,
                round,
                fixtureId: fixture.id,
                teamCode: fixture.teamCode,
                opponentCode: fixture.opponentCode,
              },
            });
            continue;
          }

          pairedIds.add(fixture.id);
          pairedIds.add(pair.id);

          const homeFixture = fixture.isHome ? fixture : pair;
          const awayFixture = fixture.isHome ? pair : fixture;

          matches.push(
            createMatchFromSchedule({
              year,
              round,
              homeTeamCode: homeFixture.teamCode,
              awayTeamCode: awayFixture.teamCode,
              homeStrengthRating: homeFixture.strengthRating,
              awayStrengthRating: awayFixture.strengthRating,
            })
          );
        }
      }

      return success(matches, allWarnings);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return failure(message);
    }
  }
}
