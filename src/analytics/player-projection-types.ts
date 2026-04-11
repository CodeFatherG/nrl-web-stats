/**
 * TypeScript interfaces for the two-component Supercoach player projection model (Floor + Spike).
 * Feature: 025-supercoach-player-projections
 */

import type { CategoryBreakdown } from '../domain/supercoach-score.js';

// ── Floor Model ──────────────────────────────────────────────────────────────

export interface FloorProfile {
  mean: number;         // Average floor points per game
  std: number | null;   // Sample std dev (null when games < 2)
  cv: number | null;    // Coefficient of variation = std/mean (null when std is null)
  perMinute: number;    // Floor points per minute (mean / avgMinutes)
  avgMinutes: number;   // Average minutes per game
  gameCount: number;    // Number of eligible completed games
  gameFloors: number[]; // Per-game floor scores (used as input to spike computation)
}

// ── Spike Distribution ───────────────────────────────────────────────────────

export type SpikeBand = 'negative' | 'nil' | 'low' | 'moderate' | 'high' | 'boom';

export interface SpikeBandEntry {
  count: number;
  frequency: number; // count / total, rounded to 4 decimal places
}

export type SpikeDistribution = Record<SpikeBand, SpikeBandEntry>;

// ── Spike Model ──────────────────────────────────────────────────────────────

export interface SpikeProfile {
  mean: number;
  std: number | null;  // null when games < 2
  cv: number;          // Infinity when mean <= 0; note: Infinity not serialisable as JSON
  perMinute: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  distribution: SpikeDistribution;
  gameCount: number;
  gameSpikes: number[]; // Per-game spike scores
}

// ── Per-game breakdown ────────────────────────────────────────────────────────

/** One eligible game's contribution to the projection model */
export interface GameProjectionEntry {
  round: number;
  totalScore: number;
  floorScore: number;
  spikeScore: number;
  minutesPlayed: number;
}

// ── Combined Player Profile (API response shape) ─────────────────────────────

export interface PlayerProjectionProfile {
  // Identity
  playerId: string;
  playerName: string;
  teamCode: string;
  position: string;

  // Minutes
  avgMinutes: number;

  // Floor Component
  floorMean: number;
  floorStd: number | null;
  floorCv: number | null;
  floorPerMinute: number;

  // Spike Component
  spikeMean: number;
  spikeStd: number | null;
  spikeCv: number;     // Infinity when spikeMean <= 0; serialised as null in JSON responses
  spikePerMinute: number;
  spikeP25: number;
  spikeP50: number;
  spikeP75: number;
  spikeP90: number;
  spikeDistribution: SpikeDistribution;

  // Combined Projections
  projectedTotal: number;   // floorMean + spikeMean
  projectedFloor: number;   // floorMean + spikeP25 (conservative)
  projectedCeiling: number; // floorMean + spikeP90 (boom week)

  // Sample Metadata
  gamesPlayed: number;
  lowSampleWarning: boolean; // true when gamesPlayed < MIN_SAMPLE_SIZE (6)
  noUsableData: boolean;     // true when no eligible completed games exist

  // Per-game breakdown (ordered by round ascending)
  games: GameProjectionEntry[];
}

// ── Ranking Types ─────────────────────────────────────────────────────────────

export type RankingMode = 'composite' | 'captaincy' | 'selection' | 'trade';

export interface RankedPlayer {
  rank: number;
  compositeScore: number | null; // null when floorCv is null (< 2 eligible games)
  profile: PlayerProjectionProfile;
}

export interface TeamProjectionRankings {
  teamCode: string;
  year: number;
  mode: RankingMode;
  rankedPlayers: RankedPlayer[];
  excludedCount: number; // Players with noUsableData or null compositeScore
}

// ── Joining Input ─────────────────────────────────────────────────────────────

/** One eligible completed game — built by the use case by joining SC data + performance data */
export interface EligibleGame {
  round: number;
  totalScore: number;
  categories: CategoryBreakdown; // from PlayerMatchSupercoach
  minutesPlayed: number;         // from MatchPerformance; defaults to 80 when missing
}

// ── Player Metadata ───────────────────────────────────────────────────────────

/** Identity fields passed into buildPlayerProfile() */
export interface PlayerMeta {
  playerId: string;
  playerName: string;
  teamCode: string;
  position: string;
}

// ── Composite Weights ─────────────────────────────────────────────────────────

export interface CompositeWeights {
  floor: number;         // weight for floorMean
  spike: number;         // weight for spikeMean
  consistency: number;   // weight for (1 - floorCv)
  reliableSpike: number; // weight for spikeP25
}
