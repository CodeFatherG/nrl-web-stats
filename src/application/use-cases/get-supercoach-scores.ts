/**
 * GetSupercoachScoresUseCase — orchestrates computing Supercoach scores for a round.
 *
 * Fetches primary stats from PlayerRepository, supplementary stats from D1,
 * runs name matching to join them, computes scores via the scoring service.
 * Auto-persists new player name links when algorithmic matching succeeds.
 */

import type { PlayerRepository } from '../../domain/repositories/player-repository.js';
import type { D1SupplementaryStatsRepository } from '../../infrastructure/persistence/d1-supplementary-stats-repo.js';
import type { ScoringConfig } from '../../config/supercoach-scoring-config.js';
import type { SupplementaryPlayerStats } from '../../domain/ports/supplementary-stats-source.js';
import type { RoundSupercoachSummary, SupercoachScore, PlayerSeasonSupercoach, RoundScore } from '../../domain/supercoach-score.js';
import type { MergedPlayerStats } from '../../analytics/supercoach-types.js';
import type { D1PlayerNameLinkRepository, PlayerNameLink } from '../../infrastructure/persistence/d1-player-name-link-repo.js';
import type { MatchingContext } from '../../config/player-name-matcher.js';
import { extractPrimaryScoringStats } from '../../analytics/supercoach-types.js';
import { computePlayerScore } from '../../analytics/supercoach-scoring-service.js';
import { matchPlayerName } from '../../config/player-name-matcher.js';
import { VALID_TEAM_CODES } from '../../models/team.js';
import { logger } from '../../utils/logger.js';

export class GetSupercoachScoresUseCase {
  constructor(
    private readonly playerRepository: PlayerRepository,
    private readonly supplementaryRepo: D1SupplementaryStatsRepository,
    private readonly scoringConfig: ScoringConfig,
    private readonly linkRepo?: D1PlayerNameLinkRepository
  ) {}

  /** Build matching context from persisted links and supplementary team codes */
  private async buildMatchingContext(
    supplementaryStats: SupplementaryPlayerStats[]
  ): Promise<MatchingContext> {
    // Load persisted links
    const persistedLinks = new Map<string, string>();
    if (this.linkRepo) {
      const allLinks = await this.linkRepo.findAll();
      for (const link of allLinks) {
        persistedLinks.set(link.playerId, link.supplementaryName);
      }
    }

    // Build supplementary team code map
    const supplementaryTeamCodes = new Map<string, string>();
    for (const stat of supplementaryStats) {
      if (stat.teamCode) {
        supplementaryTeamCodes.set(stat.playerName, stat.teamCode);
      }
    }

    return { persistedLinks, supplementaryTeamCodes };
  }

  /** Auto-persist a newly discovered link (non-blocking) */
  private persistLink(
    playerId: string,
    playerName: string,
    teamCode: string,
    supplementaryName: string,
    confidence: string,
    linksToSave: PlayerNameLink[]
  ): void {
    linksToSave.push({
      playerId,
      playerName,
      teamCode,
      supplementaryName,
      confidence,
      source: 'auto',
    });
  }

