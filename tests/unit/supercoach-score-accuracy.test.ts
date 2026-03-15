/**
 * Supercoach score accuracy test — compares calculated scores against published scores
 * using real scraped data from nrl.com and nrlsupercoachstats.com.
 *
 * Fixture data:
 *   - Primary stats: nrl.com match centre API (Sharks v Titans, Round 1, 2026)
 *   - Supplementary stats: nrlsupercoachstats.com jqGrid endpoint
 *
 * The supplementary source columns are POINT CONTRIBUTIONS (raw × pointsPerUnit).
 * The adapter divides by pointsPerUnit to recover raw counts.
 * Published scores in fixtures are used only for test validation — not stored in production.
 */

import { describe, it, expect } from 'vitest';
import { computePlayerScore } from '../../src/analytics/supercoach-scoring-service.js';
import { loadScoringConfig } from '../../src/config/supercoach-scoring-config.js';
import type { PrimaryScoringStats, MergedPlayerStats } from '../../src/analytics/supercoach-types.js';
import type { SupplementaryPlayerStats } from '../../src/domain/ports/supplementary-stats-source.js';

import primaryFixture from '../fixtures/supercoach-scoring/sha-v-gct-r1-2026-primary.json';
import supplementaryFixture from '../fixtures/supercoach-scoring/sha-v-gct-r1-2026-supplementary.json';

const config = loadScoringConfig(2026);

// ---------------------------------------------------------------------------
// Point-value divisors (must match scoring config)
// ---------------------------------------------------------------------------
const POINTS_PER_UNIT: Record<string, number> = {
  lastTouch: 4,
  missedGoals: -2,
  missedFieldGoals: -1,
  effectiveOffloads: 4,
  ineffectiveOffloads: 2,
  runsOver8m: 2,
  runsUnder8m: 1,
  kickRegatherBreak: 8,
  heldUpInGoal: 3,
};

function pointsToRaw(pointContribution: number, pointsPerUnit: number): number {
  if (pointsPerUnit === 0) return 0;
  return Math.round(pointContribution / pointsPerUnit);
}

// ---------------------------------------------------------------------------
// Build test data from fixtures
// ---------------------------------------------------------------------------

interface TestPlayer {
  name: string;
  /** Published score from supplementary source fixture (test-only, not stored in production) */
  publishedScore: number;
  primary: PrimaryScoringStats;
  /** Supplementary with raw counts (point contributions ÷ pointsPerUnit) — what the adapter produces */
  supplementaryRaw: SupplementaryPlayerStats;
  /** Expected primary-only score */
  expectedPrimaryOnlyScore: number;
  /** Sum of supplementary-only point columns from source */
  expectedSupplementaryContribution: number;
}

const SUPPLEMENTARY_ONLY_COLUMNS = ['LT', 'MG', 'MF', 'OL', 'IO', 'H8', 'HU', 'KB', 'HG'] as const;
const PRIMARY_DUPLICATE_COLUMNS = ['TR', 'TS', 'GO', 'FG', 'TA', 'MT', 'TB', 'FD', 'LB', 'LA', 'FT', 'IT', 'KD', 'PC', 'ER', 'SS'] as const;

function sumColumns(row: Record<string, string>, columns: readonly string[]): number {
  return columns.reduce((acc, col) => acc + parseInt(row[col] ?? '0'), 0);
}

function computePrimaryScore(stats: PrimaryScoringStats): number {
  return (
    stats.tries * 17 +
    stats.conversions * 4 +
    stats.penaltyGoals * 4 +
    stats.onePointFieldGoals * 5 +
    stats.twoPointFieldGoals * 10 +
    stats.tryAssists * 12 +
    stats.lineBreakAssists * 8 +
    stats.forcedDropOutKicks * 6 +
    stats.fortyTwentyKicks * 10 +
    stats.twentyFortyKicks * 10 +
    stats.kicksDead * -3 +
    stats.tackleBreaks * 2 +
    stats.lineBreaks * 10 +
    stats.intercepts * 5 +
    stats.tacklesMade * 1 +
    stats.missedTackles * -1 +
    stats.penalties * -2 +
    stats.errors * -2 +
    stats.sinBins * -8 +
    stats.sendOffs * -16
  );
}

