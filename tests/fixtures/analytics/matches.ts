/**
 * Deterministic match fixtures for analytics tests.
 * Covers: wins against hard/easy opponents, byes, draws, missing strength data, insufficient data.
 */

import type { Match } from '../../../src/domain/match.js';
import { MatchStatus } from '../../../src/domain/match.js';

/** 10 completed matches for BRO in 2026 with varied results and opponents */
export const broMatchesSeason2026: Match[] = [
  // R1: BRO beats MEL (hard opponent) by 12
  {
    id: '2026-R1-BRO-MEL', year: 2026, round: 1,
    homeTeamCode: 'BRO', awayTeamCode: 'MEL',
    homeStrengthRating: -8, awayStrengthRating: 5,
    homeScore: 24, awayScore: 12, status: MatchStatus.Completed, scheduledTime: null,
  },
  // R2: BRO loses to PEN (hard) by 6
  {
    id: '2026-R2-BRO-PEN', year: 2026, round: 2,
    homeTeamCode: 'PTH', awayTeamCode: 'BRO',
    homeStrengthRating: 3, awayStrengthRating: -3,
    homeScore: 18, awayScore: 12, status: MatchStatus.Completed, scheduledTime: null,
  },
  // R3: BRO beats WST (easy opponent) by 30
  {
    id: '2026-R3-BRO-WST', year: 2026, round: 3,
    homeTeamCode: 'BRO', awayTeamCode: 'WST',
    homeStrengthRating: 7, awayStrengthRating: -5,
    homeScore: 42, awayScore: 12, status: MatchStatus.Completed, scheduledTime: null,
  },
  // R4: BRO draws with STG
  {
    id: '2026-R4-BRO-STG', year: 2026, round: 4,
    homeTeamCode: 'BRO', awayTeamCode: 'STG',
    homeStrengthRating: 0, awayStrengthRating: 1,
    homeScore: 18, awayScore: 18, status: MatchStatus.Completed, scheduledTime: null,
  },
  // R5: BRO beats SYD (medium) by 8
  {
    id: '2026-R5-BRO-SYD', year: 2026, round: 5,
    homeTeamCode: 'BRO', awayTeamCode: 'SYD',
    homeStrengthRating: -2, awayStrengthRating: 3,
    homeScore: 20, awayScore: 12, status: MatchStatus.Completed, scheduledTime: null,
  },
  // R6: BRO loses to MEL (hard) by 20
  {
    id: '2026-R6-BRO-MEL', year: 2026, round: 6,
    homeTeamCode: 'MEL', awayTeamCode: 'BRO',
    homeStrengthRating: 5, awayStrengthRating: -8,
    homeScore: 32, awayScore: 12, status: MatchStatus.Completed, scheduledTime: null,
  },
  // R7: BRO beats PAR (easy) by 14
  {
    id: '2026-R7-BRO-PAR', year: 2026, round: 7,
    homeTeamCode: 'BRO', awayTeamCode: 'PAR',
    homeStrengthRating: 5, awayStrengthRating: -3,
    homeScore: 28, awayScore: 14, status: MatchStatus.Completed, scheduledTime: null,
  },
  // R8: BRO beats NQC (medium) by 4 (close win)
  {
    id: '2026-R8-BRO-NQC', year: 2026, round: 8,
    homeTeamCode: 'BRO', awayTeamCode: 'NQC',
    homeStrengthRating: -1, awayStrengthRating: 2,
    homeScore: 16, awayScore: 12, status: MatchStatus.Completed, scheduledTime: null,
  },
  // R9: Scheduled (upcoming)
  {
    id: '2026-R9-BRO-SHA', year: 2026, round: 9,
    homeTeamCode: 'BRO', awayTeamCode: 'SHA',
    homeStrengthRating: 3, awayStrengthRating: -2,
    homeScore: null, awayScore: null, status: MatchStatus.Scheduled, scheduledTime: null,
  },
  // R10: Scheduled (upcoming)
  {
    id: '2026-R10-BRO-GCT', year: 2026, round: 10,
    homeTeamCode: 'BRO', awayTeamCode: 'GCT',
    homeStrengthRating: 6, awayStrengthRating: -4,
    homeScore: null, awayScore: null, status: MatchStatus.Scheduled, scheduledTime: null,
  },
];

/** MEL matches for head-to-head testing */
export const melMatchesSeason2026: Match[] = [
  {
    id: '2026-R1-BRO-MEL', year: 2026, round: 1,
    homeTeamCode: 'BRO', awayTeamCode: 'MEL',
    homeStrengthRating: -8, awayStrengthRating: 5,
    homeScore: 24, awayScore: 12, status: MatchStatus.Completed, scheduledTime: null,
  },
  {
    id: '2026-R6-BRO-MEL', year: 2026, round: 6,
    homeTeamCode: 'MEL', awayTeamCode: 'BRO',
    homeStrengthRating: 5, awayStrengthRating: -8,
    homeScore: 32, awayScore: 12, status: MatchStatus.Completed, scheduledTime: null,
  },
];

/** Historical season for cross-season head-to-head */
export const broMatchesSeason2025: Match[] = [
  {
    id: '2025-R5-BRO-MEL', year: 2025, round: 5,
    homeTeamCode: 'BRO', awayTeamCode: 'MEL',
    homeStrengthRating: -6, awayStrengthRating: 4,
    homeScore: 20, awayScore: 16, status: MatchStatus.Completed, scheduledTime: null,
  },
  {
    id: '2025-R15-BRO-MEL', year: 2025, round: 15,
    homeTeamCode: 'MEL', awayTeamCode: 'BRO',
    homeStrengthRating: 3, awayStrengthRating: -5,
    homeScore: 22, awayScore: 22, status: MatchStatus.Completed, scheduledTime: null,
  },
];

/** Matches for a round with mixed completed/scheduled (for outlook) */
export const round10Matches: Match[] = [
  {
    id: '2026-R10-BRO-GCT', year: 2026, round: 10,
    homeTeamCode: 'BRO', awayTeamCode: 'GCT',
    homeStrengthRating: 6, awayStrengthRating: -4,
    homeScore: null, awayScore: null, status: MatchStatus.Scheduled, scheduledTime: null,
  },
  {
    id: '2026-R10-MEL-PEN', year: 2026, round: 10,
    homeTeamCode: 'MEL', awayTeamCode: 'PTH',
    homeStrengthRating: -5, awayStrengthRating: 3,
    homeScore: null, awayScore: null, status: MatchStatus.Scheduled, scheduledTime: null,
  },
  {
    id: '2026-R10-CAN-STG', year: 2026, round: 10,
    homeTeamCode: 'CBR', awayTeamCode: 'STG',
    homeStrengthRating: 2, awayStrengthRating: -1,
    homeScore: 24, awayScore: 18, status: MatchStatus.Completed, scheduledTime: null,
  },
];

/** Match with no strength rating data */
export const matchNoStrength: Match = {
  id: '2026-R1-NEW-GCT', year: 2026, round: 1,
  homeTeamCode: 'NEW', awayTeamCode: 'GCT',
  homeStrengthRating: null, awayStrengthRating: null,
  homeScore: 20, awayScore: 14, status: MatchStatus.Completed, scheduledTime: null,
};
