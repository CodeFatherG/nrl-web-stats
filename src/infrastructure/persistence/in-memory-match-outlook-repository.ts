/**
 * InMemoryMatchOutlookRepository — process-local fallback.
 *
 * Feature: 037-analytics-cache-replacement (T015).
 */

import type {
  MatchOutlookAggregate,
  MatchOutlookRepository,
} from '../../domain/repositories/match-outlook-repository.js';

function compositeKey(year: number, round: number): string {
  return `${year}:${round}`;
}

export class InMemoryMatchOutlookRepository implements MatchOutlookRepository {
  private readonly entries = new Map<string, MatchOutlookAggregate>();

  async findMatchOutlookAggregate(
    year: number,
    round: number,
  ): Promise<MatchOutlookAggregate | null> {
    return this.entries.get(compositeKey(year, round)) ?? null;
  }

  async listMatchOutlookAsOfRounds(year: number): Promise<Map<number, number>> {
    const out = new Map<number, number>();
    for (const agg of this.entries.values()) {
      if (agg.year === year) out.set(agg.round, agg.asOfRound);
    }
    return out;
  }

  async saveMatchOutlookAggregate(
    aggregate: MatchOutlookAggregate,
  ): Promise<void> {
    this.entries.set(compositeKey(aggregate.year, aggregate.round), aggregate);
  }
}
