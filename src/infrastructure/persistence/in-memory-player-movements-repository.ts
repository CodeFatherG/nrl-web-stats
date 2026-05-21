/**
 * InMemoryPlayerMovementsRepository — process-local fallback adapter for the
 * PlayerMovementsRepository port.
 *
 * Used when no durable store binding is configured (local dev, unit tests).
 * Contents do not survive isolate recycling — FR-020 explicitly accepts this.
 *
 * Feature: 035-player-movements-artifact (T007).
 */

import type { PlayerMovementsResult } from '../../domain/player-movements.js';
import type {
  PlayerMovementsArtifact,
  PlayerMovementsRepository,
} from '../../domain/repositories/player-movements-repository.js';
import { projectToPublic } from './player-movements-envelope.js';

function compositeKey(year: number, round: number): string {
  return `${year}:${round}`;
}

export class InMemoryPlayerMovementsRepository
  implements PlayerMovementsRepository
{
  private readonly entries = new Map<string, PlayerMovementsArtifact>();

  async findByYearAndRound(
    year: number,
    round: number,
  ): Promise<PlayerMovementsResult | null> {
    const artifact = this.entries.get(compositeKey(year, round));
    return artifact ? projectToPublic(artifact) : null;
  }

  async findMostRecentRound(year: number): Promise<number | null> {
    let maxRound: number | null = null;
    for (const artifact of this.entries.values()) {
      if (artifact.year !== year) continue;
      if (maxRound === null || artifact.round > maxRound) {
        maxRound = artifact.round;
      }
    }
    return maxRound;
  }

  async listCoveredRounds(year: number): Promise<ReadonlySet<number>> {
    const rounds = new Set<number>();
    for (const artifact of this.entries.values()) {
      if (artifact.year === year) rounds.add(artifact.round);
    }
    return rounds;
  }

  async save(artifact: PlayerMovementsArtifact): Promise<void> {
    this.entries.set(compositeKey(artifact.year, artifact.round), artifact);
  }
}
