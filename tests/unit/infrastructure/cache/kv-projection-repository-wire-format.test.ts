import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import {
  encodePlayerAggregate,
  encodeTeamRankingsAggregate,
  encodePrecomputeStatus,
} from '../../../../src/infrastructure/cache/kv-projection-repository.js';
import type {
  PlayerProjectionAggregate,
  PrecomputeStatus,
  TeamRankingsAggregate,
} from '../../../../src/domain/repositories/projection-repository.js';

const COMPUTED_AT = '2026-05-28T12:34:56.789Z';

describe('projection envelope wire format (A2 RW-flat × 3 subtypes)', () => {
  it('player aggregate encodes byte-for-byte', () => {
    const agg: PlayerProjectionAggregate = {
      playerId: 'p1',
      year: 2026,
      asOfRound: 7,
      computedAt: COMPUTED_AT,
      baseProfile: { mean: 50 },
      contextualProfile: { mean: 55 },
    } as PlayerProjectionAggregate;

    const expected =
      '{"schemaVersion":1,"asOfRound":7,"computedAt":"2026-05-28T12:34:56.789Z","payload":' +
      '{"playerId":"p1","year":2026,"baseProfile":{"mean":50},"contextualProfile":{"mean":55}}}';

    expect(encodePlayerAggregate(agg)).toBe(expected);
  });

  it('team rankings aggregate encodes byte-for-byte', () => {
    const agg: TeamRankingsAggregate = {
      year: 2026,
      teamCode: 'BRI',
      mode: 'composite',
      asOfRound: 7,
      computedAt: COMPUTED_AT,
      rankings: { tiers: ['A', 'B'] },
    } as TeamRankingsAggregate;

    const expected =
      '{"schemaVersion":1,"asOfRound":7,"computedAt":"2026-05-28T12:34:56.789Z","payload":' +
      '{"year":2026,"teamCode":"BRI","mode":"composite","rankings":{"tiers":["A","B"]}}}';

    expect(encodeTeamRankingsAggregate(agg)).toBe(expected);
  });

  describe('precompute status (uses Date.now)', () => {
    beforeAll(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(COMPUTED_AT));
    });
    afterAll(() => {
      vi.useRealTimers();
    });

    it('encodes byte-for-byte', () => {
      const status: PrecomputeStatus = { year: 2026, asOfRound: 7 };
      const expected =
        '{"schemaVersion":1,"asOfRound":7,"computedAt":"2026-05-28T12:34:56.789Z","payload":' +
        '{"year":2026,"asOfRound":7}}';
      expect(encodePrecomputeStatus(status)).toBe(expected);
    });
  });
});
