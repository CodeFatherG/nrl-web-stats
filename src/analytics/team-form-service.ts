/**
 * Team Form Service — computes form trajectory relative to schedule difficulty.
 * Algorithm per research.md R1.
 */

import type { Match } from '../domain/match.js';
import { MatchStatus } from '../domain/match.js';
import type { Fixture } from '../models/fixture.js';
import type { TeamFormSnapshot, FormTrajectory, FormClassification } from './types.js';

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function computeRawResultScore(result: 'win' | 'loss' | 'draw', margin: number): number {
  switch (result) {
    case 'win':
      return 1.0 + clamp(margin / 40, 0, 0.5);
    case 'draw':
      return 0.5;
    case 'loss':
      // Partial credit for close losses: smaller margin = higher score
      return clamp((40 - margin) / 40, 0, 0.5);
  }
}

function normaliseDifficultyFactor(
  opponentStrengthRating: number,
  allStrengthRatings: number[]
): number {
  if (allStrengthRatings.length === 0) return 0.5;
  const min = Math.min(...allStrengthRatings);
  const max = Math.max(...allStrengthRatings);
  if (min === max) return 0.5;
  const normalised = (opponentStrengthRating - min) / (max - min);
  // Difficulty = 1 - normalised (hard opponents with negative ratings normalise low, so 1 - low = high difficulty)
  return 1 - normalised;
}

function classify(rollingForm: number): FormClassification {
  if (rollingForm > 0.65) return 'outperforming';
  if (rollingForm < 0.35) return 'underperforming';
  return 'meeting';
}

function getMatchResult(match: Match, teamCode: string): 'win' | 'loss' | 'draw' | null {
  if (match.homeScore === null || match.awayScore === null) return null;
  const isHome = match.homeTeamCode === teamCode;
  const teamScore = isHome ? match.homeScore : match.awayScore;
  const oppScore = isHome ? match.awayScore : match.homeScore;
  if (teamScore > oppScore) return 'win';
  if (teamScore < oppScore) return 'loss';
  return 'draw';
}

function getOpponentCode(match: Match, teamCode: string): string | null {
  if (match.homeTeamCode === teamCode) return match.awayTeamCode;
  if (match.awayTeamCode === teamCode) return match.homeTeamCode;
  return null;
}

export function computeFormTrajectory(
  matches: Match[],
  fixtures: Fixture[],
  teamCode: string,
  year: number,
  windowSize: number
): Omit<FormTrajectory, 'teamName'> {
  // Filter to completed matches for this team in this year
  const teamMatches = matches.filter(m =>
    m.year === year &&
    m.status === MatchStatus.Completed &&
    (m.homeTeamCode === teamCode || m.awayTeamCode === teamCode) &&
    m.homeScore !== null &&
    m.awayScore !== null &&
    m.homeTeamCode !== null &&
    m.awayTeamCode !== null // exclude byes
  ).sort((a, b) => a.round - b.round);

  // Build fixture lookup for strength ratings
  const fixtureMap = new Map<string, Fixture>();
  for (const f of fixtures) {
    fixtureMap.set(`${f.teamCode}-${f.round}`, f);
  }

  // Collect all strength ratings for normalisation
  const allStrengthRatings = fixtures
    .filter(f => f.year === year && !f.isBye)
    .map(f => f.strengthRating);

  // Compute snapshots
  const snapshots: TeamFormSnapshot[] = teamMatches.map(match => {
    const result = getMatchResult(match, teamCode)!;
    const margin = Math.abs(match.homeScore! - match.awayScore!);
    const opponentCode = getOpponentCode(match, teamCode)!;

    // Look up opponent's strength rating from the team's fixture for this round
    const teamFixture = fixtureMap.get(`${teamCode}-${match.round}`);
    const opponentStrengthRating = teamFixture?.strengthRating ?? null;

    const rawScore = computeRawResultScore(result, margin);

    let formScore: number;
    if (opponentStrengthRating !== null && allStrengthRatings.length > 0) {
      const difficultyFactor = normaliseDifficultyFactor(opponentStrengthRating, allStrengthRatings);
      formScore = rawScore * (0.5 + 0.5 * difficultyFactor);
    } else {
      // No difficulty weighting — use raw score
      formScore = rawScore;
    }

    return {
      round: match.round,
      result,
      margin,
      opponentCode,
      opponentStrengthRating,
      formScore,
    };
  });

  // Rolling form = mean of last windowSize snapshots
  const windowSnapshots = snapshots.slice(-windowSize);
  const rollingFormRating = windowSnapshots.length > 0
    ? windowSnapshots.reduce((sum, s) => sum + s.formScore, 0) / windowSnapshots.length
    : null;

  const classification = rollingFormRating !== null ? classify(rollingFormRating) : null;
  const sampleSizeWarning = snapshots.length < windowSize;

  return {
    teamCode,
    year,
    windowSize,
    snapshots,
    rollingFormRating,
    classification,
    sampleSizeWarning,
  };
}
