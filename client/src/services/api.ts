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
  PlayerMovementsResponse,
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

// Spec 039 — the rankings endpoints now return an availability envelope on
// cold-start / watermark-mismatch. Existing consumers that read fields via
// optional chaining (e.g. `data?.thresholds`) continue to work — the union
// type narrows naturally because the precompute-pending branch has neither
// `thresholds` nor `rankings`.
// `thresholds` / `rankings` declared as optional `never` on the pending
// branch so consumers can keep using optional-chaining (`data?.thresholds`)
// without a type guard — TS narrows to `undefined` on the pending branch.
type RankingsPending = {
  available: false;
  asOfRound: null;
  reason: string;
  thresholds?: never;
  rankings?: never;
  ranking?: never;
};

export async function getTeamSeasonRanking(
  year: number,
  teamCode: string
): Promise<TeamSeasonRankingResponse | RankingsPending> {
  return fetchApi<TeamSeasonRankingResponse | RankingsPending>(
    `/rankings/${year}/${teamCode}`,
  );
}

export async function getAllTeamsRanking(
  year: number
): Promise<AllTeamsRankingResponse | RankingsPending> {
  return fetchApi<AllTeamsRankingResponse | RankingsPending>(`/rankings/${year}`);
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
// Spec 037 — discriminated wire envelope for the four analytics endpoints.
// Hit: { available: true, asOfRound, data }. Miss: { available: false, ... }.
// Clients MUST branch on `available` before reading `data` / `asOfRound`.
export type AvailabilityEnvelope<T> =
  | { available: true; asOfRound: number; data: T }
  | { available: false; asOfRound: null; reason: string };

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
): Promise<AvailabilityEnvelope<FormTrajectoryResponse>> {
  const params = window ? `?window=${window}` : '';
  return fetchApi<AvailabilityEnvelope<FormTrajectoryResponse>>(`/analytics/form/${year}/${teamCode}${params}`);
}

export async function getPlayerTrends(
  year: number,
  teamCode: string,
  window?: number,
  significantOnly?: boolean
): Promise<AvailabilityEnvelope<PlayerTrendsResponse>> {
  const searchParams = new URLSearchParams();
  if (window) searchParams.set('window', String(window));
  if (significantOnly) searchParams.set('significantOnly', 'true');
  const qs = searchParams.toString();
  return fetchApi<AvailabilityEnvelope<PlayerTrendsResponse>>(`/analytics/trends/${year}/${teamCode}${qs ? `?${qs}` : ''}`);
}

export async function getMatchOutlook(
  year: number,
  round: number,
  window?: number
): Promise<AvailabilityEnvelope<MatchOutlookResponse>> {
  const params = window ? `?window=${window}` : '';
  return fetchApi<AvailabilityEnvelope<MatchOutlookResponse>>(`/analytics/outlook/${year}/${round}${params}`);
}