  async execute(
    year: number,
    round: number,
    teamCodeFilter?: string
  ): Promise<RoundSupercoachSummary> {
    // Get supplementary stats for this round
    const supplementaryStats = await this.supplementaryRepo.findByRound(year, round);
    const supplementaryNames = supplementaryStats.map(s => s.playerName);
    const supplementaryMap = new Map<string, SupplementaryPlayerStats>();
    for (const stat of supplementaryStats) {
      supplementaryMap.set(stat.playerName, stat);
    }

    const matchingContext = await this.buildMatchingContext(supplementaryStats);

    // Get primary stats for all teams (or filtered team)
    const teamCodes = teamCodeFilter ? [teamCodeFilter] : [...VALID_TEAM_CODES];
    const scores: SupercoachScore[] = [];
    let unmatchedCount = 0;
    const linksToSave: PlayerNameLink[] = [];

    for (const teamCode of teamCodes) {
      const performances = await this.playerRepository.findPerformancesByMatch(year, round, teamCode);

      for (const { playerName, playerId, performance } of performances) {
        // Split player name into first/last for matching
        const nameParts = playerName.split(' ');
        const firstName = nameParts[0] ?? '';
        const lastName = nameParts.slice(1).join(' ') || firstName;

        // Try to find supplementary match
        const identityMatch = supplementaryStats.length > 0
          ? matchPlayerName(
              playerId,
              firstName,
              lastName,
              teamCode,
              supplementaryNames,
              matchingContext
            )
          : null;

        let supplementary: SupplementaryPlayerStats | null = null;
        let matchConfidence: MergedPlayerStats['matchConfidence'] = 'unmatched';

        if (identityMatch) {
          supplementary = supplementaryMap.get(identityMatch.supplementaryName) ?? null;
          matchConfidence = identityMatch.confidence;

          // Auto-persist new links (skip if already a persisted link)
          if (identityMatch.confidence !== 'linked' && this.linkRepo) {
            this.persistLink(
              playerId, playerName, teamCode,
              identityMatch.supplementaryName, identityMatch.confidence,
              linksToSave
            );
          }
        } else if (supplementaryStats.length > 0) {
          unmatchedCount++;
        }

        // Extract primary scoring stats from the full match performance
        const primaryStats = extractPrimaryScoringStats({
          playerId: performance.matchId, // Use a stable ID
          playerName,
          teamCode,
          matchId: performance.matchId,
          year: performance.year,
          round: performance.round,
          tries: performance.tries,
          conversions: performance.conversions,
          penaltyGoals: performance.penaltyGoals,
          onePointFieldGoals: performance.onePointFieldGoals,
          twoPointFieldGoals: performance.twoPointFieldGoals,
          tryAssists: performance.tryAssists,
          lineBreakAssists: performance.lineBreakAssists,
          forcedDropOutKicks: performance.forcedDropOutKicks,
          fortyTwentyKicks: performance.fortyTwentyKicks,
          twentyFortyKicks: performance.twentyFortyKicks,
          kicksDead: performance.kicksDead,
          tackleBreaks: performance.tackleBreaks,
          lineBreaks: performance.lineBreaks,
          intercepts: performance.intercepts,
          tacklesMade: performance.tacklesMade,
          missedTackles: performance.missedTackles,
          penalties: performance.penalties,
          errors: performance.errors,
          sinBins: performance.sinBins,
          sendOffs: performance.sendOffs,
          offloads: performance.offloads,
          allRuns: performance.allRuns,
        });

        const merged: MergedPlayerStats = {
          primary: primaryStats,
          supplementary,
          matchConfidence,
        };

        scores.push(computePlayerScore(merged, this.scoringConfig));
      }
    }

    // Batch-save new links
    if (linksToSave.length > 0 && this.linkRepo) {
      try {
        await this.linkRepo.saveBatch(linksToSave);
        logger.info('Auto-persisted player name links', { count: linksToSave.length, year, round });
      } catch (err) {
        logger.error('Failed to persist player name links', { error: err instanceof Error ? err.message : String(err) });
      }
    }

    // Sort by total score descending
    scores.sort((a, b) => b.totalScore - a.totalScore);

    const totalDiscrepancies = scores.reduce(
      (sum, s) => sum + s.validationWarnings.length,
      0
    );

    const isComplete = supplementaryStats.length > 0 &&
      scores.every(s => s.isComplete);

    return {
      year,
      round,
      isComplete,
      playersScored: scores.length,
      validationSummary: {
        totalDiscrepancies,
        unmatchedPlayers: unmatchedCount,
      },
      scores,
    };
  }

