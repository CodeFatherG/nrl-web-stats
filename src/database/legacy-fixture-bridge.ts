/**
 * Legacy fixture bridge — converts Match[] to Fixture[] and loads them
 * into the legacy in-memory fixture store used by fixture, ranking, and
 * streak endpoints.
 *
 * This bridge is called after schedule scraping to keep the legacy store
 * in sync while the codebase migrates to D1-backed persistence.
 */

import type { Match } from '../domain/match.js';
import { createFixture } from '../models/fixture.js';
import { VALID_TEAM_CODES } from '../models/team.js';
import { loadFixtures } from './store.js';

export function buildLegacyFixtureBridge(year: number, matches: Match[]): void {
  const fixtures = [];
  // Track which teams play in each round to infer byes
  const teamsPlayingByRound = new Map<number, Set<string>>();

  for (const match of matches) {
    if (match.homeTeamCode !== null && match.awayTeamCode !== null) {
      const homeFixture = createFixture(
        match.year,
        match.round,
        match.homeTeamCode,
        match.awayTeamCode,
        true,
        match.homeStrengthRating ?? 0
      );
      const awayFixture = createFixture(
        match.year,
        match.round,
        match.awayTeamCode,
        match.homeTeamCode,
        false,
        match.awayStrengthRating ?? 0
      );
      fixtures.push(homeFixture, awayFixture);

      // Track teams playing this round
      if (!teamsPlayingByRound.has(match.round)) {
        teamsPlayingByRound.set(match.round, new Set());
      }
      const playing = teamsPlayingByRound.get(match.round)!;
      playing.add(match.homeTeamCode);
      playing.add(match.awayTeamCode);
    }
  }

  // Infer bye fixtures: teams not playing in a round have a bye
  for (const [round, playingTeams] of teamsPlayingByRound) {
    for (const teamCode of VALID_TEAM_CODES) {
      if (!playingTeams.has(teamCode)) {
        fixtures.push(createFixture(year, round, teamCode, null, false, 0));
      }
    }
  }

  loadFixtures(year, fixtures);
}
