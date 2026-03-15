/**
 * Player name matching utility.
 * Three-tier strategy: exact normalized → fuzzy normalized → manual override.
 * Joins nrl.com players (firstName + lastName) with nrlsupercoachstats.com names ({LastName}, {FirstName}).
 */

import type { MatchConfidence } from '../domain/supercoach-score.js';
import overridesData from './name-overrides.json';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PlayerIdentityMatch {
  readonly primaryPlayerId: string;
  readonly primaryName: string;
  readonly primaryTeamCode: string;
  readonly supplementaryName: string;
  readonly confidence: MatchConfidence;
  readonly normalizationApplied: string | null;
}

interface OverridesFile {
  overrides: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Name normalization
// ---------------------------------------------------------------------------

/** Normalize a name for comparison: lowercase, strip diacritics, normalize whitespace */
export function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics
    .toLowerCase()
    .replace(/[''ʻ`]/g, '') // strip apostrophe variants
    .replace(/[-–—]/g, ' ') // normalize hyphens to spaces
    .replace(/\s+/g, ' ') // collapse whitespace
    .trim();
}

/** Convert "FirstName LastName" to "lastname, firstname" (normalized) */
export function toSupplementaryFormat(firstName: string, lastName: string): string {
  return `${normalizeName(lastName)}, ${normalizeName(firstName)}`;
}

/** Parse a supplementary name "LastName, FirstName" into parts */
function parseSupplementaryName(name: string): { lastName: string; firstName: string } | null {
  const commaIdx = name.indexOf(',');
  if (commaIdx < 0) return null;
  return {
    lastName: name.substring(0, commaIdx).trim(),
    firstName: name.substring(commaIdx + 1).trim(),
  };
}

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

/**
 * Match a primary-source player against supplementary-source names.
 * Returns the best match or null if no match found.
 */
export function matchPlayerName(
  playerId: string,
  firstName: string,
  lastName: string,
  teamCode: string,
  supplementaryNames: string[]
): PlayerIdentityMatch | null {
  const overrides = (overridesData as OverridesFile).overrides;

  // Tier 3: Manual override (check first — highest priority)
  const overrideName = overrides[playerId];
  if (overrideName) {
    const found = supplementaryNames.find(
      sn => normalizeName(sn) === normalizeName(overrideName)
    );
    if (found) {
      return {
        primaryPlayerId: playerId,
        primaryName: `${firstName} ${lastName}`,
        primaryTeamCode: teamCode,
        supplementaryName: found,
        confidence: 'override',
        normalizationApplied: `manual override: ${overrideName}`,
      };
    }
  }

  // Tier 1: Exact normalized match
  const normalizedPrimary = toSupplementaryFormat(firstName, lastName);
  const exactMatch = supplementaryNames.find(
    sn => normalizeName(sn) === normalizedPrimary
  );
  if (exactMatch) {
    return {
      primaryPlayerId: playerId,
      primaryName: `${firstName} ${lastName}`,
      primaryTeamCode: teamCode,
      supplementaryName: exactMatch,
      confidence: 'exact',
      normalizationApplied: null,
    };
  }

  // Tier 2: Fuzzy normalized match
  const normalizedLast = normalizeName(lastName);
  const normalizedFirst = normalizeName(firstName);

  const fuzzyMatches = supplementaryNames.filter(sn => {
    const parsed = parseSupplementaryName(normalizeName(sn));
    if (!parsed) return false;

    // Last name must match exactly (normalized)
    if (parsed.lastName !== normalizedLast) return false;

    // First name: allow prefix match (handles abbreviations like "N." vs "Nathan")
    if (parsed.firstName === normalizedFirst) return true;
    if (normalizedFirst.startsWith(parsed.firstName) && parsed.firstName.length >= 1) return true;
    if (parsed.firstName.startsWith(normalizedFirst) && normalizedFirst.length >= 1) return true;

    return false;
  });

  if (fuzzyMatches.length === 1) {
    return {
      primaryPlayerId: playerId,
      primaryName: `${firstName} ${lastName}`,
      primaryTeamCode: teamCode,
      supplementaryName: fuzzyMatches[0],
      confidence: 'normalized',
      normalizationApplied: 'fuzzy first name match',
    };
  }

  // Multiple fuzzy matches — no disambiguation possible
  return null;
}
