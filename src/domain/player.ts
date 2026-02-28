/**
 * Player aggregate and MatchPerformance value object.
 * Core domain types for NRL player statistics.
 */

/** MatchPerformance value object — one player's stats for a single match */
export interface MatchPerformance {
  readonly matchId: string;
  readonly year: number;
  readonly round: number;
  readonly teamCode: string;
  readonly tries: number;
  readonly goals: number;
  readonly tackles: number;
  readonly runMetres: number;
  readonly fantasyPoints: number;
  readonly isComplete: boolean;
}

/** Input data for creating a MatchPerformance */
export interface MatchPerformanceData {
  readonly matchId: string;
  readonly year: number;
  readonly round: number;
  readonly teamCode: string;
  readonly tries: number;
  readonly goals: number;
  readonly tackles: number;
  readonly runMetres: number;
  readonly fantasyPoints: number;
  readonly isComplete: boolean;
}

/** Create a validated MatchPerformance value object */
export function createMatchPerformance(data: MatchPerformanceData): MatchPerformance {
  if (data.tries < 0 || data.goals < 0 || data.tackles < 0 || data.runMetres < 0) {
    throw new Error(
      `Stats must be non-negative: tries=${data.tries}, goals=${data.goals}, tackles=${data.tackles}, runMetres=${data.runMetres}`
    );
  }
  return { ...data };
}

/** Player aggregate — individual NRL player with performance history */
export interface Player {
  readonly id: string;
  readonly name: string;
  readonly dateOfBirth: string | null;
  readonly teamCode: string;
  readonly position: string;
  readonly performances: readonly MatchPerformance[];
}

/** Generate a deterministic Player ID from name and optional DOB */
export function createPlayerId(name: string, dateOfBirth?: string | null): string {
  const normalised = name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-');
  if (dateOfBirth) {
    return `${normalised}-${dateOfBirth}`;
  }
  return normalised;
}

/** Create a new Player with empty performance history */
export function createPlayer(
  name: string,
  dateOfBirth: string | null,
  teamCode: string,
  position: string
): Player {
  return {
    id: createPlayerId(name, dateOfBirth),
    name,
    dateOfBirth,
    teamCode,
    position,
    performances: [],
  };
}

/** Add a performance record to a Player. Returns a new Player (immutable). */
export function addPerformance(player: Player, performance: MatchPerformance): Player {
  return {
    ...player,
    performances: [...player.performances, performance],
  };
}
