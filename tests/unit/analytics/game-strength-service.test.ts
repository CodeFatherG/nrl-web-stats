import { describe, it, expect } from 'vitest';
import {
  recencyWeight,
  weightedAverage,
  extractTeamHistory,
  computeLeagueCategoryWeights,
  computeTeamGSR,
  computeRoundGSR,
  DEFAULT_HALF_LIFE,
  DEFAULT_MIN_ROUNDS_FOR_RELIABILITY,
  type NonByeFixture,
} from '../../../src/analytics/game-strength-service.js';
import type { TeamSeasonSupercoach, TeamSupercoachGroup, SupercoachScore } from '../../../src/domain/supercoach-score.js';
import type { TeamMatchHistory } from '../../../src/domain/game-strength.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeScore(teamCode: string, totals: Partial<Record<string, number>>): SupercoachScore {
  return {
    playerId: 'p1',
    playerName: 'Test Player',
    teamCode,
    matchId: 'test',
    year: 2026,
    round: 1,
    isComplete: true,
    matchConfidence: 'linked',
    categories: {} as SupercoachScore['categories'],
    categoryTotals: {
      scoring: totals['scoring'] ?? 0,
      create: totals['create'] ?? 0,
      evade: totals['evade'] ?? 0,
      base: totals['base'] ?? 0,
      defence: totals['defence'] ?? 0,
      negative: totals['negative'] ?? 0,
    },
    totalScore: Object.values(totals).reduce((s, v) => s + (v ?? 0), 0),
    validationWarnings: [],
  };
}

function makeTeamGroup(teamCode: string, totalScore: number, catBase = 0): TeamSupercoachGroup {
  return {
    teamCode,
    teamName: teamCode,
    teamTotal: totalScore,
    isComplete: true,
    players: [
      makeScore(teamCode, { base: catBase || totalScore * 0.4, scoring: totalScore * 0.2, create: totalScore * 0.15, evade: totalScore * 0.1, defence: totalScore * 0.1, negative: -(totalScore * 0.05) }),
    ],
  };
}

function makeSeason(teamCode: string, rounds: Array<{ round: number; teamTotal: number; opponentCode: string; opponentTotal: number }>): TeamSeasonSupercoach {
  return {
    year: 2026,
    teamCode,
    teamName: teamCode,
    matches: rounds.map(({ round, teamTotal, opponentCode, opponentTotal }) => ({
      matchId: `2026-R${round}-${teamCode}-${opponentCode}`,
      year: 2026,
      round,
      isComplete: true,
      homeTeam: makeTeamGroup(teamCode, teamTotal),
      awayTeam: makeTeamGroup(opponentCode, opponentTotal),
    })),
  };
}

function makeHistory(teamCode: string, totals: number[], opponentTotals?: number[]): TeamMatchHistory {
  return {
    teamCode,
    entries: totals.map((total, i) => {
      const oppTotal = opponentTotals?.[i] ?? total * 0.9;
      const splitCats = (t: number) => ({
        scoring: t * 0.2,
        create: t * 0.15,
        evade: t * 0.1,
        base: t * 0.4,
        defence: t * 0.1,
        negative: -(t * 0.05),
      });
      return {
        matchId: `match-${i}`,
        year: 2026,
        round: i + 1,
        teamTotal: total,
        categoryTotals: splitCats(total),
        opponentTotal: oppTotal,
        opponentCategoryTotals: splitCats(oppTotal),
        isComplete: true,
        opponentCode: 'OPP',
      };
    }),
  };
}

// ─── recencyWeight ────────────────────────────────────────────────────────────

describe('recencyWeight', () => {
  it('returns 1.0 at roundDiff = 0 (most recent game)', () => {
    expect(recencyWeight(0, DEFAULT_HALF_LIFE)).toBeCloseTo(1.0);
  });

  it('returns 0.5 at roundDiff = halfLife', () => {
    expect(recencyWeight(DEFAULT_HALF_LIFE, DEFAULT_HALF_LIFE)).toBeCloseTo(0.5);
  });

  it('returns 0.25 at roundDiff = 2 × halfLife', () => {
    expect(recencyWeight(DEFAULT_HALF_LIFE * 2, DEFAULT_HALF_LIFE)).toBeCloseTo(0.25);
  });

  it('is monotonically decreasing', () => {
    const weights = [0, 1, 2, 4, 8].map(d => recencyWeight(d, DEFAULT_HALF_LIFE));
    for (let i = 1; i < weights.length; i++) {
      expect(weights[i]).toBeLessThan(weights[i - 1]);
    }
  });
});

