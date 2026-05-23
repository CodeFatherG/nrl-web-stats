/**
 * InMemoryPlayerTrendsRepository — process-local fallback.
 *
 * Feature: 037-analytics-cache-replacement (T016).
 */

import type {
  PlayerTrendsAggregate,
  PlayerTrendsRepository,
} from '../../domain/repositories/player-trends-repository.js';

function compositeKey(year: number, teamCode: string): string {
  return `${year}:${teamCode}`;
}

export class InMemoryPlayerTrendsRepository implements PlayerTrendsRepository {
  private readonly entries = new Map<string, PlayerTrendsAggregate>();

  async findPlayerTrendsAggregate(
    year: number,
    teamCode: string,
  ): Promise<PlayerTrendsAggregate | null> {
    return this.entries.get(compositeKey(year, teamCode)) ?? null;
  }

  async listPlayerTrendsAsOfRounds(year: number): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    for (const agg of this.entries.values()) {
      if (agg.year === year) out.set(agg.teamCode, agg.asOfRound);
    }
    return out;
  }

  async savePlayerTrendsAggregate(
    aggregate: PlayerTrendsAggregate,
  ): Promise<void> {
    this.entries.set(compositeKey(aggregate.year, aggregate.teamCode), aggregate);
  }
}
