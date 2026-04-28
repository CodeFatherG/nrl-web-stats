/**
 * Pure analytics functions for the contextual player projection model.
 * Features: 028-player-context-analytics-opponent, 029-venue-weather-analytics
 *
 * All functions are pure (no I/O, no side effects).
 * Input joining and caching are handled in the use case layer.
 */

import type {
  ContextualEligibleGame,
  ContextualMultiplier,
  OpponentAdjustment,
  OpponentDefensiveProfile,
  PositionDefenseEntry,
  ProjectionValues,
  VenueAdjustment,
  WeatherAdjustment,
} from './contextual-projection-types.js';
import { VENUE_NORMALISATION } from '../config/venue-normalisation.js';
import { WEATHER_NORMALISATION } from '../config/weather-normalisation.js';
import type { WeatherCategory } from '../config/weather-normalisation.js';

// ── Constants ─────────────────────────────────────────────────────────────────

/** Minimum games for full confidence (N = 3 → confidence = 1.0) */
export const MIN_SAMPLE_N = 3;

// ── Math helpers ──────────────────────────────────────────────────────────────

/** Linear interpolation: lerp(a, b, 0) = a, lerp(a, b, 1) = b */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Confidence coefficient: clamp(sampleN / minSampleN, 0, 1) */
export function clampedConfidence(sampleN: number, minSampleN: number = MIN_SAMPLE_N): number {
  return Math.min(1, Math.max(0, sampleN / minSampleN));
}

// ── Opponent defensive profile ────────────────────────────────────────────────

/**
 * Build the full opponent defensive profile for all teams from all player games.
 *
 * For each game, the scoring player's position is looked up in the positions map,
 * and their SC score is counted as a point conceded by game.opponent.
 * Teams with no data for a position get defenseFactor = 1.0 (neutral).
 *
 * League average per position is the mean of ALL game scores at that position,
 * not the mean of team means.
 */
export function buildOpponentDefenseProfile(
  allGames: ContextualEligibleGame[],
  positions: Map<string, string>,
  year: number,
  latestCompleteRound: number,
): OpponentDefensiveProfile {
  // Accumulate SC points conceded per (teamCode, position) pair
  const concededScores = new Map<string, number[]>();
  // Accumulate all SC scores per position for league average
  const leagueScores = new Map<string, number[]>();

  for (const game of allGames) {
    const position = positions.get(game.playerId);
    if (!position) continue;

    // League average accumulation
    const posScores = leagueScores.get(position) ?? [];
    posScores.push(game.totalScore);
    leagueScores.set(position, posScores);

    // Per-team conceded accumulation: game.opponent conceded these points
    const key = `${game.opponent}:${position}`;
    const teamScores = concededScores.get(key) ?? [];
    teamScores.push(game.totalScore);
    concededScores.set(key, teamScores);
  }

  // Compute league averages per position
  const leagueAvg = new Map<string, number>();
  for (const [position, scores] of leagueScores.entries()) {
    leagueAvg.set(position, scores.reduce((s, v) => s + v, 0) / scores.length);
  }

  // Build profile entries
  const profiles = new Map<string, PositionDefenseEntry>();
  for (const [key, scores] of concededScores.entries()) {
    const colonIdx = key.indexOf(':');
    const teamCode = key.slice(0, colonIdx);
    const position = key.slice(colonIdx + 1);
    const mean = scores.reduce((s, v) => s + v, 0) / scores.length;
    const avg = leagueAvg.get(position) ?? mean; // fallback: factor = 1.0
    profiles.set(key, {
      teamCode,
      position,
      meanPointsConceded: mean,
      defenseFactor: avg > 0 ? mean / avg : 1.0,
      gamesCount: scores.length,
    });
  }

  return { year, latestCompleteRound, profiles };
}

/**
 * Look up a team's defensive factor for a specific position.
 * Returns neutral values (factor 1.0, confidence 0) when no data exists.
 */
export function lookupDefenseFactor(
  profile: OpponentDefensiveProfile,
  opponentCode: string,
  position: string,
): { defenseFactor: number; defenseConfidence: number; gamesCount: number } {
  const entry = profile.profiles.get(`${opponentCode}:${position}`);
  if (!entry || entry.gamesCount === 0) {
    return { defenseFactor: 1.0, defenseConfidence: 0, gamesCount: 0 };
  }
  return {
    defenseFactor: entry.defenseFactor,
    defenseConfidence: clampedConfidence(entry.gamesCount),
    gamesCount: entry.gamesCount,
  };
}

