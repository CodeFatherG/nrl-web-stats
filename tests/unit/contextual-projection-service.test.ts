/**
 * Unit tests for contextual projection service — pure analytics functions.
 * Feature: 028-player-context-analytics-opponent
 *
 * Tests are organised by function. All tests use deterministic fixtures — no I/O.
 */

import { describe, it, expect } from 'vitest';
import {
  lerp,
  clampedConfidence,
  computeH2hRpi,
  buildOpponentDefenseProfile,
  lookupDefenseFactor,
  computeOpponentMultiplier,
  applyOpponentAdjustment,
  MIN_SAMPLE_N,
} from '../../src/analytics/contextual-projection-service.js';
import {
  ALL_GAMES,
  POSITIONS,
  PTH_HALFBACK_1_GAMES,
  PTH_HALFBACK_2_GAMES,
  PTH_HALFBACK_3_GAMES,
  NQC_HALFBACK_1_GAMES,
  PTH_HALFBACK_1_ID,
  EXPECTED,
} from '../fixtures/analytics/contextual-projection-fixtures.js';
import type { ContextualEligibleGame, OpponentDefensiveProfile } from '../../src/analytics/contextual-projection-types.js';

const YEAR = 2026;
const ROUND = 6;

// ── lerp ─────────────────────────────────────────────────────────────────────

describe('lerp', () => {
  it('returns a when t=0', () => {
    expect(lerp(1.0, 1.5, 0)).toBe(1.0);
  });

  it('returns b when t=1', () => {
    expect(lerp(1.0, 1.5, 1)).toBe(1.5);
  });

  it('returns midpoint when t=0.5', () => {
    expect(lerp(1.0, 2.0, 0.5)).toBe(1.5);
  });

  it('works with t between 0 and 1', () => {
    expect(lerp(0, 3, 1 / 3)).toBeCloseTo(1.0, 10);
  });
});

// ── clampedConfidence ────────────────────────────────────────────────────────

describe('clampedConfidence', () => {
  it('returns 0 when sampleN=0', () => {
    expect(clampedConfidence(0)).toBe(0);
  });

  it('returns 1 when sampleN=minSampleN', () => {
    expect(clampedConfidence(MIN_SAMPLE_N)).toBe(1);
  });

  it('returns 1 when sampleN exceeds minSampleN', () => {
    expect(clampedConfidence(10)).toBe(1);
  });

  it('returns 1/3 for sampleN=1 with minSampleN=3', () => {
    expect(clampedConfidence(1, 3)).toBeCloseTo(1 / 3, 10);
  });

  it('returns 2/3 for sampleN=2 with minSampleN=3', () => {
    expect(clampedConfidence(2, 3)).toBeCloseTo(2 / 3, 10);
  });

  it('uses MIN_SAMPLE_N=3 as default', () => {
    expect(clampedConfidence(3)).toBe(1);
    expect(clampedConfidence(1)).toBeCloseTo(1 / 3, 10);
  });
});

// ── computeH2hRpi ─────────────────────────────────────────────────────────────

describe('computeH2hRpi', () => {
  it('returns rawRpi ≈ 1.10 and gameCount=3 for player with 3 h2h games vs BRI', () => {
    const { rawRpi, gameCount } = computeH2hRpi(PTH_HALFBACK_1_GAMES, 'BRI');
    expect(gameCount).toBe(EXPECTED.h1GameCount);
    expect(rawRpi).toBeCloseTo(EXPECTED.h1RawRpi, 4);
  });

  it('h2h mean is computed correctly from raw games (weighted)', () => {
    const { rawRpi } = computeH2hRpi(PTH_HALFBACK_1_GAMES, 'BRI');
    // rawRpi = h2hMean / overallMean = 85/77 ≈ 1.1039
    expect(rawRpi).toBeCloseTo(85 / 77, 4);
  });

  it('returns rawRpi=1.0 and gameCount=0 for player with zero h2h games', () => {
    const { rawRpi, gameCount } = computeH2hRpi(NQC_HALFBACK_1_GAMES, 'BRI');
    expect(rawRpi).toBe(1.0);
    expect(gameCount).toBe(0);
  });

  it('returns gameCount=1 for player with exactly 1 h2h game (PTH_HALFBACK_3)', () => {
    const { rawRpi, gameCount } = computeH2hRpi(PTH_HALFBACK_3_GAMES, 'BRI');
    expect(gameCount).toBe(1);
    expect(rawRpi).toBeCloseTo(EXPECTED.h3RawRpi, 4);
  });

  it('returns rawRpi=1.0 and gameCount=0 for empty game list', () => {
    const { rawRpi, gameCount } = computeH2hRpi([], 'BRI');
    expect(rawRpi).toBe(1.0);
    expect(gameCount).toBe(0);
  });

  it('rawRpi differs between players with different h2h histories', () => {
    const { rawRpi: rpi1 } = computeH2hRpi(PTH_HALFBACK_1_GAMES, 'BRI');
    const { rawRpi: rpi2 } = computeH2hRpi(PTH_HALFBACK_2_GAMES, 'BRI');
    expect(rpi1).not.toBeCloseTo(rpi2, 2); // different players, different overall means
  });
});

