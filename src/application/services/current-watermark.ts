/**
 * currentWatermark — the single shared definition of "latest completed round"
 * used by both the read-path staleness check (FR-003) and the write-path
 * trigger predicate (FR-007).
 *
 * Lives in the application layer because it orchestrates reads across three
 * repositories — not a pure domain operation (Constitution Principle II /
 * FR-011). The domain layer holds aggregates and the port interfaces; this
 * service composes them.
 *
 * Definition (FR-003 / Q3): round R is complete iff every scheduled fixture
 * in R has all of:
 *   (a) a match result row,
 *   (b) player stats rows for both teams,
 *   (c) supplementary stats for the round.
 * The watermark is max{R : R is complete}; 0 when no round qualifies.
 *
 * Feature: 034-precomputed-projections (T012).
 */

import type { MatchRepository } from '../../domain/repositories/match-repository.js';
import type { PlayerRepository } from '../../domain/repositories/player-repository.js';
import { MatchStatus } from '../../domain/match.js';

/** Surface a minimal interface for the supplementary-stats check so this
 *  service does not depend on the full D1 repo class. Matches the existing
 *  `SupplementaryStatsRepoLike` in enqueue-due-scrapes.ts. */
export interface WatermarkSupplementaryRepo {
  isRoundCached(year: number, round: number): Promise<boolean>;
}

export interface CurrentWatermarkDeps {
  matchRepository: MatchRepository;
  playerRepository: PlayerRepository;
  supplementaryRepo: WatermarkSupplementaryRepo;
}

/**
 * Compute the current completed-round watermark for `year`.
 *
 * Returns 0 when no round qualifies (empty data, season hasn't started, etc.)
 */
export async function currentWatermark(
  year: number,
  deps: CurrentWatermarkDeps,
): Promise<number> {
  const matches = await deps.matchRepository.findByYear(year);
  if (matches.length === 0) return 0;

  // Group fixtures by round to know how many games each round has.
  const fixturesByRound = new Map<number, typeof matches>();
  for (const m of matches) {
    const list = fixturesByRound.get(m.round);
    if (list) list.push(m);
    else fixturesByRound.set(m.round, [m]);
  }

  // Check each round in descending order; return the first that satisfies all
  // three conditions.
  const sortedRounds = [...fixturesByRound.keys()].sort((a, b) => b - a);
  let highest = 0;

  for (const round of sortedRounds) {
    const fixtures = fixturesByRound.get(round)!;

    // (a) Every fixture has match result — proxied by status === Completed
    //     (the result row is present iff the match has reached Completed in
    //     our domain model — see ScrapeMatchResultsUseCase).
    const allCompleted = fixtures.every((m) => m.status === MatchStatus.Completed);
    if (!allCompleted) continue;

    // (b) Player stats rows for both teams in every fixture. The existing
    //     playerRepository.isRoundComplete check confirms all expected
    //     performances are stored; combined with countDistinctMatchesInRound
    //     it tells us no team's stats are missing.
    const playerStatsOk = await deps.playerRepository.isRoundComplete(year, round);
    if (!playerStatsOk) continue;
    const distinctMatches = await deps.playerRepository.countDistinctMatchesInRound(year, round);
    if (distinctMatches < fixtures.length) continue;

    // (c) Supplementary stats for the round.
    const suppOk = await deps.supplementaryRepo.isRoundCached(year, round);
    if (!suppOk) continue;

    // All three conditions met — this is the highest complete round.
    highest = round;
    break;
  }

  return highest;
}
