/**
 * TypeScript types for the contextual player projection model.
 * Feature: 028-player-context-analytics-opponent
 *
 * All types are computed in-memory — nothing is persisted to D1.
 * Shared with feature 029 which will add venue/weather dimensions.
 */

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
 * adjustments only contains keys for computed dimensions (venue/weather absent in feature 028).
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
    readonly opponent: OpponentAdjustment;
  };
}

// ── Internal enriched game type ───────────────────────────────────────────────

/**
 * Enriched eligible game for opponent model computation.
 * Carries opponent and season context without modifying the shared EligibleGame type.
 * Used internally by the use case and service — not exposed in API responses.
 */
export interface ContextualEligibleGame {
  readonly playerId: string;   // Required for defensive profile aggregation
  readonly round: number;
  readonly totalScore: number;
  readonly opponent: string;   // Opposing team code (team that conceded these points)
  readonly season: number;     // Season year (for multi-season recency weighting)
  readonly weight: number;     // Recency weight [1, 2] — higher for more recent seasons
}
