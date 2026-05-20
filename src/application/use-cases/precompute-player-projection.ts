/**
 * PrecomputePlayerProjectionUseCase — single-player leaf job for the fan-out
 * precompute pipeline. Replaces the per-player iteration that used to live
 * inside the now-deleted PrecomputeProjectionsUseCase.
 *
 * Idempotency: re-running against the same (year, playerId, asOfRound) writes
 * byte-identical bytes (modulo the `computedAt` timestamp). Skips writing when
 * the player has no usable data — discovery will treat that player as "covered"
 * on the next tick only after the aggregate exists, so we either need a usable
 * profile or we drop the player from the expected set in discovery.
 *
 * Failure semantics: ProjectionStoreQuotaExhaustedError propagates as-is so the
 * dispatcher classifies it terminal (FR-021).
 */

import type {
  PlayerProjectionAggregate,
  ProjectionRepository,
} from '../../domain/repositories/projection-repository.js';
import type { GetPlayerProjectionUseCase } from './get-player-projection.js';
import type { GetContextualProfileUseCase } from './get-contextual-profile.js';

export interface PrecomputePlayerProjectionDeps {
  projectionRepository: ProjectionRepository;
  /** Live (un-wrapped) player projection use case — direct D1 compute. */
  playerProjectionLive: { computeLive: GetPlayerProjectionUseCase['computeLive'] };
  /** Live (un-wrapped) contextual profile use case — accepts pre-computed
   *  baseProfile so we don't re-compute the projection inside. */
  contextualProfileLive: { computeLive: GetContextualProfileUseCase['computeLive'] };
}

export interface PrecomputePlayerProjectionInput {
  year: number;
  asOfRound: number;
  playerId: string;
}

export interface PrecomputePlayerProjectionResult {
  written: boolean;
  /** Reason a write was skipped; absent when written=true. */
  skipReason?: 'no-base-profile' | 'no-contextual-profile';
}

export class PrecomputePlayerProjectionUseCase {
  constructor(private readonly deps: PrecomputePlayerProjectionDeps) {}

  async execute(input: PrecomputePlayerProjectionInput): Promise<PrecomputePlayerProjectionResult> {
    const { year, asOfRound, playerId } = input;

    const baseProfile = await this.deps.playerProjectionLive.computeLive(year, playerId);
    if (!baseProfile) return { written: false, skipReason: 'no-base-profile' };

    const contextualOutcome = await this.deps.contextualProfileLive.computeLive(year, playerId, { baseProfile });
    if (contextualOutcome.kind !== 'ok') return { written: false, skipReason: 'no-contextual-profile' };

    const aggregate: PlayerProjectionAggregate = {
      playerId,
      year,
      asOfRound,
      computedAt: new Date().toISOString(),
      baseProfile,
      contextualProfile: contextualOutcome.result,
    };
    await this.deps.projectionRepository.savePlayerAggregate(aggregate);
    return { written: true };
  }
}
