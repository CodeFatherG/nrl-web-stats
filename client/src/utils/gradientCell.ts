const GREEN = { r: 200, g: 230, b: 201 }; // #c8e6c9
const RED = { r: 255, g: 205, b: 210 };   // #ffcdd2

/**
 * Returns a CSS rgb() colour string interpolated between soft green (best)
 * and soft red (worst), or undefined when all values are equal (no ranking).
 *
 * @param value           The cell value
 * @param min             Minimum value in the row across all players
 * @param max             Maximum value in the row across all players
 * @param higherIsBetter  true → max is green; false → min is green
 */
export function computeGradientColor(
  value: number,
  min: number,
  max: number,
  higherIsBetter: boolean,
): string | undefined {
  if (min === max) return undefined;
  // t = 0 → green (best), t = 1 → red (worst)
  const t = higherIsBetter
    ? (max - value) / (max - min)
    : (value - min) / (max - min);
  const r = Math.round(GREEN.r + t * (RED.r - GREEN.r));
  const g = Math.round(GREEN.g + t * (RED.g - GREEN.g));
  const b = Math.round(GREEN.b + t * (RED.b - GREEN.b));
  return `rgb(${r},${g},${b})`;
}

/**
 * Computes the min/max for a row of nullable values.
 * Returns null when fewer than 2 non-null values exist (no gradient to draw).
 */
export function rowMinMax(
  values: (number | null)[],
): { min: number; max: number } | null {
  const nums = values.filter((v): v is number => v !== null);
  if (nums.length < 2) return null;
  return { min: Math.min(...nums), max: Math.max(...nums) };
}
