/**
 * GetPlayerProjectionUseCase — builds a two-component (Floor + Spike) projection profile
 * for a single player from existing D1 data. No schema changes required.
 *
 * Feature: 025-supercoach-player-projections
 */

import type { PlayerRepository } from '../../domain/repositories/player-repository.js';
import type { GetSupercoachScoresUseCase } from './get-supercoach-scores.js';
import type { EligibleGame, PlayerProjectionProfile } from '../../analytics/player-projection-types.js';
import { buildPlayerProfile } from '../../analytics/player-projection-service.js';
import { logger } from '../../utils/logger.js';

export class GetPlayerProjectionUseCase {
  constructor(
    private readonly playerRepository: PlayerRepository,
    private readonly supercoachUseCase: GetSupercoachScoresUseCase,
  ) {}

  /**
   * Build a projection profile for a player across all eligible (isComplete=true) games in a season.
   * Returns null when the player does not exist or has no performance data.
   */
  async execute(year: number, playerId: string): Promise<PlayerProjectionProfile | null> {
    const player = await this.playerRepository.findById(playerId);
    if (!player) return null;

    // Fetch Supercoach scores — this is the authoritative source for isComplete and categories
    const scSeason = await this.supercoachUseCase.executeForPlayer(year, playerId);
    if (!scSeason) return null;

    // Fetch primary performance data for minutesPlayed per round
    const performances = await this.playerRepository.findMatchPerformances(playerId, year);
    const minutesByRound = new Map<number, number>();
    for (const perf of performances) {
      minutesByRound.set(perf.round, perf.minutesPlayed);
    }

    // Build EligibleGame list — only isComplete=true rounds
    const eligibleGames: EligibleGame[] = [];
    for (const match of scSeason.matches) {
      if (!match.isComplete) continue;
      eligibleGames.push({
        round: match.round,
        totalScore: match.totalScore,
        categories: match.categories,
        minutesPlayed: minutesByRound.get(match.round) ?? 80,
      });
    }

    logger.info('Building player projection profile', {
      playerId,
      year,
      eligibleGames: eligibleGames.length,
      totalMatches: scSeason.matches.length,
    });

    return buildPlayerProfile(
      {
        playerId: player.id,
        playerName: player.name,
        teamCode: player.teamCode,
        position: player.position,
      },
      eligibleGames,
    );
  }
}
