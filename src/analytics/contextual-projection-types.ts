/**
 * TypeScript types for the contextual player projection model.
 * Features: 028-player-context-analytics-opponent, 029-venue-weather-analytics
 *
 * All types are computed in-memory — nothing is persisted to D1.
 */

import type { WeatherCategory } from '../config/weather-normalisation.js';

// ── Base projection values ────────────────────────────────────────────────────

/** Projection triple extracted from the floor/spike model */
export interface ProjectionValues {
  readonly total: number;    // floorMean + spikeMean
  readonly floor: number;    // floorMean + spikeP25 (conservative)
  readonly ceiling: number;  // floorMean + spikeP90 (boom week)
}

// ── Context multiplier ────────────────────────────────────────────────────────

/**
 * Single context dimension contribution.
 * multiplier is post-confidence blending: lerp(1.0, rawMultiplier, confidence).
 */
export interface ContextualMultiplier {
  readonly multiplier: number;   // Effective value after blending — 1.0 = neutral
  readonly confidence: number;   // [0, 1] — 0 = no data (multiplier = 1.0), 1 = full signal
  readonly sampleN: number;      // Games used to compute the raw multiplier
}

// ── Venue adjustment ──────────────────────────────────────────────────────────

/**
 * Venue-specific context breakdown.
 * multiplier is applied to adjustedProjection.
 */
export interface VenueAdjustment extends ContextualMultiplier {
  /** Canonical stadium ID used for the lookup, e.g. 'suncorp'. */
  readonly stadiumId: string;
}

// ── Weather adjustment ────────────────────────────────────────────────────────

/**
 * Weather-specific context breakdown.
 * Returned for informational purposes only — NOT applied to adjustedProjection
 * (no forecast data source is available for upcoming games).
 */
export interface WeatherAdjustment extends ContextualMultiplier {
  /** Canonical weather category used for the lookup. */
  readonly category: WeatherCategory;
}

// ── Opponent adjustment ───────────────────────────────────────────────────────

/**
 * Opponent-specific context breakdown.
 * Extends ContextualMultiplier with the two diagnostic sub-model values.
 */
export interface OpponentAdjustment extends ContextualMultiplier {
  /** Raw positional defensive factor (pre-blending). teamMean / leagueMean for this position. */
  readonly defenseFactor: number;
  /** Confidence for the defensive profile component (0–1), based on opponent game count. */
  readonly defenseConfidence: number;
  /** Raw head-to-head RPI (pre-blending). Player mean vs opponent / player overall mean. */
  readonly h2hRpi: number;
  /** Confidence for the h2h component (0–1), based on h2h game count. */
  readonly h2hConfidence: number;
}

// ── Defensive profile ─────────────────────────────────────────────────────────

/** One cell in the team defensive profile matrix */
export interface PositionDefenseEntry {
  readonly teamCode: string;
  readonly position: string;
  readonly meanPointsConceded: number; // Mean SC points conceded to this position per game
  readonly defenseFactor: number;      // meanPointsConceded / leagueMean[position]
  readonly gamesCount: number;
}

/**
 * Aggregated defensive profile for all teams × positions.
 * Computed once per (year, latestCompleteRound) and cached.
 * Map key: "${teamCode}:${position}"
 */
export interface OpponentDefensiveProfile {
  readonly year: number;
  readonly latestCompleteRound: number;
  readonly profiles: Map<string, PositionDefenseEntry>;
}

// ── Result payload ────────────────────────────────────────────────────────────

/**
 * Complete API response for a single player in a given context.
 * Each adjustments entry is optional — only present when the corresponding
 * query param was supplied. Weather is informational only (not applied to adjustedProjection).
 * adjustedProjection = base × opponent?.multiplier × venue?.multiplier
 */
export interface ContextualProjectionResult {
  readonly playerId: string;
  readonly playerName: string;
  readonly teamCode: string;
  readonly position: string;
  readonly year: number;
  readonly baseProjection: ProjectionValues;
  readonly adjustedProjection: ProjectionValues;
  readonly adjustments: {
    readonly opponent?: OpponentAdjustment;
    readonly venue?: VenueAdjustment;
    readonly weather?: WeatherAdjustment;
  };
}

// ── Profile result (all multipliers in one shot) ──────────────────────────────

/**
 * Full context profile for a player — multipliers across every opponent, venue,
 * and weather category. Weather multipliers are informational only (not applied
 * to any projection). Keyed by team code / canonical venue ID / weather category.
 */
export interface ContextualProfileResult {
  readonly playerId: string;
  readonly playerName: string;
  readonly teamCode: string;
  readonly position: string;
  readonly year: number;
  readonly baseProjection: ProjectionValues;
  readonly opponents: Record<string, OpponentAdjustment>;
  readonly venues: Record<string, VenueAdjustment>;
  readonly weather: Record<string, WeatherAdjustment>;
}

// ── Internal enriched game type ───────────────────────────────────────────────

/**
 * Enriched eligible game for contextual model computation.
 * Carries opponent, venue, weather, and season context.
 * Used internally by the use case and service — not exposed in API responses.
 */
export interface ContextualEligibleGame {
  readonly playerId: string;          // Required for defensive profile aggregation
  readonly round: number;
  readonly totalScore: number;
  readonly opponent: string;          // Opposing team code (team that conceded these points)
  readonly season: number;            // Season year (for multi-season recency weighting)
  readonly weight: number;            // Recency weight [1, 2] — higher for more recent seasons
  readonly stadium: string | null;    // Raw nrl.com string — resolved via VENUE_NORMALISATION
  readonly weather: string | null;    // Raw nrl.com string — resolved via WEATHER_NORMALISATION
}
