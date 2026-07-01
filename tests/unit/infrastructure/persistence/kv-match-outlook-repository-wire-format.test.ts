import { describe, it, expect } from 'vitest';
import { encodeMatchOutlookAggregate } from '../../../../src/infrastructure/persistence/kv-match-outlook-repository.js';
import type { MatchOutlookAggregate } from '../../../../src/domain/repositories/match-outlook-repository.js';

describe('match-outlook envelope wire format (A2 RW-flat)', () => {
  it('encodes a representative aggregate byte-for-byte', () => {
    const agg: MatchOutlookAggregate = {
      year: 2026,
      round: 7,
      asOfRound: 7,
      computedAt: '2026-05-28T12:34:56.789Z',
      outlook: { matches: [{ id: 'm1', favorite: 'BRI' }] },
    } as MatchOutlookAggregate;

    const expected =
      '{"schemaVersion":1,"asOfRound":7,"computedAt":"2026-05-28T12:34:56.789Z","payload":' +
      '{"year":2026,"round":7,"outlook":{"matches":[{"id":"m1","favorite":"BRI"}]}}}';

    expect(encodeMatchOutlookAggregate(agg)).toBe(expected);
  });
});
