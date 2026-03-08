import { describe, it, expect } from 'vitest';
import { computeHeadToHead, computeOutlook, computeRoundOutlook } from '../../src/analytics/match-outlook-service.js';
import { broMatchesSeason2026, broMatchesSeason2025, round10Matches } from '../fixtures/analytics/matches.js';
import { broFixtures2026, allFixtures2026 } from '../fixtures/analytics/fixtures.js';
import type { Match } from '../../src/domain/match.js';
import { MatchStatus } from '../../src/domain/match.js';

describe('MatchOutlookService', () => {
  describe('computeHeadToHead', () => {
    it('computes head-to-head across multiple seasons', () => {
      const allMatches = [...broMatchesSeason2026, ...broMatchesSeason2025];
      const h2h = computeHeadToHead(allMatches, 'BRO', 'MEL');
      // 2026 R1: BRO home wins 24-12, R6: MEL home wins 32-12
      // 2025 R5: BRO home wins 20-16, R15: draw 22-22
      expect(h2h.totalMatches).toBe(4);
      expect(h2h.homeWins).toBe(2); // BRO wins both matches as home team designee
      expect(h2h.awayWins).toBe(1); // MEL wins R6
      expect(h2h.draws).toBe(1);
      expect(h2h.homeWinRate).toBeCloseTo(0.5, 1);
    });

    it('returns default 0.5 when no history', () => {
      const h2h = computeHeadToHead([], 'BRO', 'DOL');
      expect(h2h.totalMatches).toBe(0);
      expect(h2h.homeWinRate).toBe(0.5);
    });
  });

  describe('computeOutlook', () => {
    const allRatings = [-8, -5, -3, -2, -1, 0, 3, 5, 6, 7];

    it('classifies Easy when composite >= 0.65', () => {
      // Strong home form, weak away form, good h2h, easy strength
      const result = computeOutlook(
        1.2, // strong home form
        0.2, // weak away form
        { totalMatches: 10, homeWins: 8, awayWins: 1, draws: 1, homeWinRate: 0.8 },
        7, // easy strength
        allRatings
      );
      expect(result.label).toBe('Easy');
      expect(result.compositeScore).toBeGreaterThanOrEqual(0.65);
      expect(result.factorsAvailable).toBe(4);
    });

    it('classifies Tough when composite < 0.40', () => {
      const result = computeOutlook(
        0.2, // weak home form
        1.2, // strong away form
        { totalMatches: 10, homeWins: 2, awayWins: 7, draws: 1, homeWinRate: 0.2 },
        -8, // hard strength
        allRatings
      );
      expect(result.label).toBe('Tough');
      expect(result.compositeScore).toBeLessThan(0.40);
    });

    it('classifies Competitive between thresholds', () => {
      const result = computeOutlook(
        0.6, // moderate home form
        0.6, // moderate away form
        { totalMatches: 10, homeWins: 5, awayWins: 4, draws: 1, homeWinRate: 0.5 },
        0, // neutral strength
        allRatings
      );
      expect(result.label).toBe('Competitive');
    });

    it('detects Upset Alert when form diverges from strength/h2h', () => {
      // Form says home team bad, but strength + h2h say easy
      const result = computeOutlook(
        0.1, // terrible home form
        1.4, // great away form
        { totalMatches: 10, homeWins: 9, awayWins: 1, draws: 0, homeWinRate: 0.9 },
        7, // easy strength
        allRatings
      );
      expect(result.label).toBe('Upset Alert');
    });

    it('handles null form data', () => {
      const result = computeOutlook(
        null, null,
        { totalMatches: 5, homeWins: 3, awayWins: 2, draws: 0, homeWinRate: 0.6 },
        3,
        allRatings
      );
      expect(result.factorsAvailable).toBe(2); // only h2h + strength
      expect(result.compositeScore).toBeGreaterThan(0);
    });

    it('handles missing strength data', () => {
      const result = computeOutlook(
        0.7, 0.4,
        { totalMatches: 5, homeWins: 3, awayWins: 2, draws: 0, homeWinRate: 0.6 },
        null,
        allRatings
      );
      expect(result.factorsAvailable).toBe(3);
    });
  });

  describe('computeRoundOutlook', () => {
    it('separates completed matches from upcoming', () => {
      const allMatches = [...broMatchesSeason2026, ...round10Matches];
      const { outlooks, completed } = computeRoundOutlook(
        round10Matches,
        allMatches,
        allFixtures2026,
        () => 0.5
      );
      expect(completed.length).toBe(1);
      expect(completed[0].status).toBe('Completed');
      expect(outlooks.length).toBe(2);
    });

    it('returns actual scores for completed matches', () => {
      const allMatches = [...broMatchesSeason2026, ...round10Matches];
      const { completed } = computeRoundOutlook(
        round10Matches,
        allMatches,
        allFixtures2026,
        () => 0.5
      );
      expect(completed[0].homeScore).toBe(24);
      expect(completed[0].awayScore).toBe(18);
    });
  });
});