// ─── weightedAverage ─────────────────────────────────────────────────────────

describe('weightedAverage', () => {
  it('returns 0 for empty array', () => {
    expect(weightedAverage([])).toBe(0);
  });

  it('returns the single value when there is one entry', () => {
    expect(weightedAverage([{ value: 1500, weight: 1 }])).toBeCloseTo(1500);
  });

  it('weights recent values more heavily', () => {
    // Two entries: old value 1000 (weight 0.5), recent value 2000 (weight 1.0)
    const result = weightedAverage([
      { value: 1000, weight: 0.5 },
      { value: 2000, weight: 1.0 },
    ]);
    // Expected: (1000×0.5 + 2000×1.0) / 1.5 = 2500/1.5 ≈ 1666.7
    expect(result).toBeCloseTo(1666.67, 1);
  });

  it('returns 0 when all weights are zero', () => {
    expect(weightedAverage([{ value: 1000, weight: 0 }])).toBe(0);
  });
});

// ─── extractTeamHistory ──────────────────────────────────────────────────────

describe('extractTeamHistory', () => {
  it('extracts correct team totals and category totals', () => {
    const season = makeSeason('BRO', [
      { round: 1, teamTotal: 1800, opponentCode: 'NZL', opponentTotal: 1600 },
      { round: 2, teamTotal: 2000, opponentCode: 'MEL', opponentTotal: 1700 },
    ]);
    const history = extractTeamHistory(season, 'BRO');
    expect(history.teamCode).toBe('BRO');
    expect(history.entries).toHaveLength(2);
    expect(history.entries[0].teamTotal).toBe(1800);
    expect(history.entries[1].teamTotal).toBe(2000);
  });

  it('sets opponentCode correctly', () => {
    const season = makeSeason('BRO', [
      { round: 1, teamTotal: 1800, opponentCode: 'NZL', opponentTotal: 1600 },
    ]);
    const history = extractTeamHistory(season, 'BRO');
    expect(history.entries[0].opponentCode).toBe('NZL');
  });

  it('sums player categoryTotals per match', () => {
    const season = makeSeason('BRO', [
      { round: 1, teamTotal: 1000, opponentCode: 'NZL', opponentTotal: 900 },
    ]);
    const history = extractTeamHistory(season, 'BRO');
    const entry = history.entries[0];
    // Player has base = total * 0.4 = 400
    expect(entry.categoryTotals.base).toBeCloseTo(400);
  });

  it('excludes unplayed matches (teamTotal=0 and opponentTotal=0)', () => {
    // executeForTeamSeason returns ALL fixtures for the season, including future unplayed
    // matches which have teamTotal=0 placeholder values. These must not be included in the
    // history — otherwise weighted average would be diluted by zeros (and worse, the
    // unplayed matches sort as "most recent" so they'd dominate the recency weighting).
    const season = makeSeason('BRO', [
      { round: 1, teamTotal: 1800, opponentCode: 'NZL', opponentTotal: 1600 },
      { round: 2, teamTotal: 2000, opponentCode: 'MEL', opponentTotal: 1700 },
      { round: 3, teamTotal: 0, opponentCode: 'STH', opponentTotal: 0 },    // unplayed
      { round: 4, teamTotal: 0, opponentCode: 'PAR', opponentTotal: 0 },    // unplayed
    ]);
    const history = extractTeamHistory(season, 'BRO');
    expect(history.entries).toHaveLength(2);
    expect(history.entries.map(e => e.round)).toEqual([1, 2]);
  });

  it('populates opponentTotal and opponentCategoryTotals from the opposing team group', () => {
    const season = makeSeason('BRO', [
      { round: 1, teamTotal: 1800, opponentCode: 'NZL', opponentTotal: 1400 },
    ]);
    const history = extractTeamHistory(season, 'BRO');
    const entry = history.entries[0];
    expect(entry.opponentTotal).toBe(1400);
    // Opponent had base = 1400 * 0.4 = 560 in makeTeamGroup
    expect(entry.opponentCategoryTotals.base).toBeCloseTo(560);
  });

  it('returns empty entries for a team with no matches', () => {
    const season: TeamSeasonSupercoach = {
      year: 2026, teamCode: 'NEW', teamName: 'NEW', matches: [],
    };
    const history = extractTeamHistory(season, 'NEW');
    expect(history.entries).toHaveLength(0);
  });
});

