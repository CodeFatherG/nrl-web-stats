import type {
  HealthResponse,
  ScrapeResponse,
  TeamsResponse,
  TeamScheduleResponse,
  TeamStreaksResponse,
  RoundResponse,
  TeamSeasonRankingResponse,
  AllTeamsRankingResponse,
  SeasonSummaryResponse,
  ApiError,
} from '../types';

const API_BASE = '/api';

async function fetchApi<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
    },
    ...options,
  });

  if (!response.ok) {
    const errorData = (await response.json()) as ApiError;
    throw new Error(errorData.message || `Request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export async function getHealth(): Promise<HealthResponse> {
  return fetchApi<HealthResponse>('/health');
}

export async function scrapeYear(year: number): Promise<ScrapeResponse> {
  return fetchApi<ScrapeResponse>('/scrape', {
    method: 'POST',
    body: JSON.stringify({ year }),
  });
}

export async function getTeams(): Promise<TeamsResponse> {
  return fetchApi<TeamsResponse>('/teams');
}

export async function getTeamSchedule(
  teamCode: string,
  year?: number
): Promise<TeamScheduleResponse> {
  const params = year ? `?year=${year}` : '';
  return fetchApi<TeamScheduleResponse>(`/teams/${teamCode}/schedule${params}`);
}

export async function getRound(
  year: number,
  round: number
): Promise<RoundResponse> {
  return fetchApi<RoundResponse>(`/rounds/${year}/${round}`);
}

export async function getTeamSeasonRanking(
  year: number,
  teamCode: string
): Promise<TeamSeasonRankingResponse> {
  return fetchApi<TeamSeasonRankingResponse>(`/rankings/${year}/${teamCode}`);
}

export async function getAllTeamsRanking(
  year: number
): Promise<AllTeamsRankingResponse> {
  return fetchApi<AllTeamsRankingResponse>(`/rankings/${year}`);
}

export async function getSeasonSummary(
  year: number
): Promise<SeasonSummaryResponse> {
  return fetchApi<SeasonSummaryResponse>(`/season/${year}/summary`);
}

export async function getTeamStreaks(
  year: number,
  teamCode: string
): Promise<TeamStreaksResponse> {
  return fetchApi<TeamStreaksResponse>(`/streaks/${year}/${teamCode}`);
}

// Analytics API
export interface FormTrajectoryResponse {
  teamCode: string;
  teamName: string;
  year: number;
  windowSize: number;
  rollingFormRating: number | null;
  classification: string | null;
  sampleSizeWarning: boolean;
  snapshots: Array<{
    round: number;
    result: string;
    margin: number;
    opponentCode: string;
    opponentStrengthRating: number | null;
    formScore: number;
  }>;
}

export interface PlayerTrendsResponse {
  teamCode: string;
  teamName: string;
  year: number;
  windowSize: number;
  players: Array<{
    playerId: string;
    playerName: string;
    roundsPlayed: number;
    isSignificant: boolean;
    sampleSizeWarning: boolean;
    stats: Array<{
      statName: string;
      seasonAverage: number;
      windowAverage: number;
      deviationPercent: number;
      direction: 'up' | 'down' | 'stable';
    }>;
  }>;
}

export interface MatchOutlookResponse {
  year: number;
  round: number;
  matches: Array<{
    matchId: string;
    homeTeamCode: string;
    awayTeamCode: string;
    homeFormRating: number | null;
    awayFormRating: number | null;
    headToHead: {
      totalMatches: number;
      homeWins: number;
      awayWins: number;
      draws: number;
      homeWinRate: number;
    };
    strengthRating: number | null;
    compositeScore: number;
    label: 'Easy' | 'Competitive' | 'Tough' | 'Upset Alert';
    factorsAvailable: number;
  }>;
  completedMatches: Array<{
    matchId: string;
    homeTeamCode: string;
    awayTeamCode: string;
    homeScore: number;
    awayScore: number;
    status: string;
  }>;
}

export interface CompositionImpactResponse {
  teamCode: string;
  teamName: string;
  year: number;
  totalMatches: number;
  sampleSizeWarning: boolean;
  playerImpacts: Array<{
    playerId: string;
    playerName: string;
    matchesPlayed: number;
    matchesMissed: number;
    winRateWith: number;
    winRateWithout: number | null;
    impactScore: number;
    method: 'availability' | 'correlation';
  }>;
}

export async function getTeamForm(
  year: number,
  teamCode: string,
  window?: number
): Promise<FormTrajectoryResponse> {
  const params = window ? `?window=${window}` : '';
  return fetchApi<FormTrajectoryResponse>(`/analytics/form/${year}/${teamCode}${params}`);
}

export async function getPlayerTrends(
  year: number,
  teamCode: string,
  window?: number,
  significantOnly?: boolean
): Promise<PlayerTrendsResponse> {
  const searchParams = new URLSearchParams();
  if (window) searchParams.set('window', String(window));
  if (significantOnly) searchParams.set('significantOnly', 'true');
  const qs = searchParams.toString();
  return fetchApi<PlayerTrendsResponse>(`/analytics/trends/${year}/${teamCode}${qs ? `?${qs}` : ''}`);
}

export async function getMatchOutlook(
  year: number,
  round: number,
  window?: number
): Promise<MatchOutlookResponse> {
  const params = window ? `?window=${window}` : '';
  return fetchApi<MatchOutlookResponse>(`/analytics/outlook/${year}/${round}${params}`);
}

export async function getCompositionImpact(
  year: number,
  teamCode: string
): Promise<CompositionImpactResponse> {
  return fetchApi<CompositionImpactResponse>(`/analytics/composition/${year}/${teamCode}`);
}
