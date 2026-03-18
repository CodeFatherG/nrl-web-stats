/**
 * Player name matching utility.
 * Five-tier strategy: persisted link → exact normalized → fuzzy normalized → team+lastname → unmatched.
 * Joins nrl.com players (firstName + lastName) with nrlsupercoachstats.com names ({LastName}, {FirstName}).
 */

import type { MatchConfidence } from '../domain/supercoach-score.js';

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

/** Optional context maps for enhanced matching tiers */
export interface MatchingContext {
  /** Maps playerId → supplementaryName from the persisted link database */
  readonly persistedLinks?: Map<string, string>;
  /** Maps supplementaryName → teamCode from supplementary stats */
  readonly supplementaryTeamCodes?: Map<string, string>;
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
 *
 * Tier order (highest to lowest priority):
 * 1. Persisted link lookup (from D1 player_name_links table)
 * 2. Exact normalized full name
 * 3. Fuzzy prefix first name + exact last name
 * 4. Team-based last name (exact last name + matching team code + unique on team)
 * 5. Unmatched (null)
 */
export function matchPlayerName(
  playerId: string,
  firstName: string,
  lastName: string,
  teamCode: string,
  supplementaryNames: string[],
  context?: MatchingContext
): PlayerIdentityMatch | null {
  const makeResult = (supplementaryName: string, confidence: MatchConfidence, normalization: string | null): PlayerIdentityMatch => ({
    primaryPlayerId: playerId,
    primaryName: `${firstName} ${lastName}`,
    primaryTeamCode: teamCode,
    supplementaryName,
    confidence,
    normalizationApplied: normalization,
  });

  // Tier 1: Persisted link lookup
  const linkedName = context?.persistedLinks?.get(playerId);
  if (linkedName) {
    const found = supplementaryNames.find(
      sn => normalizeName(sn) === normalizeName(linkedName)
    );
    if (found) {
      return makeResult(found, 'linked', 'persisted link');
    }
  }

  // Tier 2: Exact normalized match
  const normalizedPrimary = toSupplementaryFormat(firstName, lastName);
  const exactMatch = supplementaryNames.find(
    sn => normalizeName(sn) === normalizedPrimary
  );
  if (exactMatch) {
    return makeResult(exactMatch, 'exact', null);
  }

  // Tier 3: Fuzzy normalized match
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
    return makeResult(fuzzyMatches[0], 'normalized', 'fuzzy first name match');
  }

  // Tier 4: Team-based last name match
  const teamCodes = context?.supplementaryTeamCodes;
  if (teamCodes) {
    const teamLastNameMatches = supplementaryNames.filter(sn => {
      const parsed = parseSupplementaryName(normalizeName(sn));
      if (!parsed) return false;

      // Last name must match exactly (normalized)
      if (parsed.lastName !== normalizedLast) return false;

      // Team code must match
      const suppTeam = teamCodes.get(sn);
      return suppTeam === teamCode;
    });

    if (teamLastNameMatches.length === 1) {
      return makeResult(teamLastNameMatches[0], 'team_lastname', 'team code + last name match');
    }
  }

  // No match found
  return null;
}
