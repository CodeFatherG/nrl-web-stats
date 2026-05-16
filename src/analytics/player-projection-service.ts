/**
 * Pure analytics functions for the two-component Supercoach player projection model.
 * Feature: 025-supercoach-player-projections
 *
 * All functions are pure (no I/O, no side effects). Input joining is done in the use case layer.
 */

import type {
  CategoryBreakdown,
} from '../domain/supercoach-score.js';
import type {
  CompositeWeights,
  EligibleGame,
  FloorProfile,
  GameProjectionEntry,
  PlayerMeta,
  PlayerProjectionProfile,
  SpikeBand,
  SpikeDistribution,
  SpikeProfile,
} from './player-projection-types.js';

// ── Constants ─────────────────────────────────────────────────────────────────

/** Stats classified as floor (high-frequency, volume-driven) */
export const FLOOR_STAT_NAMES = new Set([
  'tacklesMade',
  'missedTackles',
  'runsOver8m',
  'runsUnder8m',
  'penalties',
  'errors',
]);

/** Spike distribution band boundaries — half-open [min, max) except boom which is open-ended */
export const SPIKE_BANDS: Array<{ name: SpikeBand; min: number; max: number }> = [
  { name: 'negative', min: -Infinity, max: 0 },
  { name: 'nil',      min: 0,         max: 6 },
  { name: 'low',      min: 6,         max: 16 },
  { name: 'moderate', min: 16,        max: 31 },
  { name: 'high',     min: 31,        max: 51 },
  { name: 'boom',     min: 51,        max: Infinity },
];

/** Default composite ranking weights */
export const DEFAULT_COMPOSITE_WEIGHTS: CompositeWeights = {
  floor: 1.0,
  spike: 0.8,
  consistency: 10.0,
  reliableSpike: 0.5,
};

/** Minimum eligible games for a reliable projection (below this → lowSampleWarning) */
export const MIN_SAMPLE_SIZE = 6;

/**
 * Exponential decay factor applied to game weights (index 0 = oldest).
 * weight[i] = RECENCY_DECAY_FACTOR ^ (n-1-i), so the most recent game always
 * has weight 1.0. At 0.85 a game 6 rounds ago has ~38% the influence of last round.
 */
export const RECENCY_DECAY_FACTOR = 0.85;

// ── Math Helpers ──────────────────────────────────────────────────────────────

/**
 * Returns per-game weights for recency decay.
 * weights[0] is the oldest game, weights[n-1] = 1.0 is the most recent.
 */
export function exponentialWeights(n: number, decay: number = RECENCY_DECAY_FACTOR): number[] {
  if (n === 0) return [];
  return Array.from({ length: n }, (_, i) => Math.pow(decay, n - 1 - i));
}

/** Weighted mean. weights and values must be the same length. */
export function weightedMean(values: number[], weights: number[]): number {
  if (values.length === 0) return 0;
  const total = weights.reduce((s, w) => s + w, 0);
  if (total === 0) return 0;
  return values.reduce((s, v, i) => s + v * (weights[i] ?? 0), 0) / total;
}

/**
 * Linear-interpolation percentile matching numpy's default (linear) method.
 * arr must be non-empty. p is in [0, 100].
 */
export function percentile(arr: number[], p: number): number {
  const sorted = [...arr].sort((a, b) => a - b);
  const n = sorted.length;
  if (n === 1) return sorted[0]!;
  const i = (p / 100) * (n - 1);
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  if (lo === hi) return sorted[lo]!;
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (i - lo);
}

/**
 * Sample standard deviation (n-1 denominator).
 * Returns null when arr.length < 2.
 */
export function sampleStd(arr: number[]): number | null {
  if (arr.length < 2) return null;
  const mean = arr.reduce((s, v) => s + v, 0) / arr.length;
  const sumSq = arr.reduce((s, v) => s + (v - mean) ** 2, 0);
  return Math.sqrt(sumSq / (arr.length - 1));
}

// ── Floor Computation ─────────────────────────────────────────────────────────

/**
 * Extract the floor score from a single game's category breakdown.
 * Sums contribution values for all stats in FLOOR_STAT_NAMES across all categories.
 */
export function buildFloorScore(categories: CategoryBreakdown): number {
  let total = 0;
  for (const statList of Object.values(categories)) {
    for (const stat of statList) {
      if (FLOOR_STAT_NAMES.has(stat.statName)) {
        total += stat.contribution;
      }
    }
  }
  return total;
}

/**
 * Build the complete floor profile from a player's eligible games.
 * weights must be aligned with games (same length). Defaults to uniform weighting.
 * mean and avgMinutes are weighted; std and cv use raw values to characterise the full distribution.
 */
export function buildFloorProfile(games: EligibleGame[], weights?: number[]): FloorProfile {
  const gameFloors = games.map(g => buildFloorScore(g.categories));
  const gameMinutes = games.map(g => g.minutesPlayed);
  const w = weights ?? Array(gameFloors.length).fill(1);

  const mean = gameFloors.length > 0 ? weightedMean(gameFloors, w) : 0;
  const avgMinutes = gameMinutes.length > 0 ? weightedMean(gameMinutes, w) : 80;

  const std = sampleStd(gameFloors);
  const cv = std === null ? null : (mean <= 0 ? Infinity : std / mean);
  const perMinute = avgMinutes > 0 ? mean / avgMinutes : 0;

  return {
    mean,
    std,
    cv,
    perMinute,
    avgMinutes,
    gameCount: gameFloors.length,
    gameFloors,
  };
}

// ── Spike Computation ─────────────────────────────────────────────────────────

/**
 * Classify a spike score into its distribution band.
 */
