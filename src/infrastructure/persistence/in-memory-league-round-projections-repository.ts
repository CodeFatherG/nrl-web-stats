/**
 * InMemoryLeagueRoundProjectionsRepository — process-local fallback adapter.
 * Used when no KV binding is configured (local dev, unit tests).
 */

import type {
  LeagueRoundProjectionsArtifact,
  LeagueRoundProjectionsRepository,
} from '../../domain/repositories/league-round-projections-repository.js';

function compositeKey(year: number, round: number): string {
  return `${year}:${round}`;
}

export class InMemoryLeagueRoundProjectionsRepository
  implements LeagueRoundProjectionsRepository {
  private readonly entries = new Map<string, LeagueRoundProjectionsArtifact>();

  async findByYearAndRound(
    year: number,
    round: number,
  ): Promise<LeagueRoundProjectionsArtifact | null> {
    return this.entries.get(compositeKey(year, round)) ?? null;
  }

  async listCoveredRounds(year: number): Promise<Map<number, number>> {
    const out = new Map<number, number>();
    for (const artifact of this.entries.values()) {
      if (artifact.year === year) out.set(artifact.round, artifact.asOfRound);
    }
    return out;
  }

  async save(artifact: LeagueRoundProjectionsArtifact): Promise<void> {
    this.entries.set(compositeKey(artifact.year, artifact.round), artifact);
  }
}