// ─── computeLeagueCategoryWeights ────────────────────────────────────────────

describe('computeLeagueCategoryWeights', () => {
  it('weights sum to 1.0', () => {
    const histories = [makeHistory('BRO', [1800, 2000]), makeHistory('NZL', [1600, 1900])];
    const { weights } = computeLeagueCategoryWeights(histories, DEFAULT_HALF_LIFE, 2026, 0);
    const total = Object.values(weights).reduce((s, w) => s + w, 0);
    expect(total).toBeCloseTo(1.0, 9);
  });

  it('base category gets highest weight when data has base ≈ 40%', () => {
    const histories = [makeHistory('BRO', [1800, 2000]), makeHistory('NZL', [1600, 1900])];
    const { weights } = computeLeagueCategoryWeights(histories, DEFAULT_HALF_LIFE, 2026, 0);
    const categories = Object.keys(weights) as Array<keyof typeof weights>;
    const maxCat = categories.reduce((a, b) => weights[a] > weights[b] ? a : b);
    expect(maxCat).toBe('base');
  });

  it('returns equal weights when no team has history', () => {
    const histories: TeamMatchHistory[] = [{ teamCode: 'BRO', entries: [] }];
    const { weights } = computeLeagueCategoryWeights(histories, DEFAULT_HALF_LIFE, 2026, 0);
    const values = Object.values(weights);
    const expected = 1 / values.length;
    for (const v of values) {
      expect(v).toBeCloseTo(expected);
    }
  });

  it('returns 6 category weights and 6 averages', () => {
    const histories = [makeHistory('BRO', [1800])];
    const { weights, averages } = computeLeagueCategoryWeights(histories, DEFAULT_HALF_LIFE, 2026, 0);
    expect(Object.keys(weights)).toHaveLength(6);
    expect(Object.keys(averages)).toHaveLength(6);
  });
});

// ─── computeTeamGSR ──────────────────────────────────────────────────────────

