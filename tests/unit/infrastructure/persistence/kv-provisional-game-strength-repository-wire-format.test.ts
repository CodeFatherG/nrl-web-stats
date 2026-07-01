import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { encode } from '../../../../src/infrastructure/persistence/kv-provisional-game-strength-repository.js';
import type { RoundGSR } from '../../../../src/domain/game-strength.js';

describe('provisional-game-strength envelope wire format (A1 Immutable)', () => {
  beforeAll(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-28T12:34:56.789Z'));
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  it('encodes a representative artifact byte-for-byte', () => {
    const gsr: RoundGSR = {
      year: 2026,
      round: 7,
      leagueAvgTeamScore: 22.5,
      matches: [],
      methodology: {
        halfLifeRounds: 4,
        offenseWeight: 0.5,
        minRoundsForReliability: 3,
        seasonTransitionPenalty: 0,
        categoryWeightingMethod: 'dynamic',
      },
    };

    const expected =
      '{"schemaVersion":1,"computedAt":"2026-05-28T12:34:56.789Z","payload":' +
      '{"year":2026,"round":7,"leagueAvgTeamScore":22.5,"matches":[],' +
      '"methodology":{"halfLifeRounds":4,"offenseWeight":0.5,"minRoundsForReliability":3,"seasonTransitionPenalty":0,"categoryWeightingMethod":"dynamic"}}}';

    expect(encode(gsr)).toBe(expected);
  });
});
