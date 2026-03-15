import { describe, it, expect } from 'vitest';
import { computePlayerScore } from '../../src/analytics/supercoach-scoring-service.js';
import { loadScoringConfig } from '../../src/config/supercoach-scoring-config.js';
import type { MergedPlayerStats, PrimaryScoringStats } from '../../src/analytics/supercoach-types.js';
import type { SupplementaryPlayerStats } from '../../src/domain/ports/supplementary-stats-source.js';

const config = loadScoringConfig(2026);

function createPrimaryStats(overrides: Partial<PrimaryScoringStats> = {}): PrimaryScoringStats {
  return {
    playerId: '219',
    playerName: 'Nathan Cleary',
    teamCode: 'PTH',
    matchId: 'MEL-PTH-2026-1',
    year: 2026,
    round: 1,
    tries: 0,
    conversions: 0,
    penaltyGoals: 0,
    onePointFieldGoals: 0,
    twoPointFieldGoals: 0,
    tryAssists: 0,
    lineBreakAssists: 0,
    forcedDropOutKicks: 0,
    fortyTwentyKicks: 0,
    twentyFortyKicks: 0,
    kicksDead: 0,
    tackleBreaks: 0,
    lineBreaks: 0,
    intercepts: 0,
    tacklesMade: 0,
    missedTackles: 0,
    penalties: 0,
    errors: 0,
    sinBins: 0,
    sendOffs: 0,
    offloads: 0,
    allRuns: 0,
    ...overrides,
  };
}

function createSupplementaryStats(
  overrides: Partial<SupplementaryPlayerStats> = {}
): SupplementaryPlayerStats {
  return {
    playerName: 'Cleary, Nathan',
    season: 2026,
    round: 1,
    lastTouch: 0,
    missedGoals: 0,
    missedFieldGoals: 0,
    effectiveOffloads: 0,
    ineffectiveOffloads: 0,
    runsOver8m: 0,
    runsUnder8m: 0,
    trySaves: 0,
    kickRegatherBreak: 0,
    heldUpInGoal: 0,
    ...overrides,
  };
}

function createMerged(
  primaryOverrides: Partial<PrimaryScoringStats> = {},
  supplementaryOverrides: Partial<SupplementaryPlayerStats> | null = {}
): MergedPlayerStats {
  return {
    primary: createPrimaryStats(primaryOverrides),
    supplementary: supplementaryOverrides === null ? null : createSupplementaryStats(supplementaryOverrides),
    matchConfidence: supplementaryOverrides === null ? 'unmatched' : 'exact',
  };
}

