import type { Team, SeasonSummaryResponse, ByeGridData, SignificantByeRound } from '../types';

/**
 * Builds the bye grid data structure from season summary and team list.
 * Teams are sorted alphabetically by full name.
 */
export function buildByeGridData(
  seasonSummary: SeasonSummaryResponse,
  teams: Team[],
  highlightedColumn: number | null,
  highlightedRow: string | null
): ByeGridData {
  // Sort teams alphabetically by full name
  const sortedTeams = [...teams].sort((a, b) => a.name.localeCompare(b.name));

  // Build bye map: teamCode -> Set of round numbers
  const byeMap = new Map<string, Set<number>>();
  const byeCountByRound = new Map<number, number>();

  // Initialize all rounds with 0 count
  for (let round = 1; round <= 27; round++) {
    byeCountByRound.set(round, 0);
  }

  // Process each round's bye teams
  for (const round of seasonSummary.rounds) {
    byeCountByRound.set(round.round, round.byeTeams.length);

    for (const teamCode of round.byeTeams) {
      if (!byeMap.has(teamCode)) {
        byeMap.set(teamCode, new Set());
      }
      byeMap.get(teamCode)!.add(round.round);
    }
  }

  // Calculate max bye count for normalization
  const maxByeCount = Math.max(...byeCountByRound.values(), 0);

  // Build rounds array (1-27)
  const rounds = Array.from({ length: 27 }, (_, i) => i + 1);

  // Weight the column and row strengths based on highlighted column/row
  const columnStrengths = new Map<number, number>();
  if (highlightedRow != null) {
    // We have highlighted a row so find the weight of each column based on that row's bye distribution
    const teamByes = byeMap.get(highlightedRow) ?? new Set();
    for (const round of rounds) {
      columnStrengths.set(round, teamByes.has(round) ? 0 : 1);
    }
  }

  const rowStrengths = new Map<string, number>();
  if (highlightedColumn != null) {
    // We have highlighted a column so find the weight of each row based on that column's bye distribution
    for (const team of sortedTeams) {
      const teamByes = byeMap.get(team.code) ?? new Set();
      rowStrengths.set(team.code, teamByes.has(highlightedColumn) ? 0 : 1);
    }
  }

  return {
    teams: sortedTeams,
    rounds,
    byeMap,
    byeCountByRound,
    maxByeCount,
    columnStrengths,
    rowStrengths,
  };
}

/**
 * Gets the background color intensity for a column header based on bye count.
 * Higher bye count = more intense blue color.
 */
export function getByeConcentrationColor(
  byeCount: number,
  maxByeCount: number
): string {
  if (byeCount === 0 || maxByeCount === 0) {
    return 'transparent';
  }
  const intensity = byeCount / maxByeCount;
  // Light blue gradient: rgba(33, 150, 243, 0.1) to rgba(33, 150, 243, 0.4)
  return `rgba(33, 150, 243, ${0.1 + intensity * 0.3})`;
}

/**
 * Gets rounds that have more than the specified threshold of byes.
 * Used to identify significant bye rounds for the statistics table.
 * @param byeCountByRound Map of round number to bye count
 * @param threshold Minimum number of byes to be considered significant (default: 2, meaning >2)
 * @returns Array of round numbers with bye count > threshold, sorted ascending
 */
export function getSignificantByeRounds(
  byeCountByRound: Map<number, number>,
  threshold: number = 2
): number[] {
  const significantRounds: number[] = [];

  for (const [round, count] of byeCountByRound.entries()) {
    if (count > threshold) {
      significantRounds.push(round);
    }
  }

  return significantRounds.sort((a, b) => a - b);
}

/**
 * Gets the affected (with bye) and unaffected (without bye) teams for a specific round.
 * @param round Round number to check
 * @param byeMap Map from team code to set of round numbers where team has bye
 * @param allTeams Array of all team objects
 * @returns Object with affected and unaffected team code arrays
 */
export function getTeamsByByeStatus(
  round: number,
  byeMap: Map<string, Set<number>>,
  allTeams: Team[]
): { affected: string[]; unaffected: string[] } {
  const affected: string[] = [];
  const unaffected: string[] = [];

  for (const team of allTeams) {
    const teamByes = byeMap.get(team.code);
    if (teamByes && teamByes.has(round)) {
      affected.push(team.code);
    } else {
      unaffected.push(team.code);
    }
  }

  // Sort both arrays alphabetically by team code
  affected.sort();
  unaffected.sort();

  return { affected, unaffected };
}

/**
 * Builds the complete significant bye rounds data for the statistics table.
 * Combines getSignificantByeRounds and getTeamsByByeStatus into a single call.
 * @param byeCountByRound Map of round number to bye count
 * @param byeMap Map from team code to set of round numbers where team has bye
 * @param allTeams Array of all team objects
 * @param roundRange Optional round range filter [start, end]
 * @param threshold Minimum number of byes to be considered significant (default: 2)
 * @returns Array of SignificantByeRound objects
 */
export function buildSignificantByeRounds(
  byeCountByRound: Map<number, number>,
  byeMap: Map<string, Set<number>>,
  allTeams: Team[],
  roundRange?: [number, number],
  threshold: number = 2
): SignificantByeRound[] {
  const significantRoundNumbers = getSignificantByeRounds(byeCountByRound, threshold);

  // Apply round range filter if provided
  const filteredRounds = roundRange
    ? significantRoundNumbers.filter(
        (round) => round >= roundRange[0] && round <= roundRange[1]
      )
    : significantRoundNumbers;

  return filteredRounds.map((round) => {
    const { affected, unaffected } = getTeamsByByeStatus(round, byeMap, allTeams);
    return {
      round,
      affectedTeams: affected,
      unaffectedTeams: unaffected,
    };
  });
}
