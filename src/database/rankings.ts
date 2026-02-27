/**
 * Team ranking calculations and caching
 */

import type { Fixture } from '../models/fixture.js';
import type {
  StrengthCategory,
  TeamRoundRanking,
  TeamSeasonRanking,
} from '../models/types.js';
import { getFixturesByYear, getFixturesByYearTeam, setRankingsCacheClearFn } from './store.js';
import { logger } from '../utils/logger.js';

/** Cache for season rankings */
const seasonRankingsCache = new Map<number, Map<string, TeamSeasonRanking>>();

/** Cache for round rankings (key: year-round) */
const roundRankingsCache = new Map<string, Map<string, TeamRoundRanking>>();

/**
 * Get strength category from percentile
 * 0-0.33 = hard (bottom third), 0.33-0.67 = medium, 0.67-1 = easy (top third)
 */
function getCategoryFromPercentile(percentile: number): StrengthCategory {
  if (percentile <= 0.33) return 'hard';
  if (percentile <= 0.67) return 'medium';
  return 'easy';
}

/**
 * Calculate percentile rank for a value in a sorted array (ascending)
 * Returns 0 for lowest value, 1 for highest
 */
function calculatePercentile(value: number, sortedValues: number[]): number {
  if (sortedValues.length === 0) return 0.5;
  if (sortedValues.length === 1) return 0.5;

  // Count values less than or equal to this value
  let countBelow = 0;
  for (const v of sortedValues) {
    if (v < value) countBelow++;
  }

  return countBelow / (sortedValues.length - 1);
}

/**
 * Calculate and cache round rankings for a specific year and round
 */
function calculateRoundRankings(year: number, round: number): Map<string, TeamRoundRanking> {
  const cacheKey = `${year}-${round}`;

  // Check cache first
  const cached = roundRankingsCache.get(cacheKey);
  if (cached) return cached;

  const allFixtures = getFixturesByYear(year);
  const roundFixtures = allFixtures.filter(f => f.round === round && !f.isBye);

  // Get all strength ratings for this round (excluding byes)
  const ratings = roundFixtures.map(f => f.strengthRating).sort((a, b) => a - b);

  const rankings = new Map<string, TeamRoundRanking>();

  // Process all fixtures for this round (including byes)
  const allRoundFixtures = allFixtures.filter(f => f.round === round);
  for (const fixture of allRoundFixtures) {
    const percentile = fixture.isBye
      ? 0 // Byes are treated as hard (0 percentile)
      : calculatePercentile(fixture.strengthRating, ratings);

    rankings.set(fixture.teamCode, {
      teamCode: fixture.teamCode,
      year,
      round,
      strengthRating: fixture.strengthRating,
      percentile,
      category: getCategoryFromPercentile(percentile),
      opponentCode: fixture.opponentCode,
      isHome: fixture.isHome,
      isBye: fixture.isBye,
    });
  }

  // Cache the results
  roundRankingsCache.set(cacheKey, rankings);
  logger.debug('Calculated round rankings', { year, round, teamCount: rankings.size });

  return rankings;
}

/**
 * Calculate and cache season rankings for all teams in a year
 */
function calculateSeasonRankings(year: number): Map<string, TeamSeasonRanking> {
  // Check cache first
  const cached = seasonRankingsCache.get(year);
  if (cached) return cached;

  const allFixtures = getFixturesByYear(year);
  if (allFixtures.length === 0) {
    return new Map();
  }

  // Group fixtures by team and calculate totals
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

  // Calculate averages and sort for percentile calculation
  const teamAverages: Array<{ teamCode: string; average: number; stats: { total: number; matches: number; byes: number } }> = [];
  for (const [teamCode, stats] of teamStats) {
    const average = stats.matches > 0 ? stats.total / stats.matches : 0;
    teamAverages.push({ teamCode, average, stats });
  }

  // Sort by average for percentile calculation (ascending - lower = harder)
  const sortedAverages = teamAverages.map(t => t.average).sort((a, b) => a - b);

  // Build season rankings
  const rankings = new Map<string, TeamSeasonRanking>();

  for (const { teamCode, average, stats } of teamAverages) {
    const percentile = calculatePercentile(average, sortedAverages);

    // Get round-by-round rankings
    const teamFixtures = getFixturesByYearTeam(year, teamCode);
    const rounds: TeamRoundRanking[] = [];

    for (const fixture of teamFixtures) {
      const roundRankings = calculateRoundRankings(year, fixture.round);
      const roundRanking = roundRankings.get(teamCode);
      if (roundRanking) {
        rounds.push(roundRanking);
      }
    }

    // Sort rounds by round number
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

  // Cache the results
  seasonRankingsCache.set(year, rankings);
  logger.info('Calculated season rankings', { year, teamCount: rankings.size });

  return rankings;
}

/**
 * Get team ranking for a specific round
 */
export function getTeamRoundRanking(
  year: number,
  teamCode: string,
  round: number
): TeamRoundRanking | null {
  const roundRankings = calculateRoundRankings(year, round);
  return roundRankings.get(teamCode.toUpperCase()) || null;
}

/**
 * Get team season ranking
 */
export function getTeamSeasonRanking(
  year: number,
  teamCode: string
): TeamSeasonRanking | null {
  const seasonRankings = calculateSeasonRankings(year);
  return seasonRankings.get(teamCode.toUpperCase()) || null;
}

/**
 * Get all teams' season rankings for a year, sorted by rank
 */
export function getAllTeamSeasonRankings(
  year: number
): Array<{ teamCode: string; ranking: TeamSeasonRanking; rank: number }> {
  const seasonRankings = calculateSeasonRankings(year);

  // Convert to array and sort by average strength (descending - easiest first)
  const ranked = Array.from(seasonRankings.values())
    .sort((a, b) => b.averageStrength - a.averageStrength)
    .map((ranking, index) => ({
      teamCode: ranking.teamCode,
      ranking,
      rank: index + 1,
    }));

  return ranked;
}

/**
 * Clear rankings cache for a year (call when fixtures are updated)
 */
export function clearRankingsCache(year?: number): void {
  if (year !== undefined) {
    seasonRankingsCache.delete(year);
    // Clear all round caches for this year
    for (const key of roundRankingsCache.keys()) {
      if (key.startsWith(`${year}-`)) {
        roundRankingsCache.delete(key);
      }
    }
    logger.debug('Cleared rankings cache for year', { year });
  } else {
    seasonRankingsCache.clear();
    roundRankingsCache.clear();
    logger.debug('Cleared all rankings caches');
  }
}

// Register the clear function with the store module
setRankingsCacheClearFn(clearRankingsCache);