describe('computeTeamGSR', () => {
  const equalWeights = {
    scoring: 1/6, create: 1/6, evade: 1/6, base: 1/6, defence: 1/6, negative: 1/6,
  };
  // Reasonable per-category averages aligned with the test team scoring distribution
  const sampleAverages = {
    scoring: 360, create: 270, evade: 180, base: 720, defence: 180, negative: -90,
  };

  it('sets sampleSizeWarning=true when team has fewer than minRounds samples', () => {
    const team = makeHistory('BRO', [1800, 2000]); // 2 entries < 3
    const opp = makeHistory('NZL', [1600, 1900, 1700]);
    const result = computeTeamGSR('BRO', 'NZL', team, opp, equalWeights, sampleAverages, DEFAULT_HALF_LIFE, DEFAULT_MIN_ROUNDS_FOR_RELIABILITY, 2026, 0);
    expect(result.sampleSizeWarning).toBe(true);
  });

  it('sets sampleSizeWarning=false when both teams have enough samples', () => {
    const team = makeHistory('BRO', [1800, 2000, 1900]);
    const opp = makeHistory('NZL', [1600, 1900, 1700]);
    const result = computeTeamGSR('BRO', 'NZL', team, opp, equalWeights, sampleAverages, DEFAULT_HALF_LIFE, DEFAULT_MIN_ROUNDS_FOR_RELIABILITY, 2026, 0);
    expect(result.sampleSizeWarning).toBe(false);
  });

  it('sets sampleSizeWarning=true when opponent has fewer than minRounds samples', () => {
    const team = makeHistory('BRO', [1800, 2000, 1900]);
    const opp = makeHistory('NZL', [1600]); // 1 entry < 3
    const result = computeTeamGSR('BRO', 'NZL', team, opp, equalWeights, sampleAverages, DEFAULT_HALF_LIFE, DEFAULT_MIN_ROUNDS_FOR_RELIABILITY, 2026, 0);
    expect(result.sampleSizeWarning).toBe(true);
  });

  it('returns teamSamplesUsed and opponentSamplesUsed correctly', () => {
    const team = makeHistory('BRO', [1800, 2000, 1900, 2100]);
    const opp = makeHistory('NZL', [1600, 1900]);
    const result = computeTeamGSR('BRO', 'NZL', team, opp, equalWeights, sampleAverages, DEFAULT_HALF_LIFE, DEFAULT_MIN_ROUNDS_FOR_RELIABILITY, 2026, 0);
    expect(result.teamSamplesUsed).toBe(4);
    expect(result.opponentSamplesUsed).toBe(2);
  });

  it('returns categoryStrengths with exactly 6 entries in fixed order', () => {
    const team = makeHistory('BRO', [1800]);
    const opp = makeHistory('NZL', [1600]);
    const result = computeTeamGSR('BRO', 'NZL', team, opp, equalWeights, sampleAverages, DEFAULT_HALF_LIFE, DEFAULT_MIN_ROUNDS_FOR_RELIABILITY, 2026, 0);
    expect(result.categoryStrengths).toHaveLength(6);
    expect(result.categoryStrengths.map(c => c.category)).toEqual([
      'base', 'scoring', 'create', 'evade', 'defence', 'negative',
    ]);
  });

  it('returns zero weightedAvgScored for a team with no history', () => {
    const team = makeHistory('BRO', []);
    const opp = makeHistory('NZL', [1600, 1700, 1500]);
    const result = computeTeamGSR('BRO', 'NZL', team, opp, equalWeights, sampleAverages, DEFAULT_HALF_LIFE, DEFAULT_MIN_ROUNDS_FOR_RELIABILITY, 2026, 0);
    expect(result.weightedAvgScored).toBe(0);
    expect(result.sampleSizeWarning).toBe(true);
  });

  it('season-transition penalty reduces prior-year entries\' weight in weightedAvgScored', () => {
    // Build a team with one 2025 match (much higher score) + one 2026 match (lower score).
    // With penalty=0, the older match (at index 0) decays normally; with a large penalty,
    // it decays much faster, so weightedAvgScored gets closer to the recent 2026 score.
    const entries = [
      { matchId: '2025-R27-BRO-X', year: 2025, round: 27, teamTotal: 2000, categoryTotals: { scoring: 400, create: 300, evade: 200, base: 800, defence: 200, negative: -100 }, opponentTotal: 1800, opponentCategoryTotals: { scoring: 360, create: 270, evade: 180, base: 720, defence: 180, negative: -90 }, isComplete: true, opponentCode: 'X' },
      { matchId: '2026-R1-BRO-Y', year: 2026, round: 1, teamTotal: 1000, categoryTotals: { scoring: 200, create: 150, evade: 100, base: 400, defence: 100, negative: -50 }, opponentTotal: 1200, opponentCategoryTotals: { scoring: 240, create: 180, evade: 120, base: 480, defence: 120, negative: -60 }, isComplete: true, opponentCode: 'Y' },
    ];
    const team: TeamMatchHistory = { teamCode: 'BRO', entries };
    const opp: TeamMatchHistory = { teamCode: 'OPP', entries: [{ ...entries[0], teamTotal: 1500, opponentTotal: 1500 }, { ...entries[1], teamTotal: 1500, opponentTotal: 1500 }] };

    // Without penalty: both entries weighted by ordinal index only.
    //   teamTotal weights: index 0 (2025) → diff=1 → weight ~0.89; index 1 (2026) → diff=0 → weight=1.0
    //   weightedAvg ≈ (2000×0.89 + 1000×1.0) / 1.89 ≈ 1471
    const noPenalty = computeTeamGSR('BRO', 'OPP', team, opp, equalWeights, sampleAverages, DEFAULT_HALF_LIFE, DEFAULT_MIN_ROUNDS_FOR_RELIABILITY, 2026, 0);
    // With penalty=12: 2025 effective diff = 1 + 12 = 13 → weight ~0.22 (much smaller)
    //   weightedAvg ≈ (2000×0.22 + 1000×1.0) / 1.22 ≈ 1180 (closer to the recent 1000)
    const withPenalty = computeTeamGSR('BRO', 'OPP', team, opp, equalWeights, sampleAverages, DEFAULT_HALF_LIFE, DEFAULT_MIN_ROUNDS_FOR_RELIABILITY, 2026, 12);

    // Penalty pulls the average toward the recent (lower-scoring) 2026 match.
    expect(withPenalty.weightedAvgScored).toBeLessThan(noPenalty.weightedAvgScored);
    // And it stays bounded between the two values.
    expect(withPenalty.weightedAvgScored).toBeGreaterThan(1000);
    expect(noPenalty.weightedAvgScored).toBeLessThan(2000);
  });

  it('produces ASYMMETRIC GSR — home and away teams get different overallGSR when teams differ', () => {
    // Team A scores high, opponents score low against it (strong on both sides).
    // Team B scores low, opponents score high against it (weak on both sides).
    const teamA = makeHistory('STRONG', [2200, 2300, 2100, 2400], [1500, 1400, 1600, 1450]); // scores 2200ish, allows 1500ish
    const teamB = makeHistory('WEAK', [1500, 1400, 1600, 1450], [2200, 2300, 2100, 2400]);   // scores 1500ish, allows 2200ish

    const aResult = computeTeamGSR('STRONG', 'WEAK', teamA, teamB, equalWeights, sampleAverages, DEFAULT_HALF_LIFE, DEFAULT_MIN_ROUNDS_FOR_RELIABILITY, 2026, 0);
    const bResult = computeTeamGSR('WEAK', 'STRONG', teamB, teamA, equalWeights, sampleAverages, DEFAULT_HALF_LIFE, DEFAULT_MIN_ROUNDS_FOR_RELIABILITY, 2026, 0);

    // The strong team's GSR should be much higher (easier match-up — they score lots and the weak opponent gives up lots)
    expect(aResult.overallGSR).toBeGreaterThan(bResult.overallGSR);
    // Sanity: the two values must actually differ — this is the symmetric-bug regression check
    expect(aResult.overallGSR).not.toBeCloseTo(bResult.overallGSR, 5);
  });
});

