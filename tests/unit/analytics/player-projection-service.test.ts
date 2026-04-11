import { describe, it, expect } from 'vitest';
import {
  buildFloorScore,
  buildFloorProfile,
  buildPlayerProfile,
  buildSpikeDistribution,
  classifySpikeBand,
  compositeScore,
  DEFAULT_COMPOSITE_WEIGHTS,
  MIN_SAMPLE_SIZE,
  percentile,
  sampleStd,
} from '../../../src/analytics/player-projection-service.js';
import type { EligibleGame, PlayerMeta } from '../../../src/analytics/player-projection-types.js';
import type { CategoryBreakdown } from '../../../src/domain/supercoach-score.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeCategories(
  base: Array<{ statName: string; contribution: number }>,
  negative: Array<{ statName: string; contribution: number }> = [],
): CategoryBreakdown {
  const toStat = (s: { statName: string; contribution: number }) => ({
    statName: s.statName,
    displayName: s.statName,
    rawValue: s.contribution,
    pointsPerUnit: 1,
    contribution: s.contribution,
  });
  return {
    scoring: [],
    create: [],
    evade: [],
    defence: [],
    base: base.map(toStat),
    negative: negative.map(toStat),
  };
}

function makeGame(
  round: number,
  totalScore: number,
  baseStats: Array<{ statName: string; contribution: number }>,
  negativeStats: Array<{ statName: string; contribution: number }> = [],
  minutesPlayed = 80,
): EligibleGame {
  return {
    round,
    totalScore,
    categories: makeCategories(baseStats, negativeStats),
    minutesPlayed,
  };
}

const KENNEDY_META: PlayerMeta = {
  playerId: '504279',
  playerName: 'William Kennedy',
  teamCode: 'SHA',
  position: 'Forward',
};

/** Games derived from tests/fixtures/supercoach-projection/player-sc-2026.json (rounds 1–7) */
const KENNEDY_GAMES: EligibleGame[] = [
  makeGame(1, 88, [
    { statName: 'tacklesMade', contribution: 35 },
    { statName: 'missedTackles', contribution: -3 },
    { statName: 'runsOver8m', contribution: 16 },
    { statName: 'runsUnder8m', contribution: 5 },
  ], [{ statName: 'penalties', contribution: -2 }], 80),
  makeGame(2, 72, [
    { statName: 'tacklesMade', contribution: 30 },
    { statName: 'missedTackles', contribution: -4 },
    { statName: 'runsOver8m', contribution: 14 },
    { statName: 'runsUnder8m', contribution: 6 },
  ], [{ statName: 'errors', contribution: -4 }], 80),
  makeGame(3, 104, [
    { statName: 'tacklesMade', contribution: 38 },
    { statName: 'missedTackles', contribution: -2 },
    { statName: 'runsOver8m', contribution: 18 },
    { statName: 'runsUnder8m', contribution: 4 },
  ], [], 80),
  makeGame(4, 68, [
    { statName: 'tacklesMade', contribution: 32 },
    { statName: 'missedTackles', contribution: -5 },
    { statName: 'runsOver8m', contribution: 12 },
    { statName: 'runsUnder8m', contribution: 7 },
  ], [
    { statName: 'penalties', contribution: -4 },
    { statName: 'errors', contribution: -2 },
  ], 72),
  makeGame(5, 80, [
    { statName: 'tacklesMade', contribution: 28 },
    { statName: 'missedTackles', contribution: -3 },
    { statName: 'runsOver8m', contribution: 16 },
    { statName: 'runsUnder8m', contribution: 5 },
  ], [], 64),
  makeGame(6, 92, [
    { statName: 'tacklesMade', contribution: 36 },
    { statName: 'missedTackles', contribution: -2 },
    { statName: 'runsOver8m', contribution: 20 },
    { statName: 'runsUnder8m', contribution: 6 },
  ], [{ statName: 'penalties', contribution: -2 }], 80),
  makeGame(7, 76, [
    { statName: 'tacklesMade', contribution: 33 },
    { statName: 'missedTackles', contribution: -3 },
    { statName: 'runsOver8m', contribution: 18 },
    { statName: 'runsUnder8m', contribution: 7 },
  ], [], 78),
];

