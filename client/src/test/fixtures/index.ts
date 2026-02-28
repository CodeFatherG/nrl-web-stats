import type {
  Team,
  TeamsResponse,
  TeamScheduleResponse,
  ScheduleFixture,
  RoundResponse,
  RoundMatch,
  HealthResponse,
  StrengthThresholds,
  SeasonSummaryResponse,
  CompactRound,
  ByeGridData,
  SignificantByeRound,
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
  { round: 1, year: 2026, opponent: 'SYD', isHome: true, isBye: false, strengthRating: 420, category: 'easy' },
  { round: 2, year: 2026, opponent: 'MEL', isHome: false, isBye: false, strengthRating: 480, category: 'easy' },
  { round: 3, year: 2026, opponent: 'PEN', isHome: true, isBye: false, strengthRating: 450, category: 'easy' },
  { round: 4, year: 2026, opponent: 'CAN', isHome: false, isBye: false, strengthRating: 320, category: 'hard' },
  { round: 5, year: 2026, opponent: null, isHome: false, isBye: true, strengthRating: 0, category: 'hard' },
  { round: 6, year: 2026, opponent: 'DOL', isHome: true, isBye: false, strengthRating: 350, category: 'medium' },
  { round: 7, year: 2026, opponent: 'WST', isHome: false, isBye: false, strengthRating: 280, category: 'hard' },
  { round: 8, year: 2026, opponent: 'GLD', isHome: true, isBye: false, strengthRating: 310, category: 'hard' },
  { round: 9, year: 2026, opponent: 'NTH', isHome: false, isBye: false, strengthRating: 380, category: 'medium' },
  { round: 10, year: 2026, opponent: 'PAR', isHome: true, isBye: false, strengthRating: 340, category: 'medium' },
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

// Mock Season Summary for Bye Overview tests
export const mockCompactRounds: CompactRound[] = [
  { round: 1, matches: [], byeTeams: [] },
  { round: 2, matches: [], byeTeams: [] },
  { round: 3, matches: [], byeTeams: [] },
  { round: 4, matches: [], byeTeams: [] },
  { round: 5, matches: [], byeTeams: ['BRI', 'CAN'] },
  { round: 6, matches: [], byeTeams: ['CBY', 'CRO'] },
  { round: 7, matches: [], byeTeams: ['DOL', 'GLD'] },
  { round: 8, matches: [], byeTeams: ['MAN', 'MEL'] },
  { round: 9, matches: [], byeTeams: ['NEW', 'NZL'] },
  { round: 10, matches: [], byeTeams: ['NTH', 'PAR'] },
  { round: 11, matches: [], byeTeams: ['PEN', 'SGI'] },
  { round: 12, matches: [], byeTeams: ['SOU', 'SYD', 'WST'] },
  { round: 13, matches: [], byeTeams: [] },
  { round: 14, matches: [], byeTeams: [] },
  { round: 15, matches: [], byeTeams: [] },
  { round: 16, matches: [], byeTeams: [] },
  { round: 17, matches: [], byeTeams: [] },
  { round: 18, matches: [], byeTeams: [] },
  { round: 19, matches: [], byeTeams: [] },
  { round: 20, matches: [], byeTeams: [] },
  { round: 21, matches: [], byeTeams: [] },
  { round: 22, matches: [], byeTeams: [] },
  { round: 23, matches: [], byeTeams: [] },
  { round: 24, matches: [], byeTeams: [] },
  { round: 25, matches: [], byeTeams: [] },
  { round: 26, matches: [], byeTeams: [] },
  { round: 27, matches: [], byeTeams: [] },
];

export const mockSeasonSummaryResponse: SeasonSummaryResponse = {
  year: 2026,
  rounds: mockCompactRounds,
};

// Mock ByeGridData for component tests
export const mockByeGridData: ByeGridData = {
  teams: [...mockTeams].sort((a, b) => a.name.localeCompare(b.name)),
  rounds: Array.from({ length: 27 }, (_, i) => i + 1),
  byeMap: new Map([
    ['BRI', new Set([5])],
    ['CAN', new Set([5])],
    ['CBY', new Set([6])],
    ['CRO', new Set([6])],
    ['DOL', new Set([7])],
    ['GLD', new Set([7])],
    ['MAN', new Set([8])],
    ['MEL', new Set([8])],
    ['NEW', new Set([9])],
    ['NZL', new Set([9])],
    ['NTH', new Set([10])],
    ['PAR', new Set([10])],
    ['PEN', new Set([11])],
    ['SGI', new Set([11])],
    ['SOU', new Set([12])],
    ['SYD', new Set([12])],
    ['WST', new Set([12])],
  ]),
  byeCountByRound: new Map([
    [1, 0], [2, 0], [3, 0], [4, 0],
    [5, 2], [6, 2], [7, 2], [8, 2], [9, 2], [10, 2], [11, 2], [12, 3],
    [13, 0], [14, 0], [15, 0], [16, 0], [17, 0], [18, 0], [19, 0], [20, 0],
    [21, 0], [22, 0], [23, 0], [24, 0], [25, 0], [26, 0], [27, 0],
  ]),
  maxByeCount: 3,
  columnStrengths: new Map(),
  rowStrengths: new Map(),
};

// Mock Significant Bye Rounds for SignificantByeStats tests
// Only round 12 has >2 byes (SOU, SYD, WST = 3 teams)
export const mockSignificantByeRounds: SignificantByeRound[] = [
  {
    round: 12,
    affectedTeams: ['SOU', 'SYD', 'WST'],
    unaffectedTeams: ['BRI', 'CAN', 'CBY', 'CRO', 'DOL', 'GLD', 'MAN', 'MEL', 'NEW', 'NTH', 'NZL', 'PAR', 'PEN', 'SGI'],
  },
];

// Mock with multiple significant rounds for additional testing
export const mockMultipleSignificantByeRounds: SignificantByeRound[] = [
  {
    round: 5,
    affectedTeams: ['BRI', 'CAN', 'CBY'],
    unaffectedTeams: ['CRO', 'DOL', 'GLD', 'MAN', 'MEL', 'NEW', 'NTH', 'NZL', 'PAR', 'PEN', 'SGI', 'SOU', 'SYD', 'WST'],
  },
  {
    round: 12,
    affectedTeams: ['SOU', 'SYD', 'WST'],
    unaffectedTeams: ['BRI', 'CAN', 'CBY', 'CRO', 'DOL', 'GLD', 'MAN', 'MEL', 'NEW', 'NTH', 'NZL', 'PAR', 'PEN', 'SGI'],
  },
];

// Empty significant rounds for testing empty state
export const mockEmptySignificantByeRounds: SignificantByeRound[] = [];