export function classifySpikeBand(score: number): SpikeBand {
  for (const band of SPIKE_BANDS) {
    if (score >= band.min && score < band.max) {
      return band.name;
    }
  }
  // score === Infinity edge case — classify as boom
  return 'boom';
}

/**
 * Build an empirical histogram of spike scores across the defined bands.
 */
export function buildSpikeDistribution(gameSpikes: number[]): SpikeDistribution {
  const counts: Record<SpikeBand, number> = {
    negative: 0, nil: 0, low: 0, moderate: 0, high: 0, boom: 0,
  };
  for (const score of gameSpikes) {
    counts[classifySpikeBand(score)]++;
  }
  const total = gameSpikes.length;
  return {
    negative: { count: counts.negative, frequency: total > 0 ? Math.round(counts.negative / total * 10000) / 10000 : 0 },
    nil:      { count: counts.nil,      frequency: total > 0 ? Math.round(counts.nil      / total * 10000) / 10000 : 0 },
    low:      { count: counts.low,      frequency: total > 0 ? Math.round(counts.low      / total * 10000) / 10000 : 0 },
    moderate: { count: counts.moderate, frequency: total > 0 ? Math.round(counts.moderate / total * 10000) / 10000 : 0 },
    high:     { count: counts.high,     frequency: total > 0 ? Math.round(counts.high     / total * 10000) / 10000 : 0 },
    boom:     { count: counts.boom,     frequency: total > 0 ? Math.round(counts.boom     / total * 10000) / 10000 : 0 },
  };
}

/**
 * Build the complete spike profile from eligible games and their pre-computed floor scores.
 * floorScores must be aligned with games (same length, same order).
 * weights must be aligned with games. Defaults to uniform weighting.
 * mean and avgMinutes are weighted; std and percentiles use raw values to characterise the full distribution.
 */
export function buildSpikeProfile(games: EligibleGame[], floorScores: number[], weights?: number[]): SpikeProfile {
  const gameSpikes = games.map((g, i) => g.totalScore - (floorScores[i] ?? 0));
  const gameMinutes = games.map(g => g.minutesPlayed);
  const w = weights ?? Array(gameSpikes.length).fill(1);

  const mean = gameSpikes.length > 0 ? weightedMean(gameSpikes, w) : 0;
  const avgMinutes = gameMinutes.length > 0 ? weightedMean(gameMinutes, w) : 80;

  const std = sampleStd(gameSpikes);
  const cv = std === null ? Infinity : (mean <= 0 ? Infinity : std / mean);
  const perMinute = avgMinutes > 0 ? mean / avgMinutes : 0;

  const p25 = gameSpikes.length > 0 ? percentile(gameSpikes, 25) : 0;
  const p50 = gameSpikes.length > 0 ? percentile(gameSpikes, 50) : 0;
  const p75 = gameSpikes.length > 0 ? percentile(gameSpikes, 75) : 0;
  const p90 = gameSpikes.length > 0 ? percentile(gameSpikes, 90) : 0;

  return {
    mean,
    std,
    cv,
    perMinute,
    p25,
    p50,
    p75,
    p90,
    distribution: buildSpikeDistribution(gameSpikes),
    gameCount: gameSpikes.length,
    gameSpikes,
  };
}

// ── Player Profile Orchestration ──────────────────────────────────────────────

/**
 * Build a complete two-component projection profile for a player.
 * games must be pre-filtered to eligible (isComplete=true) rounds only.
 * decayFactor controls recency weighting; pass 1.0 to reproduce uniform (unweighted) behaviour.
 */
export function buildPlayerProfile(
  meta: PlayerMeta,
  games: EligibleGame[],
  decayFactor: number = RECENCY_DECAY_FACTOR,
): PlayerProjectionProfile {
  const noUsableData = games.length === 0;
  const lowSampleWarning = games.length < MIN_SAMPLE_SIZE;

  const weights = exponentialWeights(games.length, decayFactor);
  const floor = buildFloorProfile(games, weights);
  const spike = buildSpikeProfile(games, floor.gameFloors, weights);

  return {
    playerId: meta.playerId,
    playerName: meta.playerName,
    teamCode: meta.teamCode,
    position: meta.position,

    avgMinutes: floor.avgMinutes,

    floorMean: floor.mean,
    floorStd: floor.std,
    floorCv: floor.cv,
    floorPerMinute: floor.perMinute,

    spikeMean: spike.mean,
    spikeStd: spike.std,
    spikeCv: spike.cv,
    spikePerMinute: spike.perMinute,
    spikeP25: spike.p25,
    spikeP50: spike.p50,
    spikeP75: spike.p75,
    spikeP90: spike.p90,
    spikeDistribution: spike.distribution,

    projectedTotal: floor.mean + spike.mean,
    projectedFloor: floor.mean + spike.p25,
    projectedCeiling: floor.mean + spike.p90,

    gamesPlayed: games.length,
    lowSampleWarning,
    noUsableData,

    games: games.map((g, i): GameProjectionEntry => ({
      round: g.round,
      totalScore: g.totalScore,
      floorScore: floor.gameFloors[i] ?? 0,
      spikeScore: spike.gameSpikes[i] ?? 0,
      minutesPlayed: g.minutesPlayed,
    })),
  };
}

// ── Composite Ranking Score ───────────────────────────────────────────────────

/**
 * Compute the composite ranking score.
 * Returns null when floorCv is null (< 2 eligible games) — such players are excluded from rankings.
 */
export function compositeScore(
  profile: PlayerProjectionProfile,
  weights: CompositeWeights = DEFAULT_COMPOSITE_WEIGHTS,
): number | null {
  if (profile.floorCv === null) return null;
  return (
    weights.floor * profile.floorMean +
    weights.spike * profile.spikeMean +
    weights.consistency * (1 - profile.floorCv) +
    weights.reliableSpike * profile.spikeP25
  );
}
