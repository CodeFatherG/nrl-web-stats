import type { StrengthCategory, StrengthThresholds } from '../types';

export function calculateStrengthPercentiles(
  ratings: number[]
): StrengthThresholds {
  if (ratings.length === 0) {
    return { p33: 0, p67: 0 };
  }

  const sorted = [...ratings].sort((a, b) => a - b);
  const p33Index = Math.floor(sorted.length * 0.33);
  const p67Index = Math.floor(sorted.length * 0.67);

  return {
    p33: sorted[p33Index] ?? 0,
    p67: sorted[p67Index] ?? 0,
  };
}

export function getStrengthCategory(
  rating: number,
  thresholds: StrengthThresholds
): StrengthCategory {
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