// ── buildOpponentDefenseProfile ───────────────────────────────────────────────

describe('buildOpponentDefenseProfile', () => {
  let profile: OpponentDefensiveProfile;

  beforeEach(() => {
    profile = buildOpponentDefenseProfile(ALL_GAMES, POSITIONS, YEAR, ROUND);
  });

  it('carries year and latestCompleteRound', () => {
    expect(profile.year).toBe(YEAR);
    expect(profile.latestCompleteRound).toBe(ROUND);
  });

  it('produces a defenseFactor > 1.0 for BRI vs Halfback (concedes above-average)', () => {
    const entry = profile.profiles.get('BRI:Halfback');
    expect(entry).toBeDefined();
    expect(entry!.defenseFactor).toBeGreaterThan(1.0);
  });

  it('produces a defenseFactor < 1.0 for MEL vs Halfback (concedes below-average)', () => {
    const entry = profile.profiles.get('MEL:Halfback');
    expect(entry).toBeDefined();
    expect(entry!.defenseFactor).toBeLessThan(1.0);
  });

  it('BRI defenseFactor for Halfback matches pre-computed expected value', () => {
    const entry = profile.profiles.get('BRI:Halfback');
    expect(entry!.defenseFactor).toBeCloseTo(EXPECTED.briHalfbackDefenseFactor, 4);
  });

  it('MEL defenseFactor for Halfback matches pre-computed expected value', () => {
    const entry = profile.profiles.get('MEL:Halfback');
    expect(entry!.defenseFactor).toBeCloseTo(EXPECTED.melHalfbackDefenseFactor, 4);
  });

  it('gamesCount for BRI Halfback matches expected sample size', () => {
    const entry = profile.profiles.get('BRI:Halfback');
    expect(entry!.gamesCount).toBe(EXPECTED.briHalfbackGamesCount);
  });

  it('gamesCount for MEL Halfback matches expected sample size', () => {
    const entry = profile.profiles.get('MEL:Halfback');
    expect(entry!.gamesCount).toBe(EXPECTED.melHalfbackGamesCount);
  });

  it('meanPointsConceded for BRI Halfback matches pre-computed value', () => {
    const entry = profile.profiles.get('BRI:Halfback');
    expect(entry!.meanPointsConceded).toBeCloseTo(EXPECTED.briHalfbackMeanConceded, 4);
  });

  it('produces separate entries for different positions (Halfback vs Prop)', () => {
    const halfbackEntry = profile.profiles.get('BRI:Halfback');
    const propEntry = profile.profiles.get('BRI:Prop');
    expect(halfbackEntry).toBeDefined();
    expect(propEntry).toBeDefined();
    expect(halfbackEntry!.defenseFactor).not.toBeCloseTo(propEntry!.defenseFactor, 1);
  });

  it('returns an empty profile (no entries) for an opponent with no games in dataset', () => {
    const emptyProfile = buildOpponentDefenseProfile(
      ALL_GAMES.filter(g => g.opponent !== 'BRI'),
      POSITIONS,
      YEAR,
      ROUND,
    );
    expect(emptyProfile.profiles.has('BRI:Halfback')).toBe(false);
  });

  it('handles empty game list without throwing', () => {
    const emptyProfile = buildOpponentDefenseProfile([], POSITIONS, YEAR, ROUND);
    expect(emptyProfile.profiles.size).toBe(0);
  });
});

// ── lookupDefenseFactor ───────────────────────────────────────────────────────

