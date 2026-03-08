import { describe, it, expect } from 'vitest';
import { computeFormTrajectory } from '../../src/analytics/team-form-service.js';
import { broMatchesSeason2026, matchNoStrength } from '../fixtures/analytics/matches.js';
import { broFixtures2026 } from '../fixtures/analytics/fixtures.js';
import type { Match } from '../../src/domain/match.js';
import { MatchStatus } from '../../src/domain/match.js';
import type { Fixture } from '../../src/models/fixture.js';

describe('TeamFormService', () => {
  describe('computeFormTrajectory', () => {
    const completedMatches = broMatchesSeason2026.filter(m => m.status === MatchStatus.Completed);

    it('computes form trajectory with correct snapshot count (completed only)', () => {
      const result = computeFormTrajectory(broMatchesSeason2026, broFixtures2026, 'BRO', 2026, 5);
      // 8 completed matches out of 10
      expect(result.snapshots).toHaveLength(8);
      expect(result.teamCode).toBe('BRO');
      expect(result.year).toBe(2026);
      expect(result.windowSize).toBe(5);
    });

    it('scores win against hard opponent higher than win against easy opponent', () => {
      const result = computeFormTrajectory(broMatchesSeason2026, broFixtures2026, 'BRO', 2026, 5);
      // R1: win vs MEL (hard, strength -8), R3: win vs WST (easy, strength 7)
      const r1 = result.snapshots.find(s => s.round === 1)!;
      const r3 = result.snapshots.find(s => s.round === 3)!;
      expect(r1.result).toBe('win');
      expect(r3.result).toBe('win');
      // Win against harder opponent should have higher form score
      expect(r1.formScore).toBeGreaterThan(r3.formScore);
    });

    it('gives partial credit for close losses', () => {
      const result = computeFormTrajectory(broMatchesSeason2026, broFixtures2026, 'BRO', 2026, 5);
      // R2: loss by 6 — should have some form score (partial credit for close loss)
      const r2 = result.snapshots.find(s => s.round === 2)!;
      expect(r2.result).toBe('loss');
      expect(r2.formScore).toBeGreaterThan(0);
    });

    it('handles draw as 0.5 base score', () => {
      const result = computeFormTrajectory(broMatchesSeason2026, broFixtures2026, 'BRO', 2026, 5);
      // R4: draw
      const r4 = result.snapshots.find(s => s.round === 4)!;
      expect(r4.result).toBe('draw');
      expect(r4.formScore).toBeGreaterThan(0);
      expect(r4.formScore).toBeLessThan(1);
    });

    it('excludes byes from snapshots', () => {
      // Add a bye match
      const matchesWithBye: Match[] = [
        ...broMatchesSeason2026,
        {
          id: '2026-R11-BRO-BYE', year: 2026, round: 11,
          homeTeamCode: 'BRO', awayTeamCode: null,
          homeStrengthRating: null, awayStrengthRating: null,
          homeScore: null, awayScore: null, status: MatchStatus.Completed, scheduledTime: null,
        },
      ];
      const result = computeFormTrajectory(matchesWithBye, broFixtures2026, 'BRO', 2026, 5);
      // Bye should not appear in snapshots
      expect(result.snapshots.find(s => s.round === 11)).toBeUndefined();
    });

    it('handles missing strength ratings (no difficulty weighting)', () => {
      const matchesNoStrength: Match[] = [matchNoStrength];
      const result = computeFormTrajectory(matchesNoStrength, [], 'NEW', 2026, 5);
      expect(result.snapshots).toHaveLength(1);
      expect(result.snapshots[0].opponentStrengthRating).toBeNull();
      // Should still have a form score (raw result only)
      expect(result.snapshots[0].formScore).toBeGreaterThan(0);
    });

    it('computes rolling window mean correctly', () => {
      const result = computeFormTrajectory(broMatchesSeason2026, broFixtures2026, 'BRO', 2026, 5);
      // Rolling form is mean of last 5 snapshots (rounds 4-8)
      const last5 = result.snapshots.slice(-5);
      const expectedMean = last5.reduce((sum, s) => sum + s.formScore, 0) / 5;
      expect(result.rollingFormRating).toBeCloseTo(expectedMean, 5);
    });

    it('classifies outperforming when rolling form > 0.65', () => {
      // Create matches that are all wins against hard opponents
      const strongMatches: Match[] = Array.from({ length: 6 }, (_, i) => ({
        id: `2026-R${i + 1}-BRO-MEL`, year: 2026, round: i + 1,
        homeTeamCode: 'BRO', awayTeamCode: 'MEL',
        homeStrengthRating: -8, awayStrengthRating: 5,
        homeScore: 30, awayScore: 10, status: MatchStatus.Completed as const, scheduledTime: null,
      }));
      const strongFixtures: Fixture[] = strongMatches.map(m => ({
        id: `2026-BRO-${m.round}`, year: 2026, round: m.round, teamCode: 'BRO',
        opponentCode: 'MEL', isHome: true, isBye: false, strengthRating: -8,
      }));
      const result = computeFormTrajectory(strongMatches, strongFixtures, 'BRO', 2026, 5);
      expect(result.classification).toBe('outperforming');
    });

    it('classifies underperforming when rolling form < 0.35', () => {
      // All heavy losses
      const weakMatches: Match[] = Array.from({ length: 6 }, (_, i) => ({
        id: `2026-R${i + 1}-BRO-WST`, year: 2026, round: i + 1,
        homeTeamCode: 'BRO', awayTeamCode: 'WST',
        homeStrengthRating: 7, awayStrengthRating: -5,
        homeScore: 6, awayScore: 40, status: MatchStatus.Completed as const, scheduledTime: null,
      }));
      const weakFixtures: Fixture[] = weakMatches.map(m => ({
        id: `2026-BRO-${m.round}`, year: 2026, round: m.round, teamCode: 'BRO',
        opponentCode: 'WST', isHome: true, isBye: false, strengthRating: 7,
      }));
      const result = computeFormTrajectory(weakMatches, weakFixtures, 'BRO', 2026, 5);
      expect(result.classification).toBe('underperforming');
    });

    it('sets sampleSizeWarning when rounds < windowSize', () => {
      const fewMatches = broMatchesSeason2026.slice(0, 3); // only 3 completed
      const result = computeFormTrajectory(fewMatches, broFixtures2026, 'BRO', 2026, 5);
      expect(result.sampleSizeWarning).toBe(true);
    });

    it('returns null ratings and classification for empty results', () => {
      const result = computeFormTrajectory([], [], 'BRO', 2026, 5);
      expect(result.snapshots).toHaveLength(0);
      expect(result.rollingFormRating).toBeNull();
      expect(result.classification).toBeNull();
      expect(result.sampleSizeWarning).toBe(true);
    });
  });
});