// Expected values computed from the fixture data
// floors: [51, 42, 58, 40, 46, 58, 55], mean=50
// spikes: [37, 30, 46, 28, 34, 34, 21], mean≈32.857

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('percentile', () => {
  it('returns the sole element for n=1', () => {
    expect(percentile([7], 50)).toBe(7);
  });

  it('exact index — no interpolation needed', () => {
    expect(percentile([1, 2, 3, 4, 5], 50)).toBe(3);
  });

  it('linear interpolation — spec §4.5 example (spikes: [6,2,34,2,4,4])', () => {
    const spikes = [6, 2, 34, 2, 4, 4];
    expect(percentile(spikes, 25)).toBeCloseTo(2.5, 5);
    expect(percentile(spikes, 50)).toBeCloseTo(4.0, 5);
    // p90: sorted=[2,2,4,4,6,34], i=0.9*5=4.5 → 6+0.5*(34-6)=20
    expect(percentile(spikes, 90)).toBeCloseTo(20.0, 5);
  });

  it('p0 returns minimum, p100 returns maximum', () => {
    const arr = [5, 3, 1, 4, 2];
    expect(percentile(arr, 0)).toBe(1);
    expect(percentile(arr, 100)).toBe(5);
  });
});

describe('sampleStd', () => {
  it('returns null for n=1', () => {
    expect(sampleStd([42])).toBeNull();
  });

  it('returns null for empty array', () => {
    expect(sampleStd([])).toBeNull();
  });

  it('returns 0 for all-equal values', () => {
    expect(sampleStd([5, 5, 5, 5])).toBeCloseTo(0, 10);
  });

  it('computes sample std (n-1 denominator) correctly', () => {
    // [10, 20] → mean=15, sum-sq-dev=50, sample-std=sqrt(50/1)=~7.071
    expect(sampleStd([10, 20])).toBeCloseTo(Math.sqrt(50), 5);
    // [1, 2, 3] → mean=2, sum-sq-dev=2, sample-std=sqrt(2/2)=1
    expect(sampleStd([1, 2, 3])).toBeCloseTo(1.0, 5);
  });
});

describe('buildFloorScore', () => {
  it('sums contribution values only for floor stat names', () => {
    const categories = makeCategories(
      [
        { statName: 'tacklesMade', contribution: 35 },
        { statName: 'missedTackles', contribution: -3 },
        { statName: 'runsOver8m', contribution: 16 },
        { statName: 'runsUnder8m', contribution: 5 },
        { statName: 'intercepts', contribution: 8 }, // non-floor — should be ignored
      ],
      [{ statName: 'penalties', contribution: -2 }],
    );
    expect(buildFloorScore(categories)).toBe(51);
  });

  it('returns 0 when no floor stats are present', () => {
    const categories = makeCategories([
      { statName: 'tries', contribution: 17 },
      { statName: 'lineBreaks', contribution: 10 },
    ]);
    expect(buildFloorScore(categories)).toBe(0);
  });

  it('handles empty categories without throwing', () => {
    const categories = makeCategories([]);
    expect(buildFloorScore(categories)).toBe(0);
  });
});

