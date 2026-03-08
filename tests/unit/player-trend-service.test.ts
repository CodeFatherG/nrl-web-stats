import { describe, it, expect } from 'vitest';
import { computePlayerTrends } from '../../src/analytics/player-trend-service.js';
import { trendingUpPlayer, stablePlayer, trendingDownPlayer, insufficientDataPlayer, broPlayers } from '../fixtures/analytics/players.js';

describe('PlayerTrendService', () => {
  describe('computePlayerTrends', () => {
    it('detects upward trend in fantasy points', () => {
      const trends = computePlayerTrends([trendingUpPlayer], 2026, 5);
      expect(trends).toHaveLength(1);
      const trend = trends[0];
      expect(trend.playerId).toBe('john-smith-1995-03-15');
      expect(trend.isSignificant).toBe(true);

      const fp = trend.stats.find(s => s.statName === 'fantasyPoints')!;
      expect(fp.direction).toBe('up');
      expect(fp.deviationPercent).toBeGreaterThan(20);
      expect(fp.windowAverage).toBeGreaterThan(fp.seasonAverage);
    });

    it('marks stable player as not significant', () => {
      const trends = computePlayerTrends([stablePlayer], 2026, 5);
      const trend = trends[0];
      expect(trend.isSignificant).toBe(false);

      for (const stat of trend.stats) {
        expect(stat.direction).toBe('stable');
        expect(Math.abs(stat.deviationPercent)).toBeLessThanOrEqual(20);
      }
    });

    it('detects declining tackles', () => {
      const trends = computePlayerTrends([trendingDownPlayer], 2026, 5);
      const trend = trends[0];
      expect(trend.isSignificant).toBe(true);

      const tackles = trend.stats.find(s => s.statName === 'tackles')!;
      expect(tackles.direction).toBe('down');
      expect(tackles.deviationPercent).toBeLessThan(-20);
    });

    it('returns sampleSizeWarning for insufficient data', () => {
      const trends = computePlayerTrends([insufficientDataPlayer], 2026, 5);
      const trend = trends[0];
      expect(trend.roundsPlayed).toBe(1);
      expect(trend.sampleSizeWarning).toBe(true);
      expect(trend.isSignificant).toBe(false);
    });

    it('respects configurable window size', () => {
      const trends3 = computePlayerTrends([trendingUpPlayer], 2026, 3);
      const trends8 = computePlayerTrends([trendingUpPlayer], 2026, 8);

      // Window of 3 should use last 3 rounds, window of 8 should use all
      const fp3 = trends3[0].stats.find(s => s.statName === 'fantasyPoints')!;
      const fp8 = trends8[0].stats.find(s => s.statName === 'fantasyPoints')!;

      // With window=8 (all rounds), window avg == season avg, so deviation ~0
      expect(Math.abs(fp8.deviationPercent)).toBeLessThan(1);
      // With window=3 (last 3 rounds), should show larger deviation
      expect(Math.abs(fp3.deviationPercent)).toBeGreaterThan(Math.abs(fp8.deviationPercent));
    });

    it('filters significantOnly correctly', () => {
      const trends = computePlayerTrends(broPlayers, 2026, 5);
      const significant = trends.filter(t => t.isSignificant);
      const nonSignificant = trends.filter(t => !t.isSignificant);

      expect(significant.length).toBeGreaterThan(0);
      expect(nonSignificant.length).toBeGreaterThan(0);
    });

    it('handles player with no performances in year', () => {
      const trends = computePlayerTrends([trendingUpPlayer], 2025, 5);
      expect(trends[0].roundsPlayed).toBe(0);
      expect(trends[0].sampleSizeWarning).toBe(true);
    });
  });
});
