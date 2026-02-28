import type { StrengthCategory, StrengthThresholds } from '../types';

export function getStrengthCategory(
  rating: number,
  thresholds: StrengthThresholds
): StrengthCategory {
  // Handle IQR outlier fences if provided
  if (thresholds.lowerFence != null && rating < thresholds.lowerFence) return 'hard';
  if (thresholds.upperFence != null && rating > thresholds.upperFence) return 'easy';
  // Lower ratings = fewer SC points available = harder matchup
  // Higher ratings = more SC points available = easier matchup
  if (rating <= thresholds.p33) return 'hard';
  if (rating <= thresholds.p67) return 'medium';
  return 'easy';
}

export function getStrengthColor(category: StrengthCategory): string {
  const colors: Record<StrengthCategory, string> = {
    easy: '#4CAF50',   // Green
    medium: '#FFC107', // Yellow
    hard: '#F44336',   // Red
  };
  return colors[category];
}

export function getStrengthTextColor(category: StrengthCategory): string {
  const colors: Record<StrengthCategory, string> = {
    easy: '#FFFFFF',
    medium: '#000000',
    hard: '#FFFFFF',
  };
  return colors[category];
}