describe('lookupDefenseFactor', () => {
  let profile: OpponentDefensiveProfile;

  beforeEach(() => {
    profile = buildOpponentDefenseProfile(ALL_GAMES, POSITIONS, YEAR, ROUND);
  });

  it('returns defenseFactor=1.0 and defenseConfidence=0 for unknown opponent', () => {
    const result = lookupDefenseFactor(profile, 'UNKNOWN', 'Halfback');
    expect(result.defenseFactor).toBe(1.0);
    expect(result.defenseConfidence).toBe(0);
    expect(result.gamesCount).toBe(0);
  });

  it('returns defenseFactor=1.0 and defenseConfidence=0 for unknown position', () => {
    const result = lookupDefenseFactor(profile, 'BRI', 'UnknownPosition');
    expect(result.defenseFactor).toBe(1.0);
    expect(result.defenseConfidence).toBe(0);
  });

  it('returns defenseConfidence=1.0 when gamesCount >= MIN_SAMPLE_N', () => {
    const result = lookupDefenseFactor(profile, 'BRI', 'Halfback');
    expect(result.defenseConfidence).toBe(1.0); // BRI:Halfback has 10 games
  });

  it('returns defenseFactor > 1.0 for BRI vs Halfback', () => {
    const result = lookupDefenseFactor(profile, 'BRI', 'Halfback');
    expect(result.defenseFactor).toBeGreaterThan(1.0);
  });
});

// ── computeOpponentMultiplier ─────────────────────────────────────────────────

describe('computeOpponentMultiplier', () => {
  let profile: OpponentDefensiveProfile;

  beforeEach(() => {
    profile = buildOpponentDefenseProfile(ALL_GAMES, POSITIONS, YEAR, ROUND);
  });

  it('returns multiplier > 1.0 for a player with above-average h2h vs weak defensive team', () => {
    const adj = computeOpponentMultiplier(profile, 'Halfback', 'BRI', PTH_HALFBACK_1_GAMES);
    expect(adj.multiplier).toBeGreaterThan(1.0);
  });

  it('returns multiplier = 1.0 for player with zero h2h AND unknown opponent', () => {
    const emptyProfile = buildOpponentDefenseProfile([], POSITIONS, YEAR, ROUND);
    const adj = computeOpponentMultiplier(emptyProfile, 'Halfback', 'BRI', NQC_HALFBACK_1_GAMES);
    expect(adj.multiplier).toBeCloseTo(1.0, 10);
    expect(adj.confidence).toBe(0);
  });

  it('multiplier for player with zero h2h equals effectiveDefenseFactor (h2h neutral)', () => {
    const adj = computeOpponentMultiplier(profile, 'Halfback', 'BRI', NQC_HALFBACK_1_GAMES);
    // h2hConfidence = 0 → effectiveH2h = 1.0 → multiplier = 1.0 * effectiveDef
    const { defenseConfidence, defenseFactor } = adj;
    const effectiveDef = lerp(1.0, defenseFactor, defenseConfidence);
    expect(adj.multiplier).toBeCloseTo(effectiveDef, 10);
  });

  it('h2hRpi differs between pth-halfback-1 and pth-halfback-2 (different history)', () => {
    const adj1 = computeOpponentMultiplier(profile, 'Halfback', 'BRI', PTH_HALFBACK_1_GAMES);
    const adj2 = computeOpponentMultiplier(profile, 'Halfback', 'BRI', PTH_HALFBACK_2_GAMES);
    expect(adj1.h2hRpi).not.toBeCloseTo(adj2.h2hRpi, 2);
  });

  it('defenseFactor is identical for pth-halfback-1 and pth-halfback-2 (same position, same opponent)', () => {
    const adj1 = computeOpponentMultiplier(profile, 'Halfback', 'BRI', PTH_HALFBACK_1_GAMES);
    const adj2 = computeOpponentMultiplier(profile, 'Halfback', 'BRI', PTH_HALFBACK_2_GAMES);
    expect(adj1.defenseFactor).toBeCloseTo(adj2.defenseFactor, 10);
    expect(adj1.defenseConfidence).toBeCloseTo(adj2.defenseConfidence, 10);
  });

  it('sampleN equals h2h game count', () => {
    const adj = computeOpponentMultiplier(profile, 'Halfback', 'BRI', PTH_HALFBACK_1_GAMES);
    expect(adj.sampleN).toBe(EXPECTED.h1GameCount);
  });

  it('h2hConfidence = 1/3 when player has exactly 1 h2h game', () => {
    const adj = computeOpponentMultiplier(profile, 'Halfback', 'BRI', PTH_HALFBACK_3_GAMES);
    expect(adj.h2hConfidence).toBeCloseTo(1 / 3, 4);
    expect(adj.sampleN).toBe(1);
  });

  it('multiplier for low h2h player is attenuated (not equal to raw RPI applied at full strength)', () => {
    const adj = computeOpponentMultiplier(profile, 'Halfback', 'BRI', PTH_HALFBACK_3_GAMES);
    // effectiveH2h should be between 1.0 and rawRpi (attenuated)
    expect(adj.h2hConfidence).toBeCloseTo(1 / 3, 4);
    const effectiveH2h = lerp(1.0, adj.h2hRpi, adj.h2hConfidence);
    // Combined multiplier = effectiveH2h * effectiveDef
    const effectiveDef = lerp(1.0, adj.defenseFactor, adj.defenseConfidence);
    expect(adj.multiplier).toBeCloseTo(effectiveH2h * effectiveDef, 10);
  });

  it('carries all required fields in the return value', () => {
    const adj = computeOpponentMultiplier(profile, 'Halfback', 'BRI', PTH_HALFBACK_1_GAMES);
    expect(typeof adj.multiplier).toBe('number');
    expect(typeof adj.confidence).toBe('number');
    expect(typeof adj.sampleN).toBe('number');
    expect(typeof adj.defenseFactor).toBe('number');
    expect(typeof adj.defenseConfidence).toBe('number');
    expect(typeof adj.h2hRpi).toBe('number');
    expect(typeof adj.h2hConfidence).toBe('number');
  });
});

