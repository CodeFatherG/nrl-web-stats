import { describe, it, expect } from 'vitest';
import {
  encodeThresholdsEnvelope,
  encodeSeasonEnvelope,
  encodeRoundEnvelope,
} from '../../../../src/infrastructure/persistence/kv-team-strength-rankings-repository.js';
import type {
  SeasonThresholds,
  TeamRoundRanking,
  TeamSeasonRanking,
} from '../../../../src/models/types.js';

const COMPUTED_AT = '2026-05-28T12:34:56.789Z';

describe('team-strength-rankings envelope wire format (A2 RW-flat × 3 subtypes)', () => {
  it('thresholds subtype encodes byte-for-byte', () => {
    const thresholds: SeasonThresholds = {
      p33: 1.0,
      p67: 2.0,
      lowerFence: 0.5,
      upperFence: 2.5,
    };

    const expected =
      '{"schemaVersion":1,"computedAt":"2026-05-28T12:34:56.789Z","asOfRound":7,' +
      '"payload":{"p33":1,"p67":2,"lowerFence":0.5,"upperFence":2.5}}';

    expect(encodeThresholdsEnvelope(7, COMPUTED_AT, thresholds)).toBe(expected);
  });

  it('season subtype encodes byte-for-byte', () => {
    const season = new Map<string, TeamSeasonRanking>([
      [
        'BRI',
        {
          teamCode: 'BRI',
          year: 2026,
          totalStrength: 14,
          averageStrength: 2,
          matchCount: 7,
          byeCount: 0,
          percentile: 0.85,
          category: 'hard',
          rounds: [],
        },
      ],
    ]);

    const expected =
      '{"schemaVersion":1,"computedAt":"2026-05-28T12:34:56.789Z","asOfRound":7,' +
      '"payload":[["BRI",{"teamCode":"BRI","year":2026,"totalStrength":14,"averageStrength":2,' +
      '"matchCount":7,"byeCount":0,"percentile":0.85,"category":"hard","rounds":[]}]]}';

    expect(encodeSeasonEnvelope(7, COMPUTED_AT, season)).toBe(expected);
  });

  it('round subtype encodes byte-for-byte', () => {
    const rounds = new Map<string, TeamRoundRanking>([
      [
        'BRI',
        {
          teamCode: 'BRI',
          year: 2026,
          round: 7,
          strengthRating: 2.1,
          percentile: 0.85,
          category: 'hard',
          opponentCode: 'PAR',
          isHome: true,
          isBye: false,
        },
      ],
    ]);

    const expected =
      '{"schemaVersion":1,"computedAt":"2026-05-28T12:34:56.789Z","asOfRound":7,' +
      '"payload":[["BRI",{"teamCode":"BRI","year":2026,"round":7,"strengthRating":2.1,' +
      '"percentile":0.85,"category":"hard","opponentCode":"PAR","isHome":true,"isBye":false}]]}';

    expect(encodeRoundEnvelope(7, COMPUTED_AT, rounds)).toBe(expected);
  });
});
