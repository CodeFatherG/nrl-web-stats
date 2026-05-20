/**
 * GetPlayerProjectionUseCase — builds a two-component (Floor + Spike) projection profile
 * for a single player from existing D1 data. No schema changes required.
 *
 * Feature: 025-supercoach-player-projections (original live path)
 *          034-precomputed-projections — repo-first with live fallback (US1).
 *
 * Read path (US1):
 *   1. Attempt projectionRepository.findPlayerAggregate(year, playerId).
 *   2. If a fresh aggregate exists (asOfRound >= currentWatermark), return its baseProfile.
 *   3. Otherwise (miss / stale / repo error) fall through to live computation below.
 * The repository is NEVER written to from this read path.
 */

import type { PlayerRepository } from '../../domain/repositories/player-repository.js';
import type { ProjectionRepository } from '../../domain/repositories/projection-repository.js';
import type { GetSupercoachScoresUseCase } from './get-supercoach-scores.js';
import type { EligibleGame, PlayerProjectionProfile } from '../../analytics/player-projection-types.js';
import { buildPlayerProfile } from '../../analytics/player-projection-service.js';
import { logger } from '../../utils/logger.js';

/** Returns the watermark (latest completed round) for a year. Injected so the
 *  use case never imports infrastructure or other use cases for this. */
export type WatermarkFn = (year: number) => Promise<number>;

export class GetPlayerProjectionUseCase {
  constructor(
    private readonly playerRepository: PlayerRepository,
    private readonly supercoachUseCase: GetSupercoachScoresUseCase,
    private readonly projectionRepository: ProjectionRepository,
    private readonly watermarkFn: WatermarkFn,
  ) {}

  /**
   * Build a projection profile for a player across all eligible (isComplete=true) games in a season.
   * Returns null when the player does not exist or has no performance data.
   */
  async execute(year: number, playerId: string): Promise<PlayerProjectionProfile | null> {
    // ── Repo-first read path (spec 034, US1) ─────────────────────────────
    try {
      const agg = await this.projectionRepository.findPlayerAggregate(year, playerId);
      if (agg !== null) {
        const watermark = await this.watermarkFn(year);
        if (agg.asOfRound >= watermark) {
          return agg.baseProfile;
        }
      }
    } catch (err) {
      // SC-008: store outages must never propagate to users. Log and fall
      // through to live computation.
      logger.warn('projection repository read failed; falling back to live', {
        playerId,
        year,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // ── Live fallback ────────────────────────────────────────────────────
    return this.computeLive(year, playerId);
  }

  /**
   * Pure live computation — no repository touch. Exposed for the precompute
   * use case (US4), which calls this directly to write fresh artifacts.
   */
  async computeLive(year: number, playerId: string): Promise<PlayerProjectionProfile | null> {
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
