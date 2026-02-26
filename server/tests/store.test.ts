/**
 * Tests for in-memory database store
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadFixtures,
  resetDatabase,
  getAllTeams,
  getTeamByCode,
  getLoadedYears,
  getTotalFixtureCount,
  getFixturesByYear,
  getFixturesByTeam,
  getFixturesByRound,
  getFixturesByYearTeam,
  getAllFixtures,
} from '../src/database/store.js';
import { createFixture } from '../src/models/fixture.js';
import type { Fixture } from '../src/models/fixture.js';

// Create test fixtures
function createTestFixtures(): Fixture[] {
  return [
    createFixture(2026, 1, 'MEL', 'BRO', true, 500),
    createFixture(2026, 1, 'BRO', 'MEL', false, 500),
    createFixture(2026, 2, 'MEL', 'SYD', false, 450),
    createFixture(2026, 2, 'SYD', 'MEL', true, 450),
    createFixture(2026, 3, 'MEL', null, false, -500), // bye
    createFixture(2025, 1, 'MEL', 'PAR', true, 480),
    createFixture(2025, 1, 'PAR', 'MEL', false, 480),
  ];
}

describe('Database Store', () => {
  beforeEach(() => {
    resetDatabase();
  });

  describe('loadFixtures', () => {
    it('should load fixtures into the store', () => {
      const fixtures = createTestFixtures();
      loadFixtures(2026, fixtures);

      expect(getTotalFixtureCount()).toBe(fixtures.length);
    });

    it('should register teams from fixtures', () => {
      loadFixtures(2026, createTestFixtures());

      const teams = getAllTeams();
      expect(teams.length).toBeGreaterThan(0);
    });

    it('should track loaded years', () => {
      loadFixtures(2026, createTestFixtures());

      const years = getLoadedYears();
      expect(years).toContain(2026);
    });
  });

  describe('getTeamByCode', () => {
    beforeEach(() => {
      loadFixtures(2026, createTestFixtures());
    });

    it('should return team by valid code', () => {
      const team = getTeamByCode('MEL');

      expect(team).toBeDefined();
      expect(team?.code).toBe('MEL');
      expect(team?.name).toBe('Melbourne Storm');
    });

    it('should return undefined for invalid code', () => {
      const team = getTeamByCode('XXX');

      expect(team).toBeUndefined();
    });
  });

  describe('getFixturesByYear', () => {
    beforeEach(() => {
      loadFixtures(2026, createTestFixtures());
    });

    it('should return fixtures for a specific year', () => {
      const fixtures = getFixturesByYear(2026);

      expect(fixtures.length).toBeGreaterThan(0);
      fixtures.forEach(f => expect(f.year).toBe(2026));
    });

    it('should return empty array for year with no data', () => {
      const fixtures = getFixturesByYear(2020);

      expect(fixtures).toEqual([]);
    });
  });

  describe('getFixturesByTeam', () => {
    beforeEach(() => {
      loadFixtures(2026, createTestFixtures());
    });

    it('should return fixtures for a specific team', () => {
      const fixtures = getFixturesByTeam('MEL');

      expect(fixtures.length).toBeGreaterThan(0);
      fixtures.forEach(f => expect(f.teamCode).toBe('MEL'));
    });

    it('should return empty array for team with no fixtures', () => {
      const fixtures = getFixturesByTeam('XXX');

      expect(fixtures).toEqual([]);
    });
  });

  describe('getFixturesByRound', () => {
    beforeEach(() => {
      loadFixtures(2026, createTestFixtures());
    });

    it('should return fixtures for a specific round in a year', () => {
      const fixtures = getFixturesByRound(2026, 1);

      expect(fixtures.length).toBeGreaterThan(0);
      fixtures.forEach(f => {
        expect(f.year).toBe(2026);
        expect(f.round).toBe(1);
      });
    });

    it('should return empty array for round with no data', () => {
      const fixtures = getFixturesByRound(2026, 99);

      expect(fixtures).toEqual([]);
    });
  });

  describe('getFixturesByYearTeam', () => {
    beforeEach(() => {
      loadFixtures(2026, createTestFixtures());
    });

    it('should return fixtures for specific team and year', () => {
      const fixtures = getFixturesByYearTeam(2026, 'MEL');

      expect(fixtures.length).toBeGreaterThan(0);
      fixtures.forEach(f => {
        expect(f.year).toBe(2026);
        expect(f.teamCode).toBe('MEL');
      });
    });
  });

  describe('getAllFixtures', () => {
    it('should return all loaded fixtures', () => {
      const testFixtures = createTestFixtures();
      loadFixtures(2026, testFixtures);

      const fixtures = getAllFixtures();

      expect(fixtures.length).toBe(testFixtures.length);
    });
  });

  describe('resetDatabase', () => {
    it('should clear all data from store', () => {
      loadFixtures(2026, createTestFixtures());
      expect(getTotalFixtureCount()).toBeGreaterThan(0);

      resetDatabase();

      expect(getTotalFixtureCount()).toBe(0);
      expect(getLoadedYears()).toEqual([]);
    });
  });
});
