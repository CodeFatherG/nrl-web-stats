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
  MatchDetailResponse,
  PlayerSeasonResponse,
  PlayerDetailResponse,
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

export async function getMatchDetail(
  matchId: string
): Promise<MatchDetailResponse> {
  return fetchApi<MatchDetailResponse>(`/matches/${encodeURIComponent(matchId)}`);
}

export async function getSeasonPlayers(
  year: number
): Promise<PlayerSeasonResponse> {
  return fetchApi<PlayerSeasonResponse>(`/players/season/${year}`);
}

export async function getPlayer(
  playerId: string
): Promise<PlayerDetailResponse> {
  return fetchApi<PlayerDetailResponse>(`/players/${encodeURIComponent(playerId)}`);
}

// Supercoach API

export interface SupercoachScoreResponse {
  year: number;
  round: number;
  isComplete: boolean;
  playersScored: number;
  validationSummary: {
    totalDiscrepancies: number;
    unmatchedPlayers: number;
  };
  scores: Array<{
    playerId: string;
    playerName: string;
    teamCode: string;
    matchId: string;
    isComplete: boolean;
    matchConfidence: string;
    totalScore: number;
    categoryTotals: {
      scoring: number;
      create: number;
      evade: number;
      base: number;
      defence: number;
      negative: number;
    };
    categories: Record<string, Array<{
      statName: string;
      displayName: string;
      rawValue: number;
      pointsPerUnit: number;
      contribution: number;
    }>>;
    validationWarnings: Array<{
      type: string;
      message: string;
      primaryValue: number | null;
      supplementaryValue: number | null;
    }>;
  }>;
}

export async function getSupercoachScores(
  year: number,
  round: number,
  teamCode?: string
): Promise<SupercoachScoreResponse> {
  const params = teamCode ? `?teamCode=${teamCode}` : '';
  return fetchApi<SupercoachScoreResponse>(`/supercoach/${year}/${round}${params}`);
}

export interface ScrapeSupplementaryResult {
  year: number;
  round: number;
  playersScraped: number;
  matched: number;
  unmatched: number;
  cached: boolean;
  warnings: Array<{ type: string; message: string }>;
}

export async function scrapeSupercoachStats(
  year: number,
  round: number,
  force = false
): Promise<ScrapeSupplementaryResult> {
  return fetchApi<ScrapeSupplementaryResult>('/scrape/supercoach', {
    method: 'POST',
    body: JSON.stringify({ year, round, force }),
  });
}

export interface StatContribution {
  statName: string;
  displayName: string;
  rawValue: number;
  pointsPerUnit: number;
  contribution: number;
}

export interface PlayerMatchSupercoach {
  // Identity fields (same as SupercoachScore)
  playerId: string;
  playerName: string;
  teamCode: string;
  matchId: string;
  year: number;
  round: number;
  // Context
  opponent: string;
  // Score
  totalScore: number;
  isComplete: boolean;
  matchConfidence: string;
  categories: {
    scoring: StatContribution[];
    create: StatContribution[];
    evade: StatContribution[];
    base: StatContribution[];
    defence: StatContribution[];
    negative: StatContribution[];
  };
  categoryTotals: {
    scoring: number;
    create: number;
    evade: number;
    base: number;
    defence: number;
    negative: number;
  };
  validationWarnings: Array<{
    type: string;
    message: string;
    primaryValue: number | null;
    supplementaryValue: number | null;
  }>;
}

export interface PlayerSeasonSupercoachResponse {
  playerId: string;
  playerName: string;
  teamCode: string;
  year: number;
  matches: PlayerMatchSupercoach[];
  seasonTotal: number;
  seasonAverage: number;
  matchesPlayed: number;
}

// Casualty Ward API

export interface CasualtyWardEntry {
  id: number;
  firstName: string;
  lastName: string;
  playerName: string;
  teamCode: string;
  injury: string;
  expectedReturn: string;
  startDate: string;
  endDate: string | null;
  playerId: string | null;
}

export interface CasualtyWardResponse {
  entries: CasualtyWardEntry[];
  count: number;
}

export interface PlayerInjuryHistoryResponse {
  playerId: string;
  entries: CasualtyWardEntry[];
}

export async function getCasualtyWard(): Promise<CasualtyWardResponse> {
  return fetchApi<CasualtyWardResponse>('/casualty-ward');
}

export async function getPlayerInjuryHistory(
  playerId: string
): Promise<PlayerInjuryHistoryResponse> {
  return fetchApi<PlayerInjuryHistoryResponse>(`/casualty-ward/player/${encodeURIComponent(playerId)}`);
}

export async function getPlayerSupercoachSeason(
  year: number,
  playerId: string
): Promise<PlayerSeasonSupercoachResponse> {
  return fetchApi<PlayerSeasonSupercoachResponse>(`/supercoach/${year}/player/${encodeURIComponent(playerId)}`);
}

export type SpikeBand = 'negative' | 'nil' | 'low' | 'moderate' | 'high' | 'boom';

export interface SpikeBandEntry {
  count: number;
  frequency: number; // fraction 0–1
}

export type SpikeDistribution = Record<SpikeBand, SpikeBandEntry>;

export interface GameProjectionEntry {
  round: number;
  totalScore: number;
  floorScore: number;
  spikeScore: number;
  minutesPlayed: number;
}

/** Response from GET /api/supercoach/:year/player/:playerId/projection */
export interface PlayerProjectionResponse {
  playerId: string;
  playerName: string;
  teamCode: string;
  position: string;
  avgMinutes: number;
  floorMean: number;
  floorStd: number | null;
  floorCv: number | null;
  floorPerMinute: number;
  spikeMean: number;
  spikeStd: number | null;
  spikeCv: number | null;
  spikePerMinute: number;
  spikeP25: number;
  spikeP50: number;
  spikeP75: number;
  spikeP90: number;
  spikeDistribution: SpikeDistribution;
  projectedTotal: number;
  projectedFloor: number;
  projectedCeiling: number;
  gamesPlayed: number;
  lowSampleWarning: boolean;
  noUsableData: boolean;
  games: GameProjectionEntry[];
}

export async function getPlayerSupercoachProjection(
  year: number,
  playerId: string
): Promise<PlayerProjectionResponse> {
  return fetchApi<PlayerProjectionResponse>(`/supercoach/${year}/player/${encodeURIComponent(playerId)}/projection`);
}

export interface ContextualProjectionValues {
  total: number;
  floor: number;
  ceiling: number;
}

/** Response from GET /api/supercoach/:year/player/:playerId/contextual-projection */
export interface ContextualProjectionResult {
  playerId: string;
  playerName: string;
  teamCode: string;
  position: string;
  year: number;
  baseProjection: ContextualProjectionValues;
  adjustedProjection: ContextualProjectionValues;
  adjustments: {
    opponent: {
      multiplier: number;
      confidence: number;
      sampleN: number;
      defenseFactor: number;
      defenseConfidence: number;
      h2hRpi: number;
      h2hConfidence: number;
    };
  };
}

export async function getContextualProjection(
  year: number,
  playerId: string,
  opponent: string
): Promise<ContextualProjectionResult> {
  return fetchApi<ContextualProjectionResult>(
    `/supercoach/${year}/player/${encodeURIComponent(playerId)}/contextual-projection?opponent=${encodeURIComponent(opponent)}`
  );
}