describe('buildFloorProfile — Kennedy fixture (7 games)', () => {
  const profile = buildFloorProfile(KENNEDY_GAMES);

  it('counts eligible games correctly', () => {
    expect(profile.gameCount).toBe(7);
  });

  it('computes correct per-game floor scores', () => {
    expect(profile.gameFloors).toEqual([51, 42, 58, 40, 46, 58, 55]);
  });

  it('computes correct floor mean', () => {
    expect(profile.mean).toBeCloseTo(50, 5);
  });

  it('computes correct sample std', () => {
    expect(profile.std).toBeCloseTo(7.461, 2);
  });

  it('computes correct CV', () => {
    expect(profile.cv).toBeCloseTo(0.1492, 3);
  });

  it('computes correct avgMinutes', () => {
    // (80+80+80+72+64+80+78)/7 = 534/7 ≈ 76.286
    expect(profile.avgMinutes).toBeCloseTo(76.286, 2);
  });

  it('returns null std for fewer than 2 games', () => {
    const oneGame = buildFloorProfile([KENNEDY_GAMES[0]!]);
    expect(oneGame.std).toBeNull();
    expect(oneGame.cv).toBeNull();
  });
});

describe('classifySpikeBand', () => {
  it('classifies negative scores', () => {
    expect(classifySpikeBand(-1)).toBe('negative');
    expect(classifySpikeBand(-100)).toBe('negative');
  });

  it('classifies nil (0 to 5 inclusive)', () => {
    expect(classifySpikeBand(0)).toBe('nil');
    expect(classifySpikeBand(5)).toBe('nil');
  });

  it('classifies low (6 to 15 inclusive)', () => {
    expect(classifySpikeBand(6)).toBe('low');
    expect(classifySpikeBand(15)).toBe('low');
  });

  it('classifies moderate (16 to 30 inclusive)', () => {
    expect(classifySpikeBand(16)).toBe('moderate');
    expect(classifySpikeBand(30)).toBe('moderate');
  });

  it('classifies high (31 to 50 inclusive)', () => {
    expect(classifySpikeBand(31)).toBe('high');
    expect(classifySpikeBand(50)).toBe('high');
  });

  it('classifies boom (51+)', () => {
    expect(classifySpikeBand(51)).toBe('boom');
    expect(classifySpikeBand(200)).toBe('boom');
  });
});

describe('buildSpikeDistribution', () => {
  it('counts and computes frequencies for Kennedy spike scores', () => {
    // spikes: [37, 30, 46, 28, 34, 34, 21]
    // moderate: [30, 28, 21] = 3, high: [37, 46, 34, 34] = 4
    const dist = buildSpikeDistribution([37, 30, 46, 28, 34, 34, 21]);
    expect(dist.negative.count).toBe(0);
    expect(dist.nil.count).toBe(0);
    expect(dist.low.count).toBe(0);
    expect(dist.moderate.count).toBe(3);
    expect(dist.high.count).toBe(4);
    expect(dist.boom.count).toBe(0);
    expect(dist.moderate.frequency).toBeCloseTo(3 / 7, 4);
    expect(dist.high.frequency).toBeCloseTo(4 / 7, 4);
  });

  it('handles empty array without throwing', () => {
    const dist = buildSpikeDistribution([]);
    expect(dist.nil.count).toBe(0);
    expect(dist.nil.frequency).toBe(0);
  });
});

