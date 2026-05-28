import { describe, it, expect } from 'vitest';
import { encodePlayerTrendsAggregate } from '../../../../src/infrastructure/persistence/kv-player-trends-repository.js';
import type { PlayerTrendsAggregate } from '../../../../src/domain/repositories/player-trends-repository.js';

describe('player-trends envelope wire format (A2 RW-flat)', () => {
  it('encodes a representative aggregate byte-for-byte', () => {
    const agg: PlayerTrendsAggregate = {
      year: 2026,
      teamCode: 'BRI',
      asOfRound: 7,
      computedAt: '2026-05-28T12:34:56.789Z',
      trends: { topRiser: 'p1', topFaller: 'p2' },
    } as PlayerTrendsAggregate;

    const expected =
      '{"schemaVersion":1,"asOfRound":7,"computedAt":"2026-05-28T12:34:56.789Z","payload":' +
      '{"year":2026,"teamCode":"BRI","trends":{"topRiser":"p1","topFaller":"p2"}}}';

    expect(encodePlayerTrendsAggregate(agg)).toBe(expected);
  });
});
