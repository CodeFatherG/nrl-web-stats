import { describe, it, expect } from 'vitest';
import {
  normalizeName,
  toSupplementaryFormat,
  matchPlayerName,
} from '../../src/config/player-name-matcher.js';

describe('player-name-matcher', () => {
  describe('normalizeName', () => {
    it('lowercases names', () => {
      expect(normalizeName('Nathan Cleary')).toBe('nathan cleary');
    });

    it('strips apostrophes', () => {
      expect(normalizeName("O'Sullivan")).toBe('osullivan');
    });

    it('strips diacritics', () => {
      expect(normalizeName('Sébastien')).toBe('sebastien');
    });

    it('normalizes hyphens to spaces', () => {
      expect(normalizeName('Harris-Tavita')).toBe('harris tavita');
    });

    it('collapses whitespace', () => {
      expect(normalizeName('  John   Smith  ')).toBe('john smith');
    });
  });

  describe('toSupplementaryFormat', () => {
    it('converts first/last to supplementary format', () => {
      expect(toSupplementaryFormat('Nathan', 'Cleary')).toBe('cleary, nathan');
    });
  });

  describe('matchPlayerName', () => {
    const names = [
      'Cleary, Nathan',
      'Munster, Cameron',
      'Walsh, Reece',
      "O'Sullivan, Lachlan",
      'Harris-Tavita, Chanel',
      'Talakai, Siosifa',
    ];

    it('exact match for simple names', () => {
      const result = matchPlayerName('1', 'Nathan', 'Cleary', 'PTH', names);
      expect(result).not.toBeNull();
      expect(result!.confidence).toBe('exact');
      expect(result!.supplementaryName).toBe('Cleary, Nathan');
    });

    it('matches names with apostrophes', () => {
      const result = matchPlayerName('2', "Lachlan", "O'Sullivan", 'BRO', names);
      expect(result).not.toBeNull();
      expect(result!.supplementaryName).toBe("O'Sullivan, Lachlan");
    });

    it('matches names with hyphens', () => {
      const result = matchPlayerName('3', 'Chanel', 'Harris-Tavita', 'NZL', names);
      expect(result).not.toBeNull();
      expect(result!.supplementaryName).toBe('Harris-Tavita, Chanel');
    });

    it('returns null for unmatched player', () => {
      const result = matchPlayerName('99', 'Unknown', 'Player', 'MEL', names);
      expect(result).toBeNull();
    });

    it('fuzzy matches abbreviated first names', () => {
      // "N" should fuzzy match "Nathan"
      const result = matchPlayerName('4', 'N', 'Cleary', 'PTH', names);
      expect(result).not.toBeNull();
      expect(result!.confidence).toBe('normalized');
      expect(result!.supplementaryName).toBe('Cleary, Nathan');
    });

    it('returns null when no last name match exists', () => {
      const result = matchPlayerName('5', 'James', 'Nonexistent', 'SYD', names);
      expect(result).toBeNull();
    });
  });
});
