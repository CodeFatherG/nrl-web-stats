import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InMemoryMatchRepository } from '../../../src/database/in-memory-match-repository.js';
import { createMatchFromSchedule } from '../../../src/domain/match.js';
import type { Match } from '../../../src/domain/match.js';

// Mock legacy-fixture-bridge to avoid side effects from the legacy bridge
vi.mock('../../../src/database/legacy-fixture-bridge.js', () => ({
  buildLegacyFixtureBridge: vi.fn(),
}));

import { buildLegacyFixtureBridge } from '../../../src/database/legacy-fixture-bridge.js';
const mockBuildBridge = vi.mocked(buildLegacyFixtureBridge);

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
    it('saves and retrieves a match by ID', async () => {
      const match = createTestMatch();
      await repo.save(match);
      expect(await repo.findById(match.id)).toEqual(match);
    });

    it('returns null for non-existent ID', async () => {
      expect(await repo.findById('non-existent')).toBeNull();
    });

    it('upserts on duplicate ID', async () => {
      const match1 = createTestMatch();
      await repo.save(match1);

      // Same teams/round/year = same ID, but different strength
      const match2 = createMatchFromSchedule({
        year: 2026,
        round: 1,
        homeTeamCode: 'BRO',
        awayTeamCode: 'MEL',
        homeStrengthRating: 999,
        awayStrengthRating: 999,
      });
      await repo.save(match2);

      expect(await repo.getMatchCount()).toBe(1);
      expect((await repo.findById(match1.id))!.homeStrengthRating).toBe(999);
    });
  });

  describe('findByYear', () => {
    it('returns matches for a specific year', async () => {
      const m2026 = createTestMatch({ year: 2026 });
      const m2025 = createTestMatch({ year: 2025, homeTeamCode: 'SYD', awayTeamCode: 'PAR' });
      await repo.save(m2026);
      await repo.save(m2025);

      const result = await repo.findByYear(2026);
      expect(result).toHaveLength(1);
      expect(result[0].year).toBe(2026);
    });

    it('returns empty array for year with no data', async () => {
      expect(await repo.findByYear(2030)).toEqual([]);
    });
  });

  describe('findByYearAndRound', () => {
    it('returns matches for a specific year and round', async () => {
      const r1 = createTestMatch({ round: 1 });
      const r2 = createTestMatch({ round: 2, homeTeamCode: 'SYD', awayTeamCode: 'PAR' });
      await repo.save(r1);
      await repo.save(r2);

      const result = await repo.findByYearAndRound(2026, 1);
      expect(result).toHaveLength(1);
      expect(result[0].round).toBe(1);
    });

    it('returns empty for non-existent round', async () => {
      expect(await repo.findByYearAndRound(2026, 99)).toEqual([]);
    });
  });

  describe('findByTeam', () => {
    it('finds matches where team is home', async () => {
      const match = createTestMatch({ homeTeamCode: 'BRO', awayTeamCode: 'MEL' });
      await repo.save(match);

      const result = await repo.findByTeam('BRO');
      expect(result).toHaveLength(1);
    });

    it('finds matches where team is away', async () => {
      const match = createTestMatch({ homeTeamCode: 'BRO', awayTeamCode: 'MEL' });
      await repo.save(match);

      const result = await repo.findByTeam('MEL');
      expect(result).toHaveLength(1);
    });

    it('filters by year when provided', async () => {
      const m2026 = createTestMatch({ year: 2026 });
      const m2025 = createTestMatch({ year: 2025 });
      await repo.save(m2026);
      await repo.save(m2025);

      const result = await repo.findByTeam('BRO', 2026);
      expect(result).toHaveLength(1);
      expect(result[0].year).toBe(2026);
    });

    it('returns empty for unknown team', async () => {
      expect(await repo.findByTeam('ZZZ')).toEqual([]);
    });
  });

  describe('saveAll', () => {
    it('saves matches and enables querying', async () => {
      const matches = [
        createTestMatch({ round: 1 }),
        createTestMatch({ round: 2, homeTeamCode: 'SYD', awayTeamCode: 'PAR' }),
      ];
      await repo.saveAll(matches);

      expect(await repo.findByYear(2026)).toHaveLength(2);
      expect(await repo.isYearLoaded(2026)).toBe(true);
    });

    it('upserts existing matches on saveAll', async () => {
      const old = [createTestMatch({ round: 1 })];
      await repo.saveAll(old);
      expect(await repo.findByYear(2026)).toHaveLength(1);

      // saveAll with same ID upserts, plus adds new
      const replacement = [
        createTestMatch({ round: 1, homeStrengthRating: 999, awayStrengthRating: 999 }),
        createTestMatch({ round: 2, homeTeamCode: 'NEW', awayTeamCode: 'SHA' }),
      ];
      await repo.saveAll(replacement);

      expect(await repo.findByYear(2026)).toHaveLength(2);
      expect(await repo.getMatchCount()).toBe(2);
      // Strength updated via upsert
      const updated = await repo.findById(old[0].id);
      expect(updated!.homeStrengthRating).toBe(999);
    });

    it('does not affect other years', async () => {
      const m2025 = [createTestMatch({ year: 2025 })];
      const m2026 = [createTestMatch({ year: 2026, homeTeamCode: 'SYD', awayTeamCode: 'PAR' })];
      await repo.saveAll(m2025);
      await repo.saveAll(m2026);

      expect(await repo.findByYear(2025)).toHaveLength(1);
      expect(await repo.findByYear(2026)).toHaveLength(1);
    });

    it('calls legacy fixture bridge with converted fixtures including byes', async () => {
      const matches = [createTestMatch()];
      await repo.saveAll(matches);

      expect(mockBuildBridge).toHaveBeenCalledWith(2026, matches);
    });

    it('infers bye fixtures via bridge for each round independently', async () => {
      const round1Match = createTestMatch({ round: 1, homeTeamCode: 'BRO', awayTeamCode: 'MEL' });
      const round2Match = createTestMatch({ round: 2, homeTeamCode: 'SYD', awayTeamCode: 'PAR' });
      await repo.saveAll([round1Match, round2Match]);

      expect(mockBuildBridge).toHaveBeenCalledWith(2026, [round1Match, round2Match]);
    });

    it('does not call bridge for empty match list', async () => {
      await repo.saveAll([]);

      expect(mockBuildBridge).not.toHaveBeenCalled();
    });
  });

  describe('metadata methods', () => {
    it('getLoadedYears returns sorted years', async () => {
      await repo.saveAll([createTestMatch({ year: 2026 })]);
      await repo.saveAll([createTestMatch({ year: 2024, homeTeamCode: 'SYD', awayTeamCode: 'PAR' })]);
      await repo.saveAll([createTestMatch({ year: 2025, homeTeamCode: 'NEW', awayTeamCode: 'SHA' })]);

      expect(await repo.getLoadedYears()).toEqual([2024, 2025, 2026]);
    });

    it('isYearLoaded returns false for unloaded year', async () => {
      expect(await repo.isYearLoaded(2026)).toBe(false);
    });

    it('isYearLoaded returns true after saveAll', async () => {
      await repo.saveAll([createTestMatch({ year: 2026 })]);
      expect(await repo.isYearLoaded(2026)).toBe(true);
    });

    it('getMatchCount returns 0 for empty repository', async () => {
      expect(await repo.getMatchCount()).toBe(0);
    });

    it('getMatchCount returns total across all years', async () => {
      await repo.saveAll([createTestMatch({ year: 2025 })]);
      await repo.saveAll([
        createTestMatch({ year: 2026, homeTeamCode: 'SYD', awayTeamCode: 'PAR' }),
        createTestMatch({ year: 2026, round: 2, homeTeamCode: 'NEW', awayTeamCode: 'SHA' }),
      ]);

      expect(await repo.getMatchCount()).toBe(3);
    });
  });

  describe('empty repository', () => {
    it('all query methods return empty results', async () => {
      expect(await repo.findByYear(2026)).toEqual([]);
      expect(await repo.findByYearAndRound(2026, 1)).toEqual([]);
      expect(await repo.findByTeam('BRO')).toEqual([]);
      expect(await repo.findById('anything')).toBeNull();
      expect(await repo.getLoadedYears()).toEqual([]);
      expect(await repo.getMatchCount()).toBe(0);
    });
  });
});
