/**
 * Composition Service — correlates player availability/performance with team outcomes.
 * Algorithm per research.md R4.
 */

import type { Match } from '../domain/match.js';
import { MatchStatus } from '../domain/match.js';
import type { Player, MatchPerformance } from '../domain/player.js';
import type { PlayerImpact, ImpactMethod } from './types.js';

const MIN_MATCHES_PLAYED = 3;
const MIN_MATCHES_MISSED = 2;
const MIN_TEAM_MATCHES = 5;

function isTeamWin(match: Match, teamCode: string): boolean {
  if (match.homeScore === null || match.awayScore === null) return false;
  const isHome = match.homeTeamCode === teamCode;
  const teamScore = isHome ? match.homeScore : match.awayScore;
  const oppScore = isHome ? match.awayScore : match.homeScore;
  return teamScore > oppScore;
}

/**
 * Compute Pearson correlation between player fantasy points and team wins.
 */
function computeCorrelation(
  performances: MatchPerformance[],
  teamMatches: Match[],
  teamCode: string
): number {
  if (performances.length < MIN_MATCHES_PLAYED) return 0;

  const matchMap = new Map(teamMatches.map(m => [m.round, m]));
  const paired: { fp: number; win: number }[] = [];

  for (const perf of performances) {
    const match = matchMap.get(perf.round);
    if (!match || match.status !== MatchStatus.Completed) continue;
    paired.push({
      fp: perf.fantasyPoints,
      win: isTeamWin(match, teamCode) ? 1 : 0,
    });
  }

  if (paired.length < MIN_MATCHES_PLAYED) return 0;

  const n = paired.length;
  const meanFp = paired.reduce((s, p) => s + p.fp, 0) / n;
  const meanWin = paired.reduce((s, p) => s + p.win, 0) / n;

  let numerator = 0;
  let denomFp = 0;
  let denomWin = 0;

  for (const p of paired) {
    const dFp = p.fp - meanFp;
    const dWin = p.win - meanWin;
    numerator += dFp * dWin;
    denomFp += dFp * dFp;
    denomWin += dWin * dWin;
  }

  const denom = Math.sqrt(denomFp * denomWin);
  if (denom === 0) return 0;

  return numerator / denom;
}

/**
 * Compute composition impact for a team's roster.
 */
export function computeCompositionImpact(
  teamMatches: Match[],
  players: Player[],
  teamCode: string,
  year: number
): { playerImpacts: PlayerImpact[]; totalMatches: number; sampleSizeWarning: boolean } {
  const completedMatches = teamMatches.filter(m =>
    m.year === year &&
    m.status === MatchStatus.Completed &&
    m.homeScore !== null &&
    m.awayScore !== null &&
    (m.homeTeamCode === teamCode || m.awayTeamCode === teamCode)
  );

  const totalMatches = completedMatches.length;
  const sampleSizeWarning = totalMatches < MIN_TEAM_MATCHES;

  if (sampleSizeWarning) {
    return { playerImpacts: [], totalMatches, sampleSizeWarning };
  }

  const completedRounds = new Set(completedMatches.map(m => m.round));

  const impacts: PlayerImpact[] = [];

  for (const player of players) {
    const playerPerfs = player.performances.filter(p =>
      p.year === year && p.isComplete && completedRounds.has(p.round)
    );
    const playerRounds = new Set(playerPerfs.map(p => p.round));

    const matchesPlayed = playerRounds.size;
    const matchesMissed = totalMatches - matchesPlayed;

    if (matchesPlayed < MIN_MATCHES_PLAYED) continue;

    let winRateWith: number;
    let winRateWithout: number | null;
    let impactScore: number;
    let method: ImpactMethod;

    if (matchesMissed >= MIN_MATCHES_MISSED) {
      // Availability method
      method = 'availability';

      const matchesWithPlayer = completedMatches.filter(m => playerRounds.has(m.round));
      const matchesWithoutPlayer = completedMatches.filter(m => !playerRounds.has(m.round));

      const winsWithPlayer = matchesWithPlayer.filter(m => isTeamWin(m, teamCode)).length;
      const winsWithoutPlayer = matchesWithoutPlayer.filter(m => isTeamWin(m, teamCode)).length;

      winRateWith = matchesWithPlayer.length > 0 ? winsWithPlayer / matchesWithPlayer.length : 0;
      winRateWithout = matchesWithoutPlayer.length > 0 ? winsWithoutPlayer / matchesWithoutPlayer.length : 0;
      impactScore = Math.round((winRateWith - winRateWithout) * 100) / 100;
    } else {
      // Correlation method — player played every/nearly every match
      method = 'correlation';
      winRateWithout = null;

      const winsWithPlayer = completedMatches.filter(m =>
        playerRounds.has(m.round) && isTeamWin(m, teamCode)
      ).length;
      winRateWith = matchesPlayed > 0 ? winsWithPlayer / matchesPlayed : 0;

      impactScore = Math.round(computeCorrelation(playerPerfs, completedMatches, teamCode) * 100) / 100;
    }

    impacts.push({
      playerId: player.id,
      playerName: player.name,
      matchesPlayed,
      matchesMissed,
      winRateWith: Math.round(winRateWith * 100) / 100,
      winRateWithout: winRateWithout !== null ? Math.round(winRateWithout * 100) / 100 : null,
      impactScore,
      method,
    });
  }

  // Rank by absolute impact score descending
  impacts.sort((a, b) => Math.abs(b.impactScore) - Math.abs(a.impactScore));

  return { playerImpacts: impacts, totalMatches, sampleSizeWarning };
}
