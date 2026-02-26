/**
 * Fixture entity - represents a single game or bye week
 */

export interface Fixture {
  /** Unique identifier: "{year}-{teamCode}-{round}" */
  id: string;
  /** Season year (e.g., 2026) */
  year: number;
  /** Round number (1-27) */
  round: number;
  /** Team this fixture belongs to */
  teamCode: string;
  /** Opponent team code (null for bye weeks) */
  opponentCode: string | null;
  /** True if home game, false if away */
  isHome: boolean;
  /** True if bye week */
  isBye: boolean;
  /** Strength of schedule rating */
  strengthRating: number;
}

/** Create a fixture ID from components */
export function createFixtureId(year: number, teamCode: string, round: number): string {
  return `${year}-${teamCode}-${round}`;
}

/** Create a new fixture */
export function createFixture(
  year: number,
  round: number,
  teamCode: string,
  opponentCode: string | null,
  isHome: boolean,
  strengthRating: number
): Fixture {
  return {
    id: createFixtureId(year, teamCode, round),
    year,
    round,
    teamCode,
    opponentCode,
    isHome: opponentCode !== null ? isHome : false,
    isBye: opponentCode === null,
    strengthRating,
  };
}
