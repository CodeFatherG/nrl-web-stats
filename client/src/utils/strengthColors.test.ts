import { describe, it, expect } from 'vitest';
import {
  calculateStrengthPercentiles,
  getStrengthCategory,
  getStrengthColor,
  getStrengthTextColor,
} from './strengthColors';

describe('calculateStrengthPercentiles', () => {
  it('should return zeros for empty array', () => {
    const result = calculateStrengthPercentiles([]);
    expect(result).toEqual({ p33: 0, p67: 0 });
  });

  it('should calculate percentiles for sorted array', () => {
    // Array of 10 values: 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000
    const ratings = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000];
    const result = calculateStrengthPercentiles(ratings);
    // p33 index = floor(10 * 0.33) = 3 -> value 400
    // p67 index = floor(10 * 0.67) = 6 -> value 700
    expect(result.p33).toBe(400);
    expect(result.p67).toBe(700);
  });

  it('should calculate percentiles for unsorted array', () => {
    const ratings = [500, 100, 400, 200, 300, 800, 600, 1000, 900, 700];
    const result = calculateStrengthPercentiles(ratings);
    // Same as above after sorting
    expect(result.p33).toBe(400);
    expect(result.p67).toBe(700);
  });

  it('should handle single value array', () => {
    const result = calculateStrengthPercentiles([350]);
    // p33 index = floor(1 * 0.33) = 0
    // p67 index = floor(1 * 0.67) = 0
    expect(result.p33).toBe(350);
    expect(result.p67).toBe(350);
  });

  it('should handle small arrays', () => {
    const result = calculateStrengthPercentiles([100, 200, 300]);
    // p33 index = floor(3 * 0.33) = 0 -> 100
    // p67 index = floor(3 * 0.67) = 2 -> 300
    expect(result.p33).toBe(100);
    expect(result.p67).toBe(300);
  });
});

describe('getStrengthCategory', () => {
  // Lower ratings = fewer SC points = harder matchup
  // Higher ratings = more SC points = easier matchup
  const thresholds = { p33: 320, p67: 400 };

  it('should return "hard" for ratings at or below p33 (low points = tough matchup)', () => {
    expect(getStrengthCategory(100, thresholds)).toBe('hard');
    expect(getStrengthCategory(320, thresholds)).toBe('hard');
  });

  it('should return "medium" for ratings between p33 and p67', () => {
    expect(getStrengthCategory(321, thresholds)).toBe('medium');
    expect(getStrengthCategory(350, thresholds)).toBe('medium');
    expect(getStrengthCategory(400, thresholds)).toBe('medium');
  });

  it('should return "easy" for ratings above p67 (high points = easy matchup)', () => {
    expect(getStrengthCategory(401, thresholds)).toBe('easy');
    expect(getStrengthCategory(500, thresholds)).toBe('easy');
  });

  it('should handle edge case where thresholds are equal', () => {
    const equalThresholds = { p33: 350, p67: 350 };
    // When p33 == p67, rating <= p33 returns hard, rating > p67 returns easy
    expect(getStrengthCategory(350, equalThresholds)).toBe('hard');
    expect(getStrengthCategory(351, equalThresholds)).toBe('easy');
    expect(getStrengthCategory(349, equalThresholds)).toBe('hard');
  });

  it('should handle zero rating (very hard matchup)', () => {
    expect(getStrengthCategory(0, thresholds)).toBe('hard');
  });
});

describe('getStrengthColor', () => {
  it('should return green for easy', () => {
    expect(getStrengthColor('easy')).toBe('#4CAF50');
  });

  it('should return yellow for medium', () => {
    expect(getStrengthColor('medium')).toBe('#FFC107');
  });

  it('should return red for hard', () => {
    expect(getStrengthColor('hard')).toBe('#F44336');
  });
});

describe('getStrengthTextColor', () => {
  it('should return white for easy (green background)', () => {
    expect(getStrengthTextColor('easy')).toBe('#FFFFFF');
  });

  it('should return black for medium (yellow background)', () => {
    expect(getStrengthTextColor('medium')).toBe('#000000');
  });

  it('should return white for hard (red background)', () => {
    expect(getStrengthTextColor('hard')).toBe('#FFFFFF');
  });
});