// ─── computeRoundGSR ─────────────────────────────────────────────────────────

describe('computeRoundGSR', () => {
  function makeFixture(homeCode: string, awayCode: string, round = 5): NonByeFixture {
    return { homeCode, awayCode, matchId: `2026-R${round}-${homeCode}-${awayCode}` };
  }

  // For round-mean tests, set opponentTotal = teamTotal so each team's WAA equals its own WAS on
  // average — keeps the test data self-consistent and lets the mean-normalisation assertion hold.
  // computeRoundGSR takes lightweight TeamMatchHistory, so we pre-extract here.
  function makeSeasonMap(...entries: [string, number[]][]): Map<string, TeamMatchHistory> {
    return new Map(
      entries.map(([code, totals]) => {
        const season = makeSeason(code, totals.map((t, i) => ({
          round: i + 1, teamTotal: t, opponentCode: 'OPP', opponentTotal: t,
        })));
        return [code, extractTeamHistory(season, code)];
      })
    );
  }

  it('mean of normalizedOverallGSR values is ≈ 1.0 across a round', () => {
    const fixtures: NonByeFixture[] = [
      makeFixture('BRO', 'NZL'),
      makeFixture('MEL', 'PAR'),
    ];
    const histories = makeSeasonMap(
      ['BRO', [1800, 2000, 1900, 2100, 1850]],
      ['NZL', [1600, 1700, 1550, 1800, 1650]],
      ['MEL', [2100, 2200, 2050, 2300, 2150]],
      ['PAR', [1700, 1800, 1650, 1900, 1750]],
    );
    const result = computeRoundGSR(fixtures, histories, {
      halfLife: DEFAULT_HALF_LIFE,
      minRoundsForReliability: DEFAULT_MIN_ROUNDS_FOR_RELIABILITY,
      year: 2026,
      round: 5,
    });

    const allNormalized = result.matches.flatMap(m => [
      m.homeTeam.normalizedOverallGSR,
      m.awayTeam.normalizedOverallGSR,
    ]);
    const mean = allNormalized.reduce((s, v) => s + v, 0) / allNormalized.length;
    expect(mean).toBeCloseTo(1.0, 5);
  });

  it('excludes bye fixtures from the result', () => {
    const fixtures: NonByeFixture[] = [makeFixture('BRO', 'NZL')]; // only one fixture
    const histories = makeSeasonMap(
      ['BRO', [1800, 2000, 1900]],
      ['NZL', [1600, 1700, 1550]],
    );
    const result = computeRoundGSR(fixtures, histories, {
      halfLife: DEFAULT_HALF_LIFE,
      minRoundsForReliability: DEFAULT_MIN_ROUNDS_FOR_RELIABILITY,
      year: 2026,
      round: 5,
    });
    expect(result.matches).toHaveLength(1);
  });

  it('populates methodology block correctly', () => {
    const fixtures: NonByeFixture[] = [makeFixture('BRO', 'NZL')];
    const histories = makeSeasonMap(['BRO', [1800]], ['NZL', [1600]]);
    const result = computeRoundGSR(fixtures, histories, {
      halfLife: 8,
      minRoundsForReliability: 4,
      year: 2026,
      round: 3,
    });
    expect(result.methodology.halfLifeRounds).toBe(8);
    expect(result.methodology.minRoundsForReliability).toBe(4);
    expect(result.methodology.offenseWeight).toBe(0.5);
    expect(result.methodology.categoryWeightingMethod).toBe('dynamic');
  });

  it('recent game weights more than a game 6 rounds ago', () => {
    // Give BRO a big score in the last round and a small score in older rounds
    const fixtures: NonByeFixture[] = [makeFixture('BRO', 'NZL')];
    const broSeason = makeSeason('BRO', [
      { round: 1, teamTotal: 1000, opponentCode: 'NZL', opponentTotal: 1500 },
      { round: 2, teamTotal: 1000, opponentCode: 'NZL', opponentTotal: 1500 },
      { round: 3, teamTotal: 1000, opponentCode: 'NZL', opponentTotal: 1500 },
      { round: 4, teamTotal: 1000, opponentCode: 'NZL', opponentTotal: 1500 },
      { round: 5, teamTotal: 3000, opponentCode: 'NZL', opponentTotal: 1500 }, // very recent, very high
    ]);
    const nzlSeason = makeSeason('NZL', [
      { round: 1, teamTotal: 1500, opponentCode: 'BRO', opponentTotal: 1000 },
      { round: 2, teamTotal: 1500, opponentCode: 'BRO', opponentTotal: 1000 },
      { round: 3, teamTotal: 1500, opponentCode: 'BRO', opponentTotal: 1000 },
    ]);
    const histories = new Map([
      ['BRO', extractTeamHistory(broSeason, 'BRO')],
      ['NZL', extractTeamHistory(nzlSeason, 'NZL')],
    ]);
    const result = computeRoundGSR(fixtures, histories, {
      halfLife: DEFAULT_HALF_LIFE,
      minRoundsForReliability: DEFAULT_MIN_ROUNDS_FOR_RELIABILITY,
      year: 2026,
      round: 6,
    });
    // BRO's weightedAvgScored should exceed the uniform average of 1400 (4×1000+3000)/5
    // due to recency bias pulling toward the recent 3000-point game
    expect(result.matches[0].homeTeam.weightedAvgScored).toBeGreaterThan(1400);
  });

  it('normalizedCategoricalGSR ≈ 1.0 for a team with league-average category distribution', () => {
    // All teams use the default split (base=0.4 etc.) — every team is "average" in shape,
    // so each team's categoricalGSR should equal its overallGSR after normalization.
    const fixtures: NonByeFixture[] = [makeFixture('BRO', 'NZL')];
    const histories = makeSeasonMap(
      ['BRO', [1800, 2000, 1900, 2100, 1850]],
      ['NZL', [1800, 2000, 1900, 2100, 1850]],
    );
    const result = computeRoundGSR(fixtures, histories, {
      halfLife: DEFAULT_HALF_LIFE,
      minRoundsForReliability: DEFAULT_MIN_ROUNDS_FOR_RELIABILITY,
      year: 2026,
      round: 5,
    });
    const home = result.matches[0].homeTeam;
    // Both ratings on the same scale; balanced team → both ≈ 1.0
    expect(home.normalizedOverallGSR).toBeCloseTo(1.0, 5);
    expect(home.normalizedCategoricalGSR).toBeCloseTo(home.normalizedOverallGSR, 5);
  });
});
