import { describe, it, expect } from 'vitest';
import { encodeArtifact } from '../../../../src/infrastructure/persistence/player-movements-envelope.js';
import type { PlayerMovementsArtifact } from '../../../../src/domain/repositories/player-movements-repository.js';

describe('player-movements envelope wire format (A1 Immutable)', () => {
  it('encodes a representative artifact byte-for-byte', () => {
    const artifact: PlayerMovementsArtifact = {
      year: 2026,
      round: 7,
      computedAt: '2026-05-28T12:34:56.789Z',
      season: 2026,
      injured: [],
      dropped: [],
      benched: [],
      returningFromInjury: [],
      coveringInjury: [],
      promoted: [],
      positionChanged: [],
    };

    const expected =
      '{"schemaVersion":1,"computedAt":"2026-05-28T12:34:56.789Z","payload":' +
      '{"year":2026,"round":7,"season":2026,"injured":[],"dropped":[],"benched":[],"returningFromInjury":[],"coveringInjury":[],"promoted":[],"positionChanged":[]}}';

    expect(encodeArtifact(artifact)).toBe(expected);
  });

  it('preserves the optional noPreviousRound flag at its current position', () => {
    const artifact: PlayerMovementsArtifact = {
      year: 2026,
      round: 1,
      computedAt: '2026-03-01T00:00:00Z',
      season: 2026,
      noPreviousRound: true,
      injured: [],
      dropped: [],
      benched: [],
      returningFromInjury: [],
      coveringInjury: [],
      promoted: [],
      positionChanged: [],
    };

    const expected =
      '{"schemaVersion":1,"computedAt":"2026-03-01T00:00:00Z","payload":' +
      '{"year":2026,"round":1,"season":2026,"noPreviousRound":true,' +
      '"injured":[],"dropped":[],"benched":[],"returningFromInjury":[],"coveringInjury":[],"promoted":[],"positionChanged":[]}}';

    expect(encodeArtifact(artifact)).toBe(expected);
  });
});
