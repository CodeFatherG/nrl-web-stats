/**
 * GetTeamProjectionRankingsUseCase — builds ranked projection profiles for all
 * players in a team with D1 data for a season.
 *
 * Feature: 025-supercoach-player-projections (original live path)
 *          034-precomputed-projections — repo-first with live fallback (US2).
 */

import type { PlayerRepository } from '../../domain/repositories/player-repository.js';
import type { ProjectionRepository } from '../../domain/repositories/projection-repository.js';
import type { GetSupercoachScoresUseCase } from './get-supercoach-scores.js';
import type {
  EligibleGame,
  RankedPlayer,
  RankingMode,
  TeamProjectionRankings,
} from '../../analytics/player-projection-types.js';
import {
  buildPlayerProfile,
  compositeScore,
  DEFAULT_COMPOSITE_WEIGHTS,
} from '../../analytics/player-projection-service.js';
import type { CompositeWeights } from '../../analytics/player-projection-types.js';
import type { WatermarkFn } from './get-player-projection.js';
import { logger } from '../../utils/logger.js';

/** Mode-specific composite weight overrides */
const MODE_WEIGHTS: Record<RankingMode, CompositeWeights> = {
  composite: DEFAULT_COMPOSITE_WEIGHTS,
  captaincy: { floor: 0.5, spike: 1.5, consistency: 5.0, reliableSpike: 1.0 },
  selection: { floor: 1.5, spike: 0.5, consistency: 15.0, reliableSpike: 0.3 },
  trade:     { floor: 1.0, spike: 0.8, consistency: 10.0, reliableSpike: 0.5 },
};

export class GetTeamProjectionRankingsUseCase {
  constructor(
    private readonly playerRepository: PlayerRepository,
    private readonly supercoachUseCase: GetSupercoachScoresUseCase,
    private readonly projectionRepository: ProjectionRepository,
    private readonly watermarkFn: WatermarkFn,
  ) {}

  async execute(
    year: number,
    teamCode: string,
    mode: RankingMode = 'composite',
  ): Promise<TeamProjectionRankings> {
    // ── Repo-first read path (spec 034, US2) ─────────────────────────────
    try {
      const agg = await this.projectionRepository.findTeamRankingsAggregate(year, teamCode, mode);
      if (agg !== null) {
        const watermark = await this.watermarkFn(year);
        if (agg.asOfRound >= watermark) {
          return agg.rankings;
        }
      }
    } catch (err) {
      // SC-008: store outages must never propagate to users.
      logger.warn('team rankings repository read failed; falling back to live', {
        teamCode,
        mode,
        year,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    const rankings = await this.computeLive(year, teamCode, mode);

    // ── SPEC-034-READTHROUGH START ───────────────────────────────────────
    // Opportunistic cache population on miss/stale. Same rules as in
    // get-contextual-profile.ts. Removable as one self-contained block.
    await this.tryPopulateAggregate(year, teamCode, mode, rankings);
    // ── SPEC-034-READTHROUGH END ─────────────────────────────────────────

    return rankings;
  }

  /** SPEC-034-READTHROUGH — write a TeamRankingsAggregate after live fallback.
   *  Errors are caught and logged; they never propagate to the user (SC-008). */
  private async tryPopulateAggregate(
    year: number,
    teamCode: string,
    mode: RankingMode,
    rankings: TeamProjectionRankings,
  ): Promise<void> {
    try {
      const asOfRound = await this.watermarkFn(year);
      await this.projectionRepository.saveTeamRankingsAggregate({
        year,
        teamCode,
        mode,
        asOfRound,
        computedAt: new Date().toISOString(),
        rankings,
      });
    } catch (err) {
      logger.warn('read-through write failed (team rankings)', {
        teamCode, mode, year, error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /** Pure live computation — no repository touch. Exposed for the precompute
   *  use case (US4) so it can write fresh artifacts without recursing through
   *  the repo-first read path. */
  async computeLive(
    year: number,
    teamCode: string,
    mode: RankingMode = 'composite',
  ): Promise<TeamProjectionRankings> {
    // All players with at least one performance for this team and season
    const players = await this.playerRepository.findByTeam(teamCode, year);

    const weights = MODE_WEIGHTS[mode];

    const included: RankedPlayer[] = [];
    let excludedCount = 0;

    for (const player of players) {
      try {
        const scSeason = await this.supercoachUseCase.executeForPlayer(year, player.id);

        // Players with no SC data at all are excluded silently
        if (!scSeason) {
          excludedCount++;
          continue;
        }

        // Build minutesPlayed lookup from primary performances
        const performances = await this.playerRepository.findMatchPerformances(player.id, year);
        const minutesByRound = new Map<number, number>();
        for (const perf of performances) {
          minutesByRound.set(perf.round, perf.minutesPlayed);
        }

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

        const profile = buildPlayerProfile(
          {
            playerId: player.id,
            playerName: player.name,
            teamCode: player.teamCode,
            position: player.position,
          },
          eligibleGames,
        );

        // noUsableData players are excluded from the ranked list
        if (profile.noUsableData) {
          excludedCount++;
          continue;
        }

        const score = compositeScore(profile, weights);

        // null compositeScore (< 2 eligible games) → excluded from ranked list
        if (score === null) {
          excludedCount++;
          continue;
        }

        // trade mode: exclude players with infinite or CV >= 1.0 spike volatility
        if (mode === 'trade' && (profile.spikeCv === Infinity || profile.spikeCv >= 1.0)) {
          excludedCount++;
          continue;
        }

        included.push({ rank: 0, compositeScore: score, profile });
      } catch (err) {
        logger.warn('Skipping player in team projection rankings due to error', {
          playerId: player.id,
          playerName: player.name,
          error: err instanceof Error ? err.message : String(err),
        });
        // silently skip — do not increment excludedCount for unexpected errors
      }
    }

    // Sort descending by composite score, assign ranks
    included.sort((a, b) => (b.compositeScore ?? 0) - (a.compositeScore ?? 0));
    for (let i = 0; i < included.length; i++) {
      included[i]!.rank = i + 1;
    }

    logger.info('Built team projection rankings', {
      teamCode,
      year,
      mode,
      ranked: included.length,
      excluded: excludedCount,
    });

    return {
      teamCode,
      year,
      mode,
      rankedPlayers: included,
      excludedCount,
    };
  }
}
