/**
 * Pure-function helpers for the team-strength-rankings domain.
 * Stateless and IO-free — numeric rating → category classification.
 */

import type { SeasonThresholds, StrengthCategory } from '../models/types.js';

/** Classify a rating into a category using IQR-clamped season thresholds.
 *  Out-of-fence values are treated as the extreme of their direction. */
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

/** Classify a percentile-rank value (0–1) into a category. */
export function getCategoryFromPercentile(percentile: number): StrengthCategory {
  if (percentile <= 0.33) return 'hard';
  if (percentile <= 0.67) return 'medium';
  return 'easy';
}
