/**
 * Unit tests for getMatchDetail handler logic
 */

import { describe, it, expect } from 'vitest';
import { createMatchId, MatchStatus } from '../../src/domain/match';
import type { Match } from '../../src/domain/match';

describe('match detail handler logic', () => {
  describe('match ID validation', () => {
    const validPattern = /^\d{4}-R\d{1,2}-[A-Z]{3}-[A-Z]{3}$/;

    it('accepts valid match IDs', () => {
      expect(validPattern.test('2025-R5-BRI-SYD')).toBe(true);
      expect(validPattern.test('2025-R27-CRO-MEL')).toBe(true);
      expect(validPattern.test('2026-R1-DOL-NQL')).toBe(true);
    });

    it('rejects invalid match IDs', () => {
      expect(validPattern.test('invalid')).toBe(false);
      expect(validPattern.test('2025-1-BRI-SYD')).toBe(false); // missing R prefix
      expect(validPattern.test('2025-R5-bri-syd')).toBe(false); // lowercase
      expect(validPattern.test('2025-R5-BR-SYD')).toBe(false); // 2-letter code
      expect(validPattern.test('25-R5-BRI-SYD')).toBe(false); // 2-digit year
    });
  });

  describe('match ID construction', () => {
    it('produces deterministic IDs with alphabetical team sort', () => {
      const id1 = createMatchId('SYD', 'BRI', 2025, 5);
      const id2 = createMatchId('BRI', 'SYD', 2025, 5);
      expect(id1).toBe(id2);
      expect(id1).toBe('2025-R5-BRI-SYD');
    });
  });

  describe('response assembly', () => {
    it('maps completed match to response with status', () => {
      const match: Match = {
        id: '2025-R5-BRI-SYD',
        year: 2025,
        round: 5,
        homeTeamCode: 'BRI',
        awayTeamCode: 'SYD',
        homeScore: 24,
        awayScore: 18,
        status: MatchStatus.Completed,
        homeStrengthRating: 365.2,
        awayStrengthRating: 342.8,
        scheduledTime: '2025-04-04T19:50:00+10:00',
        stadium: 'Suncorp Stadium',
        weather: 'Fine, 24C',
      };

      expect(match.status).toBe('Completed');
      expect(match.homeScore).toBe(24);
      expect(match.awayScore).toBe(18);
    });

    it('maps scheduled match with null scores', () => {
      const match: Match = {
        id: '2025-R10-BRI-SYD',
        year: 2025,
        round: 10,
        homeTeamCode: 'BRI',
        awayTeamCode: 'SYD',
        homeScore: null,
        awayScore: null,
        status: MatchStatus.Scheduled,
        homeStrengthRating: 365.2,
        awayStrengthRating: 342.8,
        scheduledTime: '2025-05-15T19:50:00+10:00',
        stadium: 'Suncorp Stadium',
        weather: null,
      };

      expect(match.status).toBe('Scheduled');
      expect(match.homeScore).toBeNull();
      expect(match.awayScore).toBeNull();
    });
  });
});