export async function getCompositionImpact(
  year: number,
  teamCode: string
): Promise<AvailabilityEnvelope<CompositionImpactResponse>> {
  return fetchApi<AvailabilityEnvelope<CompositionImpactResponse>>(`/analytics/composition/${year}/${teamCode}`);
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

export interface SupercoachPlayerScore {
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
}

export interface SupercoachTeamGroup {
  teamCode: string;
  teamName: string;
  teamTotal: number;
  isComplete: boolean;
  players: SupercoachPlayerScore[];
}

export interface SupercoachMatchResult {
  matchId: string;
  year: number;
  round: number;
  isComplete: boolean;
  homeTeam: SupercoachTeamGroup;
  awayTeam: SupercoachTeamGroup;
}

export interface SupercoachScoreResponse {
  year: number;
  round: number;
  isComplete: boolean;
  matchCount: number;
  matches: SupercoachMatchResult[];
}

export async function getSupercoachScores(
  year: number,
  round: number,
): Promise<SupercoachScoreResponse> {
  return fetchApi<SupercoachScoreResponse>(`/supercoach/${year}/${round}`);
}

export interface MatchSupercoachPlayerScore {
  playerId: string;
  playerName: string;
  teamCode: string;
  totalScore: number;
  isComplete: boolean;
  categoryTotals: {
    scoring: number;
    create: number;
    evade: number;
    base: number;
    defence: number;
    negative: number;
  };
}

export interface MatchSupercoachTeamGroup {
  teamCode: string;
  teamName: string;
  isComplete: boolean;
  teamTotal: number;
  players: MatchSupercoachPlayerScore[];
}

export interface MatchSupercoachResponse {
  matchId: string;
  year: number;
  round: number;
  isComplete: boolean;
  homeTeam: MatchSupercoachTeamGroup;
  awayTeam: MatchSupercoachTeamGroup;
}

export async function getMatchSupercoach(
  year: number,
  matchId: string
): Promise<MatchSupercoachResponse> {
  return fetchApi<MatchSupercoachResponse>(`/supercoach/${year}/match/${encodeURIComponent(matchId)}`);
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
  currentPrice: number | null;
  currentBreakeven: number | null;
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
  gamesMissed: number | null;
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
    venue?: {
      multiplier: number;
      confidence: number;
      sampleN: number;
      stadiumId: string;
    };
  };
}

export async function getContextualProjection(
  year: number,
  playerId: string,
  opponent: string,
  venue?: string,
): Promise<ContextualProjectionResult> {
  const params = new URLSearchParams({ opponent });
  if (venue) params.set('venue', venue);
  return fetchApi<ContextualProjectionResult>(
    `/supercoach/${year}/player/${encodeURIComponent(playerId)}/contextual-projection?${params}`
  );
}

export async function getPlayerMovements(season: number): Promise<PlayerMovementsResponse> {
  return fetchApi<PlayerMovementsResponse>(`/player-movements?season=${season}`);
}

// ─── Game Strength Rating ─────────────────────────────────────────────────────

export interface GSRCategoryStrength {
  category: string;
  label: string;
  weightedAvgScored: number;
  weightedAvgAllowed: number;
  combinedStrength: number;
  leagueWeight: number;
}

export interface GSRTeamRating {
  teamCode: string;
  opponentCode: string;
  weightedAvgScored: number;
  weightedAvgAllowed: number;
  overallGSR: number;
  normalizedOverallGSR: number;
  categoricalGSR: number;
  normalizedCategoricalGSR: number;
  categoryStrengths: GSRCategoryStrength[];
  teamSamplesUsed: number;
  opponentSamplesUsed: number;
  sampleSizeWarning: boolean;
}

export interface GSRMatch {
  matchId: string;
  year: number;
  round: number;
  homeTeam: GSRTeamRating;
  awayTeam: GSRTeamRating;
}

export interface GSRPayload {
  year: number;
  round: number;
  leagueAvgTeamScore: number;
  matches: GSRMatch[];
  methodology: {
    halfLifeRounds: number;
    offenseWeight: number;
    minRoundsForReliability: number;
    categoryWeightingMethod: string;
  };
}

/**
 * Server response for the GSR endpoint. Either the rating payload (locked
 * or provisional — the wire shape is identical), or `{ available: false }`
 * when no precomputed artifact exists yet for the requested `(year, round)`.
 * The `available: false` branch is reachable only for default-half-life
 * requests; custom half-life always computes on demand.
 *
 * Discriminate at the call site by checking for the `available` property:
 *   if ('available' in data) { ... }  // miss
 *   else                       { ... } // hit — data is GSRPayload
 */
export type GSRResponse = GSRPayload | { available: false };

export async function getGameStrengthRatings(year: number, round: number): Promise<GSRResponse> {
  return fetchApi<GSRResponse>(`/supercoach/${year}/game-strength/${round}`);
}

/** Narrow a `GSRResponse` to a `GSRPayload` (the happy path). */
export function isGSRAvailable(r: GSRResponse): r is GSRPayload {
  return !('available' in r);
}
