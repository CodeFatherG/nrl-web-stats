/**
 * CompositeGameStrengthRepository — production implementation of the
 * GameStrengthRepository port. Routes operations to the appropriate
 * backend internally:
 *
 *   - Locked artifacts live in the D1 `game_strength_ratings` table
 *     (existing immutability semantics: INSERT-OR-IGNORE, never overwritten).
 *   - Provisional artifacts live in the Cloudflare KV `CACHE` namespace
 *     under the `gsr-provisional:v1:` key prefix, or in a per-isolate
 *     in-memory Map when no `CACHE` binding is configured.
 *
 * The split is invisible to use cases — they consume one port with one
 * vocabulary (read / writeLocked / writeProvisional / etc.).
 *
 * Feature: 036-game-strength-artifact.
 */

import type { RoundGSR } from '../../domain/game-strength.js';
import {
  GameStrengthStoreQuotaExhaustedError,
  type GameStrengthArtifact,
  type GameStrengthRepository,
} from '../../domain/repositories/game-strength-repository.js';
import { ProvisionalGameStrengthStoreQuotaExhaustedError } from '../../domain/repositories/provisional-game-strength-repository.js';
import type { D1GameStrengthRepository } from './d1-game-strength-repository.js';
import type { ProvisionalGameStrengthRepository } from '../../domain/repositories/provisional-game-strength-repository.js';

export class CompositeGameStrengthRepository implements GameStrengthRepository {
  constructor(
    private readonly locked: D1GameStrengthRepository,
    private readonly provisional: ProvisionalGameStrengthRepository,
  ) {}

  async read(year: number, round: number): Promise<GameStrengthArtifact | null> {
    const lockedHit = await this.locked.findByRound(year, round);
    if (lockedHit) {
      return {
        gsr: lockedHit.gsr,
        locked: true,
        lockedAt: lockedHit.lockedAt,
      };
    }
    const provisionalHit = await this.provisional.findByRound(year, round);
    if (provisionalHit) {
      return {
        gsr: provisionalHit,
        locked: false,
        lockedAt: null,
      };
    }
    return null;
  }

  async writeLocked(year: number, round: number, gsr: RoundGSR): Promise<void> {
    // INSERT OR IGNORE in the D1 sub-adapter — second writes for an
    // already-locked round are benign no-ops (existing semantics).
    await this.locked.save(year, round, gsr);
  }

  async writeProvisional(year: number, round: number, gsr: RoundGSR): Promise<void> {
    try {
      await this.provisional.save(year, round, gsr);
    } catch (err) {
      // Re-wrap the sub-adapter's named error in the port's named error so
      // the dispatcher's `classifyError` need only know about one type.
      if (err instanceof ProvisionalGameStrengthStoreQuotaExhaustedError) {
        throw new GameStrengthStoreQuotaExhaustedError(err.message, err);
      }
      throw err;
    }
  }

  async deleteProvisional(year: number, round: number): Promise<void> {
    await this.provisional.deleteByRound(year, round);
  }

  async deleteAllProvisional(year: number): Promise<void> {
    await this.provisional.deleteByYear(year);
  }

  async listLockedRounds(year: number): Promise<ReadonlySet<number>> {
    return this.locked.findLockedRoundsForYear(year);
  }

  async listProvisionalRounds(year: number): Promise<ReadonlySet<number>> {
    return this.provisional.listProvisionalRounds(year);
  }
}
