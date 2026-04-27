/**
 * Deterministic fixtures for contextual projection analytics tests.
 * Feature: 028-player-context-analytics-opponent
 *
 * Scenario: Two teams (PTH and BRI) play each other in rounds 2, 4, 6.
 * PTH halfbacks also play MEL in rounds 1, 3, 5. MEL halfback plays both BRI and PTH.
 * This gives enough cross-team data for league normalisation and h2h history tests.
 *
 * Pre-computed expected values are exported as EXPECTED to enable exact assertions.
 */

import type { ContextualEligibleGame } from '../../../src/analytics/contextual-projection-types.js';

// ── Player IDs ────────────────────────────────────────────────────────────────

export const PTH_HALFBACK_1_ID = 'pth-halfback-1'; // 3 h2h games vs BRI (full confidence)
export const PTH_HALFBACK_2_ID = 'pth-halfback-2'; // 3 h2h games vs BRI (for shared-defenseFactor test)
export const PTH_HALFBACK_3_ID = 'pth-halfback-3'; // 1 h2h game vs BRI (confidence = 1/3)
export const NQC_HALFBACK_1_ID = 'nqc-halfback-1'; // 0 h2h games vs BRI (confidence = 0)
export const PTH_PROP_1_ID = 'pth-prop-1';         // Prop — different position from halfbacks
export const MEL_HALFBACK_1_ID = 'mel-halfback-1'; // Contributes to BRI and PTH defensive profiles
export const BRI_PROP_1_ID = 'bri-prop-1';         // Contributes to PTH and MEL defensive profiles
export const MEL_PROP_1_ID = 'mel-prop-1';         // Contributes to BRI and PTH defensive profiles

// ── Positions map ─────────────────────────────────────────────────────────────

export const POSITIONS: Map<string, string> = new Map([
  [PTH_HALFBACK_1_ID, 'Halfback'],
  [PTH_HALFBACK_2_ID, 'Halfback'],
  [PTH_HALFBACK_3_ID, 'Halfback'],
  [NQC_HALFBACK_1_ID, 'Halfback'],
  [PTH_PROP_1_ID, 'Prop'],
  [MEL_HALFBACK_1_ID, 'Halfback'],
  [BRI_PROP_1_ID, 'Prop'],
  [MEL_PROP_1_ID, 'Prop'],
]);

// ── Game records ──────────────────────────────────────────────────────────────
// opponent = the DEFENDING team (the team that conceded these SC points)

const YEAR = 2026;
const W = 1; // weight (uniform for same-season tests)