// ── Head-to-head RPI ──────────────────────────────────────────────────────────

/**
 * Compute the player's head-to-head RPI against a specific opponent.
 *
 * rawRpi = mean(games vs opponent) / mean(all games)
 * Returns rawRpi = 1.0 and gameCount = 0 when no h2h history exists.
 * Games are weighted for recency (game.weight).
 */
export function computeH2hRpi(
  playerGames: ContextualEligibleGame[],
  opponentCode: string,
): { rawRpi: number; gameCount: number } {
  if (playerGames.length === 0) {
    return { rawRpi: 1.0, gameCount: 0 };
  }

  // Weighted overall mean
  let totalWeightedScore = 0;
  let totalWeight = 0;
  for (const g of playerGames) {
    totalWeightedScore += g.totalScore * g.weight;
    totalWeight += g.weight;
  }
  const overallMean = totalWeight > 0 ? totalWeightedScore / totalWeight : 0;

  if (overallMean === 0) {
    return { rawRpi: 1.0, gameCount: 0 };
  }

  // Weighted h2h mean
  const h2hGames = playerGames.filter(g => g.opponent === opponentCode);
  if (h2hGames.length === 0) {
    return { rawRpi: 1.0, gameCount: 0 };
  }

  let h2hWeightedScore = 0;
  let h2hWeight = 0;
  for (const g of h2hGames) {
    h2hWeightedScore += g.totalScore * g.weight;
    h2hWeight += g.weight;
  }
  const h2hMean = h2hWeight > 0 ? h2hWeightedScore / h2hWeight : overallMean;

  return {
    rawRpi: h2hMean / overallMean,
    gameCount: h2hGames.length,
  };
}

// ── Combined opponent multiplier ──────────────────────────────────────────────

/**
 * Compute the combined opponent adjustment for a player against a given opponent.
 *
 * Both sub-models are confidence-weighted independently before multiplication:
 *   effectiveH2h  = lerp(1.0, rawH2hRpi,     h2hConfidence)
 *   effectiveDef  = lerp(1.0, defenseFactor,  defenseConfidence)
 *   multiplier    = effectiveH2h × effectiveDef
 */
export function computeOpponentMultiplier(
  defenseProfile: OpponentDefensiveProfile,
  playerPosition: string,
  opponentCode: string,
  playerGames: ContextualEligibleGame[],
): OpponentAdjustment {
  const { rawRpi, gameCount } = computeH2hRpi(playerGames, opponentCode);
  const h2hConfidence = clampedConfidence(gameCount);
  const effectiveH2h = lerp(1.0, rawRpi, h2hConfidence);

  const { defenseFactor, defenseConfidence, gamesCount: defenseGamesCount } =
    lookupDefenseFactor(defenseProfile, opponentCode, playerPosition);
  const effectiveDef = lerp(1.0, defenseFactor, defenseConfidence);

  const multiplier = effectiveH2h * effectiveDef;
  const combinedConfidence = h2hConfidence * defenseConfidence;

  return {
    multiplier,
    confidence: combinedConfidence,
    sampleN: gameCount,
    defenseFactor,
    defenseConfidence,
    h2hRpi: rawRpi,
    h2hConfidence,
  };
}

// ── Venue RPI ─────────────────────────────────────────────────────────────────

/**
 * Compute a player's venue RPI for a specific canonical stadium.
 *
 * rawRpi = weightedMean(games at stadium) / weightedMean(ALL games)
 * Returns multiplier = 1.0 and confidence = 0 when no games exist at the stadium.
 * Games with an unresolvable raw stadium string are excluded from the numerator only —
 * they still count in the denominator so all three sub-models share a common baseline.
 */
