import { describe, it, expect } from 'vitest';
import { computeCompositionImpact } from '../../src/analytics/composition-service.js';
import type { Match } from '../../src/domain/match.js';
import { MatchStatus } from '../../src/domain/match.js';
import type { Player } from '../../src/domain/player.js';

// Helper to create completed matches
function makeMatch(round: number, homeScore: number, awayScore: number): Match {
  return {
    id: `2026-R${round}-BRO-OPP`, year: 2026, round,
    homeTeamCode: 'BRO', awayTeamCode: 'OPP',
    homeStrengthRating: null, awayStrengthRating: null,
    homeScore, awayScore, status: MatchStatus.Completed, scheduledTime: null,
  };
}

// Helper to create player with specific rounds played
function makePlayer(id: string, name: string, rounds: number[], fpValues?: number[]): Player {
  return {
    id, name, dateOfBirth: null, teamCode: 'BRO', position: 'Lock',
    performances: rounds.map((r, i) => ({
      matchId: `2026-R${r}-BRO-OPP`, year: 2026, round: r, teamCode: 'BRO',
      tries: 0, goals: 0, tackles: 20, runMetres: 80,
      fantasyPoints: fpValues ? fpValues[i] : 40,
      isComplete: true,
    })),
  };
}

describe('CompositionService', () => {
  // 8 completed matches: wins in rounds 1,2,3,5,7, losses in 4,6,8
  const teamMatches: Match[] = [
    makeMatch(1, 24, 12), // win
    makeMatch(2, 20, 14), // win
    makeMatch(3, 30, 10), // win
    makeMatch(4, 10, 22), // loss
    makeMatch(5, 18, 12), // win
    makeMatch(6, 8, 28),  // loss
    makeMatch(7, 22, 16), // win
    makeMatch(8, 12, 20), // loss
  ];

  describe('computeCompositionImpact', () => {
    it('computes availability-based impact for player who missed 3 matches', () => {
      // Player played rounds 1,2,3,5,7 (all wins), missed 4,6,8 (all losses)
      const player = makePlayer('star-player', 'Star Player', [1, 2, 3, 5, 7]);

      const result = computeCompositionImpact(teamMatches, [player], 'BRO', 2026);
      expect(result.playerImpacts).toHaveLength(1);

      const impact = result.playerImpacts[0];
      expect(impact.method).toBe('availability');
      expect(impact.matchesPlayed).toBe(5);
      expect(impact.matchesMissed).toBe(3);
      expect(impact.winRateWith).toBe(1.0); // won all 5 with
      expect(impact.winRateWithout).toBe(0.0); // lost all 3 without
      expect(impact.impactScore).toBe(1.0);
    });

    it('uses correlation method for player who played every match', () => {
      // Player played all 8 rounds — high FP in wins, low in losses
      const player = makePlayer('ever-present', 'Ever Present',
        [1, 2, 3, 4, 5, 6, 7, 8],
        [60, 55, 70, 20, 50, 15, 65, 25] // high FP in wins, low in losses
      );

      const result = computeCompositionImpact(teamMatches, [player], 'BRO', 2026);
      expect(result.playerImpacts).toHaveLength(1);

      const impact = result.playerImpacts[0];
      expect(impact.method).toBe('correlation');
      expect(impact.matchesMissed).toBe(0);
      expect(impact.winRateWithout).toBeNull();
      expect(impact.impactScore).toBeGreaterThan(0); // positive correlation
    });

    it('excludes player with fewer than 3 matches', () => {
      const player = makePlayer('bench-warmer', 'Bench Warmer', [1, 2]); // only 2 rounds

      const result = computeCompositionImpact(teamMatches, [player], 'BRO', 2026);
      expect(result.playerImpacts).toHaveLength(0);
    });

    it('returns sampleSizeWarning when team has fewer than 5 matches', () => {
      const fewMatches = teamMatches.slice(0, 4); // only 4 matches
      const player = makePlayer('test-player', 'Test Player', [1, 2, 3]);

      const result = computeCompositionImpact(fewMatches, [player], 'BRO', 2026);
      expect(result.sampleSizeWarning).toBe(true);
      expect(result.playerImpacts).toHaveLength(0);
    });

    it('ranks players by absolute impact score descending', () => {
      const highImpact = makePlayer('high-impact', 'High Impact', [1, 2, 3, 5, 7]); // all wins
      const lowImpact = makePlayer('low-impact', 'Low Impact',
        [1, 2, 3, 4, 5, 6, 7, 8],
        [40, 40, 40, 40, 40, 40, 40, 40] // flat FP, no correlation
      );

      const result = computeCompositionImpact(teamMatches, [highImpact, lowImpact], 'BRO', 2026);
      expect(result.playerImpacts.length).toBe(2);
      expect(Math.abs(result.playerImpacts[0].impactScore))
        .toBeGreaterThanOrEqual(Math.abs(result.playerImpacts[1].impactScore));
    });
  });
});
