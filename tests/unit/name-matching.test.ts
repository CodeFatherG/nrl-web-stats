import { describe, it, expect } from 'vitest';
import {
  normalizeName,
  toSupplementaryFormat,
  matchPlayerName,
} from '../../src/config/player-name-matcher.js';
import type { MatchingContext } from '../../src/config/player-name-matcher.js';

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

    it('works without context parameter (backward compat)', () => {
      const result = matchPlayerName('1', 'Nathan', 'Cleary', 'PTH', names);
      expect(result).not.toBeNull();
      expect(result!.confidence).toBe('exact');
    });
  });

  describe('persisted link tier', () => {
    const names = ['Brimson, Alexander', 'Cleary, Nathan'];

    it('matches via persisted link (highest priority)', () => {
      const context: MatchingContext = {
        persistedLinks: new Map([['aj-brimson', 'Brimson, Alexander']]),
      };
      const result = matchPlayerName('aj-brimson', 'AJ', 'Brimson', 'GCT', names, context);
      expect(result).not.toBeNull();
      expect(result!.confidence).toBe('linked');
      expect(result!.supplementaryName).toBe('Brimson, Alexander');
    });

    it('persisted link takes priority over exact match', () => {
      // Even though "Nathan Cleary" would exact-match, the persisted link wins
      const context: MatchingContext = {
        persistedLinks: new Map([['nathan-cleary', 'Brimson, Alexander']]),
      };
      const result = matchPlayerName('nathan-cleary', 'Nathan', 'Cleary', 'PTH', names, context);
      expect(result).not.toBeNull();
      expect(result!.confidence).toBe('linked');
      expect(result!.supplementaryName).toBe('Brimson, Alexander');
    });

    it('falls through if persisted link name not in supplementary list', () => {
      const context: MatchingContext = {
        persistedLinks: new Map([['aj-brimson', 'Brimson, Nonexistent']]),
      };
      // Should fall through to other tiers — no exact/fuzzy match for "AJ Brimson" either
      const result = matchPlayerName('aj-brimson', 'AJ', 'Brimson', 'GCT', names, context);
      // No exact or fuzzy match possible (AJ is not a prefix of Alexander and vice versa)
      // But team-based matching not available without teamCodes context
      expect(result).toBeNull();
    });
  });

  describe('team-based last name tier', () => {
    const names = ['Brimson, Alexander', 'Cleary, Nathan', 'Trbojevic, Tom', 'Trbojevic, Jake'];

    it('matches by last name + team code when unique on team', () => {
      const context: MatchingContext = {
        supplementaryTeamCodes: new Map([
          ['Brimson, Alexander', 'GCT'],
          ['Cleary, Nathan', 'PTH'],
          ['Trbojevic, Tom', 'MNL'],
          ['Trbojevic, Jake', 'MNL'],
        ]),
      };
      const result = matchPlayerName('aj-brimson', 'AJ', 'Brimson', 'GCT', names, context);
      expect(result).not.toBeNull();
      expect(result!.confidence).toBe('team_lastname');
      expect(result!.supplementaryName).toBe('Brimson, Alexander');
    });

    it('returns null for siblings on same team (ambiguous)', () => {
      const context: MatchingContext = {
        supplementaryTeamCodes: new Map([
          ['Brimson, Alexander', 'GCT'],
          ['Cleary, Nathan', 'PTH'],
          ['Trbojevic, Tom', 'MNL'],
          ['Trbojevic, Jake', 'MNL'],
        ]),
      };
      // "Some Trbojevic" on MNL — two Trbojevics on that team
      const result = matchPlayerName('some-trbojevic', 'Some', 'Trbojevic', 'MNL', names, context);
      expect(result).toBeNull();
    });

    it('returns null when team code does not match', () => {
      const context: MatchingContext = {
        supplementaryTeamCodes: new Map([
          ['Brimson, Alexander', 'GCT'],
        ]),
      };
      // AJ Brimson on wrong team
      const result = matchPlayerName('aj-brimson', 'AJ', 'Brimson', 'SYD', names, context);
      expect(result).toBeNull();
    });

    it('exact match takes priority over team-based match', () => {
      const context: MatchingContext = {
        supplementaryTeamCodes: new Map([
          ['Cleary, Nathan', 'PTH'],
        ]),
      };
      const result = matchPlayerName('nathan-cleary', 'Nathan', 'Cleary', 'PTH', names, context);
      expect(result).not.toBeNull();
      expect(result!.confidence).toBe('exact');
    });
  });
});
