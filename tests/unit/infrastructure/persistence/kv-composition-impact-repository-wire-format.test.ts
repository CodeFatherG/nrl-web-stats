import { describe, it, expect } from 'vitest';
import { encodeCompositionImpactAggregate } from '../../../../src/infrastructure/persistence/kv-composition-impact-repository.js';
import type { CompositionImpactAggregate } from '../../../../src/domain/repositories/composition-impact-repository.js';

describe('composition-impact envelope wire format (A2 RW-flat)', () => {
  it('encodes a representative aggregate byte-for-byte', () => {
    const agg: CompositionImpactAggregate = {
      year: 2026,
      teamCode: 'BRI',
      asOfRound: 7,
      computedAt: '2026-05-28T12:34:56.789Z',
      impact: { delta: 1.5 },
    } as CompositionImpactAggregate;

    const expected =
      '{"schemaVersion":1,"asOfRound":7,"computedAt":"2026-05-28T12:34:56.789Z","payload":' +
      '{"year":2026,"teamCode":"BRI","impact":{"delta":1.5}}}';

    expect(encodeCompositionImpactAggregate(agg)).toBe(expected);
  });
});
