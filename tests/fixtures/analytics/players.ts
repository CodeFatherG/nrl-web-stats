/**
 * Deterministic player fixtures for analytics tests.
 * Covers: trending up, stable, trending down, insufficient data.
 */

import type { Player, MatchPerformance } from '../../../src/domain/player.js';

function makePerformance(
  playerId: string,
  round: number,
  teamCode: string,
  stats: { tries: number; goals: number; tackles: number; runMetres: number; fantasyPoints: number },
  year = 2026
): MatchPerformance {
  return {
    matchId: `${year}-R${round}-${teamCode}-OPP`,
    year,
    round,
    teamCode,
    tries: stats.tries,
    goals: stats.goals,
    tackles: stats.tackles,
    runMetres: stats.runMetres,
    fantasyPoints: stats.fantasyPoints,
    isComplete: true,
  };
}

/** Player trending UP in fantasy points (last 5 rounds higher than season avg) */
export const trendingUpPlayer: Player = {
  id: 'john-smith-1995-03-15',
  name: 'John Smith',
  dateOfBirth: '1995-03-15',
  teamCode: 'BRO',
  position: 'Fullback',
  performances: [
    makePerformance('john-smith-1995-03-15', 1, 'BRO', { tries: 0, goals: 0, tackles: 20, runMetres: 100, fantasyPoints: 30 }),
    makePerformance('john-smith-1995-03-15', 2, 'BRO', { tries: 0, goals: 0, tackles: 22, runMetres: 105, fantasyPoints: 35 }),
    makePerformance('john-smith-1995-03-15', 3, 'BRO', { tries: 1, goals: 0, tackles: 18, runMetres: 95, fantasyPoints: 32 }),
    // Window starts here (rounds 4-8)
    makePerformance('john-smith-1995-03-15', 4, 'BRO', { tries: 1, goals: 0, tackles: 25, runMetres: 120, fantasyPoints: 55 }),
    makePerformance('john-smith-1995-03-15', 5, 'BRO', { tries: 2, goals: 0, tackles: 28, runMetres: 130, fantasyPoints: 65 }),
    makePerformance('john-smith-1995-03-15', 6, 'BRO', { tries: 1, goals: 0, tackles: 26, runMetres: 125, fantasyPoints: 60 }),
    makePerformance('john-smith-1995-03-15', 7, 'BRO', { tries: 2, goals: 0, tackles: 30, runMetres: 140, fantasyPoints: 70 }),
    makePerformance('john-smith-1995-03-15', 8, 'BRO', { tries: 1, goals: 0, tackles: 24, runMetres: 115, fantasyPoints: 58 }),
  ],
};

/** Player with stable stats (within 20% deviation) */
export const stablePlayer: Player = {
  id: 'bob-jones-1998-07-22',
  name: 'Bob Jones',
  dateOfBirth: '1998-07-22',
  teamCode: 'BRO',
  position: 'Lock',
  performances: [
    makePerformance('bob-jones-1998-07-22', 1, 'BRO', { tries: 0, goals: 0, tackles: 30, runMetres: 80, fantasyPoints: 40 }),
    makePerformance('bob-jones-1998-07-22', 2, 'BRO', { tries: 0, goals: 0, tackles: 32, runMetres: 85, fantasyPoints: 42 }),
    makePerformance('bob-jones-1998-07-22', 3, 'BRO', { tries: 0, goals: 0, tackles: 28, runMetres: 78, fantasyPoints: 38 }),
    makePerformance('bob-jones-1998-07-22', 4, 'BRO', { tries: 0, goals: 0, tackles: 31, runMetres: 82, fantasyPoints: 41 }),
    makePerformance('bob-jones-1998-07-22', 5, 'BRO', { tries: 0, goals: 0, tackles: 29, runMetres: 80, fantasyPoints: 39 }),
    makePerformance('bob-jones-1998-07-22', 6, 'BRO', { tries: 0, goals: 0, tackles: 30, runMetres: 81, fantasyPoints: 40 }),
    makePerformance('bob-jones-1998-07-22', 7, 'BRO', { tries: 0, goals: 0, tackles: 33, runMetres: 84, fantasyPoints: 43 }),
    makePerformance('bob-jones-1998-07-22', 8, 'BRO', { tries: 0, goals: 0, tackles: 31, runMetres: 79, fantasyPoints: 41 }),
  ],
};

/** Player trending DOWN in tackles */
export const trendingDownPlayer: Player = {
  id: 'mike-brown-1997-01-10',
  name: 'Mike Brown',
  dateOfBirth: '1997-01-10',
  teamCode: 'BRO',
  position: 'Second Row',
  performances: [
    makePerformance('mike-brown-1997-01-10', 1, 'BRO', { tries: 0, goals: 0, tackles: 40, runMetres: 90, fantasyPoints: 50 }),
    makePerformance('mike-brown-1997-01-10', 2, 'BRO', { tries: 0, goals: 0, tackles: 38, runMetres: 88, fantasyPoints: 48 }),
    makePerformance('mike-brown-1997-01-10', 3, 'BRO', { tries: 1, goals: 0, tackles: 42, runMetres: 95, fantasyPoints: 55 }),
    // Window starts (rounds 4-8) — tackles drop significantly
    makePerformance('mike-brown-1997-01-10', 4, 'BRO', { tries: 0, goals: 0, tackles: 25, runMetres: 85, fantasyPoints: 38 }),
    makePerformance('mike-brown-1997-01-10', 5, 'BRO', { tries: 0, goals: 0, tackles: 22, runMetres: 80, fantasyPoints: 35 }),
    makePerformance('mike-brown-1997-01-10', 6, 'BRO', { tries: 0, goals: 0, tackles: 20, runMetres: 78, fantasyPoints: 32 }),
    makePerformance('mike-brown-1997-01-10', 7, 'BRO', { tries: 0, goals: 0, tackles: 24, runMetres: 82, fantasyPoints: 36 }),
    makePerformance('mike-brown-1997-01-10', 8, 'BRO', { tries: 0, goals: 0, tackles: 21, runMetres: 76, fantasyPoints: 33 }),
  ],
};

/** Player with only 1 round (insufficient data, sampleSizeWarning) */
export const insufficientDataPlayer: Player = {
  id: 'new-player-2002-05-01',
  name: 'New Player',
  dateOfBirth: '2002-05-01',
  teamCode: 'BRO',
  position: 'Wing',
  performances: [
    makePerformance('new-player-2002-05-01', 8, 'BRO', { tries: 2, goals: 0, tackles: 5, runMetres: 120, fantasyPoints: 45 }),
  ],
};

/** All BRO test players */
export const broPlayers: Player[] = [
  trendingUpPlayer,
  stablePlayer,
  trendingDownPlayer,
  insufficientDataPlayer,
];
