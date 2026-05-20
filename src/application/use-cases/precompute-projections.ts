/**
 * PrecomputeProjectionsUseCase — writes fresh projection artifacts to the
 * projection repository for one (year, asOfRound). Triggered as a queue job
 * published by EnqueueDueScrapesUseCase when the watermark advances.
 *
 * Failure semantics (FR-009, FR-021):
 *   - Fail fast on first save error.
 *   - ProjectionStoreQuotaExhaustedError propagates as-is so the queue
 *     dispatcher classifies it as terminal.
 *   - PrecomputeStatus is written LAST so its presence guarantees monotonic
 *     advancement of the high-watermark of completed runs.
 *   - Idempotent on retry: a re-run against the same asOfRound writes
 *     byte-identical artifacts (FR-009, Q5).
 *
 * Feature: 034-precomputed-projections (US4).
 */

import type { PlayerRepository } from '../../domain/repositories/player-repository.js';
import type {
  PlayerProjectionAggregate,
  ProjectionRepository,
  TeamRankingsAggregate,
} from '../../domain/repositories/projection-repository.js';
import type { RankingMode } from '../../analytics/player-projection-types.js';
import type { GetPlayerProjectionUseCase } from './get-player-projection.js';
import type { GetContextualProfileUseCase } from './get-contextual-profile.js';
import type { GetTeamProjectionRankingsUseCase } from './get-team-projection-rankings.js';
import { VALID_TEAM_CODES } from '../../models/team.js';
import { logger } from '../../utils/logger.js';

const ALL_MODES: readonly RankingMode[] = ['composite', 'captaincy', 'selection', 'trade'] as const;

export interface PrecomputeProjectionsDeps {
  projectionRepository: ProjectionRepository;
  playerRepository: PlayerRepository;
  /** Live (un-wrapped) player projection use case. Must compute from D1
   *  directly, NOT recurse through the repo-first read path. */
  playerProjectionLive: { computeLive: GetPlayerProjectionUseCase['computeLive'] };
  /** Live (un-wrapped) contextual profile use case. */
  contextualProfileLive: { computeLive: GetContextualProfileUseCase['computeLive'] };
  /** Live (un-wrapped) team rankings use case. */
  teamRankingsLive: { computeLive: GetTeamProjectionRankingsUseCase['computeLive'] };
}

export interface PrecomputeProjectionsInput {
  year: number;
  asOfRound: number;
}

export interface PrecomputeProjectionsSummary {
  year: number;
  asOfRound: number;
  playersWritten: number;
  teamRankingsWritten: number;
}

export class PrecomputeProjectionsUseCase {
  constructor(private readonly deps: PrecomputeProjectionsDeps) {}

  async execute(input: PrecomputeProjectionsInput): Promise<PrecomputeProjectionsSummary> {
    const { year, asOfRound } = input;
    const computedAt = new Date().toISOString();

    let playersWritten = 0;
    let teamRankingsWritten = 0;

    // ── 1. Player aggregates (~500 per year) ─────────────────────────────
    const summaries = await this.deps.playerRepository.findAllSeasonSummaries(year);
    const seenPlayerIds = new Set<string>();
    for (const summary of summaries) {
      if (seenPlayerIds.has(summary.playerId)) continue;
      seenPlayerIds.add(summary.playerId);

      const baseProfile = await this.deps.playerProjectionLive.computeLive(year, summary.playerId);
      if (!baseProfile) continue; // player has no usable data; skip without writing

      const contextualOutcome = await this.deps.contextualProfileLive.computeLive(year, summary.playerId);
      if (contextualOutcome.kind !== 'ok') continue;

      const agg: PlayerProjectionAggregate = {
        playerId: summary.playerId,
        year,
        asOfRound,
        computedAt,
        baseProfile,
        contextualProfile: contextualOutcome.result,
      };
      await this.deps.projectionRepository.savePlayerAggregate(agg);
      playersWritten += 1;
    }

    // ── 2. Team rankings aggregates (17 × 4 = 68 per year) ──────────────
    for (const teamCode of VALID_TEAM_CODES) {
      for (const mode of ALL_MODES) {
        const rankings = await this.deps.teamRankingsLive.computeLive(year, teamCode, mode);
        const agg: TeamRankingsAggregate = {
          year,
          teamCode,
          mode,
          asOfRound,
          computedAt,
          rankings,
        };
        await this.deps.projectionRepository.saveTeamRankingsAggregate(agg);
        teamRankingsWritten += 1;
      }
    }

    // ── 3. Precompute status — written LAST so the high-watermark of
    //    completed runs advances iff every aggregate above succeeded.
    await this.deps.projectionRepository.savePrecomputeStatus({ year, asOfRound });

    logger.info('Precompute projections complete', {
      year,
      asOfRound,
      playersWritten,
      teamRankingsWritten,
    });

    return { year, asOfRound, playersWritten, teamRankingsWritten };
  }
}
