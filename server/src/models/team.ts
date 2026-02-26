/**
 * Team entity - represents an NRL team
 */

export interface Team {
  /** Unique 3-letter team code (e.g., "MEL", "BRO") */
  code: string;
  /** Full team name (e.g., "Melbourne Storm") */
  name: string;
}

/** Map of team codes to full names */
export const TEAM_NAMES: Record<string, string> = {
  BRO: 'Brisbane Broncos',
  BUL: 'Canterbury Bulldogs',
  CBR: 'Canberra Raiders',
  DOL: 'Dolphins',
  GCT: 'Gold Coast Titans',
  MEL: 'Melbourne Storm',
  MNL: 'Manly Sea Eagles',
  NEW: 'Newcastle Knights',
  NQC: 'North Queensland Cowboys',
  NZL: 'New Zealand Warriors',
  PAR: 'Parramatta Eels',
  PTH: 'Perth',
  SHA: 'Cronulla Sharks',
  STG: 'St George Illawarra Dragons',
  STH: 'South Sydney Rabbitohs',
  SYD: 'Sydney Roosters',
  WST: 'Wests Tigers',
};

/** All valid team codes */
export const VALID_TEAM_CODES = Object.keys(TEAM_NAMES);

/** Check if a team code is valid */
export function isValidTeamCode(code: string): boolean {
  return VALID_TEAM_CODES.includes(code.toUpperCase());
}

/** Get team by code */
export function getTeam(code: string): Team | null {
  const upperCode = code.toUpperCase();
  const name = TEAM_NAMES[upperCode];
  if (!name) return null;
  return { code: upperCode, name };
}

/** Get all teams */
export function getAllTeams(): Team[] {
  return VALID_TEAM_CODES.map(code => ({
    code,
    name: TEAM_NAMES[code],
  }));
}
