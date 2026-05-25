/**
 * InMemoryTeamStrengthRankingsRepository — process-local fallback for
 * `TeamStrengthRankingsRepository` (feature 039). Used when no CACHE binding
 * is configured. Contents do not survive isolate recycling.
 */

import type {
  RankingsYearPayload,
  TeamStrengthRankingsRepository,
} from '../../domain/repositories/team-strength-rankings-repository.js';
import type {
  SeasonThresholds,
  TeamRoundRanking,
  TeamSeasonRanking,
} from '../../models/types.js';

interface YearState {
  asOfRound: number;
  thresholds: SeasonThresholds;
  season: ReadonlyMap<string, TeamSeasonRanking>;
  /** round → (asOfRound, rankings). Each round carries its own watermark so
   *  partial-write scenarios in the contract suite can be modelled. */
  rounds: Map<number, { asOfRound: number; rankings: ReadonlyMap<string, TeamRoundRanking> }>;
}

export class InMemoryTeamStrengthRankingsRepository
  implements TeamStrengthRankingsRepository {
  private readonly years = new Map<number, YearState>();

  async findSeasonThresholds(year: number): Promise<SeasonThresholds | null> {
    return this.years.get(year)?.thresholds ?? null;
  }

  async findSeasonRankings(
    year: number,
  ): Promise<ReadonlyMap<string, TeamSeasonRanking> | null> {
    return this.years.get(year)?.season ?? null;
  }

  async findRoundRankings(
    year: number,
    round: number,
  ): Promise<ReadonlyMap<string, TeamRoundRanking> | null> {
    return this.years.get(year)?.rounds.get(round)?.rankings ?? null;
  }

  async listCoveredRoundRankings(year: number): Promise<Map<number, number>> {
    const state = this.years.get(year);
    if (!state) return new Map();
    const out = new Map<number, number>();
    for (const [round, entry] of state.rounds) {
      out.set(round, entry.asOfRound);
    }
    return out;
  }

  async listYearsWithThresholds(): Promise<Map<number, number>> {
    const out = new Map<number, number>();
    for (const [year, state] of this.years) {
      out.set(year, state.asOfRound);
    }
    return out;
  }

  async saveYear(
    year: number,
    asOfRound: number,
    payload: RankingsYearPayload,
  ): Promise<void> {
    const rounds = new Map<number, { asOfRound: number; rankings: ReadonlyMap<string, TeamRoundRanking> }>();
    for (const [round, rankings] of payload.roundRankings) {
      rounds.set(round, { asOfRound, rankings });
    }
    this.years.set(year, {
      asOfRound,
      thresholds: payload.thresholds,
      season: payload.season,
      rounds,
    });
  }
}
