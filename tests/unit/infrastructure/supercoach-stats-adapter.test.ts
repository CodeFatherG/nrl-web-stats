import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SuperCoachStatsAdapter } from '../../../src/infrastructure/adapters/supercoach-stats-adapter.js';
import type { Fixture } from '../../../src/models/fixture.js';
import type { Warning } from '../../../src/models/types.js';
import { MatchStatus } from '../../../src/domain/match.js';

// Mock fetcher and parser
vi.mock('../../../src/scraper/fetcher.js', () => ({
  fetchScheduleHtml: vi.fn(),
}));

vi.mock('../../../src/scraper/parser.js', () => ({
  parseScheduleHtml: vi.fn(),
}));

import { fetchScheduleHtml } from '../../../src/scraper/fetcher.js';
import { parseScheduleHtml } from '../../../src/scraper/parser.js';

const mockFetch = vi.mocked(fetchScheduleHtml);
const mockParse = vi.mocked(parseScheduleHtml);

function createTestFixture(overrides: Partial<Fixture> = {}): Fixture {
  return {
    id: '2026-BRO-1',
    year: 2026,
    round: 1,
    teamCode: 'BRO',
    opponentCode: 'MEL',
    isHome: true,
    isBye: false,
    strengthRating: 750,
    ...overrides,
  };
}

describe('SuperCoachStatsAdapter', () => {
  let adapter: SuperCoachStatsAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new SuperCoachStatsAdapter();
  });

  it('returns Match aggregates from paired fixtures', async () => {
    const homeFixture = createTestFixture({
      id: '2026-BRO-1',
      teamCode: 'BRO',
      opponentCode: 'MEL',
      isHome: true,
      strengthRating: 750,
    });
    const awayFixture = createTestFixture({
      id: '2026-MEL-1',
      teamCode: 'MEL',
      opponentCode: 'BRO',
      isHome: false,
      strengthRating: 850,
    });

    mockFetch.mockResolvedValue('<html></html>');
    mockParse.mockReturnValue({
      fixtures: [homeFixture, awayFixture],
      warnings: [],
      teamCount: 2,
    });

    const result = await adapter.fetchDraw(2026);

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data).toHaveLength(1);
    const match = result.data[0];
    expect(match.year).toBe(2026);
    expect(match.round).toBe(1);
    expect(match.homeTeamCode).toBe('BRO');
    expect(match.awayTeamCode).toBe('MEL');
    expect(match.homeStrengthRating).toBe(750);
    expect(match.awayStrengthRating).toBe(850);
    expect(match.status).toBe(MatchStatus.Scheduled);
    expect(match.homeScore).toBeNull();
    expect(match.awayScore).toBeNull();
  });

  it('generates deterministic match IDs with sorted team codes', async () => {
    const fixture1 = createTestFixture({
      id: '2026-SYD-1',
      teamCode: 'SYD',
      opponentCode: 'BRO',
      isHome: true,
      strengthRating: 600,
    });
    const fixture2 = createTestFixture({
      id: '2026-BRO-1',
      teamCode: 'BRO',
      opponentCode: 'SYD',
      isHome: false,
      strengthRating: 700,
    });

    mockFetch.mockResolvedValue('<html></html>');
    mockParse.mockReturnValue({ fixtures: [fixture1, fixture2], warnings: [], teamCount: 2 });

    const result = await adapter.fetchDraw(2026);
    expect(result.success).toBe(true);
    if (!result.success) return;

    // ID should have teams sorted: BRO before SYD
    expect(result.data[0].id).toBe('2026-R1-BRO-SYD');
  });

  it('excludes bye fixtures from match results', async () => {
    const byeFixture = createTestFixture({
      id: '2026-BRO-5',
      round: 5,
      teamCode: 'BRO',
      opponentCode: null,
      isHome: false,
      isBye: true,
      strengthRating: -500,
    });
    const homeFixture = createTestFixture({
      id: '2026-MEL-5',
      round: 5,
      teamCode: 'MEL',
      opponentCode: 'SYD',
      isHome: true,
      strengthRating: 800,
    });
    const awayFixture = createTestFixture({
      id: '2026-SYD-5',
      round: 5,
      teamCode: 'SYD',
      opponentCode: 'MEL',
      isHome: false,
      strengthRating: 700,
    });

    mockFetch.mockResolvedValue('<html></html>');
    mockParse.mockReturnValue({
      fixtures: [byeFixture, homeFixture, awayFixture],
      warnings: [],
      teamCount: 3,
    });

    const result = await adapter.fetchDraw(2026);
    expect(result.success).toBe(true);
    if (!result.success) return;

    // Only one match (MEL vs SYD), bye excluded
    expect(result.data).toHaveLength(1);
    expect(result.data[0].homeTeamCode).toBe('MEL');
    expect(result.data[0].awayTeamCode).toBe('SYD');
  });

  it('produces warnings for unpaired fixtures', async () => {
    const unpairedFixture = createTestFixture({
      id: '2026-BRO-1',
      teamCode: 'BRO',
      opponentCode: 'MEL',
      isHome: true,
      strengthRating: 750,
    });
    // No matching MEL fixture

    mockFetch.mockResolvedValue('<html></html>');
    mockParse.mockReturnValue({ fixtures: [unpairedFixture], warnings: [], teamCount: 1 });

    const result = await adapter.fetchDraw(2026);
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data).toHaveLength(0);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].type).toBe('UNPAIRED_FIXTURE');
    expect(result.warnings[0].message).toContain('BRO');
  });

  it('carries through parser warnings', async () => {
    const parserWarning: Warning = {
      type: 'MALFORMED_CELL',
      message: 'Could not parse cell',
      context: { row: 1, col: 3, content: '???' },
    };

    mockFetch.mockResolvedValue('<html></html>');
    mockParse.mockReturnValue({ fixtures: [], warnings: [parserWarning], teamCount: 0 });

    const result = await adapter.fetchDraw(2026);
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.warnings).toContainEqual(parserWarning);
  });

  it('returns failure on ScrapeError', async () => {
    mockFetch.mockRejectedValue(new Error('Failed to fetch schedule data: HTTP 500'));

    const result = await adapter.fetchDraw(2026);
    expect(result.success).toBe(false);
    if (result.success) return;

    expect(result.error).toContain('HTTP 500');
  });

  it('handles multiple rounds correctly', async () => {
    const fixtures: Fixture[] = [
      createTestFixture({ id: '2026-BRO-1', round: 1, teamCode: 'BRO', opponentCode: 'MEL', isHome: true, strengthRating: 750 }),
      createTestFixture({ id: '2026-MEL-1', round: 1, teamCode: 'MEL', opponentCode: 'BRO', isHome: false, strengthRating: 850 }),
      createTestFixture({ id: '2026-SYD-2', round: 2, teamCode: 'SYD', opponentCode: 'PAR', isHome: true, strengthRating: 600 }),
      createTestFixture({ id: '2026-PAR-2', round: 2, teamCode: 'PAR', opponentCode: 'SYD', isHome: false, strengthRating: 500 }),
    ];

    mockFetch.mockResolvedValue('<html></html>');
    mockParse.mockReturnValue({ fixtures, warnings: [], teamCount: 4 });

    const result = await adapter.fetchDraw(2026);
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data).toHaveLength(2);
    const rounds = result.data.map((m) => m.round).sort();
    expect(rounds).toEqual([1, 2]);
  });
});
