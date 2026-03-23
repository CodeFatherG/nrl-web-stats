/**
 * TeamList and SquadMember value objects.
 * Represents a named squad (lineup) for one team in one match.
 */

/** A single player entry within a team list */
export interface SquadMember {
  readonly jerseyNumber: number;
  readonly playerName: string;
  readonly position: string;
  readonly playerId: number;
}

/** A named squad of players for one team in one match */
export interface TeamList {
  readonly matchId: string;
  readonly teamCode: string;
  readonly year: number;
  readonly round: number;
  readonly members: readonly SquadMember[];
  readonly scrapedAt: string;
}

/** Validate a SquadMember. Throws on invalid data. */
export function validateSquadMember(member: SquadMember): void {
  if (member.jerseyNumber < 1) {
    throw new Error(`Jersey number must be at least 1, got ${member.jerseyNumber}`);
  }
  if (!Number.isInteger(member.jerseyNumber)) {
    throw new Error(`Jersey number must be an integer, got ${member.jerseyNumber}`);
  }
  if (!member.playerName || member.playerName.trim().length === 0) {
    throw new Error('Player name must be non-empty');
  }
  if (!member.position || member.position.trim().length === 0) {
    throw new Error('Position must be non-empty');
  }
  if (member.playerId <= 0 || !Number.isInteger(member.playerId)) {
    throw new Error(`Player ID must be a positive integer, got ${member.playerId}`);
  }
}

/** Create a validated TeamList. Throws on invalid data. */
export function createTeamList(data: {
  matchId: string;
  teamCode: string;
  year: number;
  round: number;
  members: SquadMember[];
  scrapedAt: string;
}): TeamList {
  if (!data.matchId || data.matchId.trim().length === 0) {
    throw new Error('Match ID must be non-empty');
  }
  if (!data.teamCode || data.teamCode.trim().length === 0) {
    throw new Error('Team code must be non-empty');
  }
  if (data.members.length === 0) {
    throw new Error('Team list must have at least one member');
  }

  // Validate each member
  for (const member of data.members) {
    validateSquadMember(member);
  }

  // Check for duplicate jersey numbers
  const jerseyNumbers = new Set<number>();
  for (const member of data.members) {
    if (jerseyNumbers.has(member.jerseyNumber)) {
      throw new Error(`Duplicate jersey number ${member.jerseyNumber} in team list`);
    }
    jerseyNumbers.add(member.jerseyNumber);
  }

  // Sort members by jersey number
  const sortedMembers = [...data.members].sort((a, b) => a.jerseyNumber - b.jerseyNumber);

  return {
    matchId: data.matchId,
    teamCode: data.teamCode,
    year: data.year,
    round: data.round,
    members: sortedMembers,
    scrapedAt: data.scrapedAt,
  };
}

/** Check if a squad member is in the starting lineup (jersey 1-13) */
export function isStarter(member: SquadMember): boolean {
  return member.jerseyNumber >= 1 && member.jerseyNumber <= 13;
}

/** Check if a squad member is on the interchange bench (jersey 14-17) */
export function isInterchange(member: SquadMember): boolean {
  return member.jerseyNumber >= 14 && member.jerseyNumber <= 17;
}

/** Check if a squad member is a reserve (jersey 18+) */
export function isReserve(member: SquadMember): boolean {
  return member.jerseyNumber >= 18;
}