describe('supercoach-scoring-service', () => {
  describe('computePlayerScore — full data', () => {
    it('computes correct total for a try scorer', () => {
      const merged = createMerged(
        { tries: 1, tacklesMade: 25, tackleBreaks: 4 },
        { runsOver8m: 5, runsUnder8m: 3 }
      );
      const score = computePlayerScore(merged, config);

      // tries=1×17=17, tackles=25×1=25, tackleBreaks=4×2=8, runs8m=5×2=10, runsU8m=3×1=3
      expect(score.totalScore).toBe(17 + 25 + 8 + 10 + 3);
      expect(score.isComplete).toBe(true);
      expect(score.matchConfidence).toBe('exact');
    });

    it('computes correct total for a playmaker with goals', () => {
      const merged = createMerged(
        { conversions: 4, tryAssists: 1, lineBreakAssists: 1, tacklesMade: 18, missedTackles: 2 },
        { lastTouch: 1, effectiveOffloads: 1 }
      );
      const score = computePlayerScore(merged, config);

      // goals=4×4=16, tryAssists=1×12=12, LBA=1×8=8, tackles=18×1=18, missed=-2×1=-2
      // lastTouch=1×4=4, effOffloads=1×4=4
      expect(score.totalScore).toBe(16 + 12 + 8 + 18 - 2 + 4 + 4);
    });

    it('groups stat contributions into correct categories', () => {
      const merged = createMerged(
        { tries: 1, tryAssists: 1, tackleBreaks: 2, tacklesMade: 10, penalties: 1 },
        { trySaves: 1, runsOver8m: 3 }
      );
      const score = computePlayerScore(merged, config);

      expect(score.categoryTotals.scoring).toBe(17); // tries=17
      expect(score.categoryTotals.create).toBe(12);  // tryAssists=12
      expect(score.categoryTotals.evade).toBe(4);    // tackleBreaks=2×2=4
      expect(score.categoryTotals.base).toBe(10 + 6); // tackles=10, runs8m=3×2=6
      expect(score.categoryTotals.defence).toBe(3);   // trySaves=1×3=3
      expect(score.categoryTotals.negative).toBe(-2); // penalties=1×-2=-2
    });

    it('computes negative contributions correctly', () => {
      const merged = createMerged(
        { penalties: 2, errors: 3, sinBins: 1, kicksDead: 1 },
        { missedGoals: 1, missedFieldGoals: 1 }
      );
      const score = computePlayerScore(merged, config);

      // penalties=-4, errors=-6, sinBin=-8, kicksDead=-3, missedGoals=-2, missedFG=-1
      expect(score.categoryTotals.negative).toBe(-4 + -6 + -8);
      expect(score.categoryTotals.create).toBe(-3); // kicksDead
      expect(score.categoryTotals.scoring).toBe(-2 + -1); // missedGoals + missedFG
    });

    it('handles all zero stats', () => {
      const merged = createMerged({}, {});
      const score = computePlayerScore(merged, config);

      expect(score.totalScore).toBe(0);
      expect(score.isComplete).toBe(true);
      for (const cat of ['scoring', 'create', 'evade', 'base', 'defence', 'negative'] as const) {
        expect(score.categoryTotals[cat]).toBe(0);
      }
    });

    it('returns all six category keys even when empty', () => {
      const merged = createMerged({}, {});
      const score = computePlayerScore(merged, config);

      expect(Object.keys(score.categories)).toEqual(
        expect.arrayContaining(['scoring', 'create', 'evade', 'base', 'defence', 'negative'])
      );
    });
  });

  describe('computePlayerScore — partial data (primary only)', () => {
    it('sets isComplete false when supplementary is null', () => {
      const merged = createMerged({ tries: 1, tacklesMade: 20 }, null);
      const score = computePlayerScore(merged, config);

      expect(score.isComplete).toBe(false);
      expect(score.matchConfidence).toBe('unmatched');
    });

    it('computes primary-only stats when supplementary is missing', () => {
      const merged = createMerged({ tries: 1, tacklesMade: 20, penalties: 1 }, null);
      const score = computePlayerScore(merged, config);

      // tries=17, tackles=20, penalties=-2 — supplementary stats skipped
      expect(score.totalScore).toBe(17 + 20 - 2);
    });

    it('supplementary stat contributions are absent', () => {
      const merged = createMerged({ tries: 1 }, null);
      const score = computePlayerScore(merged, config);

      // No supplementary category contributions
      const suppStatNames = ['lastTouch', 'missedGoals', 'missedFieldGoals',
        'effectiveOffloads', 'ineffectiveOffloads', 'runsOver8m', 'runsUnder8m',
        'trySaves', 'kickRegatherBreak', 'heldUpInGoal'];

      const allContributions = Object.values(score.categories).flat();
      for (const name of suppStatNames) {
        expect(allContributions.find(c => c.statName === name)).toBeUndefined();
      }
    });

    it('does not produce validation warnings when supplementary is null', () => {
      const merged = createMerged({ tries: 1 }, null);
      const score = computePlayerScore(merged, config);
      expect(score.validationWarnings).toHaveLength(0);
    });
  });

  describe('validation warnings', () => {
    it('generates offload mismatch warning', () => {
      const merged = createMerged(
        { offloads: 5 },
        { effectiveOffloads: 3, ineffectiveOffloads: 1 } // 4 ≠ 5
      );
      const score = computePlayerScore(merged, config);

      const offloadWarning = score.validationWarnings.find(w => w.type === 'offload_mismatch');
      expect(offloadWarning).toBeDefined();
      expect(offloadWarning!.primaryValue).toBe(5);
      expect(offloadWarning!.supplementaryValue).toBe(4);
    });

    it('does not warn when offloads match', () => {
      const merged = createMerged(
        { offloads: 4 },
        { effectiveOffloads: 3, ineffectiveOffloads: 1 }
      );
      const score = computePlayerScore(merged, config);

      expect(score.validationWarnings.find(w => w.type === 'offload_mismatch')).toBeUndefined();
    });

    it('generates run count mismatch warning when diff > 5', () => {
      const merged = createMerged(
        { allRuns: 20 },
        { runsOver8m: 5, runsUnder8m: 8 } // 13 vs 20, diff=7
      );
      const score = computePlayerScore(merged, config);

      const runWarning = score.validationWarnings.find(w => w.type === 'run_count_mismatch');
      expect(runWarning).toBeDefined();
      expect(runWarning!.primaryValue).toBe(20);
      expect(runWarning!.supplementaryValue).toBe(13);
    });

    it('does not warn when run diff ≤ 5', () => {
      const merged = createMerged(
        { allRuns: 15 },
        { runsOver8m: 5, runsUnder8m: 8 } // 13 vs 15, diff=2
      );
      const score = computePlayerScore(merged, config);

      expect(score.validationWarnings.find(w => w.type === 'run_count_mismatch')).toBeUndefined();
    });

  });

  describe('stat contributions detail', () => {
    it('each contribution has correct rawValue, pointsPerUnit, and contribution', () => {
      const merged = createMerged(
        { tries: 2, conversions: 3 },
        {}
      );
      const score = computePlayerScore(merged, config);

      const triesContrib = score.categories.scoring.find(c => c.statName === 'tries');
      expect(triesContrib).toBeDefined();
      expect(triesContrib!.rawValue).toBe(2);
      expect(triesContrib!.pointsPerUnit).toBe(17);
      expect(triesContrib!.contribution).toBe(34);

      const goalsContrib = score.categories.scoring.find(c => c.statName === 'goals');
      expect(goalsContrib).toBeDefined();
      expect(goalsContrib!.rawValue).toBe(3);
      expect(goalsContrib!.pointsPerUnit).toBe(4);
      expect(goalsContrib!.contribution).toBe(12);
    });

    it('category totals sum to total score', () => {
      const merged = createMerged(
        { tries: 1, tacklesMade: 25, errors: 2, lineBreaks: 1 },
        { runsOver8m: 5, trySaves: 1 }
      );
      const score = computePlayerScore(merged, config);

      const sumOfCategories = Object.values(score.categoryTotals).reduce((a, b) => a + b, 0);
      expect(sumOfCategories).toBe(score.totalScore);
    });
  });

  describe('identity fields', () => {
    it('propagates player identity from primary stats', () => {
      const merged = createMerged(
        { playerId: '999', playerName: 'Test Player', teamCode: 'BRO', matchId: 'M1', year: 2026, round: 5 },
        {}
      );
      const score = computePlayerScore(merged, config);

      expect(score.playerId).toBe('999');
      expect(score.playerName).toBe('Test Player');
      expect(score.teamCode).toBe('BRO');
      expect(score.matchId).toBe('M1');
      expect(score.year).toBe(2026);
      expect(score.round).toBe(5);
    });
  });
});
