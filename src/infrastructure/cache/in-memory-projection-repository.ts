/**
 * InMemoryProjectionRepository — process-local implementation of the
 * ProjectionRepository port. Used by unit tests (FR-014) and as the
 * fallback when no `CACHE` KV binding is present (local dev).
 *
 * Feature: 034-precomputed-projections (T007).
 */

import type {
  PlayerProjectionAggregate,
  PrecomputeStatus,
  ProjectionRepository,
  TeamRankingsAggregate,
} from '../../domain/repositories/projection-repository.js';
import type { RankingMode } from '../../analytics/player-projection-types.js';

function playerKey(year: number, playerId: string): string {
  return `${year}:${playerId}`;
}

function teamRankingsKey(year: number, teamCode: string, mode: RankingMode): string {
  return `${year}:${teamCode}:${mode}`;
}

export class InMemoryProjectionRepository implements ProjectionRepository {
  private readonly playerAggregates = new Map<string, PlayerProjectionAggregate>();
  private readonly teamRankingsAggregates = new Map<string, TeamRankingsAggregate>();
  private readonly precomputeStatuses = new Map<number, PrecomputeStatus>();

  async findPlayerAggregate(
    year: number,
    playerId: string,
  ): Promise<PlayerProjectionAggregate | null> {
    return this.playerAggregates.get(playerKey(year, playerId)) ?? null;
  }

  async findTeamRankingsAggregate(
    year: number,
    teamCode: string,
    mode: RankingMode,
  ): Promise<TeamRankingsAggregate | null> {
    return this.teamRankingsAggregates.get(teamRankingsKey(year, teamCode, mode)) ?? null;
  }

  async findPrecomputeStatus(year: number): Promise<PrecomputeStatus | null> {
    return this.precomputeStatuses.get(year) ?? null;
  }

  async savePlayerAggregate(aggregate: PlayerProjectionAggregate): Promise<void> {
    this.playerAggregates.set(playerKey(aggregate.year, aggregate.playerId), aggregate);
  }

  async saveTeamRankingsAggregate(aggregate: TeamRankingsAggregate): Promise<void> {
    this.teamRankingsAggregates.set(
      teamRankingsKey(aggregate.year, aggregate.teamCode, aggregate.mode),
      aggregate,
    );
  }

  async savePrecomputeStatus(status: PrecomputeStatus): Promise<void> {
    this.precomputeStatuses.set(status.year, status);
  }

  // ── Test helpers (not part of the port) ─────────────────────────────────

  /** Clear all state. Useful between tests. */
  clear(): void {
    this.playerAggregates.clear();
    this.teamRankingsAggregates.clear();
    this.precomputeStatuses.clear();
  }

  /** Total number of stored artifacts. Useful for asserting write counts. */
  size(): number {
    return (
      this.playerAggregates.size +
      this.teamRankingsAggregates.size +
      this.precomputeStatuses.size
    );
  }
}
