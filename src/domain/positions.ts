/**
 * The nine distinct position labels that cover the NRL run-on 13.
 * Starting status is determined by position, not by jersey number.
 */
const STARTING_POSITIONS = new Set([
  'fullback',
  'wing',
  'centre',
  'five-eighth',
  'halfback',
  'prop',
  'hooker',
  'second row',
  'lock',
]);

// NRL data uses variant spellings — map them to canonical forms.
const POSITION_ALIASES: Record<string, string> = {
  'winger': 'wing',
  '2nd row': 'second row',
};

/**
 * Normalise an NRL position label to its canonical lowercase form.
 * Use this whenever positions are compared or used as map keys.
 */
export function normalizePosition(position: string): string {
  const lower = position.toLowerCase().trim();
  return POSITION_ALIASES[lower] ?? lower;
}

export function isStartingPosition(position: string): boolean {
  return STARTING_POSITIONS.has(normalizePosition(position));
}

export function isInterchangePosition(position: string): boolean {
  return normalizePosition(position) === 'interchange';
}

/**
 * Returns true if the player is in the named 17-man squad.
 * Named = starting position (jersey 1–13 semantics) OR interchange (jersey 14–17 semantics).
 * "Reserve" or any unknown label → false.
 */
export function isNamedPosition(position: string): boolean {
  return isStartingPosition(position) || isInterchangePosition(position);
}
