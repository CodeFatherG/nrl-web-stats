import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createTeamList,
  validateSquadMember,
  isStarter,
  isInterchange,
  isReserve,
} from '../../src/domain/team-list.js';
import type { SquadMember } from '../../src/domain/team-list.js';
import { NrlComTeamListAdapter } from '../../src/infrastructure/adapters/nrl-com-team-list-adapter.js';
import * as fs from 'fs';
import * as path from 'path';

const fixturesDir = path.join(__dirname, '../fixtures');

function loadFixture(name: string): unknown {
  return JSON.parse(fs.readFileSync(path.join(fixturesDir, name), 'utf-8'));
}

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

// ---------------------------------------------------------------------------
// Domain: TeamList and SquadMember validation
// ---------------------------------------------------------------------------

describe('TeamList domain', () => {
  const validMember: SquadMember = {
    jerseyNumber: 1,
    playerName: 'Reece Walsh',
    position: 'Fullback',
    playerId: 100001,
  };

  describe('validateSquadMember', () => {
    it('accepts valid member', () => {
      expect(() => validateSquadMember(validMember)).not.toThrow();
    });

    it('rejects jersey number below 1', () => {
      expect(() => validateSquadMember({ ...validMember, jerseyNumber: 0 })).toThrow('at least 1');
    });

    it('accepts jersey number above 17 (reserves)', () => {
      expect(() => validateSquadMember({ ...validMember, jerseyNumber: 22 })).not.toThrow();
    });

    it('rejects empty player name', () => {
      expect(() => validateSquadMember({ ...validMember, playerName: '' })).toThrow('non-empty');
    });

    it('rejects empty position', () => {
      expect(() => validateSquadMember({ ...validMember, position: '' })).toThrow('non-empty');
    });

    it('rejects non-positive player ID', () => {
      expect(() => validateSquadMember({ ...validMember, playerId: 0 })).toThrow('positive integer');
    });
  });

  describe('createTeamList', () => {
    const makeMembers = (count: number): SquadMember[] =>
      Array.from({ length: count }, (_, i) => ({
        jerseyNumber: i + 1,
        playerName: `Player ${i + 1}`,
        position: i < 13 ? 'Forward' : 'Interchange',
        playerId: 1000 + i,
      }));

    it('creates a valid team list with 17 members', () => {
      const teamList = createTeamList({
        matchId: '2026-R5-BRO-MEL',
        teamCode: 'BRO',
        year: 2026,
        round: 5,
        members: makeMembers(17),
        scrapedAt: '2026-03-31T06:00:00Z',
      });

      expect(teamList.matchId).toBe('2026-R5-BRO-MEL');
      expect(teamList.teamCode).toBe('BRO');
      expect(teamList.members).toHaveLength(17);
      expect(teamList.members[0].jerseyNumber).toBe(1);
      expect(teamList.members[16].jerseyNumber).toBe(17);
    });

    it('sorts members by jersey number', () => {
      const members = makeMembers(17).reverse();
      const teamList = createTeamList({
        matchId: '2026-R5-BRO-MEL',
        teamCode: 'BRO',
        year: 2026,
        round: 5,
        members,
        scrapedAt: '2026-03-31T06:00:00Z',
      });

      for (let i = 0; i < teamList.members.length - 1; i++) {
        expect(teamList.members[i].jerseyNumber).toBeLessThan(teamList.members[i + 1].jerseyNumber);
      }
    });

    it('rejects empty members array', () => {
      expect(() =>
        createTeamList({
          matchId: '2026-R5-BRO-MEL',
          teamCode: 'BRO',
          year: 2026,
          round: 5,
          members: [],
          scrapedAt: '2026-03-31T06:00:00Z',
        })
      ).toThrow('at least one member');
    });

    it('rejects duplicate jersey numbers', () => {
      const members = makeMembers(2);
      members[1] = { ...members[1], jerseyNumber: 1 }; // duplicate
      expect(() =>
        createTeamList({
          matchId: '2026-R5-BRO-MEL',
          teamCode: 'BRO',
          year: 2026,
          round: 5,
          members,
          scrapedAt: '2026-03-31T06:00:00Z',
        })
      ).toThrow('Duplicate jersey number');
    });

    it('rejects empty match ID', () => {
      expect(() =>
        createTeamList({
          matchId: '',
          teamCode: 'BRO',
          year: 2026,
          round: 5,
          members: makeMembers(17),
          scrapedAt: '2026-03-31T06:00:00Z',
        })
      ).toThrow('non-empty');
    });
  });

  describe('isStarter / isInterchange', () => {
    it('returns true for starters (jersey 1-13)', () => {
      expect(isStarter({ ...validMember, jerseyNumber: 1 })).toBe(true);
      expect(isStarter({ ...validMember, jerseyNumber: 13 })).toBe(true);
    });

    it('returns false for interchange as starter', () => {
      expect(isStarter({ ...validMember, jerseyNumber: 14 })).toBe(false);
    });

    it('returns true for interchange (jersey 14-17)', () => {
      expect(isInterchange({ ...validMember, jerseyNumber: 14 })).toBe(true);
      expect(isInterchange({ ...validMember, jerseyNumber: 17 })).toBe(true);
    });

    it('returns false for starters as interchange', () => {
      expect(isInterchange({ ...validMember, jerseyNumber: 13 })).toBe(false);
    });

    it('returns false for reserves as interchange', () => {
      expect(isInterchange({ ...validMember, jerseyNumber: 18 })).toBe(false);
    });
  });

  describe('isReserve', () => {
    it('returns true for reserves (jersey 18+)', () => {
      expect(isReserve({ ...validMember, jerseyNumber: 18 })).toBe(true);
      expect(isReserve({ ...validMember, jerseyNumber: 22 })).toBe(true);
    });

    it('returns false for interchange as reserve', () => {
      expect(isReserve({ ...validMember, jerseyNumber: 17 })).toBe(false);
    });

    it('returns false for starters as reserve', () => {
      expect(isReserve({ ...validMember, jerseyNumber: 1 })).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// Adapter: NrlComTeamListAdapter
// ---------------------------------------------------------------------------

describe('NrlComTeamListAdapter', () => {
  let adapter: NrlComTeamListAdapter;

  beforeEach(() => {
    adapter = new NrlComTeamListAdapter();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('fetchTeamListForMatch', () => {
    it('extracts team lists from upcoming match fixture', async () => {
      const matchFixture = loadFixture('nrl-com-team-list-upcoming.json');
      mockFetchSequence([{ data: matchFixture }]);

      const result = await adapter.fetchTeamListForMatch(
        '/draw/nrl-premiership/2026/round-5/broncos-v-storm/',
        '2026-R5-BRO-MEL',
        'BRO',
        'MEL',
        2026,
        5
      );

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data).toHaveLength(2);

      const homeList = result.data.find((tl) => tl.teamCode === 'BRO');
      const awayList = result.data.find((tl) => tl.teamCode === 'MEL');

      expect(homeList).toBeDefined();
      expect(awayList).toBeDefined();
      expect(homeList!.members).toHaveLength(22);
      expect(awayList!.members).toHaveLength(22);

      // Verify specific player
      const fullback = homeList!.members.find((m) => m.jerseyNumber === 1);
      expect(fullback).toEqual({
        jerseyNumber: 1,
        playerName: 'Reece Walsh',
        position: 'Fullback',
        playerId: 100001,
      });
    });

    it('extracts team lists from completed match fixture', async () => {
      const matchFixture = loadFixture('nrl-com-team-list-completed.json');
      mockFetchSequence([{ data: matchFixture }]);

      const result = await adapter.fetchTeamListForMatch(
        '/draw/nrl-premiership/2026/round-3/raiders-v-warriors/',
        '2026-R3-CBR-NZL',
        'CBR',
        'NZL',
        2026,
        3
      );

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data).toHaveLength(2);
      const cbrList = result.data.find((tl) => tl.teamCode === 'CBR');
      expect(cbrList!.members).toHaveLength(21);
      expect(cbrList!.matchId).toBe('2026-R3-CBR-NZL');
    });

    it('returns failure on HTTP error', async () => {
      mockFetchSequence([{ data: {}, status: 500 }]);

      const result = await adapter.fetchTeamListForMatch(
        '/draw/nrl-premiership/2026/round-5/broncos-v-storm/',
        '2026-R5-BRO-MEL',
        'BRO',
        'MEL',
        2026,
        5
      );

      expect(result.success).toBe(false);
    });

    it('orders members by jersey number', async () => {
      const matchFixture = loadFixture('nrl-com-team-list-upcoming.json');
      mockFetchSequence([{ data: matchFixture }]);

      const result = await adapter.fetchTeamListForMatch(
        '/draw/nrl-premiership/2026/round-5/broncos-v-storm/',
        '2026-R5-BRO-MEL',
        'BRO',
        'MEL',
        2026,
        5
      );

      expect(result.success).toBe(true);
      if (!result.success) return;

      for (const teamList of result.data) {
        for (let i = 0; i < teamList.members.length - 1; i++) {
          expect(teamList.members[i].jerseyNumber).toBeLessThan(teamList.members[i + 1].jerseyNumber);
        }
      }
    });
  });
});

// ---------------------------------------------------------------------------
// T023: Match-window detection logic
// ---------------------------------------------------------------------------

describe('Match-window detection logic', () => {
  // These tests verify the window filtering logic used by scrapeMatchesInWindow
  // by testing the same predicate inline: kickoff - windowMs <= now <= kickoff

  const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
  const NINETY_MINUTES = 90 * 60 * 1000;

  function isInWindow(scheduledTime: string, windowMs: number, now: Date): boolean {
    const kickoff = new Date(scheduledTime).getTime();
    return kickoff - windowMs <= now.getTime() && now.getTime() <= kickoff;
  }

  describe('24-hour window', () => {
    const kickoff = '2026-04-05T08:00:00Z';

    it('includes match at exactly 24h before kickoff', () => {
      const now = new Date(new Date(kickoff).getTime() - TWENTY_FOUR_HOURS);
      expect(isInWindow(kickoff, TWENTY_FOUR_HOURS, now)).toBe(true);
    });

    it('includes match at 12h before kickoff', () => {
      const now = new Date(new Date(kickoff).getTime() - 12 * 60 * 60 * 1000);
      expect(isInWindow(kickoff, TWENTY_FOUR_HOURS, now)).toBe(true);
    });

    it('includes match at exactly kickoff time', () => {
      const now = new Date(kickoff);
      expect(isInWindow(kickoff, TWENTY_FOUR_HOURS, now)).toBe(true);
    });

    it('excludes match 1ms before the 24h window', () => {
      const now = new Date(new Date(kickoff).getTime() - TWENTY_FOUR_HOURS - 1);
      expect(isInWindow(kickoff, TWENTY_FOUR_HOURS, now)).toBe(false);
    });

    it('excludes match after kickoff', () => {
      const now = new Date(new Date(kickoff).getTime() + 1);
      expect(isInWindow(kickoff, TWENTY_FOUR_HOURS, now)).toBe(false);
    });
  });

  describe('90-minute window', () => {
    const kickoff = '2026-04-05T08:00:00Z';

    it('includes match at exactly 90min before kickoff', () => {
      const now = new Date(new Date(kickoff).getTime() - NINETY_MINUTES);
      expect(isInWindow(kickoff, NINETY_MINUTES, now)).toBe(true);
    });

    it('includes match at 45min before kickoff', () => {
      const now = new Date(new Date(kickoff).getTime() - 45 * 60 * 1000);
      expect(isInWindow(kickoff, NINETY_MINUTES, now)).toBe(true);
    });

    it('excludes match 91min before kickoff', () => {
      const now = new Date(new Date(kickoff).getTime() - 91 * 60 * 1000);
      expect(isInWindow(kickoff, NINETY_MINUTES, now)).toBe(false);
    });

    it('includes match at exactly kickoff time', () => {
      const now = new Date(kickoff);
      expect(isInWindow(kickoff, NINETY_MINUTES, now)).toBe(true);
    });

    it('excludes match 1ms after kickoff', () => {
      const now = new Date(new Date(kickoff).getTime() + 1);
      expect(isInWindow(kickoff, NINETY_MINUTES, now)).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('handles midnight kickoff correctly', () => {
      const kickoff = '2026-04-06T00:00:00Z';
      const now = new Date('2026-04-05T22:30:00Z'); // 90min before
      expect(isInWindow(kickoff, NINETY_MINUTES, now)).toBe(true);
    });

    it('handles different timezone representations consistently', () => {
      // UTC midnight is 10am AEST — both should resolve the same
      const kickoff = '2026-04-06T00:00:00Z';
      const now = new Date(new Date(kickoff).getTime() - 60 * 60 * 1000); // 1h before
      expect(isInWindow(kickoff, TWENTY_FOUR_HOURS, now)).toBe(true);
      expect(isInWindow(kickoff, NINETY_MINUTES, now)).toBe(true);
    });
  });
});