// ── applyOpponentAdjustment ───────────────────────────────────────────────────

describe('applyOpponentAdjustment', () => {
  const base = { total: 80.0, floor: 55.0, ceiling: 110.0 };

  it('scales all three values by multiplier', () => {
    const adj = { multiplier: 1.1, confidence: 0.8, sampleN: 3 };
    const result = applyOpponentAdjustment(base, adj);
    expect(result.total).toBeCloseTo(88.0, 5);
    expect(result.floor).toBeCloseTo(60.5, 5);
    expect(result.ceiling).toBeCloseTo(121.0, 5);
  });

  it('returns base unchanged when multiplier = 1.0', () => {
    const adj = { multiplier: 1.0, confidence: 0, sampleN: 0 };
    const result = applyOpponentAdjustment(base, adj);
    expect(result.total).toBe(80.0);
    expect(result.floor).toBe(55.0);
    expect(result.ceiling).toBe(110.0);
  });

  it('reduces all values when multiplier < 1.0', () => {
    const adj = { multiplier: 0.9, confidence: 1, sampleN: 5 };
    const result = applyOpponentAdjustment(base, adj);
    expect(result.total).toBeCloseTo(72.0, 5);
    expect(result.floor).toBeCloseTo(49.5, 5);
    expect(result.ceiling).toBeCloseTo(99.0, 5);
  });

  it('returns zero values when base values are zero', () => {
    const zeroBase = { total: 0, floor: 0, ceiling: 0 };
    const adj = { multiplier: 1.2, confidence: 1, sampleN: 4 };
    const result = applyOpponentAdjustment(zeroBase, adj);
    expect(result.total).toBe(0);
    expect(result.floor).toBe(0);
    expect(result.ceiling).toBe(0);
  });
});

// ── US2: shared defenseFactor cross-player validation ────────────────────────

describe('US2: defenseFactor is identical for same position vs same opponent', () => {
  it('pth-halfback-1 and pth-halfback-2 share the same BRI defenseFactor', () => {
    const profile = buildOpponentDefenseProfile(ALL_GAMES, POSITIONS, YEAR, ROUND);
    const adj1 = computeOpponentMultiplier(profile, 'Halfback', 'BRI', PTH_HALFBACK_1_GAMES);
    const adj2 = computeOpponentMultiplier(profile, 'Halfback', 'BRI', PTH_HALFBACK_2_GAMES);
    expect(adj1.defenseFactor).toBeCloseTo(adj2.defenseFactor, 10);
    expect(adj1.defenseConfidence).toBeCloseTo(adj2.defenseConfidence, 10);
  });

  it('pth-halfback-1 and pth-halfback-2 have DIFFERENT h2hRpi (individual history differs)', () => {
    const profile = buildOpponentDefenseProfile(ALL_GAMES, POSITIONS, YEAR, ROUND);
    const adj1 = computeOpponentMultiplier(profile, 'Halfback', 'BRI', PTH_HALFBACK_1_GAMES);
    const adj2 = computeOpponentMultiplier(profile, 'Halfback', 'BRI', PTH_HALFBACK_2_GAMES);
    expect(adj1.h2hRpi).not.toBeCloseTo(adj2.h2hRpi, 2);
  });

  it('Halfback and Prop get different defenseFactor for the same opponent', () => {
    const profile = buildOpponentDefenseProfile(ALL_GAMES, POSITIONS, YEAR, ROUND);
    const halfbackDef = lookupDefenseFactor(profile, 'BRI', 'Halfback').defenseFactor;
    const propDef = lookupDefenseFactor(profile, 'BRI', 'Prop').defenseFactor;
    expect(halfbackDef).not.toBeCloseTo(propDef, 1);
  });
});