export const ALL_GAMES: ContextualEligibleGame[] = [
  // pth-halfback-1: 3 games vs BRI (h2h), 3 games vs MEL
  // overall mean = (70+85+65+90+72+80)/6 = 462/6 = 77
  // h2h mean vs BRI = (85+90+80)/3 = 255/3 = 85  → rawRpi = 85/77 ≈ 1.1039
  { playerId: PTH_HALFBACK_1_ID, round: 1, totalScore: 70, opponent: 'MEL', season: YEAR, weight: W },
  { playerId: PTH_HALFBACK_1_ID, round: 2, totalScore: 85, opponent: 'BRI', season: YEAR, weight: W },
  { playerId: PTH_HALFBACK_1_ID, round: 3, totalScore: 65, opponent: 'MEL', season: YEAR, weight: W },
  { playerId: PTH_HALFBACK_1_ID, round: 4, totalScore: 90, opponent: 'BRI', season: YEAR, weight: W },
  { playerId: PTH_HALFBACK_1_ID, round: 5, totalScore: 72, opponent: 'MEL', season: YEAR, weight: W },
  { playerId: PTH_HALFBACK_1_ID, round: 6, totalScore: 80, opponent: 'BRI', season: YEAR, weight: W },

  // pth-halfback-2: same fixture schedule as pth-halfback-1 but different (lower) scores
  // overall mean = (60+75+55+80+58+70)/6 = 398/6 ≈ 66.33
  // h2h mean vs BRI = (75+80+70)/3 = 225/3 = 75  → rawRpi = 75/66.33 ≈ 1.1307
  { playerId: PTH_HALFBACK_2_ID, round: 1, totalScore: 60, opponent: 'MEL', season: YEAR, weight: W },
  { playerId: PTH_HALFBACK_2_ID, round: 2, totalScore: 75, opponent: 'BRI', season: YEAR, weight: W },
  { playerId: PTH_HALFBACK_2_ID, round: 3, totalScore: 55, opponent: 'MEL', season: YEAR, weight: W },
  { playerId: PTH_HALFBACK_2_ID, round: 4, totalScore: 80, opponent: 'BRI', season: YEAR, weight: W },
  { playerId: PTH_HALFBACK_2_ID, round: 5, totalScore: 58, opponent: 'MEL', season: YEAR, weight: W },
  { playerId: PTH_HALFBACK_2_ID, round: 6, totalScore: 70, opponent: 'BRI', season: YEAR, weight: W },

  // pth-halfback-3: only 1 game vs BRI → confidence = 1/3 ≈ 0.333 (attenuated multiplier)
  // overall mean = (60+80+55+62+58+64)/6 = 379/6 ≈ 63.167
  // h2h mean vs BRI = 80 (1 game)  → rawRpi = 80/63.167 ≈ 1.266
  { playerId: PTH_HALFBACK_3_ID, round: 1, totalScore: 60, opponent: 'MEL', season: YEAR, weight: W },
  { playerId: PTH_HALFBACK_3_ID, round: 2, totalScore: 80, opponent: 'BRI', season: YEAR, weight: W },
  { playerId: PTH_HALFBACK_3_ID, round: 3, totalScore: 55, opponent: 'MEL', season: YEAR, weight: W },
  { playerId: PTH_HALFBACK_3_ID, round: 4, totalScore: 62, opponent: 'MEL', season: YEAR, weight: W },
  { playerId: PTH_HALFBACK_3_ID, round: 5, totalScore: 58, opponent: 'MEL', season: YEAR, weight: W },
  { playerId: PTH_HALFBACK_3_ID, round: 6, totalScore: 64, opponent: 'MEL', season: YEAR, weight: W },

  // nqc-halfback-1: zero games vs BRI → h2hRpi=1.0, h2hConfidence=0, sampleN=0
  { playerId: NQC_HALFBACK_1_ID, round: 1, totalScore: 65, opponent: 'MEL', season: YEAR, weight: W },
  { playerId: NQC_HALFBACK_1_ID, round: 2, totalScore: 70, opponent: 'MEL', season: YEAR, weight: W },
  { playerId: NQC_HALFBACK_1_ID, round: 3, totalScore: 68, opponent: 'PTH', season: YEAR, weight: W },
  { playerId: NQC_HALFBACK_1_ID, round: 4, totalScore: 72, opponent: 'PTH', season: YEAR, weight: W },
  { playerId: NQC_HALFBACK_1_ID, round: 5, totalScore: 60, opponent: 'MEL', season: YEAR, weight: W },
  { playerId: NQC_HALFBACK_1_ID, round: 6, totalScore: 75, opponent: 'MEL', season: YEAR, weight: W },

  // pth-prop-1: different position — tests position-specific defensive profile
  { playerId: PTH_PROP_1_ID, round: 1, totalScore: 42, opponent: 'MEL', season: YEAR, weight: W },
  { playerId: PTH_PROP_1_ID, round: 2, totalScore: 50, opponent: 'BRI', season: YEAR, weight: W },
  { playerId: PTH_PROP_1_ID, round: 3, totalScore: 45, opponent: 'MEL', season: YEAR, weight: W },
  { playerId: PTH_PROP_1_ID, round: 4, totalScore: 55, opponent: 'BRI', season: YEAR, weight: W },
  { playerId: PTH_PROP_1_ID, round: 5, totalScore: 40, opponent: 'MEL', season: YEAR, weight: W },
  { playerId: PTH_PROP_1_ID, round: 6, totalScore: 48, opponent: 'BRI', season: YEAR, weight: W },

  // mel-halfback-1: games vs BRI and vs PTH (contributes to BRI and PTH defensive profiles)
  { playerId: MEL_HALFBACK_1_ID, round: 1, totalScore: 65, opponent: 'BRI', season: YEAR, weight: W },
  { playerId: MEL_HALFBACK_1_ID, round: 2, totalScore: 72, opponent: 'PTH', season: YEAR, weight: W },
  { playerId: MEL_HALFBACK_1_ID, round: 3, totalScore: 70, opponent: 'BRI', season: YEAR, weight: W },
  { playerId: MEL_HALFBACK_1_ID, round: 4, totalScore: 68, opponent: 'PTH', season: YEAR, weight: W },
  { playerId: MEL_HALFBACK_1_ID, round: 5, totalScore: 68, opponent: 'BRI', season: YEAR, weight: W },
  { playerId: MEL_HALFBACK_1_ID, round: 6, totalScore: 75, opponent: 'PTH', season: YEAR, weight: W },

  // bri-prop-1: games vs PTH and MEL (contributes to PTH and MEL defensive profiles for Prop)
  { playerId: BRI_PROP_1_ID, round: 1, totalScore: 45, opponent: 'MEL', season: YEAR, weight: W },
  { playerId: BRI_PROP_1_ID, round: 2, totalScore: 52, opponent: 'PTH', season: YEAR, weight: W },
  { playerId: BRI_PROP_1_ID, round: 3, totalScore: 50, opponent: 'MEL', season: YEAR, weight: W },
  { playerId: BRI_PROP_1_ID, round: 4, totalScore: 48, opponent: 'PTH', season: YEAR, weight: W },
  { playerId: BRI_PROP_1_ID, round: 5, totalScore: 46, opponent: 'MEL', season: YEAR, weight: W },
  { playerId: BRI_PROP_1_ID, round: 6, totalScore: 55, opponent: 'PTH', season: YEAR, weight: W },

  // mel-prop-1: games vs BRI and PTH (contributes to BRI and PTH defensive profiles for Prop)
  { playerId: MEL_PROP_1_ID, round: 1, totalScore: 45, opponent: 'BRI', season: YEAR, weight: W },
  { playerId: MEL_PROP_1_ID, round: 2, totalScore: 47, opponent: 'PTH', season: YEAR, weight: W },
  { playerId: MEL_PROP_1_ID, round: 3, totalScore: 48, opponent: 'BRI', season: YEAR, weight: W },
  { playerId: MEL_PROP_1_ID, round: 4, totalScore: 50, opponent: 'PTH', season: YEAR, weight: W },
  { playerId: MEL_PROP_1_ID, round: 5, totalScore: 42, opponent: 'BRI', season: YEAR, weight: W },
  { playerId: MEL_PROP_1_ID, round: 6, totalScore: 44, opponent: 'PTH', season: YEAR, weight: W },
];

