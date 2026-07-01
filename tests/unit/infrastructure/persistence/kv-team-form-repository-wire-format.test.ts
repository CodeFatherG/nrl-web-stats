import { describe, it, expect } from 'vitest';
import { encodeTeamFormAggregate } from '../../../../src/infrastructure/persistence/kv-team-form-repository.js';
import type { TeamFormAggregate } from '../../../../src/domain/repositories/team-form-repository.js';

describe('team-form envelope wire format (A2 RW-flat)', () => {
  it('encodes a representative aggregate byte-for-byte', () => {
    const agg: TeamFormAggregate = {
      year: 2026,
      teamCode: 'BRI',
      asOfRound: 7,
      computedAt: '2026-05-28T12:34:56.789Z',
      trajectory: { rounds: [1, 2, 3], values: [0.5, 0.6, 0.55] },
    } as TeamFormAggregate;

    const expected =
      '{"schemaVersion":1,"asOfRound":7,"computedAt":"2026-05-28T12:34:56.789Z","payload":' +
      '{"year":2026,"teamCode":"BRI","trajectory":{"rounds":[1,2,3],"values":[0.5,0.6,0.55]}}}';

    expect(encodeTeamFormAggregate(agg)).toBe(expected);
  });
});
