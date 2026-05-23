/**
 * Team ranking calculations and caching.
 *
 * After spec 038 every fixture read is async (FixtureRepository). The four
 * `getFixturesByYear` call sites here now `await` the repository; the
 * per-team loop in `calculateSeasonRankings` reads the year's fixture set
 * once at the top and filters in-memory per team (research.md Risk 1).
 */

import type { Fixture } from '../models/fixture.js';
import type {
  SeasonThresholds,
  StrengthCategory,
  TeamRoundRanking,
  TeamSeasonRanking,
} from '../models/types.js';
import { getFixturesByYear, setRankingsCacheClearFn } from './store.js';
import { logger } from '../utils/logger.js';

const seasonRankingsCache = new Map<number, Map<string, TeamSeasonRanking>>();
const roundRankingsCache = new Map<string, Map<string, TeamRoundRanking>>();
const seasonThresholdsCache = new Map<number, SeasonThresholds>();

function getCategoryFromPercentile(percentile: number): StrengthCategory {
  if (percentile <= 0.33) return 'hard';
  if (percentile <= 0.67) return 'medium';
  return 'easy';
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

export async function calculateSeasonThresholds(year: number): Promise<SeasonThresholds> {
  return computeSeasonThresholds(year, await getFixturesByYear(year));
}

function computeSeasonThresholds(year: number, allFixtures: Fixture[]): SeasonThresholds {
  const cached = seasonThresholdsCache.get(year);
  if (cached) return cached;

  const ratings = allFixtures
    .filter(f => !f.isBye)
    .map(f => f.strengthRating)
    .sort((a, b) => a - b);

  if (ratings.length < 4) {
    const result: SeasonThresholds = {
      p33: ratings.length > 0 ? quantile(ratings, 0.33) : 0,
      p67: ratings.length > 0 ? quantile(ratings, 0.67) : 0,
      lowerFence: ratings.length > 0 ? ratings[0] : 0,
      upperFence: ratings.length > 0 ? ratings[ratings.length - 1] : 0,
    };
    seasonThresholdsCache.set(year, result);
    return result;
  }

  const q1 = quantile(ratings, 0.25);
  const q3 = quantile(ratings, 0.75);
  const iqr = q3 - q1;
  const lowerFence = q1 - 1.5 * iqr;
  const upperFence = q3 + 1.5 * iqr;

  const nonOutliers = ratings.filter(r => r >= lowerFence && r <= upperFence);

  const p33 = nonOutliers.length > 0 ? quantile(nonOutliers, 0.33) : quantile(ratings, 0.33);
  const p67 = nonOutliers.length > 0 ? quantile(nonOutliers, 0.67) : quantile(ratings, 0.67);

  const result: SeasonThresholds = { p33, p67, lowerFence, upperFence };
  seasonThresholdsCache.set(year, result);

  logger.info('Calculated season thresholds', {
    year,
    totalRatings: ratings.length,
    nonOutliers: nonOutliers.length,
    p33,
    p67,
    lowerFence,
    upperFence,
  });

  return result;
}

export function getCategoryFromThresholds(
  rating: number,
  thresholds: SeasonThresholds,
): StrengthCategory {
  if (rating < thresholds.lowerFence) return 'hard';
  if (rating > thresholds.upperFence) return 'easy';
  if (rating <= thresholds.p33) return 'hard';
  if (rating <= thresholds.p67) return 'medium';
  return 'easy';
}

async function calculateRoundRankings(
  year: number,
  round: number,
): Promise<Map<string, TeamRoundRanking>> {
  const cached = roundRankingsCache.get(`${year}-${round}`);
  if (cached) return cached;
  return computeRoundRankings(year, round, await getFixturesByYear(year));
}

function computeRoundRankings(
  year: number,
  round: number,
  allFixtures: Fixture[],
): Map<string, TeamRoundRanking> {
  const cacheKey = `${year}-${round}`;
  const cached = roundRankingsCache.get(cacheKey);
  if (cached) return cached;

  const seasonThresholds = computeSeasonThresholds(year, allFixtures);

  const allSeasonRatings = allFixtures
    .filter(f => !f.isBye)
    .map(f => f.strengthRating)
    .sort((a, b) => a - b);

  const rankings = new Map<string, TeamRoundRanking>();
  const allRoundFixtures = allFixtures.filter(f => f.round === round);
  for (const fixture of allRoundFixtures) {
    const percentile = fixture.isBye
      ? 0
      : calculatePercentile(fixture.strengthRating, allSeasonRatings);
    const category = fixture.isBye
      ? ('hard' as StrengthCategory)
      : getCategoryFromThresholds(fixture.strengthRating, seasonThresholds);

    rankings.set(fixture.teamCode, {
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

  roundRankingsCache.set(cacheKey, rankings);
  logger.debug('Calculated round rankings', { year, round, teamCount: rankings.size });
  return rankings;
}

async function calculateSeasonRankings(year: number): Promise<Map<string, TeamSeasonRanking>> {
  const cached = seasonRankingsCache.get(year);
  if (cached) return cached;

  const allFixtures = await getFixturesByYear(year);
  if (allFixtures.length === 0) return new Map();

  const teamStats = new Map<string, { total: number; matches: number; byes: number }>();
  for (const fixture of allFixtures) {
    const stats = teamStats.get(fixture.teamCode) || { total: 0, matches: 0, byes: 0 };
    if (fixture.isBye) {
      stats.byes++;
    } else {
      stats.total += fixture.strengthRating;
      stats.matches++;
    }
    teamStats.set(fixture.teamCode, stats);
  }

  const teamAverages: Array<{ teamCode: string; average: number; stats: { total: number; matches: number; byes: number } }> = [];
  for (const [teamCode, stats] of teamStats) {
    const average = stats.matches > 0 ? stats.total / stats.matches : 0;
    teamAverages.push({ teamCode, average, stats });
  }

  const sortedAverages = teamAverages.map(t => t.average).sort((a, b) => a - b);

  // Per-round rankings are computed lazily but share the same `allFixtures`
  // snapshot via cache. The per-team loop below derives each team's fixtures
  // by in-memory filter instead of a second repository call (Risk 1).
  const rankings = new Map<string, TeamSeasonRanking>();

  for (const { teamCode, average, stats } of teamAverages) {
    const percentile = calculatePercentile(average, sortedAverages);

    const teamFixtures = allFixtures.filter(f => f.teamCode === teamCode);
    const rounds: TeamRoundRanking[] = [];
    for (const fixture of teamFixtures) {
      const roundRankings = computeRoundRankings(year, fixture.round, allFixtures);
      const roundRanking = roundRankings.get(teamCode);
      if (roundRanking) rounds.push(roundRanking);
    }
    rounds.sort((a, b) => a.round - b.round);

    rankings.set(teamCode, {
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

  seasonRankingsCache.set(year, rankings);
  logger.info('Calculated season rankings', { year, teamCount: rankings.size });
  return rankings;
}

export async function getTeamRoundRanking(
  year: number,
  teamCode: string,
  round: number,
): Promise<TeamRoundRanking | null> {
  const roundRankings = await calculateRoundRankings(year, round);
  return roundRankings.get(teamCode.toUpperCase()) || null;
}

export async function getTeamSeasonRanking(
  year: number,
  teamCode: string,
): Promise<TeamSeasonRanking | null> {
  const seasonRankings = await calculateSeasonRankings(year);
  return seasonRankings.get(teamCode.toUpperCase()) || null;
}

export async function getAllTeamSeasonRankings(
  year: number,
): Promise<Array<{ teamCode: string; ranking: TeamSeasonRanking; rank: number }>> {
  const seasonRankings = await calculateSeasonRankings(year);
  return Array.from(seasonRankings.values())
    .sort((a, b) => b.averageStrength - a.averageStrength)
    .map((ranking, index) => ({
      teamCode: ranking.teamCode,
      ranking,
      rank: index + 1,
    }));
}

export function clearRankingsCache(year?: number): void {
  if (year !== undefined) {
    seasonThresholdsCache.delete(year);
    seasonRankingsCache.delete(year);
    for (const key of roundRankingsCache.keys()) {
      if (key.startsWith(`${year}-`)) {
        roundRankingsCache.delete(key);
      }
    }
    logger.debug('Cleared rankings cache for year', { year });
  } else {
    seasonThresholdsCache.clear();
    seasonRankingsCache.clear();
    roundRankingsCache.clear();
    logger.debug('Cleared all rankings caches');
  }
}

// Receiver registration kept for backward compatibility — the receiver is
// a no-op after spec 038 (writes no longer flow through database/store.ts).
setRankingsCacheClearFn(clearRankingsCache);
