import { describe, it, expect } from 'vitest';
import {
  encodeWatermarkEnvelope,
  type WatermarkState,
} from '../../../../src/infrastructure/persistence/match-results-scrape-watermark-envelope.js';

const COMPUTED_AT = '2026-05-28T12:34:56.789Z';

describe('match-results scrape watermark envelope wire format (A4 state slot)', () => {
  it('encodes a representative state byte-for-byte', () => {
    const state: WatermarkState = {
      lastScrapedAt: '2026-05-28T10:00:00.000Z',
      allCompleted: true,
    };

    const expected =
      '{"schemaVersion":1,"computedAt":"2026-05-28T12:34:56.789Z","state":' +
      '{"lastScrapedAt":"2026-05-28T10:00:00.000Z","allCompleted":true}}';

    expect(encodeWatermarkEnvelope(state, COMPUTED_AT)).toBe(expected);
  });
});
