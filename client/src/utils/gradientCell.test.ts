import { describe, it, expect } from 'vitest';
import { computeGradientColor, rowMinMax } from './gradientCell';

describe('computeGradientColor', () => {
  it('higher-is-better: max value → green', () => {
    const colour = computeGradientColor(100, 50, 100, true);
    expect(colour).toBe('rgb(200,230,201)');
  });

  it('higher-is-better: min value → red', () => {
    const colour = computeGradientColor(50, 50, 100, true);
    expect(colour).toBe('rgb(255,205,210)');
  });

  it('lower-is-better: min value → green', () => {
    const colour = computeGradientColor(50, 50, 100, false);
    expect(colour).toBe('rgb(200,230,201)');
  });

  it('lower-is-better: max value → red', () => {
    const colour = computeGradientColor(100, 50, 100, false);
    expect(colour).toBe('rgb(255,205,210)');
  });

  it('mid value interpolates between green and red', () => {
    const colour = computeGradientColor(75, 50, 100, true);
    expect(colour).toMatch(/^rgb\(/);
    // t = 0.5 → midpoint
    const r = Math.round(200 + 0.5 * (255 - 200));
    const g = Math.round(230 + 0.5 * (205 - 230));
    const b = Math.round(201 + 0.5 * (210 - 201));
    expect(colour).toBe(`rgb(${r},${g},${b})`);
  });

  it('min === max → undefined (no colouring)', () => {
    expect(computeGradientColor(75, 75, 75, true)).toBeUndefined();
    expect(computeGradientColor(75, 75, 75, false)).toBeUndefined();
  });
});

describe('rowMinMax', () => {
  it('returns min and max for two or more values', () => {
    expect(rowMinMax([10, 50, 30])).toEqual({ min: 10, max: 50 });
  });

  it('ignores null values', () => {
    expect(rowMinMax([null, 20, null, 80])).toEqual({ min: 20, max: 80 });
  });

  it('returns null when fewer than 2 non-null values', () => {
    expect(rowMinMax([null, null])).toBeNull();
    expect(rowMinMax([42])).toBeNull();
    expect(rowMinMax([null, 42])).toBeNull();
  });

  it('returns null for empty array', () => {
    expect(rowMinMax([])).toBeNull();
  });
});
