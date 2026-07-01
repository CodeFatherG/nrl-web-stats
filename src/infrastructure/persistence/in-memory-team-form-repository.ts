/**
 * InMemoryTeamFormRepository — process-local fallback for TeamFormRepository.
 *
 * Used when no CACHE binding is configured (local dev, unit tests). Contents
 * do not survive isolate recycling.
 *
 * Feature: 037-analytics-cache-replacement (T014).
 */

import type {
  TeamFormAggregate,
  TeamFormRepository,
} from '../../domain/repositories/team-form-repository.js';

function compositeKey(year: number, teamCode: string): string {
  return `${year}:${teamCode}`;
}

export class InMemoryTeamFormRepository implements TeamFormRepository {
  private readonly entries = new Map<string, TeamFormAggregate>();

  async findTeamFormAggregate(
    year: number,
    teamCode: string,
  ): Promise<TeamFormAggregate | null> {
    return this.entries.get(compositeKey(year, teamCode)) ?? null;
  }

  async listTeamFormAsOfRounds(year: number): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    for (const agg of this.entries.values()) {
      if (agg.year === year) out.set(agg.teamCode, agg.asOfRound);
    }
    return out;
  }

  async saveTeamFormAggregate(aggregate: TeamFormAggregate): Promise<void> {
    this.entries.set(compositeKey(aggregate.year, aggregate.teamCode), aggregate);
  }
}
