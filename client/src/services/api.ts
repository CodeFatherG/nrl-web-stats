import type {
  HealthResponse,
  ScrapeResponse,
  TeamsResponse,
  TeamScheduleResponse,
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
