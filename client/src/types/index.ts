// API Response Types (matching server/docs/API.md)

export interface Team {
  code: string;
  name: string;
}

export interface Fixture {
  id: string;
  year: number;
  round: number;
  teamCode: string;
  opponentCode: string | null;
  isHome: boolean;
  isBye: boolean;
  strengthRating: number;
}

export interface HealthResponse {
  status: 'ok';
  loadedYears: number[];
  totalFixtures: number;
}

export interface ScrapeResponse {
  success: boolean;
  year: number;
  teamsLoaded: number;
  fixturesLoaded: number;
  warnings: string[];
  timestamp: string;
}

export interface YearsResponse {
  years: number[];
  lastUpdated: Record<number, string>;
}

export interface TeamsResponse {
  teams: Team[];
}

export interface ScheduleFixture {
  round: number;
  year: number;
  opponent: string | null;
  isHome: boolean;
  isBye: boolean;
  strengthRating: number;
}

export interface TeamScheduleResponse {
  team: Team;
  schedule: ScheduleFixture[];
  totalStrength: number;
  byeRounds: number[];
}

export interface FixturesResponse {
  fixtures: Fixture[];
  count: number;
  filters: Record<string, unknown>;
}

export interface RoundMatch {
  homeTeam: string;
  awayTeam: string;
  homeStrength: number;
  awayStrength: number;
}

export interface RoundResponse {
  year: number;
  round: number;
  matches: RoundMatch[];
  byeTeams: string[];
}

export interface ApiError {
  error: string;
  message: string;
  validOptions?: (string | number)[];
}

// Ranking Types

export interface TeamRoundRanking {
  teamCode: string;
  year: number;
  round: number;
  strengthRating: number;
  /** Percentile rank 0-1 (0 = hardest, 1 = easiest) */
  percentile: number;
  category: StrengthCategory;
  opponentCode: string | null;
  isHome: boolean;
  isBye: boolean;
}

export interface TeamSeasonRanking {
  teamCode: string;
  year: number;
  totalStrength: number;
  averageStrength: number;
  matchCount: number;
  byeCount: number;
  /** Percentile rank 0-1 across all teams (0 = hardest schedule, 1 = easiest) */
  percentile: number;
  category: StrengthCategory;
  rounds: TeamRoundRanking[];
}

export interface TeamSeasonRankingResponse {
  team: Team;
  ranking: TeamSeasonRanking;
}

export interface AllTeamsRankingResponse {
  year: number;
  rankings: Array<{
    team: Team;
    totalStrength: number;
    averageStrength: number;
    percentile: number;
    category: StrengthCategory;
    rank: number;
  }>;
}

// UI State Types

export interface FilterState {
  roundStart: number;
  roundEnd: number;
  venueFilter: 'all' | 'home' | 'away';
}

export const DEFAULT_FILTERS: FilterState = {
  roundStart: 1,
  roundEnd: 27,
  venueFilter: 'all',
};

export interface StrengthThresholds {
  p33: number;
  p67: number;
}

export type StrengthCategory = 'easy' | 'medium' | 'hard';

export type ActiveTab = 'team' | 'round';

export interface AppState {
  serverReady: boolean;
  dataLoaded: boolean;
  loadedYears: number[];
  activeTab: ActiveTab;
  selectedTeamCode: string | null;
  teamSchedule: TeamScheduleResponse | null;
  selectedYear: number;
  selectedRound: number;
  roundData: RoundResponse | null;
  filters: FilterState;
  teams: Team[];
  strengthThresholds: StrengthThresholds;
  loading: boolean;
  error: string | null;
}

// Compact Season View Types

/** Compact match data for season summary */
export interface CompactMatch {
  homeTeam: string;
  awayTeam: string;
  homeScore: number | null;
  awayScore: number | null;
  scheduledTime: string | null;
  isComplete: boolean;
  /** Strength rating for home team's fixture */
  homeStrength: number;
  /** Strength rating for away team's fixture */
  awayStrength: number;
}

/** Compact round data for season summary */
export interface CompactRound {
  round: number;
  matches: CompactMatch[];
  byeTeams: string[];
}

/** Season summary response for compact season view */
export interface SeasonSummaryResponse {
  year: number;
  rounds: CompactRound[];
}

/** View mode for round tab */
export type RoundViewMode = 'compact' | 'detailed';
