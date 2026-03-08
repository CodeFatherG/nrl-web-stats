/**
 * Player Trend Service — detects trending player performance.
 * Algorithm per research.md R3.
 */

import type { Player, MatchPerformance } from '../domain/player.js';
import type { PlayerTrend, PlayerStatTrend, TrackedStatName, TrendDirection } from './types.js';

const TRACKED_STATS: TrackedStatName[] = ['tries', 'tackles', 'runMetres', 'fantasyPoints'];
const DEVIATION_THRESHOLD = 20;
const MINIMUM_ROUNDS_FOR_TREND = 3;

function getStatValue(perf: MatchPerformance, stat: TrackedStatName): number {
  return perf[stat];
}

function computeDirection(deviationPercent: number): TrendDirection {
  if (deviationPercent > DEVIATION_THRESHOLD) return 'up';
  if (deviationPercent < -DEVIATION_THRESHOLD) return 'down';
  return 'stable';
}

function computeStatTrend(
  performances: MatchPerformance[],
  stat: TrackedStatName,
  windowSize: number
): PlayerStatTrend | null {
  if (performances.length === 0) return null;

  const seasonTotal = performances.reduce((sum, p) => sum + getStatValue(p, stat), 0);
  const seasonAverage = seasonTotal / performances.length;

  const windowPerfs = performances.slice(-windowSize);
  const windowTotal = windowPerfs.reduce((sum, p) => sum + getStatValue(p, stat), 0);
  const windowAverage = windowTotal / windowPerfs.length;

  // Handle zero season average
  if (seasonAverage === 0) {
    if (windowAverage === 0) {
      return { statName: stat, seasonAverage: 0, windowAverage: 0, deviationPercent: 0, direction: 'stable' };
    }
    // Non-zero window with zero season — exclude from trend analysis
    return null;
  }

  const deviationPercent = ((windowAverage - seasonAverage) / seasonAverage) * 100;
  const direction = computeDirection(deviationPercent);

  return {
    statName: stat,
    seasonAverage: Math.round(seasonAverage * 100) / 100,
    windowAverage: Math.round(windowAverage * 100) / 100,
    deviationPercent: Math.round(deviationPercent * 10) / 10,
    direction,
  };
}

/**
 * Compute player trends for a team's roster in a season.
 */
export function computePlayerTrends(
  players: Player[],
  year: number,
  windowSize: number = 5
): PlayerTrend[] {
  return players.map(player => {
    // Filter performances to this season, sorted by round
    const performances = player.performances
      .filter(p => p.year === year && p.isComplete)
      .sort((a, b) => a.round - b.round);

    const roundsPlayed = performances.length;
    const sampleSizeWarning = roundsPlayed < 5;

    // Not enough data for any trend
    if (roundsPlayed < MINIMUM_ROUNDS_FOR_TREND) {
      return {
        playerId: player.id,
        playerName: player.name,
        roundsPlayed,
        isSignificant: false,
        sampleSizeWarning: true,
        stats: TRACKED_STATS.map(stat => ({
          statName: stat,
          seasonAverage: 0,
          windowAverage: 0,
          deviationPercent: 0,
          direction: 'stable' as TrendDirection,
        })),
      };
    }

    const stats: PlayerStatTrend[] = [];
    for (const stat of TRACKED_STATS) {
      const trend = computeStatTrend(performances, stat, windowSize);
      if (trend) stats.push(trend);
    }

    const isSignificant = stats.some(s => Math.abs(s.deviationPercent) > DEVIATION_THRESHOLD);

    return {
      playerId: player.id,
      playerName: player.name,
      roundsPlayed,
      isSignificant,
      sampleSizeWarning,
      stats,
    };
  });
}