describe('buildPlayerProfile', () => {
  it('sets noUsableData=true and lowSampleWarning=true for empty games', () => {
    const profile = buildPlayerProfile(KENNEDY_META, []);
    expect(profile.noUsableData).toBe(true);
    expect(profile.lowSampleWarning).toBe(true);
    expect(profile.gamesPlayed).toBe(0);
  });

  it('sets lowSampleWarning=true when gamesPlayed < MIN_SAMPLE_SIZE', () => {
    const fewGames = KENNEDY_GAMES.slice(0, MIN_SAMPLE_SIZE - 1);
    const profile = buildPlayerProfile(KENNEDY_META, fewGames);
    expect(profile.lowSampleWarning).toBe(true);
    expect(profile.noUsableData).toBe(false);
  });

  it('clears lowSampleWarning when gamesPlayed >= MIN_SAMPLE_SIZE', () => {
    const profile = buildPlayerProfile(KENNEDY_META, KENNEDY_GAMES.slice(0, MIN_SAMPLE_SIZE));
    expect(profile.lowSampleWarning).toBe(false);
  });

  it('computes correct floor and spike means from Kennedy fixture', () => {
    const profile = buildPlayerProfile(KENNEDY_META, KENNEDY_GAMES);
    expect(profile.floorMean).toBeCloseTo(50, 5);
    expect(profile.spikeMean).toBeCloseTo(32.857, 2);
  });

  it('computes correct projected values', () => {
    const profile = buildPlayerProfile(KENNEDY_META, KENNEDY_GAMES);
    expect(profile.projectedTotal).toBeCloseTo(50 + 32.857, 2);
    expect(profile.projectedFloor).toBeCloseTo(50 + 29, 2);   // spikeP25=29
    expect(profile.projectedCeiling).toBeCloseTo(50 + 40.6, 1); // spikeP90=40.6
  });

  it('sets floorStd=null and floorCv=null when only 1 game', () => {
    const profile = buildPlayerProfile(KENNEDY_META, [KENNEDY_GAMES[0]!]);
    expect(profile.floorStd).toBeNull();
    expect(profile.floorCv).toBeNull();
  });

  it('includes per-game breakdown ordered by input order', () => {
    const profile = buildPlayerProfile(KENNEDY_META, KENNEDY_GAMES);
    expect(profile.games).toHaveLength(7);
    expect(profile.games[0]).toEqual({
      round: 1,
      totalScore: 88,
      floorScore: 51,
      spikeScore: 37,
      minutesPlayed: 80,
    });
    expect(profile.games[6]).toEqual({
      round: 7,
      totalScore: 76,
      floorScore: 55,
      spikeScore: 21,
      minutesPlayed: 78,
    });
    // floorScore + spikeScore should equal totalScore for every game
    for (const g of profile.games) {
      expect(g.floorScore + g.spikeScore).toBe(g.totalScore);
    }
  });

  it('returns empty games array when no eligible games', () => {
    const profile = buildPlayerProfile(KENNEDY_META, []);
    expect(profile.games).toEqual([]);
  });

  it('carries identity fields through', () => {
    const profile = buildPlayerProfile(KENNEDY_META, KENNEDY_GAMES);
    expect(profile.playerId).toBe('504279');
    expect(profile.playerName).toBe('William Kennedy');
    expect(profile.teamCode).toBe('SHA');
    expect(profile.position).toBe('Forward');
  });
});

describe('compositeScore', () => {
  it('returns null when floorCv is null (< 2 games)', () => {
    const profile = buildPlayerProfile(KENNEDY_META, [KENNEDY_GAMES[0]!]);
    expect(compositeScore(profile)).toBeNull();
  });

  it('returns null when noUsableData (0 games)', () => {
    const profile = buildPlayerProfile(KENNEDY_META, []);
    expect(compositeScore(profile)).toBeNull();
  });

  it('computes correct composite score for Kennedy fixture', () => {
    const profile = buildPlayerProfile(KENNEDY_META, KENNEDY_GAMES);
    // 1.0*50 + 0.8*32.857 + 10.0*(1-0.14922) + 0.5*29 ≈ 99.29
    expect(compositeScore(profile)).toBeCloseTo(99.29, 1);
  });

  it('respects custom weights', () => {
    const profile = buildPlayerProfile(KENNEDY_META, KENNEDY_GAMES);
    const custom = { floor: 1.0, spike: 0.0, consistency: 0.0, reliableSpike: 0.0 };
    expect(compositeScore(profile, custom)).toBeCloseTo(50, 5);
  });

  it('applies default weights when none provided', () => {
    const profile = buildPlayerProfile(KENNEDY_META, KENNEDY_GAMES);
    const withDefault = compositeScore(profile, DEFAULT_COMPOSITE_WEIGHTS);
    const withoutWeights = compositeScore(profile);
    expect(withDefault).toBeCloseTo(withoutWeights!, 10);
  });
});
