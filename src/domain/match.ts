/**
 * Match aggregate, MatchStatus enum, and Score value object.
 * Core domain types for NRL match data.
 */

/** Match completion status lifecycle: Scheduled → InProgress → Completed */
export const MatchStatus = {
  Scheduled: 'Scheduled',
  InProgress: 'InProgress',
  Completed: 'Completed',
} as const;

export type MatchStatus = (typeof MatchStatus)[keyof typeof MatchStatus];

/** Score value object — self-validating, immutable */
export interface Score {
  readonly home: number;
  readonly away: number;
}

/** Create a validated Score value object */
export function createScore(home: number, away: number): Score {
  if (home < 0 || away < 0) {
    throw new Error(`Score values must be non-negative: home=${home}, away=${away}`);
  }
  if (!Number.isInteger(home) || !Number.isInteger(away)) {
    throw new Error(`Score values must be integers: home=${home}, away=${away}`);
  }
  return { home, away };
}

/** Get the score margin (absolute difference) */
export function scoreMargin(score: Score): number {
  return Math.abs(score.home - score.away);
}

/** Get the winner side, or null if draw */
export function scoreWinner(score: Score): 'home' | 'away' | null {
  if (score.home > score.away) return 'home';
  if (score.away > score.home) return 'away';
  return null;
}

// ---------------------------------------------------------------------------
// Match Aggregate
// ---------------------------------------------------------------------------

/** Match aggregate — per-game record, enrichable from multiple sources */
export interface Match {
  readonly id: string;
  readonly year: number;
  readonly round: number;
  readonly homeTeamCode: string | null;
  readonly awayTeamCode: string | null;
  readonly homeStrengthRating: number | null;
  readonly awayStrengthRating: number | null;
  readonly homeScore: number | null;
  readonly awayScore: number | null;
  readonly status: MatchStatus;
  readonly scheduledTime: string | null;
  readonly stadium: string | null;
  readonly weather: string | null;
}

/** Generate a deterministic Match ID with teams sorted alphabetically */
export function createMatchId(teamA: string, teamB: string, year: number, round: number): string {
  const [first, second] = [teamA, teamB].sort();
  return `${year}-R${round}-${first}-${second}`;
}

/** Status priority for forward-only transitions */
const STATUS_ORDER: Record<MatchStatus, number> = {
  [MatchStatus.Scheduled]: 0,
  [MatchStatus.InProgress]: 1,
  [MatchStatus.Completed]: 2,
};

/** Schedule data for creating or enriching a Match */
export interface ScheduleData {
  readonly homeTeamCode: string;
  readonly awayTeamCode: string;
  readonly homeStrengthRating: number;
  readonly awayStrengthRating: number;
  readonly stadium: string | null;
}

/** Result data for creating or enriching a Match */
export interface ResultData {
  readonly homeScore: number;
  readonly awayScore: number;
  readonly status: MatchStatus;
  readonly scheduledTime: string | null;
  readonly stadium: string | null;
  readonly weather: string | null;
}

/** Create a Match from schedule data only (result fields null, status Scheduled) */
export function createMatchFromSchedule(data: ScheduleData & { year: number; round: number }): Match {
  return {
    id: createMatchId(data.homeTeamCode, data.awayTeamCode, data.year, data.round),
    year: data.year,
    round: data.round,
    homeTeamCode: data.homeTeamCode,
    awayTeamCode: data.awayTeamCode,
    homeStrengthRating: data.homeStrengthRating,
    awayStrengthRating: data.awayStrengthRating,
    homeScore: null,
    awayScore: null,
    status: MatchStatus.Scheduled,
    scheduledTime: null,
    stadium: data.stadium ?? null,
    weather: null,
  };
}

/** Create a Match from result data only (schedule fields null) */
export function createMatchFromResult(data: ResultData & { teamA: string; teamB: string; year: number; round: number }): Match {
  return {
    id: createMatchId(data.teamA, data.teamB, data.year, data.round),
    year: data.year,
    round: data.round,
    homeTeamCode: null,
    awayTeamCode: null,
    homeStrengthRating: null,
    awayStrengthRating: null,
    homeScore: data.homeScore,
    awayScore: data.awayScore,
    status: data.status,
    scheduledTime: data.scheduledTime,
    stadium: data.stadium ?? null,
    weather: data.weather ?? null,
  };
}

/** Enrich an existing Match with schedule data. Preserves existing non-null fields. */
export function enrichWithSchedule(match: Match, data: ScheduleData): Match {
  return {
    ...match,
    homeTeamCode: match.homeTeamCode ?? data.homeTeamCode,
    awayTeamCode: match.awayTeamCode ?? data.awayTeamCode,
    homeStrengthRating: match.homeStrengthRating ?? data.homeStrengthRating,
    awayStrengthRating: match.awayStrengthRating ?? data.awayStrengthRating,
    stadium: match.stadium ?? data.stadium,
  };
}

/** Enrich an existing Match with result data. Preserves existing non-null fields. Status only moves forward. */
export function enrichWithResult(match: Match, data: ResultData): Match {
  const newStatus = STATUS_ORDER[data.status] > STATUS_ORDER[match.status] ? data.status : match.status;
  // Only apply scores when the incoming data represents a started/completed match
  const hasScores = STATUS_ORDER[data.status] >= STATUS_ORDER[MatchStatus.InProgress];
  return {
    ...match,
    homeScore: hasScores ? (match.homeScore ?? data.homeScore) : match.homeScore,
    awayScore: hasScores ? (match.awayScore ?? data.awayScore) : match.awayScore,
    status: newStatus,
    scheduledTime: match.scheduledTime ?? data.scheduledTime,
    stadium: match.stadium ?? data.stadium,
    weather: match.weather ?? data.weather,
  };
}