  /**
   * Compute Supercoach scores for a single player across all rounds in a season.
   */
  async executeForPlayer(year: number, playerId: string): Promise<PlayerSeasonSupercoach | null> {
    const player = await this.playerRepository.findById(playerId);
    if (!player) return null;

    const performances = await this.playerRepository.findMatchPerformances(playerId, year);
    if (performances.length === 0) return null;

    // Load persisted links once for the whole request
    const persistedLinks = new Map<string, string>();
    if (this.linkRepo) {
      const allLinks = await this.linkRepo.findAll();
      for (const link of allLinks) {
        persistedLinks.set(link.playerId, link.supplementaryName);
      }
    }

    const rounds: RoundScore[] = [];
    const linksToSave: PlayerNameLink[] = [];

    for (const perf of performances) {
      // Get supplementary stats for this round
      const supplementaryStats = await this.supplementaryRepo.findByRound(year, perf.round);
      const supplementaryNames = supplementaryStats.map(s => s.playerName);
      const supplementaryMap = new Map<string, SupplementaryPlayerStats>();
      for (const stat of supplementaryStats) {
        supplementaryMap.set(stat.playerName, stat);
      }

      // Build team codes for this round
      const supplementaryTeamCodes = new Map<string, string>();
      for (const stat of supplementaryStats) {
        if (stat.teamCode) {
          supplementaryTeamCodes.set(stat.playerName, stat.teamCode);
        }
      }

      const nameParts = player.name.split(' ');
      const firstName = nameParts[0] ?? '';
      const lastName = nameParts.slice(1).join(' ') || firstName;

      const identityMatch = supplementaryStats.length > 0
        ? matchPlayerName(
            playerId,
            firstName,
            lastName,
            perf.teamCode,
            supplementaryNames,
            { persistedLinks, supplementaryTeamCodes }
          )
        : null;

      let supplementary: SupplementaryPlayerStats | null = null;
      let matchConfidence: MergedPlayerStats['matchConfidence'] = 'unmatched';

      if (identityMatch) {
        supplementary = supplementaryMap.get(identityMatch.supplementaryName) ?? null;
        matchConfidence = identityMatch.confidence;

        // Auto-persist new links
        if (identityMatch.confidence !== 'linked' && this.linkRepo) {
          this.persistLink(
            playerId, player.name, perf.teamCode,
            identityMatch.supplementaryName, identityMatch.confidence,
            linksToSave
          );
        }
      }

      const primaryStats = extractPrimaryScoringStats({
        playerId: player.id,
        playerName: player.name,
        teamCode: perf.teamCode,
        matchId: perf.matchId,
        year: perf.year,
        round: perf.round,
        tries: perf.tries,
        conversions: perf.conversions,
        penaltyGoals: perf.penaltyGoals,
        onePointFieldGoals: perf.onePointFieldGoals,
        twoPointFieldGoals: perf.twoPointFieldGoals,
        tryAssists: perf.tryAssists,
        lineBreakAssists: perf.lineBreakAssists,
        forcedDropOutKicks: perf.forcedDropOutKicks,
        fortyTwentyKicks: perf.fortyTwentyKicks,
        twentyFortyKicks: perf.twentyFortyKicks,
        kicksDead: perf.kicksDead,
        tackleBreaks: perf.tackleBreaks,
        lineBreaks: perf.lineBreaks,
        intercepts: perf.intercepts,
        tacklesMade: perf.tacklesMade,
        missedTackles: perf.missedTackles,
        penalties: perf.penalties,
        errors: perf.errors,
        sinBins: perf.sinBins,
        sendOffs: perf.sendOffs,
        offloads: perf.offloads,
        allRuns: perf.allRuns,
      });

      const merged: MergedPlayerStats = {
        primary: primaryStats,
        supplementary,
        matchConfidence,
      };

      const score = computePlayerScore(merged, this.scoringConfig);

      rounds.push({
        round: perf.round,
        totalScore: score.totalScore,
        isComplete: score.isComplete,
        categoryTotals: score.categoryTotals,
      });
    }

    // Batch-save new links
    if (linksToSave.length > 0 && this.linkRepo) {
      try {
        await this.linkRepo.saveBatch(linksToSave);
        logger.info('Auto-persisted player name links (single player)', { count: linksToSave.length, playerId });
      } catch (err) {
        logger.error('Failed to persist player name links', { error: err instanceof Error ? err.message : String(err) });
      }
    }

    // Sort by round
    rounds.sort((a, b) => a.round - b.round);

    const seasonTotal = rounds.reduce((sum, r) => sum + r.totalScore, 0);
    const roundsPlayed = rounds.length;

    return {
      playerId: player.id,
      playerName: player.name,
      teamCode: player.teamCode,
      year,
      rounds,
      seasonTotal,
      seasonAverage: roundsPlayed > 0 ? Math.round(seasonTotal / roundsPlayed) : 0,
      roundsPlayed,
    };
  }
}
