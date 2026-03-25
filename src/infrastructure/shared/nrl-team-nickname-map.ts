/**
 * Team nickname → canonical 3-letter code resolver.
 * Uses the existing ALL_TEAMS registry via resolveTeam().
 */

import { resolveTeam } from '../../domain/team-identity.js';

/**
 * Resolve an NRL team nickname (e.g., "Broncos", "Sea Eagles") to its canonical 3-letter code.
 * Matches against team slug, full name, and aliases via the team identity registry.
 * Returns null if the nickname cannot be resolved.
 */
export function resolveTeamNickname(nickname: string): string | null {
  const team = resolveTeam(nickname);
  if (team) return team.code;

  // Try matching just the slug form (lowercase, hyphenated)
  const slugForm = nickname.toLowerCase().replace(/\s+/g, '-');
  const teamBySlug = resolveTeam(slugForm);
  if (teamBySlug) return teamBySlug.code;

  return null;
}
