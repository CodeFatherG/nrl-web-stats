/**
 * InMemoryCompositionImpactRepository — process-local fallback.
 *
 * Feature: 037-analytics-cache-replacement (T017).
 */

import type {
  CompositionImpactAggregate,
  CompositionImpactRepository,
} from '../../domain/repositories/composition-impact-repository.js';

function compositeKey(year: number, teamCode: string): string {
  return `${year}:${teamCode}`;
}

export class InMemoryCompositionImpactRepository
  implements CompositionImpactRepository
{
  private readonly entries = new Map<string, CompositionImpactAggregate>();

  async findCompositionImpactAggregate(
    year: number,
    teamCode: string,
  ): Promise<CompositionImpactAggregate | null> {
    return this.entries.get(compositeKey(year, teamCode)) ?? null;
  }

  async listCompositionImpactAsOfRounds(
    year: number,
  ): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    for (const agg of this.entries.values()) {
      if (agg.year === year) out.set(agg.teamCode, agg.asOfRound);
    }
    return out;
  }

  async saveCompositionImpactAggregate(
    aggregate: CompositionImpactAggregate,
  ): Promise<void> {
    this.entries.set(compositeKey(aggregate.year, aggregate.teamCode), aggregate);
  }
}