export function computeVenueMultiplier(
  playerGames: ContextualEligibleGame[],
  stadiumId: string,
): VenueAdjustment {
  if (playerGames.length === 0) {
    return { multiplier: 1.0, confidence: 0, sampleN: 0, stadiumId };
  }

  // Weighted overall mean — ALL games (shared baseline across sub-models)
  let totalWeightedScore = 0;
  let totalWeight = 0;
  for (const g of playerGames) {
    totalWeightedScore += g.totalScore * g.weight;
    totalWeight += g.weight;
  }
  const overallMean = totalWeight > 0 ? totalWeightedScore / totalWeight : 0;

  if (overallMean === 0) {
    return { multiplier: 1.0, confidence: 0, sampleN: 0, stadiumId };
  }

  // Weighted mean at the requested stadium (numerator only)
  const venueGames = playerGames.filter(
    g => g.stadium !== null && VENUE_NORMALISATION[g.stadium!] === stadiumId,
  );
  if (venueGames.length === 0) {
    return { multiplier: 1.0, confidence: 0, sampleN: 0, stadiumId };
  }

  let venueWeightedScore = 0;
  let venueWeight = 0;
  for (const g of venueGames) {
    venueWeightedScore += g.totalScore * g.weight;
    venueWeight += g.weight;
  }
  const venueMean = venueWeight > 0 ? venueWeightedScore / venueWeight : overallMean;
  const rawRpi = venueMean / overallMean;

  const confidence = clampedConfidence(venueGames.length);
  return {
    multiplier: lerp(1.0, rawRpi, confidence),
    confidence,
    sampleN: venueGames.length,
    stadiumId,
  };
}

// ── Weather category RPI ──────────────────────────────────────────────────────

/**
 * Compute a player's weather category RPI for a specific canonical weather category.
 *
 * rawRpi = weightedMean(games in category) / weightedMean(ALL games)
 * Returns multiplier = 1.0 and confidence = 0 when no games exist in the category.
 * Games with null or unrecognised weather strings are excluded from the numerator only —
 * they still count in the denominator so all three sub-models share a common baseline.
 *
 * NOTE: The returned multiplier is informational — it is NOT applied to the adjusted
 * projection. No forecast data source is available for upcoming games.
 */
export function computeWeatherMultiplier(
  playerGames: ContextualEligibleGame[],
  category: WeatherCategory,
): WeatherAdjustment {
  if (playerGames.length === 0) {
    return { multiplier: 1.0, confidence: 0, sampleN: 0, category };
  }

  // Weighted overall mean — ALL games (shared baseline across sub-models)
  let totalWeightedScore = 0;
  let totalWeight = 0;
  for (const g of playerGames) {
    totalWeightedScore += g.totalScore * g.weight;
    totalWeight += g.weight;
  }
  const overallMean = totalWeight > 0 ? totalWeightedScore / totalWeight : 0;

  if (overallMean === 0) {
    return { multiplier: 1.0, confidence: 0, sampleN: 0, category };
  }

  // Weighted mean for the requested category (numerator only)
  const categoryGames = playerGames.filter(
    g => g.weather !== null && WEATHER_NORMALISATION[g.weather!] === category,
  );
  if (categoryGames.length === 0) {
    return { multiplier: 1.0, confidence: 0, sampleN: 0, category };
  }

  let catWeightedScore = 0;
  let catWeight = 0;
  for (const g of categoryGames) {
    catWeightedScore += g.totalScore * g.weight;
    catWeight += g.weight;
  }
  const catMean = catWeight > 0 ? catWeightedScore / catWeight : overallMean;
  const rawRpi = catMean / overallMean;

  const confidence = clampedConfidence(categoryGames.length);
  return {
    multiplier: lerp(1.0, rawRpi, confidence),
    confidence,
    sampleN: categoryGames.length,
    category,
  };
}

// ── Projection adjustment ─────────────────────────────────────────────────────

/**
 * Scale each projection value by an array of multipliers compounded together.
 * Each multiplier is already confidence-blended before this call.
 * An empty array of multipliers returns the base projection unchanged.
 */
export function applyMultipliers(
  base: ProjectionValues,
  multipliers: number[],
): ProjectionValues {
  const combined = multipliers.reduce((acc, m) => acc * m, 1.0);
  return {
    total:   base.total   * combined,
    floor:   base.floor   * combined,
    ceiling: base.ceiling * combined,
  };
}

/** @deprecated Use applyMultipliers instead. */
export function applyOpponentAdjustment(
  base: ProjectionValues,
  adjustment: ContextualMultiplier,
): ProjectionValues {
  return applyMultipliers(base, [adjustment.multiplier]);
}
