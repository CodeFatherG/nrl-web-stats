import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NrlComMatchResultAdapter, resolveNrlComTeamId } from '../../src/infrastructure/adapters/nrl-com-match-result-adapter.js';
import { MatchStatus } from '../../src/domain/match.js';
import * as fs from 'fs';
import * as path from 'path';

const fixturesDir = path.join(__dirname, '../fixtures/nrl-com');

function loadFixture(name: string): unknown {
  return JSON.parse(fs.readFileSync(path.join(fixturesDir, name), 'utf-8'));
}

function mockFetchResponse(data: unknown, status = 200): void {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Server Error',
    json: () => Promise.resolve(data),
  }));
}

describe('NrlComMatchResultAdapter', () => {
  let adapter: NrlComMatchResultAdapter;

  beforeEach(() => {
    adapter = new NrlComMatchResultAdapter();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =============================================
  // T008: Parsing completed round fixture
  // =============================================
  describe('completed round parsing (T008)', () => {
    it('parses all 8 completed matches from round-completed.json', async () => {
      const fixtureData = loadFixture('round-completed.json');
      mockFetchResponse(fixtureData);

      const result = await adapter.fetchResults(2025, 1);

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data).toHaveLength(8);
      // All should be Completed
      for (const match of result.data) {
        expect(match.status).toBe(MatchStatus.Completed);
      }
    });

    it('extracts correct scores for Raiders v Warriors', async () => {
      const fixtureData = loadFixture('round-completed.json');
      mockFetchResponse(fixtureData);

      const result = await adapter.fetchResults(2025, 1);
      if (!result.success) throw new Error('Expected success');

      // Raiders (CBR, home) 30 v Warriors (NZL, away) 8
      // matchId: 2025-R1-CBR-NZL (alphabetically sorted)
      const match = result.data.find(m => m.matchId === '2025-R1-CBR-NZL');
      expect(match).toBeDefined();
      expect(match!.homeScore).toBe(30);
      expect(match!.awayScore).toBe(8);
      expect(match!.homeTeamCode).toBe('CBR');
      expect(match!.awayTeamCode).toBe('NZL');
    });

    it('extracts correct scores for Roosters v Broncos', async () => {
      const fixtureData = loadFixture('round-completed.json');
      mockFetchResponse(fixtureData);

      const result = await adapter.fetchResults(2025, 1);
      if (!result.success) throw new Error('Expected success');

      // Roosters (SYD, home) 14 v Broncos (BRO, away) 50
      // matchId: 2025-R1-BRO-SYD (alphabetically sorted)
      const match = result.data.find(m => m.matchId === '2025-R1-BRO-SYD');
      expect(match).toBeDefined();
      expect(match!.homeScore).toBe(14);
      expect(match!.awayScore).toBe(50);
    });

    it('populates scheduledTime from kickOffTimeLong', async () => {
      const fixtureData = loadFixture('round-completed.json');
      mockFetchResponse(fixtureData);

      const result = await adapter.fetchResults(2025, 1);
      if (!result.success) throw new Error('Expected success');

      const match = result.data.find(m => m.matchId === '2025-R1-CBR-NZL');
      expect(match!.scheduledTime).toBe('2025-03-02T00:00:00Z');
    });

    it('generates correct deterministic matchIds', async () => {
      const fixtureData = loadFixture('round-completed.json');
      mockFetchResponse(fixtureData);

      const result = await adapter.fetchResults(2025, 1);
      if (!result.success) throw new Error('Expected success');

      const expectedIds = [
        '2025-R1-CBR-NZL',   // Raiders v Warriors
        '2025-R1-PTH-SHA',   // Panthers v Sharks
        '2025-R1-BRO-SYD',   // Roosters v Broncos
        '2025-R1-NEW-WST',   // Wests Tigers v Knights
        '2025-R1-DOL-STH',   // Rabbitohs v Dolphins
        '2025-R1-BUL-STG',   // Dragons v Bulldogs
        '2025-R1-MNL-NQC',   // Sea Eagles v Cowboys
        '2025-R1-MEL-PAR',   // Storm v Eels
      ];

      const actualIds = result.data.map(m => m.matchId).sort();
      expect(actualIds).toEqual(expectedIds.sort());
    });
  });

  // =============================================
  // T009: Team identity mapping
  // =============================================
  describe('team identity mapping (T009)', () => {
    it('maps all 17 nrl.com teamIds to correct canonical codes', () => {
      const expectedMappings: [number, string][] = [
        [500011, 'BRO'],
        [500010, 'BUL'],
        [500013, 'CBR'],
        [500723, 'DOL'],
        [500004, 'GCT'],
        [500021, 'MEL'],
        [500002, 'MNL'],
        [500003, 'NEW'],
        [500012, 'NQC'],
        [500032, 'NZL'],
        [500031, 'PAR'],
        [500014, 'PTH'],
        [500028, 'SHA'],
        [500022, 'STG'],
        [500005, 'STH'],
        [500001, 'SYD'],
        [500023, 'WST'],
      ];

      for (const [teamId, expectedCode] of expectedMappings) {
        expect(resolveNrlComTeamId(teamId)).toBe(expectedCode);
      }
    });

    it('returns null for unknown teamId', () => {
      expect(resolveNrlComTeamId(999999)).toBeNull();
    });

    it('produces a warning (not an error) for unknown teamId in fixture', async () => {
      const fixtureData = {
        fixtures: [
          {
            type: 'Match',
            matchMode: 'Post',
            matchState: 'FullTime',
            roundTitle: 'Round 1',
            homeTeam: { teamId: 999999, nickName: 'Unknown', score: 10, theme: { key: 'unknown' } },
            awayTeam: { teamId: 500001, nickName: 'Roosters', score: 20, theme: { key: 'roosters' } },
            clock: { kickOffTimeLong: '2025-03-02T00:00:00Z', gameTime: '80:00' },
          },
        ],
      };
      mockFetchResponse(fixtureData);

      const result = await adapter.fetchResults(2025, 1);

      // Should succeed (not fail) but with warnings
      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data).toHaveLength(0); // Skipped due to unmapped team
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].type).toBe('UNMAPPED_TEAM');
      expect(result.warnings[0].message).toContain('999999');
    });
  });

  // =============================================
  // T010: Handling upcoming matches
  // =============================================
  describe('upcoming matches handling (T010)', () => {
    it('parses upcoming matches with Scheduled status', async () => {
      const fixtureData = loadFixture('round-upcoming.json');
      mockFetchResponse(fixtureData);

      const result = await adapter.fetchResults(2026, 15);

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data).toHaveLength(5);
      for (const match of result.data) {
        expect(match.status).toBe(MatchStatus.Scheduled);
      }
    });

    it('sets scores to 0 for upcoming matches', async () => {
      const fixtureData = loadFixture('round-upcoming.json');
      mockFetchResponse(fixtureData);

      const result = await adapter.fetchResults(2026, 15);
      if (!result.success) throw new Error('Expected success');

      for (const match of result.data) {
        expect(match.homeScore).toBe(0);
        expect(match.awayScore).toBe(0);
      }
    });

    it('populates scheduledTime for upcoming matches', async () => {
      const fixtureData = loadFixture('round-upcoming.json');
      mockFetchResponse(fixtureData);

      const result = await adapter.fetchResults(2026, 15);
      if (!result.success) throw new Error('Expected success');

      // Rabbitohs v Broncos: 2026-06-11T09:50:00Z
      const match = result.data.find(m => m.matchId === '2026-R15-BRO-STH');
      expect(match).toBeDefined();
      expect(match!.scheduledTime).toBe('2026-06-11T09:50:00Z');
    });

    it('handles mixed round with both completed and upcoming', async () => {
      const fixtureData = loadFixture('round-mixed.json');
      mockFetchResponse(fixtureData);

      const result = await adapter.fetchResults(2025, 1);
      if (!result.success) throw new Error('Expected success');

      const completed = result.data.filter(m => m.status === MatchStatus.Completed);
      const scheduled = result.data.filter(m => m.status === MatchStatus.Scheduled);

      expect(completed.length).toBeGreaterThan(0);
      expect(scheduled.length).toBeGreaterThan(0);
      expect(completed.length + scheduled.length).toBe(result.data.length);
    });
  });

  // =============================================
  // Error handling
  // =============================================
  describe('error handling', () => {
    it('returns failure for HTTP error', async () => {
      mockFetchResponse({}, 500);

      const result = await adapter.fetchResults(2025, 1);

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error).toContain('500');
    });

    it('returns failure for invalid JSON structure', async () => {
      mockFetchResponse({ unexpected: 'shape' });

      const result = await adapter.fetchResults(2025, 1);

      expect(result.success).toBe(false);
    });
  });
});
