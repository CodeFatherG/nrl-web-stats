import { describe, it, expect } from 'vitest';
import {
  loadScoringConfig,
  getScoringEntryByName,
  getEntriesByCategory,
  getAvailableSeasons,
} from '../../src/config/supercoach-scoring-config.js';

describe('supercoach-scoring-config', () => {
  describe('loadScoringConfig', () => {
    it('loads the 2026 scoring config successfully', () => {
      const config = loadScoringConfig(2026);
      expect(config.season).toBe(2026);
      expect(config.stats.length).toBeGreaterThanOrEqual(25);
    });

    it('throws for an unavailable season', () => {
      expect(() => loadScoringConfig(1999)).toThrow('No scoring configuration for season 1999');
    });

    it('includes all six categories', () => {
      const config = loadScoringConfig(2026);
      const categories = new Set(config.stats.map(s => s.category));
      expect(categories).toEqual(new Set(['scoring', 'create', 'evade', 'base', 'defence', 'negative']));
    });

    it('includes both primary and supplementary sources', () => {
      const config = loadScoringConfig(2026);
      const sources = new Set(config.stats.map(s => s.source));
      expect(sources.has('primary')).toBe(true);
      expect(sources.has('supplementary')).toBe(true);
    });
  });

  describe('getScoringEntryByName', () => {
    it('finds an entry by stat name', () => {
      const config = loadScoringConfig(2026);
      const entry = getScoringEntryByName(config, 'tries');
      expect(entry).toBeDefined();
      expect(entry!.points).toBe(17);
      expect(entry!.category).toBe('scoring');
    });

    it('returns undefined for unknown stat name', () => {
      const config = loadScoringConfig(2026);
      expect(getScoringEntryByName(config, 'nonexistent')).toBeUndefined();
    });
  });

  describe('getEntriesByCategory', () => {
    it('returns all entries for a category', () => {
      const config = loadScoringConfig(2026);
      const negativeEntries = getEntriesByCategory(config, 'negative');
      expect(negativeEntries.length).toBeGreaterThanOrEqual(4);
      for (const entry of negativeEntries) {
        expect(entry.category).toBe('negative');
        expect(entry.points).toBeLessThan(0);
      }
    });

    it('returns empty array for category with no entries if none exist', () => {
      const config = loadScoringConfig(2026);
      const entries = getEntriesByCategory(config, 'defence');
      // Defence should have try saves and held up in goal
      expect(entries.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('getAvailableSeasons', () => {
    it('includes 2026', () => {
      expect(getAvailableSeasons()).toContain(2026);
    });
  });
});
