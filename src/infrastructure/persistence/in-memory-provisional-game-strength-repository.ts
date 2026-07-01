/**
 * InMemoryProvisionalGameStrengthRepository — process-local fallback adapter
 * for the ProvisionalGameStrengthRepository port.
 *
 * Used when no durable store binding is configured (local dev, unit tests).
 * Contents do not survive isolate recycling — FR-025 explicitly accepts this.
 *
 * Feature: 036-game-strength-artifact (T006).
 */

import type { RoundGSR } from '../../domain/game-strength.js';
import type { ProvisionalGameStrengthRepository } from '../../domain/repositories/provisional-game-strength-repository.js';

function compositeKey(year: number, round: number): string {
  return `${year}:${round}`;
}

export class InMemoryProvisionalGameStrengthRepository
  implements ProvisionalGameStrengthRepository
{
  private readonly entries = new Map<string, RoundGSR>();

  async findByRound(year: number, round: number): Promise<RoundGSR | null> {
    return this.entries.get(compositeKey(year, round)) ?? null;
  }

  async listProvisionalRounds(year: number): Promise<ReadonlySet<number>> {
    const rounds = new Set<number>();
    const prefix = `${year}:`;
    for (const key of this.entries.keys()) {
      if (!key.startsWith(prefix)) continue;
      const n = Number(key.slice(prefix.length));
      if (Number.isInteger(n)) rounds.add(n);
    }
    return rounds;
  }

  async save(year: number, round: number, gsr: RoundGSR): Promise<void> {
    this.entries.set(compositeKey(year, round), gsr);
  }

  async deleteByRound(year: number, round: number): Promise<void> {
    this.entries.delete(compositeKey(year, round));
  }

  async deleteByYear(year: number): Promise<void> {
    const prefix = `${year}:`;
    for (const key of [...this.entries.keys()]) {
      if (key.startsWith(prefix)) this.entries.delete(key);
    }
  }
}
