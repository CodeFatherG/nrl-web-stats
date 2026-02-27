/**
 * Unit tests for cache expiry calculation
 */

import { describe, it, expect } from 'vitest';
import { getNextMondayExpiry } from '../../src/cache/store.js';

describe('getNextMondayExpiry', () => {
  // Helper to create dates in specific timezone
  const createUTCDate = (year: number, month: number, day: number, hour: number = 0, minute: number = 0) => {
    return new Date(Date.UTC(year, month - 1, day, hour, minute));
  };

  describe('when called on a Monday', () => {
    it('returns same day 4pm AEST if before 4pm', () => {
      // Monday 6am UTC = Monday 4pm AEST (UTC+10)
      // So 2am UTC on Monday = 12pm AEST (before 4pm)
      const monday2amUtc = createUTCDate(2026, 3, 2, 2, 0); // Monday March 2, 2026 2am UTC
      const expiry = getNextMondayExpiry(monday2amUtc);

      // Expiry should be Monday 4pm AEST = Monday 6am UTC
      expect(expiry.getUTCDay()).toBe(1); // Monday
      expect(expiry.getUTCHours()).toBe(6); // 4pm AEST = 6am UTC
      expect(expiry.getUTCMinutes()).toBe(0);
    });

    it('returns next Monday 4pm AEST if after 4pm', () => {
      // Monday 8am UTC = Monday 6pm AEST (after 4pm)
      const monday8amUtc = createUTCDate(2026, 3, 2, 8, 0); // Monday March 2, 2026 8am UTC
      const expiry = getNextMondayExpiry(monday8amUtc);

      // Expiry should be next Monday 4pm AEST = next Monday 6am UTC
      expect(expiry.getUTCDay()).toBe(1); // Monday
      expect(expiry.getUTCHours()).toBe(6); // 4pm AEST = 6am UTC
      // Should be 7 days later
      const daysDiff = (expiry.getTime() - monday8amUtc.getTime()) / (24 * 60 * 60 * 1000);
      expect(daysDiff).toBeCloseTo(6.917, 1); // ~7 days minus the 2 hours difference
    });

    it('returns next Monday at exactly 4pm boundary', () => {
      // Monday exactly 6am UTC = Monday 4pm AEST
      const mondayExactly4pmAest = createUTCDate(2026, 3, 2, 6, 0);
      const expiry = getNextMondayExpiry(mondayExactly4pmAest);

      // At exactly 4pm, should return next Monday
      expect(expiry.getUTCDay()).toBe(1); // Monday
      expect(expiry.getUTCHours()).toBe(6);
    });
  });

  describe('when called on other weekdays', () => {
    it('returns coming Monday 4pm AEST when called on Tuesday', () => {
      // Tuesday March 3, 2026 at noon UTC
      const tuesday = createUTCDate(2026, 3, 3, 12, 0);
      const expiry = getNextMondayExpiry(tuesday);

      expect(expiry.getUTCDay()).toBe(1); // Monday
      expect(expiry.getUTCHours()).toBe(6); // 4pm AEST
      // Should be March 9, 2026
      expect(expiry.getUTCDate()).toBe(9);
    });

    it('returns coming Monday 4pm AEST when called on Wednesday', () => {
      const wednesday = createUTCDate(2026, 3, 4, 12, 0);
      const expiry = getNextMondayExpiry(wednesday);

      expect(expiry.getUTCDay()).toBe(1);
      expect(expiry.getUTCDate()).toBe(9);
    });

    it('returns coming Monday 4pm AEST when called on Friday', () => {
      const friday = createUTCDate(2026, 3, 6, 12, 0);
      const expiry = getNextMondayExpiry(friday);

      expect(expiry.getUTCDay()).toBe(1);
      expect(expiry.getUTCDate()).toBe(9);
    });

    it('returns coming Monday 4pm AEST when called on Saturday', () => {
      const saturday = createUTCDate(2026, 3, 7, 12, 0);
      const expiry = getNextMondayExpiry(saturday);

      expect(expiry.getUTCDay()).toBe(1);
      expect(expiry.getUTCDate()).toBe(9);
    });
  });

  describe('when called on Sunday', () => {
    it('returns next day (Monday) 4pm AEST', () => {
      // Sunday March 1, 2026 at noon UTC
      const sunday = createUTCDate(2026, 3, 1, 12, 0);
      const expiry = getNextMondayExpiry(sunday);

      expect(expiry.getUTCDay()).toBe(1); // Monday
      expect(expiry.getUTCDate()).toBe(2); // March 2
      expect(expiry.getUTCHours()).toBe(6); // 4pm AEST
    });
  });

  describe('edge cases', () => {
    it('handles month boundaries correctly', () => {
      // Wednesday April 29, 2026 - next Monday is May 4
      const endOfApril = createUTCDate(2026, 4, 29, 12, 0);
      const expiry = getNextMondayExpiry(endOfApril);

      expect(expiry.getUTCDay()).toBe(1);
      expect(expiry.getUTCMonth()).toBe(4); // May (0-indexed)
      expect(expiry.getUTCDate()).toBe(4);
    });

    it('handles year boundaries correctly', () => {
      // Wednesday December 30, 2026 - next Monday is January 4, 2027
      const endOfYear = createUTCDate(2026, 12, 30, 12, 0);
      const expiry = getNextMondayExpiry(endOfYear);

      expect(expiry.getUTCDay()).toBe(1);
      expect(expiry.getUTCFullYear()).toBe(2027);
      expect(expiry.getUTCMonth()).toBe(0); // January
    });

    it('defaults to current time when no argument provided', () => {
      const expiry = getNextMondayExpiry();

      // Should be a future Monday at 6am UTC (4pm AEST)
      expect(expiry.getUTCDay()).toBe(1);
      expect(expiry.getUTCHours()).toBe(6);
      expect(expiry.getTime()).toBeGreaterThan(Date.now());
    });
  });
});