// ── Per-player game slices ────────────────────────────────────────────────────

export const PTH_HALFBACK_1_GAMES = ALL_GAMES.filter(g => g.playerId === PTH_HALFBACK_1_ID);
export const PTH_HALFBACK_2_GAMES = ALL_GAMES.filter(g => g.playerId === PTH_HALFBACK_2_ID);
export const PTH_HALFBACK_3_GAMES = ALL_GAMES.filter(g => g.playerId === PTH_HALFBACK_3_ID);
export const NQC_HALFBACK_1_GAMES = ALL_GAMES.filter(g => g.playerId === NQC_HALFBACK_1_ID);

// ── Pre-computed expected values for test assertions ──────────────────────────
// Hand-verified from the game data above. Update if game scores change.

const h1Scores = [70, 85, 65, 90, 72, 80];
const h1BriScores = [85, 90, 80];
const h1OverallMean = h1Scores.reduce((s, v) => s + v, 0) / h1Scores.length; // 77

const h3Scores = [60, 80, 55, 62, 58, 64];
const h3BriScores = [80];
const h3OverallMean = h3Scores.reduce((s, v) => s + v, 0) / h3Scores.length; // ≈ 63.167

// BRI concedes to Halfback:
//   pth-hb-1 (85,90,80) + pth-hb-2 (75,80,70) + pth-hb-3 (80) + mel-hb-1 (65,70,68) = 10 games
const brHalfbackScores = [85, 90, 80, 75, 80, 70, 80, 65, 70, 68];
const briHalfbackMean = brHalfbackScores.reduce((s, v) => s + v, 0) / brHalfbackScores.length;

