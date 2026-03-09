/**
 * ScrapePlayerStatsUseCase — orchestrates fetching player stats from an
 * external source and persisting them via the PlayerRepository.
 */

import type { PlayerStatsSource, PlayerMatchStats } from '../../domain/ports/player-stats-source.js';
import type { PlayerRepository } from '../../domain/repositories/player-repository.js';
import { addPerformance, createMatchPerformance } from '../../domain/player.js';
import type { Player } from '../../domain/player.js';
import type { Warning } from '../../models/types.js';
import { logger } from '../../utils/logger.js';

/** Result of a player stats scrape operation */
export interface ScrapePlayerStatsResult {
  year: number;
  round: number;
  playersProcessed: number;
  matchesScraped: number;
  created: number;
  updated: number;
  skipped: number;
  warnings: Warning[];
}

export class ScrapePlayerStatsUseCase {
  constructor(
    private readonly playerStatsSource: PlayerStatsSource,
    private readonly playerRepository: PlayerRepository
  ) {}

  async execute(year: number, round: number, force = false): Promise<ScrapePlayerStatsResult> {
    // Check if round is already complete (skip unless forced)
    if (!force) {
      const isComplete = await this.playerRepository.isRoundComplete(year, round);
      if (isComplete) {
        logger.debug('Round already complete, skipping player stats scrape', { year, round });
        return {
          year,
          round,
          playersProcessed: 0,
          matchesScraped: 0,
          created: 0,
          updated: 0,
          skipped: 1,
          warnings: [],
        };
      }
    }

    // Fetch player stats from external source
    const fetchResult = await this.playerStatsSource.fetchPlayerStats(year, round);

    if (!fetchResult.success) {
      logger.error('Failed to fetch player stats', { year, round, error: fetchResult.error });
      throw new Error(`Failed to fetch player stats: ${fetchResult.error}`);
    }

    const { data: allStats, warnings } = fetchResult;

    // Group stats by playerId
    const playerStatsMap = new Map<string, PlayerMatchStats[]>();
    for (const stat of allStats) {
      const existing = playerStatsMap.get(stat.playerId) ?? [];
      existing.push(stat);
      playerStatsMap.set(stat.playerId, existing);
    }

    // Count unique matches
    const matchIds = new Set(allStats.map(s => s.matchId));

    let created = 0;
    let updated = 0;

    // Process each player
    for (const [playerId, stats] of playerStatsMap) {
      const existingPlayer = await this.playerRepository.findById(playerId);

      // Use the latest stat entry for player identity (team/position may change)
      const latestStat = stats[stats.length - 1];

      let player: Player;
      if (existingPlayer) {
        // Update identity fields, keep existing performances
        player = {
          ...existingPlayer,
          name: latestStat.playerName,
          teamCode: latestStat.teamCode,
          position: latestStat.position,
          performances: existingPlayer.performances,
        };
        updated++;
      } else {
        player = {
          id: playerId,
          name: latestStat.playerName,
          dateOfBirth: latestStat.dateOfBirth,
          teamCode: latestStat.teamCode,
          position: latestStat.position,
          performances: [],
        };
        created++;
      }

      // Add match performances
      for (const stat of stats) {
        const performance = createMatchPerformance({
          matchId: stat.matchId,
          year: stat.year,
          round: stat.round,
          teamCode: stat.teamCode,
          allRunMetres: stat.allRunMetres,
          allRuns: stat.allRuns,
          bombKicks: stat.bombKicks,
          crossFieldKicks: stat.crossFieldKicks,
          conversions: stat.conversions,
          conversionAttempts: stat.conversionAttempts,
          dummyHalfRuns: stat.dummyHalfRuns,
          dummyHalfRunMetres: stat.dummyHalfRunMetres,
          dummyPasses: stat.dummyPasses,
          errors: stat.errors,
          fantasyPointsTotal: stat.fantasyPointsTotal,
          fieldGoals: stat.fieldGoals,
          forcedDropOutKicks: stat.forcedDropOutKicks,
          fortyTwentyKicks: stat.fortyTwentyKicks,
          goals: stat.goals,
          goalConversionRate: stat.goalConversionRate,
          grubberKicks: stat.grubberKicks,
          handlingErrors: stat.handlingErrors,
          hitUps: stat.hitUps,
          hitUpRunMetres: stat.hitUpRunMetres,
          ineffectiveTackles: stat.ineffectiveTackles,
          intercepts: stat.intercepts,
          kicks: stat.kicks,
          kicksDead: stat.kicksDead,
          kicksDefused: stat.kicksDefused,
          kickMetres: stat.kickMetres,
          kickReturnMetres: stat.kickReturnMetres,
          lineBreakAssists: stat.lineBreakAssists,
          lineBreaks: stat.lineBreaks,
          lineEngagedRuns: stat.lineEngagedRuns,
          minutesPlayed: stat.minutesPlayed,
          missedTackles: stat.missedTackles,
          offloads: stat.offloads,
          offsideWithinTenMetres: stat.offsideWithinTenMetres,
          oneOnOneLost: stat.oneOnOneLost,
          oneOnOneSteal: stat.oneOnOneSteal,
          onePointFieldGoals: stat.onePointFieldGoals,
          onReport: stat.onReport,
          passesToRunRatio: stat.passesToRunRatio,
          passes: stat.passes,
          playTheBallTotal: stat.playTheBallTotal,
          playTheBallAverageSpeed: stat.playTheBallAverageSpeed,
          penalties: stat.penalties,
          points: stat.points,
          penaltyGoals: stat.penaltyGoals,
          postContactMetres: stat.postContactMetres,
          receipts: stat.receipts,
          ruckInfringements: stat.ruckInfringements,
          sendOffs: stat.sendOffs,
          sinBins: stat.sinBins,
          stintOne: stat.stintOne,
          tackleBreaks: stat.tackleBreaks,
          tackleEfficiency: stat.tackleEfficiency,
          tacklesMade: stat.tacklesMade,
          tries: stat.tries,
          tryAssists: stat.tryAssists,
          twentyFortyKicks: stat.twentyFortyKicks,
          twoPointFieldGoals: stat.twoPointFieldGoals,
          isComplete: stat.isComplete,
        });
        player = addPerformance(player, performance);
      }

      // Persist
      await this.playerRepository.save(player);
    }

    logger.info('Player stats scrape complete', {
      year,
      round,
      playersProcessed: playerStatsMap.size,
      matchesScraped: matchIds.size,
      created,
      updated,
    });

    return {
      year,
      round,
      playersProcessed: playerStatsMap.size,
      matchesScraped: matchIds.size,
      created,
      updated,
      skipped: 0,
      warnings,
    };
  }
}
