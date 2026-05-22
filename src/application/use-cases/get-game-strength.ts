import type { FixtureRepository } from '../ports/fixture-repository.js';
import type { GetSupercoachScoresUseCase } from './get-supercoach-scores.js';
import type { GameStrengthRepository } from '../../domain/repositories/game-strength-repository.js';
import type { RoundGSR, TeamMatchHistory } from '../../domain/game-strength.js';
import type { TeamSeasonSupercoach } from '../../domain/supercoach-score.js';
import {
  computeRoundGSR,
  extractTeamHistory,
  DEFAULT_HALF_LIFE,
  DEFAULT_MIN_ROUNDS_FOR_RELIABILITY,
  type NonByeFixture,
} from '../../analytics/game-strength-service.js';
import { createMatchId } from '../../domain/match.js';
import { logger } from '../../utils/logger.js';

export class GetGameStrengthUseCase {
  constructor(
    private readonly supercoachScores: GetSupercoachScoresUseCase,
    private readonly fixtures: FixtureRepository,
    private readonly repository: GameStrengthRepository
  ) {}

  /**
   * Resolve a `RoundGSR` for `(year, round)`.
   *
   * For the default half-life:
   *   1. `repository.read(...)` — returns a locked artifact (D1-backed) if
   *      one exists, otherwise a provisional artifact (KV-backed), otherwise
   *      `null`. The locked-vs-provisional distinction is surfaced on the
   *      domain shape (the artifact's `locked` field) but neither use case
   *      callers nor the API handler need to act on it today.
   *   2. `null` is returned when no artifact exists yet — the handler
   *      surfaces this as `{ available: false }`. The use case MUST NOT
   *      perform the cross-season team-history walk on the request thread.
   *
   * For a non-default half-life: bypass the repository entirely and compute
   * on demand. Stored artifacts are keyed by `(year, round)` only — half-life
   * is a computation parameter, not part of the artifact's identity. Custom
   * half-life is an ad-hoc analysis path, not a production read.
   */
  async execute(
    year: number,
    round: number,
    halfLife: number = DEFAULT_HALF_LIFE
  ): Promise<RoundGSR | null> {
    if (halfLife === DEFAULT_HALF_LIFE) {
      const artifact = await this.repository.read(year, round);
      return artifact?.gsr ?? null;
    }

    return this.computeOnDemand(year, round, halfLife);
  }

  private async computeOnDemand(year: number, round: number, halfLife: number): Promise<RoundGSR> {
    const roundFixtures = this.fixtures.findByRound(year, round);
    const nonByeFixtures = buildNonByeFixtures(roundFixtures, year, round);

    if (nonByeFixtures.length === 0) {
      throw Object.assign(new Error(`No fixtures found for ${year} round ${round}`), { code: 'NO_FIXTURES_FOUND' });
    }

    const teamCodes = [...new Set(nonByeFixtures.flatMap(f => [f.homeCode, f.awayCode]))];
    // Pre-extract lightweight match histories. The heavy TeamSeasonSupercoach payload
    // (per-player breakdowns) goes out of scope immediately after extraction — this keeps
    // peak memory bounded even when many teams are loaded in parallel.
    const historyMap = new Map<string, TeamMatchHistory>();
    await Promise.all(
      teamCodes.map(async code => {
        const season = await fetchCrossSeasonHistory(this.supercoachScores, year, code);
        historyMap.set(code, extractTeamHistory(season, code));
      })
    );

    return computeRoundGSR(nonByeFixtures, historyMap, {
      halfLife,
      minRoundsForReliability: DEFAULT_MIN_ROUNDS_FOR_RELIABILITY,
      year,
      round,
    });
  }
}

/**
 * Fetch a team's match history across the current and previous season, sorted chronologically
 * ascending so recency weighting works correctly across season boundaries.
 *
 * For Round 1 of a new season, the only available history is the previous year — without this,
 * weightedAvgScored would be 0 and the rating would default to a sample-size warning.
 */
export async function fetchCrossSeasonHistory(
  supercoachScores: GetSupercoachScoresUseCase,
  year: number,
  teamCode: string
): Promise<TeamSeasonSupercoach> {
  const current = await supercoachScores.executeForTeamSeason(year, teamCode);
  let prevMatches: TeamSeasonSupercoach['matches'] = [];
  try {
    const prev = await supercoachScores.executeForTeamSeason(year - 1, teamCode);
    prevMatches = prev.matches;
  } catch (err) {
    logger.info('[GSR] No prior season data for cross-season history', {
      year: year - 1, teamCode,
      error: err instanceof Error ? err.message : 'unknown',
    });
  }
  // Sort all matches by (year, round) ascending so the most recent match ends up last in the
  // array — extractTeamHistory assigns roundDiff based on position from the end of the array.
  const combinedMatches = [...prevMatches, ...current.matches].sort(
    (a, b) => (a.year - b.year) || (a.round - b.round)
  );
  return { ...current, matches: combinedMatches };
}

export function buildNonByeFixtures(
  fixtures: ReturnType<FixtureRepository['findByRound']>,
  year: number,
  round: number
): NonByeFixture[] {
  return fixtures
    .filter(f => f.isHome && !f.isBye && f.opponentCode !== null)
    .map(f => ({
      homeCode: f.teamCode,
      awayCode: f.opponentCode!,
      matchId: createMatchId(f.teamCode, f.opponentCode!, year, round),
    }));
}
