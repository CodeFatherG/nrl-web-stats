import type { FixtureRepository } from '../ports/fixture-repository.js';
import type { GetSupercoachScoresUseCase } from './get-supercoach-scores.js';
import type { D1GameStrengthRepository } from '../../infrastructure/persistence/d1-game-strength-repository.js';
import type { GameStrengthCache } from '../../analytics/game-strength-cache.js';
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
    private readonly gsrRepository: D1GameStrengthRepository,
    private readonly gsrCache: GameStrengthCache
  ) {}

  /**
   * Called after round `completedRound` supplementary data is fully scraped.
   * Locks next round's GSR to D1 and caches all further future rounds in memory.
   * Idempotent: safe to call multiple times for the same round.
   */
  async execute(year: number, completedRound: number): Promise<void> {
    const nextRound = completedRound + 1;

    // Idempotency: skip if next round is already locked
    const existing = await this.gsrRepository.findByRound(year, nextRound);
    if (existing) {
      logger.info('[GSR] Next round already locked, skipping', { year, nextRound });
      return;
    }

    // Check that the completed round is actually complete
    const completedFixtures = this.fixtures.findByRound(year, completedRound);
    const completedNonBye = buildNonByeFixtures(completedFixtures, year, completedRound);

    if (completedNonBye.length === 0) {
      logger.info('[GSR] No non-bye fixtures found for completed round, skipping', { year, completedRound });
      return;
    }

    const completedTeamCodes = [...new Set(completedNonBye.flatMap(f => [f.homeCode, f.awayCode]))];
    const completedSeasons = await Promise.all(
      completedTeamCodes.map(code => this.supercoachScores.executeForTeamSeason(year, code))
    );

    const allComplete = completedSeasons.every(season => {
      const matchForRound = season.matches.find(m => m.round === completedRound && m.year === year);
      return matchForRound?.isComplete === true;
    });

    if (!allComplete) {
      logger.info('[GSR] Round not yet fully complete, deferring lock', { year, completedRound });
      return;
    }

    // Fetch all team histories once for use across all future round computations
    const allFixtures = this.fixtures.findByYear(year);
    const seasonEndRound = allFixtures.length > 0
      ? Math.max(...allFixtures.map(f => f.round))
      : nextRound;

    const allTeamCodes = [...new Set(
      allFixtures
        .filter(f => f.isHome && !f.isBye && f.opponentCode !== null)
        .flatMap(f => [f.teamCode, f.opponentCode!])
    )];

    // Fetch cross-season histories one team at a time and extract immediately so the heavy
    // TeamSeasonSupercoach payload (~thousands of player records per team) can be GC'd before
    // the next team is loaded. Holding all 17 teams' two-year player data in memory at once
    // overflows the worker heap (observed: ~1.4 GB).
    logger.info('[GSR] Fetching cross-season team histories for lock (sequential)', {
      year, teamCount: allTeamCodes.length,
    });
    const historyMap = new Map<string, TeamMatchHistory>();
    for (const code of allTeamCodes) {
      const season = await fetchCrossSeasonHistory(this.supercoachScores, year, code);
      historyMap.set(code, extractTeamHistory(season, code));
      // `season` reference dropped after this iteration; player data becomes GC-eligible.
    }

    // Lock next round's GSR to D1
    const nextFixtures = this.fixtures.findByRound(year, nextRound);
    const nextNonBye = buildNonByeFixtures(nextFixtures, year, nextRound);

    if (nextNonBye.length > 0) {
      const nextGSR = computeRoundGSR(nextNonBye, historyMap, {
        halfLife: DEFAULT_HALF_LIFE,
        minRoundsForReliability: DEFAULT_MIN_ROUNDS_FOR_RELIABILITY,
        year,
        round: nextRound,
      });
      await this.gsrRepository.save(year, nextRound, nextGSR);
      logger.info('[GSR] Locked GSR for next round', { year, round: nextRound });
    }

    // Rebuild in-memory cache for all future rounds
    this.gsrCache.clear();

    for (let r = nextRound + 1; r <= seasonEndRound; r++) {
      const futureFixtures = this.fixtures.findByRound(year, r);
      const futureNonBye = buildNonByeFixtures(futureFixtures, year, r);
      if (futureNonBye.length === 0) continue;

      const futureGSR = computeRoundGSR(futureNonBye, historyMap, {
        halfLife: DEFAULT_HALF_LIFE,
        minRoundsForReliability: DEFAULT_MIN_ROUNDS_FOR_RELIABILITY,
        year,
        round: r,
      });
      this.gsrCache.set(year, r, futureGSR);
    }

    logger.info('[GSR] Cache rebuilt for future rounds', {
      year,
      from: nextRound + 1,
      to: seasonEndRound,
      cachedRounds: this.gsrCache.size(),
    });
  }
}
