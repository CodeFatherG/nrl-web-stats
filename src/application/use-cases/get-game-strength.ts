import type { FixtureRepository } from '../../domain/repositories/fixture-repository.js';
import type { GetSupercoachScoresUseCase } from './get-supercoach-scores.js';
import type { GameStrengthRepository } from '../../domain/repositories/game-strength-repository.js';
import type { Fixture } from '../../models/fixture.js';
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
    private readonly repository: GameStrengthRepository,
  ) {}

  /**
   * Resolve a `RoundGSR` for `(year, round)`.
   *
   * Default half-life: read the locked-or-provisional artifact from the
   * repository and return its `gsr` (or `null` if absent — caller surfaces
   * as `{ available: false }`).
   *
   * Non-default half-life: bypass the repository (artifacts are keyed by
   * `(year, round)` only) and compute on-demand.
   */
  async execute(
    year: number,
    round: number,
    halfLife: number = DEFAULT_HALF_LIFE,
  ): Promise<RoundGSR | null> {
    if (halfLife === DEFAULT_HALF_LIFE) {
      const artifact = await this.repository.read(year, round);
      return artifact?.gsr ?? null;
    }
    return this.computeOnDemand(year, round, halfLife);
  }

  private async computeOnDemand(year: number, round: number, halfLife: number): Promise<RoundGSR> {
    const yearArtifact = await this.fixtures.findByYear(year);
    const roundFixtures = yearArtifact
      ? yearArtifact.payload.filter(f => f.round === round)
      : [];
    const nonByeFixtures = buildNonByeFixtures(roundFixtures, year, round);

    if (nonByeFixtures.length === 0) {
      throw Object.assign(new Error(`No fixtures found for ${year} round ${round}`), { code: 'NO_FIXTURES_FOUND' });
    }

    const teamCodes = [...new Set(nonByeFixtures.flatMap(f => [f.homeCode, f.awayCode]))];
    const historyMap = new Map<string, TeamMatchHistory>();
    await Promise.all(
      teamCodes.map(async code => {
        const season = await fetchCrossSeasonHistory(this.supercoachScores, year, code);
        historyMap.set(code, extractTeamHistory(season, code));
      }),
    );

    return computeRoundGSR(nonByeFixtures, historyMap, {
      halfLife,
      minRoundsForReliability: DEFAULT_MIN_ROUNDS_FOR_RELIABILITY,
      year,
      round,
    });
  }
}

export async function fetchCrossSeasonHistory(
  supercoachScores: GetSupercoachScoresUseCase,
  year: number,
  teamCode: string,
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
  const combinedMatches = [...prevMatches, ...current.matches].sort(
    (a, b) => (a.year - b.year) || (a.round - b.round),
  );
  return { ...current, matches: combinedMatches };
}

export function buildNonByeFixtures(
  fixtures: readonly Fixture[],
  year: number,
  round: number,
): NonByeFixture[] {
  return fixtures
    .filter(f => f.isHome && !f.isBye && f.opponentCode !== null)
    .map(f => ({
      homeCode: f.teamCode,
      awayCode: f.opponentCode!,
      matchId: createMatchId(f.teamCode, f.opponentCode!, year, round),
    }));
}