function buildTestPlayers(): TestPlayer[] {
  return primaryFixture.players.map(p => {
    const suppRow = supplementaryFixture.players.find(
      s => s.Name2 === `${p.lastName}, ${p.firstName}`
    );
    if (!suppRow) throw new Error(`No supplementary data for ${p.playerName}`);

    const primary: PrimaryScoringStats = {
      playerId: String(p.playerId),
      playerName: p.playerName,
      teamCode: p.teamCode,
      matchId: primaryFixture.matchId,
      year: primaryFixture.year,
      round: primaryFixture.round,
      ...p.stats,
    };

    // What the adapter produces: point contributions ÷ pointsPerUnit
    const supplementaryRaw: SupplementaryPlayerStats = {
      playerName: suppRow.Name2,
      season: primaryFixture.year,
      round: primaryFixture.round,
      lastTouch: pointsToRaw(parseInt(suppRow.LT), POINTS_PER_UNIT.lastTouch),
      missedGoals: pointsToRaw(parseInt(suppRow.MG), POINTS_PER_UNIT.missedGoals),
      missedFieldGoals: pointsToRaw(parseInt(suppRow.MF), POINTS_PER_UNIT.missedFieldGoals),
      effectiveOffloads: pointsToRaw(parseInt(suppRow.OL), POINTS_PER_UNIT.effectiveOffloads),
      ineffectiveOffloads: pointsToRaw(parseInt(suppRow.IO), POINTS_PER_UNIT.ineffectiveOffloads),
      runsOver8m: pointsToRaw(parseInt(suppRow.H8), POINTS_PER_UNIT.runsOver8m),
      runsUnder8m: pointsToRaw(parseInt(suppRow.HU), POINTS_PER_UNIT.runsUnder8m),
      trySaves: 0, // TS column is try-assist score, not try saves
      kickRegatherBreak: pointsToRaw(parseInt(suppRow.KB), POINTS_PER_UNIT.kickRegatherBreak),
      heldUpInGoal: pointsToRaw(parseInt(suppRow.HG), POINTS_PER_UNIT.heldUpInGoal),
    };

    const suppRowRecord = suppRow as unknown as Record<string, string>;
    const expectedPrimaryOnlyScore = computePrimaryScore(primary);
    const expectedSupplementaryContribution = sumColumns(suppRowRecord, SUPPLEMENTARY_ONLY_COLUMNS);

    return {
      name: p.playerName,
      publishedScore: parseInt(suppRow.Score),
      primary,
      supplementaryRaw,
      expectedPrimaryOnlyScore,
      expectedSupplementaryContribution,
    };
  });
}

const testPlayers = buildTestPlayers();

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('supercoach score accuracy — real match data (SHA v GCT R1 2026)', () => {
  describe('calculated score matches published score exactly', () => {
    it.each(testPlayers.map(p => [p.name, p]))(
      '%s: calculated score equals published score',
      (_name, player) => {
        const p = player as TestPlayer;
        const merged: MergedPlayerStats = {
          primary: p.primary,
          supplementary: p.supplementaryRaw,
          matchConfidence: 'exact',
        };

        const score = computePlayerScore(merged, config);
        expect(score.totalScore).toBe(p.publishedScore);
      }
    );
  });

  describe('primary-only scoring is accurate', () => {
    it.each(testPlayers.map(p => [p.name, p]))(
      '%s: primary-only calculated score matches expected',
      (_name, player) => {
        const p = player as TestPlayer;
        const merged: MergedPlayerStats = {
          primary: p.primary,
          supplementary: null,
          matchConfidence: 'unmatched',
        };

        const score = computePlayerScore(merged, config);
        expect(score.totalScore).toBe(p.expectedPrimaryOnlyScore);
        expect(score.isComplete).toBe(false);
      }
    );
  });

  describe('primary + supplementary = published (point contribution proof)', () => {
    it.each(testPlayers.map(p => [p.name, p]))(
      '%s: primary score + supplementary points = published score',
      (_name, player) => {
        const p = player as TestPlayer;
        expect(p.expectedPrimaryOnlyScore + p.expectedSupplementaryContribution).toBe(p.publishedScore);
      }
    );
  });

  describe('TS column is try-assist score, not try saves', () => {
    it('Trindall: TS=48 = tryAssists(4) × 12 points', () => {
      const trindall = testPlayers.find(p => p.name === 'Braydon Trindall')!;
      expect(trindall.primary.tryAssists).toBe(4);
      const suppRow = supplementaryFixture.players.find(s => s.Name2 === 'Trindall, Braydon')!;
      expect(parseInt(suppRow.TS)).toBe(48); // 4 × 12
    });

    it('Kennedy: TS=12 = tryAssists(1) × 12 points', () => {
      const kennedy = testPlayers.find(p => p.name === 'William Kennedy')!;
      expect(kennedy.primary.tryAssists).toBe(1);
      const suppRow = supplementaryFixture.players.find(s => s.Name2 === 'Kennedy, William')!;
      expect(parseInt(suppRow.TS)).toBe(12); // 1 × 12
    });
  });

  describe('supplementary source columns sum to published score', () => {
    it.each(testPlayers.map(p => [p.name, p]))(
      '%s: all point-contribution columns sum to published score',
      (_name, player) => {
        const p = player as TestPlayer;
        const suppRow = supplementaryFixture.players.find(
          s => s.Name2 === `${p.primary.playerName.split(' ').pop()}, ${p.primary.playerName.split(' ').slice(0, -1).join(' ')}`
        )!;
        const allCols = [...SUPPLEMENTARY_ONLY_COLUMNS, ...PRIMARY_DUPLICATE_COLUMNS];
        const sum = sumColumns(suppRow as unknown as Record<string, string>, allCols);
        expect(sum).toBe(p.publishedScore);
      }
    );
  });
});
