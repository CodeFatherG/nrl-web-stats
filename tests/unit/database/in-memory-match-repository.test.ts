import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InMemoryMatchRepository } from '../../../src/database/in-memory-match-repository.js';
import { createMatchFromSchedule } from '../../../src/domain/match.js';
import type { Match } from '../../../src/domain/match.js';

// Mock store.ts to avoid side effects from the legacy bridge
vi.mock('../../../src/database/store.js', () => ({
  loadFixtures: vi.fn(),
}));

import { loadFixtures } from '../../../src/database/store.js';
const mockLoadFixtures = vi.mocked(loadFixtures);

function createTestMatch(overrides: Partial<Parameters<typeof createMatchFromSchedule>[0]> = {}): Match {
  return createMatchFromSchedule({
    year: 2026,
    round: 1,
    homeTeamCode: 'BRO',
    awayTeamCode: 'MEL',
    homeStrengthRating: 750,
    awayStrengthRating: 850,
    ...overrides,
  });
}

describe('InMemoryMatchRepository', () => {
  let repo: InMemoryMatchRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    repo = new InMemoryMatchRepository();
  });

  describe('save and findById', () => {
    it('saves and retrieves a match by ID', () => {
      const match = createTestMatch();
      repo.save(match);
      expect(repo.findById(match.id)).toEqual(match);
    });

    it('returns null for non-existent ID', () => {
      expect(repo.findById('non-existent')).toBeNull();
    });

    it('upserts on duplicate ID', () => {
      const match1 = createTestMatch();
      repo.save(match1);

      // Same teams/round/year = same ID, but different strength
      const match2 = createMatchFromSchedule({
        year: 2026,
        round: 1,
        homeTeamCode: 'BRO',
        awayTeamCode: 'MEL',
        homeStrengthRating: 999,
        awayStrengthRating: 999,
      });
      repo.save(match2);

      expect(repo.getMatchCount()).toBe(1);
      expect(repo.findById(match1.id)!.homeStrengthRating).toBe(999);
    });
  });

  describe('findByYear', () => {
    it('returns matches for a specific year', () => {
      const m2026 = createTestMatch({ year: 2026 });
      const m2025 = createTestMatch({ year: 2025, homeTeamCode: 'SYD', awayTeamCode: 'PAR' });
      repo.save(m2026);
      repo.save(m2025);

      const result = repo.findByYear(2026);
      expect(result).toHaveLength(1);
      expect(result[0].year).toBe(2026);
    });

    it('returns empty array for year with no data', () => {
      expect(repo.findByYear(2030)).toEqual([]);
    });
  });

  describe('findByYearAndRound', () => {
    it('returns matches for a specific year and round', () => {
      const r1 = createTestMatch({ round: 1 });
      const r2 = createTestMatch({ round: 2, homeTeamCode: 'SYD', awayTeamCode: 'PAR' });
      repo.save(r1);
      repo.save(r2);

      const result = repo.findByYearAndRound(2026, 1);
      expect(result).toHaveLength(1);
      expect(result[0].round).toBe(1);
    });

    it('returns empty for non-existent round', () => {
      expect(repo.findByYearAndRound(2026, 99)).toEqual([]);
    });
  });

  describe('findByTeam', () => {
    it('finds matches where team is home', () => {
      const match = createTestMatch({ homeTeamCode: 'BRO', awayTeamCode: 'MEL' });
      repo.save(match);

      const result = repo.findByTeam('BRO');
      expect(result).toHaveLength(1);
    });

    it('finds matches where team is away', () => {
      const match = createTestMatch({ homeTeamCode: 'BRO', awayTeamCode: 'MEL' });
      repo.save(match);

      const result = repo.findByTeam('MEL');
      expect(result).toHaveLength(1);
    });

    it('filters by year when provided', () => {
      const m2026 = createTestMatch({ year: 2026 });
      const m2025 = createTestMatch({ year: 2025 });
      repo.save(m2026);
      repo.save(m2025);

      const result = repo.findByTeam('BRO', 2026);
      expect(result).toHaveLength(1);
      expect(result[0].year).toBe(2026);
    });

    it('returns empty for unknown team', () => {
      expect(repo.findByTeam('ZZZ')).toEqual([]);
    });
  });

  describe('loadForYear', () => {
    it('loads matches and enables querying', () => {
      const matches = [
        createTestMatch({ round: 1 }),
        createTestMatch({ round: 2, homeTeamCode: 'SYD', awayTeamCode: 'PAR' }),
      ];
      repo.loadForYear(2026, matches);

      expect(repo.findByYear(2026)).toHaveLength(2);
      expect(repo.isYearLoaded(2026)).toBe(true);
    });

    it('replaces existing year data atomically', () => {
      const old = [createTestMatch({ round: 1 })];
      repo.loadForYear(2026, old);
      expect(repo.findByYear(2026)).toHaveLength(1);

      const replacement = [
        createTestMatch({ round: 1, homeTeamCode: 'SYD', awayTeamCode: 'PAR' }),
        createTestMatch({ round: 2, homeTeamCode: 'NEW', awayTeamCode: 'SHA' }),
      ];
      repo.loadForYear(2026, replacement);

      expect(repo.findByYear(2026)).toHaveLength(2);
      expect(repo.getMatchCount()).toBe(2);
      // Old match should be gone
      expect(repo.findByTeam('BRO', 2026)).toHaveLength(0);
    });

    it('does not affect other years', () => {
      const m2025 = [createTestMatch({ year: 2025 })];
      const m2026 = [createTestMatch({ year: 2026, homeTeamCode: 'SYD', awayTeamCode: 'PAR' })];
      repo.loadForYear(2025, m2025);
      repo.loadForYear(2026, m2026);

      // Replace 2026
      repo.loadForYear(2026, []);

      expect(repo.findByYear(2025)).toHaveLength(1);
      expect(repo.findByYear(2026)).toHaveLength(0);
    });

    it('calls legacy store bridge with converted fixtures including byes', () => {
      const matches = [createTestMatch()];
      repo.loadForYear(2026, matches);

      expect(mockLoadFixtures).toHaveBeenCalledWith(2026, expect.any(Array));
      const fixtures = mockLoadFixtures.mock.calls[0][1];
      const matchFixtures = fixtures.filter((f: { isBye: boolean }) => !f.isBye);
      const byeFixtures = fixtures.filter((f: { isBye: boolean }) => f.isBye);
      // Each match produces 2 fixtures (home + away)
      expect(matchFixtures).toHaveLength(2);
      expect(matchFixtures[0].teamCode).toBe('BRO');
      expect(matchFixtures[0].isHome).toBe(true);
      expect(matchFixtures[1].teamCode).toBe('MEL');
      expect(matchFixtures[1].isHome).toBe(false);
      // Teams not in any match get bye fixtures (17 total teams - 2 playing = 15 byes)
      expect(byeFixtures).toHaveLength(15);
      expect(byeFixtures.every((f: { isBye: boolean }) => f.isBye)).toBe(true);
      // BRO and MEL should NOT have byes
      const byeTeams = byeFixtures.map((f: { teamCode: string }) => f.teamCode);
      expect(byeTeams).not.toContain('BRO');
      expect(byeTeams).not.toContain('MEL');
    });

    it('infers bye fixtures for each round independently', () => {
      const round1Match = createTestMatch({ round: 1, homeTeamCode: 'BRO', awayTeamCode: 'MEL' });
      const round2Match = createTestMatch({ round: 2, homeTeamCode: 'SYD', awayTeamCode: 'PAR' });
      repo.loadForYear(2026, [round1Match, round2Match]);

      const fixtures = mockLoadFixtures.mock.calls[0][1];
      const r1Byes = fixtures.filter((f: { round: number; isBye: boolean }) => f.round === 1 && f.isBye);
      const r2Byes = fixtures.filter((f: { round: number; isBye: boolean }) => f.round === 2 && f.isBye);
      // Round 1: BRO + MEL playing → 15 byes
      expect(r1Byes).toHaveLength(15);
      // Round 2: SYD + PAR playing → 15 byes
      expect(r2Byes).toHaveLength(15);
      // SYD should have a bye in round 1 but NOT in round 2
      const r1ByeTeams = r1Byes.map((f: { teamCode: string }) => f.teamCode);
      const r2ByeTeams = r2Byes.map((f: { teamCode: string }) => f.teamCode);
      expect(r1ByeTeams).toContain('SYD');
      expect(r2ByeTeams).not.toContain('SYD');
      expect(r2ByeTeams).toContain('BRO');
      expect(r1ByeTeams).not.toContain('BRO');
    });

    it('does not create bye fixtures for rounds with no matches', () => {
      repo.loadForYear(2026, []);

      const fixtures = mockLoadFixtures.mock.calls[0][1];
      expect(fixtures).toHaveLength(0);
    });
  });

  describe('metadata methods', () => {
    it('getLoadedYears returns sorted years', () => {
      repo.loadForYear(2026, []);
      repo.loadForYear(2024, []);
      repo.loadForYear(2025, []);

      expect(repo.getLoadedYears()).toEqual([2024, 2025, 2026]);
    });

    it('isYearLoaded returns false for unloaded year', () => {
      expect(repo.isYearLoaded(2026)).toBe(false);
    });

    it('isYearLoaded returns true after loadForYear', () => {
      repo.loadForYear(2026, []);
      expect(repo.isYearLoaded(2026)).toBe(true);
    });

    it('getMatchCount returns 0 for empty repository', () => {
      expect(repo.getMatchCount()).toBe(0);
    });

    it('getMatchCount returns total across all years', () => {
      repo.loadForYear(2025, [createTestMatch({ year: 2025 })]);
      repo.loadForYear(2026, [
        createTestMatch({ year: 2026, homeTeamCode: 'SYD', awayTeamCode: 'PAR' }),
        createTestMatch({ year: 2026, round: 2, homeTeamCode: 'NEW', awayTeamCode: 'SHA' }),
      ]);

      expect(repo.getMatchCount()).toBe(3);
    });
  });

  describe('empty repository', () => {
    it('all query methods return empty results', () => {
      expect(repo.findByYear(2026)).toEqual([]);
      expect(repo.findByYearAndRound(2026, 1)).toEqual([]);
      expect(repo.findByTeam('BRO')).toEqual([]);
      expect(repo.findById('anything')).toBeNull();
      expect(repo.getLoadedYears()).toEqual([]);
      expect(repo.getMatchCount()).toBe(0);
    });
  });
});
