/**
 * ComputeTeamStrengthRankingsUseCase — batched precompute of the
 * team-strength-rankings artifact.
 *
 * Reads the year's fixtures once, derives thresholds, per-round rankings,
 * and the season rollup from the same in-memory snapshot, then persists
 * everything in a single `saveYear` call.
 *
 * Cold-start (no fixtures for the year) logs at warn and returns
 * successfully — the job is non-terminal so the next discovery tick
 * re-enqueues once the fixture artifact lands.
 */

import type { FixtureRepository } from '../../domain/repositories/fixture-repository.js';
import type {
  RankingsYearPayload,
  TeamStrengthRankingsRepository,
} from '../../domain/repositories/team-strength-rankings-repository.js';
import {
  getCategoryFromPercentile,
  getCategoryFromThresholds,
} from '../../domain/team-strength-rankings.js';
import type { Fixture } from '../../models/fixture.js';
import type {
  SeasonThresholds,
  StrengthCategory,
  TeamRoundRanking,
  TeamSeasonRanking,
} from '../../models/types.js';
import { logger } from '../../utils/logger.js';

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const pos = q * (sorted.length - 1);
  const lower = Math.floor(pos);
  const upper = Math.ceil(pos);
  const frac = pos - lower;
  if (lower === upper) return sorted[lower];
  return sorted[lower] * (1 - frac) + sorted[upper] * frac;
}

function calculatePercentile(value: number, sortedValues: number[]): number {
  if (sortedValues.length === 0) return 0.5;
  if (sortedValues.length === 1) return 0.5;
  let countBelow = 0;
  for (const v of sortedValues) {
    if (v < value) countBelow++;
  }
  return countBelow / (sortedValues.length - 1);
}

function computeSeasonThresholds(allFixtures: readonly Fixture[]): SeasonThresholds {
  const ratings = allFixtures
    .filter(f => !f.isBye)
    .map(f => f.strengthRating)
    .sort((a, b) => a - b);

  if (ratings.length < 4) {
    return {
      p33: ratings.length > 0 ? quantile(ratings, 0.33) : 0,
      p67: ratings.length > 0 ? quantile(ratings, 0.67) : 0,
      lowerFence: ratings.length > 0 ? ratings[0] : 0,
      upperFence: ratings.length > 0 ? ratings[ratings.length - 1] : 0,
    };
  }

  const q1 = quantile(ratings, 0.25);
  const q3 = quantile(ratings, 0.75);
  const iqr = q3 - q1;
  const lowerFence = q1 - 1.5 * iqr;
  const upperFence = q3 + 1.5 * iqr;

  const nonOutliers = ratings.filter(r => r >= lowerFence && r <= upperFence);
  const p33 = nonOutliers.length > 0 ? quantile(nonOutliers, 0.33) : quantile(ratings, 0.33);
  const p67 = nonOutliers.length > 0 ? quantile(nonOutliers, 0.67) : quantile(ratings, 0.67);

  return { p33, p67, lowerFence, upperFence };
}

function computeRoundRankings(
  year: number,
  round: number,
  allFixtures: readonly Fixture[],
  seasonRatingsSorted: number[],
  thresholds: SeasonThresholds,
): Map<string, TeamRoundRanking> {
  const out = new Map<string, TeamRoundRanking>();
  for (const fixture of allFixtures) {
    if (fixture.round !== round) continue;
    const percentile = fixture.isBye
      ? 0
      : calculatePercentile(fixture.strengthRating, seasonRatingsSorted);
    const category: StrengthCategory = fixture.isBye
      ? 'hard'
      : getCategoryFromThresholds(fixture.strengthRating, thresholds);
    out.set(fixture.teamCode, {
      teamCode: fixture.teamCode,
      year,
      round,
      strengthRating: fixture.strengthRating,
      percentile,
      category,
      opponentCode: fixture.opponentCode,
      isHome: fixture.isHome,
      isBye: fixture.isBye,
    });
  }
  return out;
}

function computeRankingsYearPayload(
  year: number,
  allFixtures: readonly Fixture[],
): RankingsYearPayload {
  const thresholds = computeSeasonThresholds(allFixtures);
  const seasonRatingsSorted = allFixtures
    .filter(f => !f.isBye)
    .map(f => f.strengthRating)
    .sort((a, b) => a - b);

  const allRounds = new Set<number>();
  for (const f of allFixtures) allRounds.add(f.round);

  const roundRankings = new Map<number, ReadonlyMap<string, TeamRoundRanking>>();
  for (const round of [...allRounds].sort((a, b) => a - b)) {
    roundRankings.set(
      round,
      computeRoundRankings(year, round, allFixtures, seasonRatingsSorted, thresholds),
    );
  }

  // Season rollup: per-team aggregates over the year's non-bye fixtures.
  const teamStats = new Map<string, { total: number; matches: number; byes: number }>();
  for (const fixture of allFixtures) {
    const stats = teamStats.get(fixture.teamCode) ?? { total: 0, matches: 0, byes: 0 };
    if (fixture.isBye) {
      stats.byes++;
    } else {
      stats.total += fixture.strengthRating;
      stats.matches++;
    }
    teamStats.set(fixture.teamCode, stats);
  }

  const teamAverages: Array<{
    teamCode: string;
    average: number;
    stats: { total: number; matches: number; byes: number };
  }> = [];
  for (const [teamCode, stats] of teamStats) {
    const average = stats.matches > 0 ? stats.total / stats.matches : 0;
    teamAverages.push({ teamCode, average, stats });
  }
  const sortedAverages = teamAverages.map(t => t.average).sort((a, b) => a - b);

  const season = new Map<string, TeamSeasonRanking>();
  for (const { teamCode, average, stats } of teamAverages) {
    const percentile = calculatePercentile(average, sortedAverages);
    const teamFixtures = allFixtures.filter(f => f.teamCode === teamCode);
    const rounds: TeamRoundRanking[] = [];
    for (const fixture of teamFixtures) {
      const roundMap = roundRankings.get(fixture.round);
      const roundRanking = roundMap?.get(teamCode);
      if (roundRanking) rounds.push(roundRanking);
    }
    rounds.sort((a, b) => a.round - b.round);

    season.set(teamCode, {
      teamCode,
      year,
      totalStrength: stats.total,
      averageStrength: Math.round(average),
      matchCount: stats.matches,
      byeCount: stats.byes,
      percentile,
      category: getCategoryFromPercentile(percentile),
      rounds,
    });
  }

  return { thresholds, season, roundRankings };
}

export interface ComputeTeamStrengthRankingsDeps {
  readonly fixtureRepository: FixtureRepository;
  readonly teamStrengthRankingsRepository: TeamStrengthRankingsRepository;
}

export class ComputeTeamStrengthRankingsUseCase {
  constructor(private readonly deps: ComputeTeamStrengthRankingsDeps) {}

  async execute(year: number, asOfRound: number): Promise<void> {
    const artifact = await this.deps.fixtureRepository.findByYear(year);
    if (!artifact || artifact.payload.length === 0) {
      logger.warn('team-strength-rankings.precompute.skipped: no fixtures for year', {
        year,
        asOfRound,
      });
      return;
    }
    const payload = computeRankingsYearPayload(year, artifact.payload);
    await this.deps.teamStrengthRankingsRepository.saveYear(year, asOfRound, payload);
    logger.info('team-strength-rankings.precompute.completed', {
      year,
      asOfRound,
      teamCount: payload.season.size,
      roundCount: payload.roundRankings.size,
    });
  }
}
