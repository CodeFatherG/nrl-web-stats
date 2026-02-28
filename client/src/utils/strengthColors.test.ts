import { describe, it, expect } from 'vitest';
import {
  getStrengthCategory,
  getStrengthColor,
  getStrengthTextColor,
} from './strengthColors';

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

  // IQR fence tests
  it('should return "hard" for outliers below lowerFence', () => {
    const fencedThresholds = { p33: 320, p67: 400, lowerFence: 200, upperFence: 500 };
    expect(getStrengthCategory(150, fencedThresholds)).toBe('hard');
    expect(getStrengthCategory(199, fencedThresholds)).toBe('hard');
  });

  it('should return "easy" for outliers above upperFence', () => {
    const fencedThresholds = { p33: 320, p67: 400, lowerFence: 200, upperFence: 500 };
    expect(getStrengthCategory(501, fencedThresholds)).toBe('easy');
    expect(getStrengthCategory(999, fencedThresholds)).toBe('easy');
  });

  it('should use p33/p67 for values within fences', () => {
    const fencedThresholds = { p33: 320, p67: 400, lowerFence: 200, upperFence: 500 };
    expect(getStrengthCategory(250, fencedThresholds)).toBe('hard');
    expect(getStrengthCategory(350, fencedThresholds)).toBe('medium');
    expect(getStrengthCategory(450, fencedThresholds)).toBe('easy');
  });

  it('should work without fence values (backwards compatible)', () => {
    const noFences = { p33: 320, p67: 400 };
    expect(getStrengthCategory(100, noFences)).toBe('hard');
    expect(getStrengthCategory(350, noFences)).toBe('medium');
    expect(getStrengthCategory(450, noFences)).toBe('easy');
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