// MEL concedes to Halfback:
//   pth-hb-1 (70,65,72) + pth-hb-2 (60,55,58) + pth-hb-3 (60,55,62,58,64) + nqc-hb-1 (65,70,60,75) = 15 games
const melHalfbackScores = [70, 65, 72, 60, 55, 58, 60, 55, 62, 58, 64, 65, 70, 60, 75];
const melHalfbackMean = melHalfbackScores.reduce((s, v) => s + v, 0) / melHalfbackScores.length;

// PTH concedes to Halfback:
//   mel-hb-1 (72,68,75) + nqc-hb-1 (68,72) = 5 games
const pthHalfbackScores = [72, 68, 75, 68, 72];
const pthHalfbackMean = pthHalfbackScores.reduce((s, v) => s + v, 0) / pthHalfbackScores.length;

// League average for Halfback = overall mean of ALL halfback game scores
const allHalfbackScores = [
  ...h1Scores,
  60, 75, 55, 80, 58, 70, // pth-hb-2
  ...h3Scores,
  65, 70, 68, 72, 60, 75, // nqc-hb-1
  65, 72, 70, 68, 68, 75, // mel-hb-1
];
const halfbackLeagueAvg = allHalfbackScores.reduce((s, v) => s + v, 0) / allHalfbackScores.length;

export const EXPECTED = {
  // pth-halfback-1 h2h vs BRI
  h1OverallMean,
  h1BriMean: h1BriScores.reduce((s, v) => s + v, 0) / h1BriScores.length,   // 85
  h1RawRpi: (h1BriScores.reduce((s, v) => s + v, 0) / h1BriScores.length) / h1OverallMean,
  h1GameCount: 3,

  // pth-halfback-3 h2h vs BRI (1 game — low confidence)
  h3OverallMean,
  h3BriMean: h3BriScores.reduce((s, v) => s + v, 0) / h3BriScores.length,   // 80
  h3RawRpi: (h3BriScores.reduce((s, v) => s + v, 0) / h3BriScores.length) / h3OverallMean,
  h3GameCount: 1,
  h3Confidence: 1 / 3,

  // nqc-halfback-1 h2h vs BRI (zero games)
  nqcGameCount: 0,
  nqcRawRpi: 1.0,
  nqcConfidence: 0,

  // Defensive profile values for BRI/Halfback
  briHalfbackGamesCount: brHalfbackScores.length,   // 10
  briHalfbackMeanConceded: briHalfbackMean,
  briHalfbackDefenseFactor: briHalfbackMean / halfbackLeagueAvg, // > 1.0 (BRI weak vs halfbacks)

  // Defensive profile values for MEL/Halfback
  melHalfbackGamesCount: melHalfbackScores.length,  // 15
  melHalfbackMeanConceded: melHalfbackMean,
  melHalfbackDefenseFactor: melHalfbackMean / halfbackLeagueAvg, // < 1.0 (MEL strong vs halfbacks)

  // Defensive profile values for PTH/Halfback
  pthHalfbackGamesCount: pthHalfbackScores.length,  // 5
  pthHalfbackMeanConceded: pthHalfbackMean,
  pthHalfbackDefenseFactor: pthHalfbackMean / halfbackLeagueAvg,

  // League average for Halfback position
  halfbackLeagueAvg,
};
