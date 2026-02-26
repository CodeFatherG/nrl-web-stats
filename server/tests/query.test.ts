/**
 * Tests for fluent query builder
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { fixtures, FixtureQuery } from '../src/database/query.js';
import { loadFixtures, resetDatabase } from '../src/database/store.js';
import { createFixture } from '../src/models/fixture.js';
import type { Fixture } from '../src/models/fixture.js';

// Create a comprehensive set of test fixtures
function createTestFixtures(): Fixture[] {
  return [
    // MEL fixtures for 2026
    createFixture(2026, 1, 'MEL', 'BRO', true, 500),   // Home vs BRO
    createFixture(2026, 2, 'MEL', 'SYD', false, 450),  // Away vs SYD
    createFixture(2026, 3, 'MEL', null, false, -500),  // Bye
    createFixture(2026, 4, 'MEL', 'PAR', true, 480),   // Home vs PAR
    createFixture(2026, 5, 'MEL', 'NZL', false, 420),  // Away vs NZL

    // BRO fixtures for 2026
    createFixture(2026, 1, 'BRO', 'MEL', false, 500),  // Away vs MEL
    createFixture(2026, 2, 'BRO', 'PAR', true, 460),   // Home vs PAR
    createFixture(2026, 3, 'BRO', 'SYD', false, 470),  // Away vs SYD
    createFixture(2026, 4, 'BRO', null, false, -510),  // Bye
    createFixture(2026, 5, 'BRO', 'NZL', true, 430),   // Home vs NZL

    // SYD fixtures for 2026
    createFixture(2026, 1, 'SYD', 'PAR', true, 440),   // Home vs PAR
    createFixture(2026, 2, 'SYD', 'MEL', true, 450),   // Home vs MEL
    createFixture(2026, 3, 'SYD', 'BRO', true, 470),   // Home vs BRO
    createFixture(2026, 4, 'SYD', 'NZL', false, 410),  // Away vs NZL
    createFixture(2026, 5, 'SYD', null, false, -520),  // Bye

    // MEL fixtures for 2025 (different year)
    createFixture(2025, 1, 'MEL', 'BRO', true, 490),
    createFixture(2025, 2, 'MEL', 'PAR', false, 460),
  ];
}

describe('FixtureQuery', () => {
  beforeEach(() => {
    resetDatabase();
    loadFixtures(2026, createTestFixtures());
  });

  describe('basic query', () => {
    it('should return all fixtures when no filters applied', () => {
      const result = fixtures().execute();

      expect(result.length).toBe(17); // All fixtures
    });
  });

  describe('year filter', () => {
    it('should filter by year', () => {
      const result = fixtures().year(2026).execute();

      expect(result.length).toBe(15); // 2026 fixtures only
      result.forEach(f => expect(f.year).toBe(2026));
    });

    it('should return empty for year with no data', () => {
      const result = fixtures().year(2020).execute();

      expect(result).toEqual([]);
    });
  });

  describe('team filter', () => {
    it('should filter by team code', () => {
      const result = fixtures().team('MEL').execute();

      expect(result.length).toBe(7); // MEL fixtures (5 in 2026 + 2 in 2025)
      result.forEach(f => expect(f.teamCode).toBe('MEL'));
    });

    it('should be case insensitive', () => {
      const result = fixtures().team('mel').execute();

      expect(result.length).toBe(7);
      result.forEach(f => expect(f.teamCode).toBe('MEL'));
    });
  });

  describe('round filter', () => {
    it('should filter by exact round', () => {
      const result = fixtures().year(2026).round(1).execute();

      expect(result.length).toBe(3); // Round 1 fixtures
      result.forEach(f => expect(f.round).toBe(1));
    });
  });

  describe('roundRange filter', () => {
    it('should filter by round range', () => {
      const result = fixtures().year(2026).team('MEL').roundRange(1, 3).execute();

      expect(result.length).toBe(3); // Rounds 1, 2, 3
      result.forEach(f => {
        expect(f.round).toBeGreaterThanOrEqual(1);
        expect(f.round).toBeLessThanOrEqual(3);
      });
    });
  });

  describe('homeOnly filter', () => {
    it('should return only home games', () => {
      const result = fixtures().year(2026).team('MEL').homeOnly().execute();

      const homeGames = result.filter(f => !f.isBye);
      homeGames.forEach(f => expect(f.isHome).toBe(true));
    });
  });

  describe('awayOnly filter', () => {
    it('should return only away games', () => {
      const result = fixtures().year(2026).team('MEL').awayOnly().execute();

      const awayGames = result.filter(f => !f.isBye && !f.isHome);
      expect(awayGames.length).toBeGreaterThan(0);
    });
  });

  describe('byesOnly filter', () => {
    it('should return only bye weeks', () => {
      const result = fixtures().year(2026).byesOnly().execute();

      expect(result.length).toBe(3); // 3 teams have byes in test data
      result.forEach(f => expect(f.isBye).toBe(true));
    });
  });

  describe('opponent filter', () => {
    it('should filter by opponent', () => {
      const result = fixtures().year(2026).team('MEL').opponent('BRO').execute();

      expect(result.length).toBe(1);
      expect(result[0].opponentCode).toBe('BRO');
    });
  });

  describe('chained filters', () => {
    it('should support method chaining', () => {
      const result = fixtures()
        .year(2026)
        .team('MEL')
        .roundRange(1, 4)
        .homeOnly()
        .execute();

      expect(result.length).toBeGreaterThan(0);
      result.forEach(f => {
        expect(f.year).toBe(2026);
        expect(f.teamCode).toBe('MEL');
        expect(f.round).toBeGreaterThanOrEqual(1);
        expect(f.round).toBeLessThanOrEqual(4);
      });
    });

    it('should return empty array for no matches', () => {
      const result = fixtures()
        .year(2026)
        .team('MEL')
        .opponent('XXX')
        .execute();

      expect(result).toEqual([]);
    });
  });

  describe('getFilters', () => {
    it('should return active filters', () => {
      const query = fixtures()
        .year(2026)
        .team('MEL')
        .round(1);

      const filters = query.getFilters();

      expect(filters.year).toBe(2026);
      expect(filters.team).toBe('MEL');
      expect(filters.round).toBe(1);
    });
  });
});
