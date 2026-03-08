/**
 * Deterministic fixture data for analytics tests.
 * Provides strength ratings per team per round.
 */

import type { Fixture } from '../../../src/models/fixture.js';

/** BRO fixtures for 2026 season (strength ratings from supercoachstats) */
export const broFixtures2026: Fixture[] = [
  { id: '2026-BRO-1', year: 2026, round: 1, teamCode: 'BRO', opponentCode: 'MEL', isHome: true, isBye: false, strengthRating: -8 },
  { id: '2026-BRO-2', year: 2026, round: 2, teamCode: 'BRO', opponentCode: 'PTH', isHome: false, isBye: false, strengthRating: -3 },
  { id: '2026-BRO-3', year: 2026, round: 3, teamCode: 'BRO', opponentCode: 'WST', isHome: true, isBye: false, strengthRating: 7 },
  { id: '2026-BRO-4', year: 2026, round: 4, teamCode: 'BRO', opponentCode: 'STG', isHome: true, isBye: false, strengthRating: 0 },
  { id: '2026-BRO-5', year: 2026, round: 5, teamCode: 'BRO', opponentCode: 'SYD', isHome: true, isBye: false, strengthRating: -2 },
  { id: '2026-BRO-6', year: 2026, round: 6, teamCode: 'BRO', opponentCode: 'MEL', isHome: false, isBye: false, strengthRating: -8 },
  { id: '2026-BRO-7', year: 2026, round: 7, teamCode: 'BRO', opponentCode: 'PAR', isHome: true, isBye: false, strengthRating: 5 },
  { id: '2026-BRO-8', year: 2026, round: 8, teamCode: 'BRO', opponentCode: 'NQC', isHome: true, isBye: false, strengthRating: -1 },
  { id: '2026-BRO-9', year: 2026, round: 9, teamCode: 'BRO', opponentCode: 'SHA', isHome: true, isBye: false, strengthRating: 3 },
  { id: '2026-BRO-10', year: 2026, round: 10, teamCode: 'BRO', opponentCode: 'GCT', isHome: true, isBye: false, strengthRating: 6 },
];

/** BRO bye fixture */
export const broByeFixture: Fixture = {
  id: '2026-BRO-11', year: 2026, round: 11, teamCode: 'BRO', opponentCode: null, isHome: false, isBye: true, strengthRating: 0,
};

/** MEL fixtures for opponent form lookups */
export const melFixtures2026: Fixture[] = [
  { id: '2026-MEL-1', year: 2026, round: 1, teamCode: 'MEL', opponentCode: 'BRO', isHome: false, isBye: false, strengthRating: 5 },
  { id: '2026-MEL-6', year: 2026, round: 6, teamCode: 'MEL', opponentCode: 'BRO', isHome: true, isBye: false, strengthRating: 5 },
  { id: '2026-MEL-10', year: 2026, round: 10, teamCode: 'MEL', opponentCode: 'PTH', isHome: true, isBye: false, strengthRating: -5 },
];

/** GCT fixtures for outlook tests */
export const gctFixtures2026: Fixture[] = [
  { id: '2026-GCT-10', year: 2026, round: 10, teamCode: 'GCT', opponentCode: 'BRO', isHome: false, isBye: false, strengthRating: -4 },
];

/** All fixtures for 2026 combined (for strength normalisation) */
export const allFixtures2026: Fixture[] = [
  ...broFixtures2026,
  ...melFixtures2026,
  ...gctFixtures2026,
];
