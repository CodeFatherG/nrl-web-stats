import type {
  Team,
  TeamsResponse,
  TeamScheduleResponse,
  ScheduleFixture,
  RoundResponse,
  RoundMatch,
  HealthResponse,
  StrengthThresholds,
} from '../../types';

// Mock Teams
export const mockTeams: Team[] = [
  { code: 'BRI', name: 'Brisbane Broncos' },
  { code: 'CAN', name: 'Canberra Raiders' },
  { code: 'CBY', name: 'Canterbury-Bankstown Bulldogs' },
  { code: 'CRO', name: 'Cronulla-Sutherland Sharks' },
  { code: 'DOL', name: 'Dolphins' },
  { code: 'GLD', name: 'Gold Coast Titans' },
  { code: 'MAN', name: 'Manly-Warringah Sea Eagles' },
  { code: 'MEL', name: 'Melbourne Storm' },
  { code: 'NEW', name: 'Newcastle Knights' },
  { code: 'NZL', name: 'New Zealand Warriors' },
  { code: 'NTH', name: 'North Queensland Cowboys' },
  { code: 'PAR', name: 'Parramatta Eels' },
  { code: 'PEN', name: 'Penrith Panthers' },
  { code: 'SGI', name: 'St George Illawarra Dragons' },
  { code: 'SOU', name: 'South Sydney Rabbitohs' },
  { code: 'SYD', name: 'Sydney Roosters' },
  { code: 'WST', name: 'Wests Tigers' },
];

export const mockTeamsResponse: TeamsResponse = {
  teams: mockTeams,
};

// Mock Schedule Fixtures (Brisbane Broncos sample schedule)
export const mockScheduleFixtures: ScheduleFixture[] = [
  { round: 1, year: 2026, opponent: 'SYD', isHome: true, isBye: false, strengthRating: 420 },
  { round: 2, year: 2026, opponent: 'MEL', isHome: false, isBye: false, strengthRating: 480 },
  { round: 3, year: 2026, opponent: 'PEN', isHome: true, isBye: false, strengthRating: 450 },
  { round: 4, year: 2026, opponent: 'CAN', isHome: false, isBye: false, strengthRating: 320 },
  { round: 5, year: 2026, opponent: null, isHome: false, isBye: true, strengthRating: 0 },
  { round: 6, year: 2026, opponent: 'DOL', isHome: true, isBye: false, strengthRating: 350 },
  { round: 7, year: 2026, opponent: 'WST', isHome: false, isBye: false, strengthRating: 280 },
  { round: 8, year: 2026, opponent: 'GLD', isHome: true, isBye: false, strengthRating: 310 },
  { round: 9, year: 2026, opponent: 'NTH', isHome: false, isBye: false, strengthRating: 380 },
  { round: 10, year: 2026, opponent: 'PAR', isHome: true, isBye: false, strengthRating: 340 },
];

export const mockTeamScheduleResponse: TeamScheduleResponse = {
  team: { code: 'BRI', name: 'Brisbane Broncos' },
  schedule: mockScheduleFixtures,
  totalStrength: 3330,
  byeRounds: [5],
};

// Mock Round Data
export const mockRoundMatches: RoundMatch[] = [
  { homeTeam: 'BRI', awayTeam: 'SYD', homeStrength: 420, awayStrength: 380 },
  { homeTeam: 'MEL', awayTeam: 'PEN', homeStrength: 480, awayStrength: 450 },
  { homeTeam: 'CAN', awayTeam: 'PAR', homeStrength: 320, awayStrength: 340 },
  { homeTeam: 'CRO', awayTeam: 'SGI', homeStrength: 360, awayStrength: 330 },
  { homeTeam: 'MAN', awayTeam: 'NEW', homeStrength: 350, awayStrength: 310 },
  { homeTeam: 'NZL', awayTeam: 'SOU', homeStrength: 300, awayStrength: 370 },
  { homeTeam: 'NTH', awayTeam: 'GLD', homeStrength: 380, awayStrength: 290 },
];

export const mockRoundResponse: RoundResponse = {
  year: 2026,
  round: 1,
  matches: mockRoundMatches,
  byeTeams: ['DOL', 'CBY', 'WST'],
};

// Mock Health Response
export const mockHealthResponse: HealthResponse = {
  status: 'ok',
  loadedYears: [2026],
  totalFixtures: 459,
};

export const mockHealthResponseNoData: HealthResponse = {
  status: 'ok',
  loadedYears: [],
  totalFixtures: 0,
};

// Mock Strength Thresholds (based on percentiles)
export const mockStrengthThresholds: StrengthThresholds = {
  p33: 320,
  p67: 400,
};

// Helper to get team name from code
export function getTeamName(code: string): string {
  const team = mockTeams.find((t) => t.code === code);
  return team?.name ?? code;
}
