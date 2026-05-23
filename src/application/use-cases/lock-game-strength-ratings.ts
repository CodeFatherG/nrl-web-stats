import type { FixtureRepository } from '../../domain/repositories/fixture-repository.js';
import type { GetSupercoachScoresUseCase } from './get-supercoach-scores.js';
import type { GameStrengthRepository } from '../../domain/repositories/game-strength-repository.js';
import type { TeamMatchHistory } from '../../domain/game-strength.js';
import {
  computeRoundGSR,
  extractTeamHistory,
  DEFAULT_HALF_LIFE,
  DEFAULT_MIN_ROUNDS_FOR_RELIABILITY,
} from '../../analytics/game-strength-service.js';
import { buildNonByeFixtures, fetchCrossSeasonHistory } from './get-game-strength.js';
import { logger } from '../../utils/logger.js';

export class LockGameStrengthRatingsUseCase {
  constructor(
    private readonly supercoachScores: GetSupercoachScoresUseCase,
    private readonly fixtures: FixtureRepository,
    private readonly repository: GameStrengthRepository,
  ) {}

  async execute(year: number, completedRound: number): Promise<void> {
    const nextRound = completedRound + 1;

    const existing = await this.repository.read(year, nextRound);
    if (existing && existing.locked) {
      logger.info('[GSR] Next round already locked, skipping', { year, nextRound });
      return;
    }

    const yearArtifact = await this.fixtures.findByYear(year);
    const allFixtures = yearArtifact ? yearArtifact.payload : [];

    const completedFixtures = allFixtures.filter(f => f.round === completedRound);
    const completedNonBye = buildNonByeFixtures(completedFixtures, year, completedRound);

    if (completedNonBye.length === 0) {
      logger.info('[GSR] No non-bye fixtures found for completed round, skipping', { year, completedRound });
      return;
    }

    const completedTeamCodes = [...new Set(completedNonBye.flatMap(f => [f.homeCode, f.awayCode]))];
    const completedSeasons = await Promise.all(
      completedTeamCodes.map(code => this.supercoachScores.executeForTeamSeason(year, code)),
    );

    const allComplete = completedSeasons.every(season => {
      const matchForRound = season.matches.find(m => m.round === completedRound && m.year === year);
      return matchForRound?.isComplete === true;
    });

    if (!allComplete) {
      logger.info('[GSR] Round not yet fully complete, deferring lock', { year, completedRound });
      return;
    }

    const seasonEndRound = allFixtures.length > 0
      ? Math.max(...allFixtures.map(f => f.round))
      : nextRound;

    const allTeamCodes = [...new Set(
      allFixtures
        .filter(f => f.isHome && !f.isBye && f.opponentCode !== null)
        .flatMap(f => [f.teamCode, f.opponentCode!]),
    )];

    logger.info('[GSR] Fetching cross-season team histories for lock (sequential)', {
      year, teamCount: allTeamCodes.length,
    });
    const historyMap = new Map<string, TeamMatchHistory>();
    for (const code of allTeamCodes) {
      const season = await fetchCrossSeasonHistory(this.supercoachScores, year, code);
      historyMap.set(code, extractTeamHistory(season, code));
    }

    const nextFixtures = allFixtures.filter(f => f.round === nextRound);
    const nextNonBye = buildNonByeFixtures(nextFixtures, year, nextRound);

    if (nextNonBye.length > 0) {
      const nextGSR = computeRoundGSR(nextNonBye, historyMap, {
        halfLife: DEFAULT_HALF_LIFE,
        minRoundsForReliability: DEFAULT_MIN_ROUNDS_FOR_RELIABILITY,
        year,
        round: nextRound,
      });
      await this.repository.writeLocked(year, nextRound, nextGSR);
      logger.info('[GSR] Locked GSR for next round', { year, round: nextRound });
    }

    await this.repository.deleteAllProvisional(year);

    let provisionalCount = 0;
    for (let r = nextRound + 1; r <= seasonEndRound; r++) {
      const futureFixtures = allFixtures.filter(f => f.round === r);
      const futureNonBye = buildNonByeFixtures(futureFixtures, year, r);
      if (futureNonBye.length === 0) continue;

      const futureGSR = computeRoundGSR(futureNonBye, historyMap, {
        halfLife: DEFAULT_HALF_LIFE,
        minRoundsForReliability: DEFAULT_MIN_ROUNDS_FOR_RELIABILITY,
        year,
        round: r,
      });
      await this.repository.writeProvisional(year, r, futureGSR);
      provisionalCount++;
    }

    logger.info('[GSR] Provisional store rebuilt for future rounds', {
      year,
      from: nextRound + 1,
      to: seasonEndRound,
      provisionalRounds: provisionalCount,
    });
  }
}
