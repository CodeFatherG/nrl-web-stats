import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NrlComPlayerStatsAdapter } from '../../src/infrastructure/adapters/nrl-com-player-stats-adapter.js';
import * as fs from 'fs';
import * as path from 'path';

const fixturesDir = path.join(__dirname, '../fixtures');

function loadFixture(name: string): unknown {
  return JSON.parse(fs.readFileSync(path.join(fixturesDir, name), 'utf-8'));
}

/**
 * Mock fetch to return draw API response first, then match centre responses.
 * The draw fixture contains matchCentreUrls; each URL + "data" triggers a match centre fetch.
 */
function mockFetchSequence(responses: Array<{ data: unknown; status?: number }>): void {
  const mockFn = vi.fn();
  for (let i = 0; i < responses.length; i++) {
    const { data, status = 200 } = responses[i];
    mockFn.mockResolvedValueOnce({
      ok: status >= 200 && status < 300,
      status,
      statusText: status === 200 ? 'OK' : 'Error',
      json: () => Promise.resolve(data),
    });
  }
  vi.stubGlobal('fetch', mockFn);
}

describe('NrlComPlayerStatsAdapter', () => {
  let adapter: NrlComPlayerStatsAdapter;
  let drawFixture: unknown;
  let matchFixture: unknown;

  beforeEach(() => {
    adapter = new NrlComPlayerStatsAdapter();
    drawFixture = loadFixture('nrl-com-draw-round-1.json');
    matchFixture = loadFixture('nrl-com-match-raiders-v-warriors.json');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('successful fetch', () => {
    it('extracts correct player count (18 per team, 36 per match)', async () => {
      // Draw has 8 fixtures; provide same match fixture for all
      const responses = [
        { data: drawFixture },
        ...Array(8).fill({ data: matchFixture }),
      ];
      mockFetchSequence(responses);

      const result = await adapter.fetchPlayerStats(2025, 1);

      expect(result.success).toBe(true);
      if (!result.success) return;

      // 8 matches × 36 players = 288
      expect(result.data).toHaveLength(288);
    });

    it('maps field names correctly from nrl.com to domain', async () => {
      // Single-match draw fixture
      const singleDraw = {
        fixtures: [(drawFixture as { fixtures: unknown[] }).fixtures[0]],
      };
      mockFetchSequence([{ data: singleDraw }, { data: matchFixture }]);

      const result = await adapter.fetchPlayerStats(2025, 1);
      if (!result.success) throw new Error('Expected success');

      // Find a specific player from the fixture to verify mapping
      const match = matchFixture as {
        homeTeam: { players: Array<{ playerId: number; firstName: string; lastName: string; position: string }> };
        stats: { players: { homeTeam: Array<{ playerId: number; tries: number; conversions: number; penaltyGoals: number; tacklesMade: number; allRunMetres: number; fantasyPointsTotal: number }> } };
      };
      const rosterPlayer = match.homeTeam.players[0];
      const statsPlayer = match.stats.players.homeTeam.find(
        s => s.playerId === rosterPlayer.playerId
      )!;

      const mapped = result.data.find(p => p.playerId === String(rosterPlayer.playerId))!;
      expect(mapped).toBeDefined();

      // Identity fields
      expect(mapped.playerName).toBe(`${rosterPlayer.firstName} ${rosterPlayer.lastName}`);
      expect(mapped.position).toBe(rosterPlayer.position);
      expect(mapped.playerId).toBe(String(rosterPlayer.playerId));

      // Stat field mapping: conversions + penaltyGoals → goals
      expect(mapped.goals).toBe(statsPlayer.conversions + statsPlayer.penaltyGoals);
      // tacklesMade → tackles
      expect(mapped.tackles).toBe(statsPlayer.tacklesMade);
      // allRunMetres → runMetres
      expect(mapped.runMetres).toBe(statsPlayer.allRunMetres);
      // fantasyPointsTotal → fantasyPoints
      expect(mapped.fantasyPoints).toBe(statsPlayer.fantasyPointsTotal);
      // tries → tries (direct)
      expect(mapped.tries).toBe(statsPlayer.tries);
    });

    it('resolves team IDs via shared TEAM_ID_MAP', async () => {
      const singleDraw = {
        fixtures: [(drawFixture as { fixtures: unknown[] }).fixtures[0]],
      };
      mockFetchSequence([{ data: singleDraw }, { data: matchFixture }]);

      const result = await adapter.fetchPlayerStats(2025, 1);
      if (!result.success) throw new Error('Expected success');

      // Raiders = 500013 → CBR, Warriors = 500032 → NZL
      const teamCodes = new Set(result.data.map(p => p.teamCode));
      expect(teamCodes).toEqual(new Set(['CBR', 'NZL']));
    });

    it('derives isComplete from matchState === "FullTime"', async () => {
      const singleDraw = {
        fixtures: [(drawFixture as { fixtures: unknown[] }).fixtures[0]],
      };
      mockFetchSequence([{ data: singleDraw }, { data: matchFixture }]);

      const result = await adapter.fetchPlayerStats(2025, 1);
      if (!result.success) throw new Error('Expected success');

      // Our fixture has matchState "FullTime"
      for (const player of result.data) {
        expect(player.isComplete).toBe(true);
      }
    });

    it('sets isComplete false when matchState is not FullTime', async () => {
      const inProgressMatch = JSON.parse(JSON.stringify(matchFixture));
      inProgressMatch.matchState = 'FirstHalf';

      const singleDraw = {
        fixtures: [(drawFixture as { fixtures: unknown[] }).fixtures[0]],
      };
      mockFetchSequence([{ data: singleDraw }, { data: inProgressMatch }]);

      const result = await adapter.fetchPlayerStats(2025, 1);
      if (!result.success) throw new Error('Expected success');

      for (const player of result.data) {
        expect(player.isComplete).toBe(false);
      }
    });

    it('sets year and round from function parameters', async () => {
      const singleDraw = {
        fixtures: [(drawFixture as { fixtures: unknown[] }).fixtures[0]],
      };
      mockFetchSequence([{ data: singleDraw }, { data: matchFixture }]);

      const result = await adapter.fetchPlayerStats(2025, 1);
      if (!result.success) throw new Error('Expected success');

      for (const player of result.data) {
        expect(player.year).toBe(2025);
        expect(player.round).toBe(1);
      }
    });

    it('sets dateOfBirth to null (not available from nrl.com)', async () => {
      const singleDraw = {
        fixtures: [(drawFixture as { fixtures: unknown[] }).fixtures[0]],
      };
      mockFetchSequence([{ data: singleDraw }, { data: matchFixture }]);

      const result = await adapter.fetchPlayerStats(2025, 1);
      if (!result.success) throw new Error('Expected success');

      for (const player of result.data) {
        expect(player.dateOfBirth).toBeNull();
      }
    });

    it('sets matchId from match centre response', async () => {
      const singleDraw = {
        fixtures: [(drawFixture as { fixtures: unknown[] }).fixtures[0]],
      };
      mockFetchSequence([{ data: singleDraw }, { data: matchFixture }]);

      const result = await adapter.fetchPlayerStats(2025, 1);
      if (!result.success) throw new Error('Expected success');

      // matchId from fixture is 20251110110
      for (const player of result.data) {
        expect(player.matchId).toBe('20251110110');
      }
    });
  });

  describe('error handling', () => {
    it('returns failure when draw API returns non-200', async () => {
      mockFetchSequence([{ data: {}, status: 500 }]);

      const result = await adapter.fetchPlayerStats(2025, 1);

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error).toContain('HTTP 500');
    });

    it('returns failure when draw response fails Zod validation', async () => {
      mockFetchSequence([{ data: { invalid: true } }]);

      const result = await adapter.fetchPlayerStats(2025, 1);

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error).toContain('validation failed');
    });

    it('returns success with warnings when a match centre fetch fails', async () => {
      const singleDraw = {
        fixtures: [(drawFixture as { fixtures: unknown[] }).fixtures[0]],
      };
      mockFetchSequence([
        { data: singleDraw },
        { data: {}, status: 500 },
      ]);

      const result = await adapter.fetchPlayerStats(2025, 1);

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data).toHaveLength(0);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0].type).toBe('MATCH_FETCH_FAILED');
    });

    it('warns about unmapped team IDs', async () => {
      const unknownTeamMatch = JSON.parse(JSON.stringify(matchFixture));
      unknownTeamMatch.homeTeam.teamId = 999999;

      const singleDraw = {
        fixtures: [(drawFixture as { fixtures: unknown[] }).fixtures[0]],
      };
      mockFetchSequence([{ data: singleDraw }, { data: unknownTeamMatch }]);

      const result = await adapter.fetchPlayerStats(2025, 1);

      expect(result.success).toBe(true);
      if (!result.success) return;
      // Only away team players (18) should be returned since home team is unmapped
      expect(result.data).toHaveLength(18);
      expect(result.warnings.some(w => w.type === 'UNMAPPED_TEAM')).toBe(true);
    });

    it('returns empty array when no match fixtures exist (all byes)', async () => {
      const byeOnlyDraw = {
        fixtures: [{ type: 'Bye' }],
      };
      mockFetchSequence([{ data: byeOnlyDraw }]);

      const result = await adapter.fetchPlayerStats(2025, 1);

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data).toHaveLength(0);
    });
  });
});
