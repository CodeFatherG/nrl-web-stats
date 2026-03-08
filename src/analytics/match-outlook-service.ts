/**
 * Match Outlook Service — predictive match outlook using form, head-to-head, and strength ratings.
 * Algorithm per research.md R2.
 */

import type { Match } from '../domain/match.js';
import { MatchStatus } from '../domain/match.js';
import type { Fixture } from '../models/fixture.js';
import type { HeadToHeadRecord, MatchOutlook, OutlookLabel, CompletedMatchResult } from './types.js';

/**
 * Compute head-to-head record between two teams across all available seasons.
 */
export function computeHeadToHead(
  allMatches: Match[],
  homeTeamCode: string,
  awayTeamCode: string
): HeadToHeadRecord {
  const h2hMatches = allMatches.filter(m =>
    m.status === MatchStatus.Completed &&
    m.homeScore !== null &&
    m.awayScore !== null &&
    ((m.homeTeamCode === homeTeamCode && m.awayTeamCode === awayTeamCode) ||
     (m.homeTeamCode === awayTeamCode && m.awayTeamCode === homeTeamCode))
  );

  let homeWins = 0;
  let awayWins = 0;
  let draws = 0;

  for (const match of h2hMatches) {
    const isHomeTeamActuallyHome = match.homeTeamCode === homeTeamCode;
    const homeScore = isHomeTeamActuallyHome ? match.homeScore! : match.awayScore!;
    const awayScore = isHomeTeamActuallyHome ? match.awayScore! : match.homeScore!;

    if (homeScore > awayScore) homeWins++;
    else if (awayScore > homeScore) awayWins++;
    else draws++;
  }

  const totalMatches = h2hMatches.length;
  const homeWinRate = totalMatches > 0 ? homeWins / totalMatches : 0.5;

  return { totalMatches, homeWins, awayWins, draws, homeWinRate };
}

/**
 * Normalise strength rating to 0-1 scale across all ratings for the season.
 */
function normaliseStrength(rating: number, allRatings: number[]): number {
  if (allRatings.length === 0) return 0.5;
  const min = Math.min(...allRatings);
  const max = Math.max(...allRatings);
  if (min === max) return 0.5;
  return (rating - min) / (max - min);
}

/**
 * Compute match outlook for a single upcoming match.
 */
export function computeOutlook(
  homeFormRating: number | null,
  awayFormRating: number | null,
  headToHead: HeadToHeadRecord,
  strengthRating: number | null,
  allStrengthRatings: number[]
): { compositeScore: number; label: OutlookLabel; factorsAvailable: number } {
  let weightedSum = 0;
  let totalWeight = 0;
  let factorsAvailable = 0;

  // Factor 1: Home form (35%) — higher is better for home team
  if (homeFormRating !== null) {
    // Normalise form rating (typically 0-1.5) to 0-1 scale
    const normalisedHomeForm = Math.min(homeFormRating / 1.5, 1);
    weightedSum += normalisedHomeForm * 0.35;
    totalWeight += 0.35;
    factorsAvailable++;
  }

  // Factor 2: Away form (25%) — inverted: away team underperforming is good for home
  if (awayFormRating !== null) {
    const normalisedAwayForm = Math.min(awayFormRating / 1.5, 1);
    weightedSum += (1 - normalisedAwayForm) * 0.25;
    totalWeight += 0.25;
    factorsAvailable++;
  }

  // Factor 3: Head-to-head (15%)
  weightedSum += headToHead.homeWinRate * 0.15;
  totalWeight += 0.15;
  factorsAvailable++;

  // Factor 4: Strength rating (25%) — normalised, higher = easier for home
  if (strengthRating !== null && allStrengthRatings.length > 0) {
    const normalised = normaliseStrength(strengthRating, allStrengthRatings);
    weightedSum += normalised * 0.25;
    totalWeight += 0.25;
    factorsAvailable++;
  }

  // Normalise composite to 0-1 range based on available weights
  const compositeScore = totalWeight > 0 ? weightedSum / totalWeight : 0.5;

  // Determine label
  let label: OutlookLabel;

  // Check for Upset Alert: form-based vs non-form-based factor divergence > 0.3
  const formFactors: number[] = [];
  const nonFormFactors: number[] = [];

  if (homeFormRating !== null) formFactors.push(Math.min(homeFormRating / 1.5, 1));
  if (awayFormRating !== null) formFactors.push(1 - Math.min(awayFormRating / 1.5, 1));
  nonFormFactors.push(headToHead.homeWinRate);
  if (strengthRating !== null && allStrengthRatings.length > 0) {
    nonFormFactors.push(normaliseStrength(strengthRating, allStrengthRatings));
  }

  const formAvg = formFactors.length > 0
    ? formFactors.reduce((a, b) => a + b, 0) / formFactors.length
    : null;
  const nonFormAvg = nonFormFactors.length > 0
    ? nonFormFactors.reduce((a, b) => a + b, 0) / nonFormFactors.length
    : null;

  if (formAvg !== null && nonFormAvg !== null && Math.abs(formAvg - nonFormAvg) > 0.3) {
    label = 'Upset Alert';
  } else if (compositeScore >= 0.65) {
    label = 'Easy';
  } else if (compositeScore < 0.40) {
    label = 'Tough';
  } else {
    label = 'Competitive';
  }

  return { compositeScore: Math.round(compositeScore * 100) / 100, label, factorsAvailable };
}

/**
 * Compute outlook for all matches in a round.
 */
export function computeRoundOutlook(
  roundMatches: Match[],
  allMatches: Match[],
  fixtures: Fixture[],
  getFormRating: (teamCode: string) => number | null
): { outlooks: MatchOutlook[]; completed: CompletedMatchResult[] } {
  const allStrengthRatings = fixtures
    .filter(f => !f.isBye)
    .map(f => f.strengthRating);

  const outlooks: MatchOutlook[] = [];
  const completed: CompletedMatchResult[] = [];

  for (const match of roundMatches) {
    if (!match.homeTeamCode || !match.awayTeamCode) continue;

    if (match.status === MatchStatus.Completed && match.homeScore !== null && match.awayScore !== null) {
      completed.push({
        matchId: match.id,
        homeTeamCode: match.homeTeamCode,
        awayTeamCode: match.awayTeamCode,
        homeScore: match.homeScore,
        awayScore: match.awayScore,
        status: 'Completed',
      });
      continue;
    }

    const homeFormRating = getFormRating(match.homeTeamCode);
    const awayFormRating = getFormRating(match.awayTeamCode);
    const headToHead = computeHeadToHead(allMatches, match.homeTeamCode, match.awayTeamCode);

    // Get home team's strength rating for this round
    const homeFixture = fixtures.find(f =>
      f.teamCode === match.homeTeamCode && f.round === match.round
    );
    const strengthRating = homeFixture?.strengthRating ?? null;

    const { compositeScore, label, factorsAvailable } = computeOutlook(
      homeFormRating,
      awayFormRating,
      headToHead,
      strengthRating,
      allStrengthRatings
    );

    outlooks.push({
      matchId: match.id,
      homeTeamCode: match.homeTeamCode,
      awayTeamCode: match.awayTeamCode,
      homeFormRating,
      awayFormRating,
      headToHead,
      strengthRating,
      compositeScore,
      label,
      factorsAvailable,
    });
  }

  return { outlooks, completed };
}
