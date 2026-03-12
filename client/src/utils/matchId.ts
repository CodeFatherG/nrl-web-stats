/**
 * Create a deterministic match ID from year, round, and team codes.
 * Teams are sorted alphabetically to match the backend format.
 * Format: {year}-R{round}-{teamA}-{teamB}
 */
export function createMatchId(
  year: number,
  round: number,
  teamA: string,
  teamB: string
): string {
  const [first, second] = [teamA, teamB].sort();
  return `${year}-R${round}-${first}-${second}`;
}
