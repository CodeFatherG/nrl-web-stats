/**
 * Tests for HTML parser module
 */

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { parseScheduleHtml } from '../src/scraper/parser.js';

describe('parseScheduleHtml', () => {
  let html: string;

  beforeAll(() => {
    // Load the HTML fixture
    const fixturePath = path.join(__dirname, 'fixtures', 'schedule-2026.html');
    html = fs.readFileSync(fixturePath, 'utf-8');
  });

  it('should parse fixture HTML and return fixtures', () => {
    const result = parseScheduleHtml(html, 2026);

    expect(result).toBeDefined();
    expect(result.fixtures).toBeDefined();
    expect(Array.isArray(result.fixtures)).toBe(true);
  });

  it('should find at least 16 teams', () => {
    const result = parseScheduleHtml(html, 2026);

    expect(result.teamCount).toBeGreaterThanOrEqual(16);
  });

  it('should find fixtures for multiple rounds (expect ~27 rounds)', () => {
    const result = parseScheduleHtml(html, 2026);

    const rounds = new Set(result.fixtures.map(f => f.round));
    expect(rounds.size).toBeGreaterThanOrEqual(20);
  });

  it('should correctly identify bye weeks', () => {
    const result = parseScheduleHtml(html, 2026);

    const byes = result.fixtures.filter(f => f.isBye);
    expect(byes.length).toBeGreaterThan(0);

    // Bye fixtures should have null opponent and negative strength
    byes.forEach(bye => {
      expect(bye.opponentCode).toBeNull();
      expect(bye.strengthRating).toBeLessThan(0);
    });
  });

  it('should correctly parse home/away status', () => {
    const result = parseScheduleHtml(html, 2026);

    const nonByeFixtures = result.fixtures.filter(f => !f.isBye);

    const homeGames = nonByeFixtures.filter(f => f.isHome);
    const awayGames = nonByeFixtures.filter(f => !f.isHome);

    // Should have both home and away games
    expect(homeGames.length).toBeGreaterThan(0);
    expect(awayGames.length).toBeGreaterThan(0);
  });

  it('should include strength ratings for fixtures', () => {
    const result = parseScheduleHtml(html, 2026);

    const nonByeFixtures = result.fixtures.filter(f => !f.isBye);

    // Most fixtures should have positive strength ratings
    const fixturesWithRatings = nonByeFixtures.filter(f => f.strengthRating > 0);
    expect(fixturesWithRatings.length).toBeGreaterThan(nonByeFixtures.length * 0.9);
  });

  it('should generate fixture IDs in correct format', () => {
    const result = parseScheduleHtml(html, 2026);

    // Check that IDs follow the pattern: year-teamCode-round
    result.fixtures.forEach(fixture => {
      expect(fixture.id).toMatch(/^\d{4}-[A-Z]{3}-\d+$/);
      expect(fixture.id).toContain(fixture.year.toString());
      expect(fixture.id).toContain(fixture.teamCode);
      expect(fixture.id).toContain(fixture.round.toString());
    });
  });

  it('should set correct year on all fixtures', () => {
    const result = parseScheduleHtml(html, 2026);

    result.fixtures.forEach(fixture => {
      expect(fixture.year).toBe(2026);
    });
  });

  it('should have valid team codes', () => {
    const result = parseScheduleHtml(html, 2026);

    const validCodes = ['BRO', 'BUL', 'CBR', 'DOL', 'GCT', 'MEL', 'MNL', 'NEW', 'NQC', 'NZL', 'PAR', 'PTH', 'SHA', 'STG', 'STH', 'SYD', 'WST'];

    result.fixtures.forEach(fixture => {
      expect(validCodes).toContain(fixture.teamCode);
      if (fixture.opponentCode) {
        expect(validCodes).toContain(fixture.opponentCode);
      }
    });
  });

  it('should return warnings for malformed data', () => {
    const result = parseScheduleHtml(html, 2026);

    expect(result.warnings).toBeDefined();
    expect(Array.isArray(result.warnings)).toBe(true);
    // Warnings may or may not exist depending on data quality
  });

  it('should parse round numbers between 1 and 27', () => {
    const result = parseScheduleHtml(html, 2026);

    result.fixtures.forEach(fixture => {
      expect(fixture.round).toBeGreaterThanOrEqual(1);
      expect(fixture.round).toBeLessThanOrEqual(27);
    });
  });
});
