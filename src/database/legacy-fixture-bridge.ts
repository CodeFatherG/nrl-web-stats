/**
 * Legacy fixture bridge — converts Match[] (from D1) to Fixture[] (the shape
 * stored in the FixtureRepository artifact and consumed by the fixture,
 * ranking, and streak endpoints).
 *
 * Pure conversion only. Writes are the caller's responsibility — typically
 * `ScrapeDrawUseCase` (which calls `repository.save`) or the worker's
 * cold-start hydration path.
 */

import type { Match } from '../domain/match.js';
import type { Fixture } from '../models/fixture.js';
import type { FixtureRepository } from '../domain/repositories/fixture-repository.js';
import { createFixture } from '../models/fixture.js';
import { VALID_TEAM_CODES } from '../models/team.js';

/** Pure: convert a year's `Match[]` into `Fixture[]`, including inferred byes. */
export function buildFixturesFromMatches(year: number, matches: Match[]): Fixture[] {
  const fixtures: Fixture[] = [];
  const teamsPlayingByRound = new Map<number, Set<string>>();

  for (const match of matches) {
    if (match.homeTeamCode !== null && match.awayTeamCode !== null) {
      fixtures.push(
        createFixture(
          match.year,
          match.round,
          match.homeTeamCode,
          match.awayTeamCode,
          true,
          match.homeStrengthRating ?? 0,
        ),
      );
      fixtures.push(
        createFixture(
          match.year,
          match.round,
          match.awayTeamCode,
          match.homeTeamCode,
          false,
          match.awayStrengthRating ?? 0,
        ),
      );

      if (!teamsPlayingByRound.has(match.round)) {
        teamsPlayingByRound.set(match.round, new Set());
      }
      const playing = teamsPlayingByRound.get(match.round)!;
      playing.add(match.homeTeamCode);
      playing.add(match.awayTeamCode);
    }
  }

  for (const [round, playingTeams] of teamsPlayingByRound) {
    for (const teamCode of VALID_TEAM_CODES) {
      if (!playingTeams.has(teamCode)) {
        fixtures.push(createFixture(year, round, teamCode, null, false, 0));
      }
    }
  }

  return fixtures;
}

/** Persist a year's fixtures via the FixtureRepository. Used by hydration
 *  paths that walk D1 matches on cold start. */
export async function buildLegacyFixtureBridge(
  repository: FixtureRepository,
  year: number,
  matches: Match[],
): Promise<void> {
  const fixtures = buildFixturesFromMatches(year, matches);
  await repository.save(year, fixtures);
}
